/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, execute, nowIso } from "./db.ts";
import { mockTelnyxSendSms } from "./mockSendApi.ts";
import { checkQuietHours } from "./quietHours.ts";
import { isPhoneSuppressed } from "./suppression.ts";
import { autoCompleteLeadTasks } from "./tasks.ts";
import { appendComplianceFooter, phoneHasOptedInConsent, type ComplianceFooterKind } from "./smsCompliance.ts";
import { queueScheduledMessage, type LeadFull, type AutoResponseRow } from "./autoResponse.ts";
import { checkAiSmsPace } from "./aiSendPace.ts";
import { bumpLeadActivity } from "./leadActivity.ts";

/**
 * The single compliant outbound-SMS path for AI-initiated lead messages
 * (qualification questions AND the tool-calling agent's send_message). Whoever
 * composes the text - a hardcoded template or the LLM - the wording is the only
 * thing that differs; every send still runs the SAME guards here:
 *   - hard suppression (STOP / manual block) -> never sends
 *   - CTIA STOP footer appended
 *   - quiet-hours guard -> queue to scheduled_message for the cron at local open
 *   - missing owner number / provider failure -> queue for retry
 *   - persist into the SMS conversation thread so it shows in the inbox
 *
 * Per-second rate limiting is enforced by the cron flusher (sendRateLimiter) on
 * the queued path; interactive sends here are one-at-a-time per inbound reply.
 *
 * `finalBody` is the already-composed message (NOT a template) - callers that
 * have a {{token}} template should renderTemplate() before calling.
 */
export async function sendLeadSms(
  env: Env,
  lead: LeadFull,
  settings: AutoResponseRow,
  finalBody: string,
  opts: { complianceKind?: ComplianceFooterKind; delayMs?: number } = {},
): Promise<{ sent: boolean; queued: boolean }> {
  if (!lead.phone) return { sent: false, queued: false };
  if (await isPhoneSuppressed(env, lead.org_id, lead.phone)) {
    return { sent: false, queued: false };
  }

  // Owner lookup early so we can stamp the AI-disclosure prefix with the
  // agent's name. Default kind is "followup_in_thread" since the AI
  // tool-calling agent's most common send happens mid-conversation; callers
  // that know they're sending the opening should pass "first_auto".
  const owner = lead.owner_id
    ? await queryFirst<{ telnyx_phone_number: string | null; name: string | null }>(
        env.D1DB, `SELECT telnyx_phone_number, name FROM "user" WHERE id = ?`, lead.owner_id,
      )
    : null;
  // Phone-scoped consent: opted_in on this row OR any sibling lead sharing the
  // phone (a stale 'unknown' duplicate must not re-add the footer). The default
  // kind here ("followup_in_thread") never appends a footer anyway, so only run
  // the extra query when the kind would actually append AND the row isn't already
  // opted_in - keeps the common mid-conversation send at zero extra cost.
  const footerKind = opts.complianceKind ?? "followup_in_thread";
  const kindAppendsFooter = footerKind === "first_auto"
    || footerKind === "sequence_first" || footerKind === "campaign";
  const recipientOptedIn = lead.sms_consent_status === "opted_in"
    || (kindAppendsFooter && await phoneHasOptedInConsent(env, lead.org_id, lead.phone));
  const body = appendComplianceFooter(finalBody, {
    kind: footerKind,
    agentName: owner?.name ?? null,
    recipientOptedIn,
  });

  // "Natural delay" response timing: instead of replying instantly, queue the
  // AI reply a short while out so the cron sends it after a human-like pause.
  // The cron re-checks quiet hours / opt-out / rate limits at dispatch, so this
  // never bypasses a compliance control - it just adds a delay.
  if (opts.delayMs && opts.delayMs > 0) {
    await queueScheduledMessage(env, {
      leadId: lead.id, orgId: lead.org_id,
      userId: lead.owner_id ?? settings.user_id,
      channel: "sms", toAddress: lead.phone, body,
      scheduledAt: new Date(Date.now() + opts.delayMs).toISOString(),
      sentByAi: true,
    });
    return { sent: false, queued: true };
  }

  const quiet = await checkQuietHours(env, lead.org_id, lead.timezone);
  if (quiet?.blocked) {
    await queueScheduledMessage(env, {
      leadId: lead.id, orgId: lead.org_id,
      userId: lead.owner_id ?? settings.user_id,
      channel: "sms", toAddress: lead.phone, body,
      scheduledAt: quiet.until,
      sentByAi: true,
    });
    return { sent: false, queued: true };
  }

  const fromNumber = owner?.telnyx_phone_number || "";
  if (!fromNumber) {
    await queueScheduledMessage(env, {
      leadId: lead.id, orgId: lead.org_id,
      userId: lead.owner_id ?? settings.user_id,
      channel: "sms", toAddress: lead.phone, body,
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      sentByAi: true,
    });
    return { sent: false, queued: true };
  }

  // Per-number pacing: never burst AI texts to one handset (carrier 40002 spam
  // filter). If this number is over-paced, hold the reply for the cron at the
  // next allowed time instead of sending inline - it is delayed, never dropped.
  const pace = await checkAiSmsPace(env.D1DB, lead.org_id, lead.phone);
  if (!pace.ok && pace.nextAtIso) {
    await queueScheduledMessage(env, {
      leadId: lead.id, orgId: lead.org_id,
      userId: lead.owner_id ?? settings.user_id,
      channel: "sms", toAddress: lead.phone, body,
      scheduledAt: pace.nextAtIso, sentByAi: true,
    });
    return { sent: false, queued: true };
  }

  const sent = await mockTelnyxSendSms(env, fromNumber, lead.phone, body, {
    orgId: lead.org_id ?? null,
    leadId: lead.id,
  });
  if (!sent.ok) {
    await queueScheduledMessage(env, {
      leadId: lead.id, orgId: lead.org_id,
      userId: lead.owner_id ?? settings.user_id,
      channel: "sms", toAddress: lead.phone, body,
      scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      sentByAi: true,
    });
    return { sent: false, queued: true };
  }

  // Persist into the SMS conversation thread (same as an agent send).
  let contact = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ? LIMIT 1`,
    lead.org_id, lead.phone,
  );
  if (!contact) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO sms_contact (org_id, phone_number_e164) VALUES (?, ?)`,
      lead.org_id, lead.phone,
    );
    contact = { id: Number(ins.meta.last_row_id) };
  }
  let conv = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM sms_conversation WHERE org_id = ? AND contact_id = ? LIMIT 1`,
    lead.org_id, contact.id,
  );
  if (!conv) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO sms_conversation (org_id, contact_id, last_message_at) VALUES (?, ?, ?)`,
      lead.org_id, contact.id, nowIso(),
    );
    conv = { id: Number(ins.meta.last_row_id) };
  }
  await execute(
    env.D1DB,
    `INSERT INTO sms_message (org_id, conversation_id, direction, body, status, provider_message_sid, created_at, is_read, sent_by_ai)
     VALUES (?, ?, 'outbound', ?, 'sent', ?, ?, 1, 1)`,
    lead.org_id, conv.id, body, sent.data.id, nowIso(),
  );
  await execute(env.D1DB, `UPDATE sms_conversation SET last_message_at = ? WHERE id = ?`, nowIso(), conv.id);
  // The latest message is now ours - flip last_activity_direction to 'outbound'
  // so this lead drops out of "Needs Reply" (was missing, leaving the column
  // stuck on 'inbound' after every AI SMS reply).
  await bumpLeadActivity(env.D1DB, lead.id, nowIso(), "outbound");
  // We reached out to the lead -> complete any open "follow up" task.
  await autoCompleteLeadTasks(env, {
    leadId: lead.id, orgId: lead.org_id ?? undefined,
    types: ["followup"], reason: "follow-up sms sent",
  });
  return { sent: true, queued: false };
}

