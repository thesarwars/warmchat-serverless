/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { mockTelnyxSendSms } from "../../_shared/mockSendApi.ts";
import { smsBlockReason } from "../../_shared/smsCompliance.ts";
import { smsSegmentError, smsSegmentInfo } from "../../_shared/smsSegments.ts";
import { normalizeE164 } from "../../_shared/phone.ts";
import { checkUsageLimit, incrementUsage } from "../../_shared/usageCounter.ts";
import { notifyQuotaExceeded } from "../../_shared/quotaNotify.ts";
import { applyPersonalization, loadLeadVars } from "../../_shared/personalize.ts";
import { checkQuietHours } from "../../_shared/quietHours.ts";
import { cancelPendingFollowups } from "../../_shared/autoResponse.ts";
import { isPhoneSuppressed } from "../../_shared/suppression.ts";

/**
 * POST /api/messages/send - single ad-hoc SMS send (the endpoint the
 * SPA still calls from the contact-detail screen).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{
    to?: string;
    body?: string;
    message?: string;
    lead_id?: number | string;
    attachments?: Array<{ storage_key?: string; name?: string; content_type?: string; size?: number; url?: string }>;
    client_request_id?: string;
    confirm_quiet_hours?: boolean;
  }>(request);
  const rawMsg = (body?.body || body?.message || "").trim();
  // An image attachment alone is a valid MMS, so only require body text when
  // there's no image to send.
  const hasImageAttachment =
    Array.isArray(body?.attachments) &&
    body!.attachments!.some(
      (a) => a && a.url && (a.content_type || "").startsWith("image/"),
    );
  if (!rawMsg && !hasImageAttachment) return error("body is required", 400);

  let to: string;
  try { to = normalizeE164(body?.to || ""); } catch (e) { return error((e as Error).message, 400); }

  const block = await smsBlockReason(env, user.id);
  if (block) return error(block, 400);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!m) return error("User not in any organization", 403);

  // Suppression gate: STOP / admin block / lead opt-out -> hard refuse send.
  if (await isPhoneSuppressed(env, m.org_id, to)) {
    return error("This contact has opted out of SMS. Sending is blocked.", 403, {
      code: "SMS_OPTED_OUT",
    });
  }

  // Personalize {firstname} etc against the lead (if provided) so what we send,
  // store, and display in the chat are all the same final text.
  const leadId = Number(body?.lead_id) || null;
  const senderName = (user.name || "").trim();
  const vars = await loadLeadVars(env, leadId, senderName);
  const msg = applyPersonalization(rawMsg, vars);

  // Quiet-hours guard: prefer the lead's timezone, fall back to the org's.
  // The frontend can override by re-submitting with confirm_quiet_hours=true.
  const leadTz = leadId
    ? await queryFirst<{ timezone: string | null }>(
        env.D1DB, `SELECT timezone FROM lead WHERE id = ?`, leadId,
      )
    : null;
  const quiet = await checkQuietHours(env, m.org_id, leadTz?.timezone ?? null);
  if (quiet?.blocked && !body?.confirm_quiet_hours) {
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

  const segError = smsSegmentError(msg);
  if (segError) return error(segError, 400);
  const segments = smsSegmentInfo(msg).segments;

  // Per-segment usage: a 3-segment SMS costs 3 against the org's monthly cap.
  const org = await queryFirst<{ plan: string }>(env.D1DB, `SELECT plan FROM organization WHERE id = ?`, m.org_id);
  const allowed = await checkUsageLimit(env, m.org_id, org?.plan || "free_channel", "sms", segments);
  if (!allowed) {
    await notifyQuotaExceeded(env, m.org_id, "sms");
    return error("Monthly SMS limit reached for your plan", 403);
  }

  // Sanitize attachments + collect image URLs for MMS delivery via Telnyx.
  const attachments = Array.isArray(body?.attachments)
    ? body!.attachments!
        .filter((a) => a && typeof a === "object")
        .map((a) => ({
          storage_key: a.storage_key,
          name: a.name,
          content_type: a.content_type,
          size: a.size,
          url: a.url,
        }))
    : [];
  const mediaUrls = attachments
    .filter((a) => a.url && (a.content_type || "").startsWith("image/"))
    .map((a) => a.url!) as string[];

  const u = await queryFirst<{ telnyx_phone_number: string }>(
    env.D1DB, `SELECT telnyx_phone_number FROM "user" WHERE id = ?`, user.id,
  );
  const sent = await mockTelnyxSendSms(env, u!.telnyx_phone_number, to, msg, {
    orgId: m.org_id,
  }, {
    ...(mediaUrls.length ? { mediaUrls } : {}),
  });
  if (!sent.ok) return error(sent.error.message, sent.error.status);

  let contact = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ? LIMIT 1`, m.org_id, to,
  );
  if (!contact) {
    const ins = await execute(env.D1DB,
      `INSERT INTO sms_contact (org_id, phone_number_e164) VALUES (?, ?)`, m.org_id, to);
    contact = { id: Number(ins.meta.last_row_id) };
  }
  let conv = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM sms_conversation WHERE org_id = ? AND contact_id = ? LIMIT 1`, m.org_id, contact.id,
  );
  if (!conv) {
    const ins = await execute(env.D1DB,
      `INSERT INTO sms_conversation (org_id, contact_id, last_message_at) VALUES (?, ?, ?)`,
      m.org_id, contact.id, nowIso());
    conv = { id: Number(ins.meta.last_row_id) };
  }
  await execute(env.D1DB,
    `INSERT INTO sms_message (org_id, conversation_id, direction, body, attachments, status, provider_message_sid, client_request_id, created_at)
     VALUES (?, ?, 'outbound', ?, ?, 'sent', ?, ?, ?)`,
    m.org_id, conv.id, msg,
    attachments.length ? JSON.stringify(attachments) : null,
    sent.data.id, body?.client_request_id || null, nowIso());
  await execute(env.D1DB, `UPDATE sms_conversation SET last_message_at = ? WHERE id = ?`, nowIso(), conv.id);
  await incrementUsage(env, m.org_id, "sms", segments);

  // Stop-on-agent-reply: cancel any pending AI follow-ups now that a human
  // agent has reached out. Matches the spec's "AI stops when the agent sends".
  if (leadId) {
    try { await cancelPendingFollowups(env, leadId); } catch { /* non-fatal */ }
  }

  return json({ success: true, message_id: sent.data.id });
};
