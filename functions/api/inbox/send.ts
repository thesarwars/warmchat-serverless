/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { dispatchOutboundEmail } from "../../_shared/outboundEmail.ts";
import { mockTelnyxSendSms } from "../../_shared/mockSendApi.ts";
import { smsBlockReason } from "../../_shared/smsCompliance.ts";
import { smsSegmentError } from "../../_shared/smsSegments.ts";
import { checkUsageLimit, incrementUsage, getOrgPlan } from "../../_shared/usageCounter.ts";
import { notifyQuotaExceeded } from "../../_shared/quotaNotify.ts";
import { checkQuietHours } from "../../_shared/quietHours.ts";
import { cancelPendingFollowups } from "../../_shared/autoResponse.ts";
import { isPhoneSuppressed } from "../../_shared/suppression.ts";

/**
 * POST /api/inbox/send - send a new outbound message and persist it.
 * Email dispatches via dispatchOutboundEmail (Elastic/Gmail); SMS via Telnyx
 * with the same compliance + usage checks as /api/messages/send. Provider
 * errors surface as HTTP errors.
 * Body: { contact_id (lead.id), channel: 'email'|'sms', subject?, message, sender_type? }.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id);
  if (!m) return error("User not part of organization", 403);

  const body = (await readJson<{
    contact_id?: number; channel?: string; subject?: string; message?: string; sender_type?: string;
    confirm_quiet_hours?: boolean;
  }>(request)) || {};
  const channel = (body.channel || "email").toLowerCase();
  const message = (body.message || "").trim();
  const subject = (body.subject || "").trim();
  if (!message) return error("message is required", 400);
  if (!Number.isInteger(body.contact_id)) return error("contact_id is required", 400);

  const lead = await queryFirst<{ id: number; email: string | null; phone: string | null; timezone: string | null }>(
    env.D1DB, `SELECT id, email, phone, timezone FROM lead WHERE id = ? AND org_id = ?`, body.contact_id, m.org_id);
  if (!lead) return error("Contact not found", 404);

  // Quiet-hours guard applies to both email and SMS branches. Confirmation
  // bypass mirrors the inbox composer's "send anyway?" prompt.
  const quiet = await checkQuietHours(env, m.org_id, lead.timezone);
  if (quiet?.blocked && !body.confirm_quiet_hours) {
    // Return 200 so Cloudflare doesn't log this as an error - the client
    // detects the QUIET_HOURS code in the body and prompts for confirmation.
    return json({
      message: `Quiet hours in lead local time (${quiet.hour}:00, ${quiet.timezone})`,
      code: "QUIET_HOURS",
      hour: quiet.hour,
      timezone: quiet.timezone,
      until: quiet.until,
    });
  }

  if (channel === "email") {
    if (!lead.email) return error("Lead has no email address", 400);

    const plan = await getOrgPlan(env, m.org_id);
    const allowed = await checkUsageLimit(env, m.org_id, plan, "email", 1);
    if (!allowed) {
      await notifyQuotaExceeded(env, m.org_id, "email");
      return error("Monthly email limit reached for your plan", 403);
    }

    // Dispatch first; only persist if the provider accepted the message.
    const dispatch = await dispatchOutboundEmail(env, {
      userId: user.id,
      to: lead.email,
      subject: subject || "(no subject)",
      body: message,
      leadId: lead.id,
      senderType: body.sender_type ?? null,
      senderName: user.name || null,
    });
    if (!dispatch.ok) {
      if (dispatch.code === "NEEDS_REAUTH") {
        return json({ error: dispatch.error, code: dispatch.code }, dispatch.status);
      }
      return error(dispatch.error, dispatch.status);
    }

    let inbox = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM inbox WHERE org_id = ? AND channel = 'email' LIMIT 1`, m.org_id);
    if (!inbox) {
      const ins = await execute(
        env.D1DB,
        `INSERT INTO inbox (name, channel, org_id, created_at) VALUES ('Email', 'email', ?, ?)`,
        m.org_id, nowIso(),
      );
      inbox = { id: Number(ins.meta.last_row_id) };
    }
    const thread = await execute(
      env.D1DB,
      `INSERT INTO thread (subject, inbox_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      dispatch.subject, inbox.id, nowIso(), nowIso(),
    );
    const threadId = Number(thread.meta.last_row_id);
    const msg = await execute(
      env.D1DB,
      `INSERT INTO inbox_messages
         (thread_id, sender_id, sender_name, sender_email, subject, body, direction, channel,
          to_email, message_id, created_at, message_date, is_read,
          delivery_status, sent_at, tracking_token)
       VALUES (?, ?, ?, ?, ?, ?, 'outbound', 'email', ?, ?, ?, ?, 1, 'sent', ?, ?)`,
      threadId, user.id, user.name || null, dispatch.fromEmail || null, dispatch.subject,
      dispatch.body, lead.email, dispatch.providerMessageId ?? null, nowIso(), nowIso(),
      nowIso(), dispatch.trackingToken,
    );
    await execute(env.D1DB,
      `INSERT INTO thread_lead_assignments (thread_id, lead_id, assigned_at) VALUES (?, ?, ?)`,
      threadId, lead.id, nowIso());
    await incrementUsage(env, m.org_id, "email", 1);
    return json(
      {
        status: "sent",
        thread_id: threadId,
        message_id: Number(msg.meta.last_row_id),
        provider_message_id: dispatch.providerMessageId ?? null,
        channel: dispatch.channel,
      },
      201,
    );
  }

  if (channel === "sms") {
    if (!lead.phone) return error("Lead has no phone number", 400);
    // Suppression gate: hard-block sending to anyone who texted STOP or was
    // manually blocked by an admin. Returns a structured error so the inbox
    // composer can surface a clear "this contact has opted out" toast.
    if (await isPhoneSuppressed(env, m.org_id, lead.phone)) {
      return error("This contact has opted out of SMS. Sending is blocked.", 403, {
        code: "SMS_OPTED_OUT",
      });
    }
    const segError = smsSegmentError(message);
    if (segError) return error(segError, 400);
    const block = await smsBlockReason(env, user.id);
    if (block) return error(block, 400);

    const org = await queryFirst<{ plan: string }>(env.D1DB, `SELECT plan FROM organization WHERE id = ?`, m.org_id);
    const allowed = await checkUsageLimit(env, m.org_id, org?.plan || "free_channel", "sms", 1);
    if (!allowed) {
      await notifyQuotaExceeded(env, m.org_id, "sms");
      return error("Monthly SMS limit reached for your plan", 403);
    }

    const u = await queryFirst<{ telnyx_phone_number: string | null }>(
      env.D1DB, `SELECT telnyx_phone_number FROM "user" WHERE id = ?`, user.id);
    if (!u?.telnyx_phone_number) return error("No SMS number connected", 400);

    const sent = await mockTelnyxSendSms(env, u.telnyx_phone_number, lead.phone, message, {
      orgId: m.org_id,
      leadId: lead.id,
    });
    if (!sent.ok) return error(sent.error.message, sent.error.status);

    let contact = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ? LIMIT 1`, m.org_id, lead.phone);
    if (!contact) {
      const ins = await execute(env.D1DB,
        `INSERT INTO sms_contact (org_id, phone_number_e164) VALUES (?, ?)`, m.org_id, lead.phone);
      contact = { id: Number(ins.meta.last_row_id) };
    }
    let conv = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM sms_conversation WHERE org_id = ? AND contact_id = ? LIMIT 1`, m.org_id, contact.id);
    if (!conv) {
      const ins = await execute(env.D1DB,
        `INSERT INTO sms_conversation (org_id, contact_id, last_message_at) VALUES (?, ?, ?)`,
        m.org_id, contact.id, nowIso());
      conv = { id: Number(ins.meta.last_row_id) };
    }
    const msg = await execute(
      env.D1DB,
      `INSERT INTO sms_message
         (org_id, conversation_id, direction, body, status, provider_message_sid, created_at, is_read)
       VALUES (?, ?, 'outbound', ?, 'sent', ?, ?, 1)`,
      m.org_id, conv.id, message, sent.data.id, nowIso(),
    );
    await execute(env.D1DB,
      `UPDATE sms_conversation SET last_message_at = ? WHERE id = ?`, nowIso(), conv.id);
    await incrementUsage(env, m.org_id, "sms", 1);

    // Stop-on-agent-reply: cancel pending AI follow-ups now that the agent
    // has sent. Mirrors the spec's "AI stops when the agent sends" rule.
    try { await cancelPendingFollowups(env, lead.id); } catch { /* non-fatal */ }

    return json({ status: "sent", conversation_id: conv.id, message_id: Number(msg.meta.last_row_id), provider_message_id: sent.data.id }, 201);
  }

  return error("channel must be 'email' or 'sms'", 400);
};