/**
 * Send a lead an MMS (listing photos). Same compliance guards as sendLeadSms,
 * but sent only when allowed right now - we do NOT queue media (scheduled_message
 * has no media column), so quiet-hours / no-number return a reason and the agent
 * can send a text instead. The persisted thread body carries a "[photo]" marker
 * (never the bytes) so later loadHistory shows a photo was sent.
 */
export async function sendLeadMms(
  env: Env,
  lead: LeadFull,
  settings: AutoResponseRow,
  caption: string,
  mediaUrls: string[],
): Promise<{ sent: boolean; reason?: string }> {
  void settings;
  if (!lead.phone) return { sent: false, reason: "lead has no phone" };
  if (!mediaUrls.length) return { sent: false, reason: "no photos to send" };
  if (await isPhoneSuppressed(env, lead.org_id, lead.phone)) return { sent: false, reason: "lead opted out" };

  const owner = lead.owner_id
    ? await queryFirst<{ telnyx_phone_number: string | null; name: string | null }>(
        env.D1DB, `SELECT telnyx_phone_number, name FROM "user" WHERE id = ?`, lead.owner_id)
    : null;
  const fromNumber = owner?.telnyx_phone_number || "";
  if (!fromNumber) return { sent: false, reason: "agent has no phone number yet" };

  const quiet = await checkQuietHours(env, lead.org_id, lead.timezone);
  if (quiet?.blocked) return { sent: false, reason: "quiet hours - send a text instead or wait for the window" };

  const body = appendComplianceFooter(caption || "", { kind: "followup_in_thread", agentName: owner?.name ?? null });
  const res = await mockTelnyxSendSms(env, fromNumber, lead.phone, body,
    { orgId: lead.org_id ?? null, leadId: lead.id }, { mediaUrls });
  if (!res.ok) return { sent: false, reason: "the messaging provider rejected the photo" };

  // Persist into the SMS thread with a [photo] marker (no bytes/URLs to the model).
  const threadBody = `[photo] ${caption || ""}`.trim();
  let contact = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ? LIMIT 1`, lead.org_id, lead.phone);
  if (!contact) {
    const ins = await execute(env.D1DB, `INSERT INTO sms_contact (org_id, phone_number_e164) VALUES (?, ?)`, lead.org_id, lead.phone);
    contact = { id: Number(ins.meta.last_row_id) };
  }
  let conv = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM sms_conversation WHERE org_id = ? AND contact_id = ? LIMIT 1`, lead.org_id, contact.id);
  if (!conv) {
    const ins = await execute(env.D1DB, `INSERT INTO sms_conversation (org_id, contact_id, last_message_at) VALUES (?, ?, ?)`, lead.org_id, contact.id, nowIso());
    conv = { id: Number(ins.meta.last_row_id) };
  }
  await execute(
    env.D1DB,
    `INSERT INTO sms_message (org_id, conversation_id, direction, body, status, provider_message_sid, created_at, is_read, sent_by_ai)
     VALUES (?, ?, 'outbound', ?, 'sent', ?, ?, 1, 1)`,
    lead.org_id, conv.id, threadBody, res.data.id, nowIso(),
  );
  await execute(env.D1DB, `UPDATE sms_conversation SET last_message_at = ? WHERE id = ?`, nowIso(), conv.id);
  await bumpLeadActivity(env.D1DB, lead.id, nowIso(), "outbound");
  return { sent: true };
}
