/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, execute, nowIso } from "./db.ts";
import { bumpLeadActivity } from "./leadActivity.ts";
import { checkQuietHours } from "./quietHours.ts";
import { dispatchOutboundEmail } from "./outboundEmail.ts";
import { queueScheduledMessage, type LeadFull, type AutoResponseRow } from "./autoResponse.ts";

/**
 * The single compliant outbound-EMAIL path for AI-initiated lead messages (the
 * tool-calling agent's send_message when the lead reached us over email). Mirror
 * of sendLeadSms for the email channel - whoever composes the words, every send
 * runs the SAME guards here:
 *   - lead.email_opt_out (CAN-SPAM unsubscribe) -> never sends
 *   - missing email address -> never sends
 *   - quiet-hours guard -> queue to scheduled_message for the cron at local open
 *   - dispatch via dispatchOutboundEmail (Elastic/Gmail, mock-aware) - the same
 *     provider resolution the inbox composer uses
 *   - persist the outbound row into the lead's email thread so it shows in the
 *     unified inbox AND so the agent's loadHistory can read it back
 *
 * `finalBody`/`subject` are the already-composed message (NOT a template).
 */
export async function sendLeadEmail(
  env: Env,
  lead: LeadFull,
  settings: AutoResponseRow,
  finalBody: string,
  subject: string,
  opts: { delayMs?: number } = {},
): Promise<{ sent: boolean; queued: boolean; reason?: string }> {
  if (!lead.email) return { sent: false, queued: false, reason: "lead has no email" };

  // CAN-SPAM: a lead who unsubscribed from email must never receive one.
  const optRow = await queryFirst<{ email_opt_out: number }>(
    env.D1DB, `SELECT email_opt_out FROM lead WHERE id = ?`, lead.id,
  );
  if (optRow?.email_opt_out === 1) return { sent: false, queued: false, reason: "lead opted out of email" };

  const subjectLine = (subject || "").trim() || "Re: your message";

  // "Natural delay" response timing: queue the AI reply a short while out so the
  // cron sends it after a human-like pause (cron re-checks all compliance).
  if (opts.delayMs && opts.delayMs > 0) {
    await queueScheduledMessage(env, {
      leadId: lead.id, orgId: lead.org_id,
      userId: lead.owner_id ?? settings.user_id,
      channel: "email", toAddress: lead.email, subject: subjectLine, body: finalBody,
      scheduledAt: new Date(Date.now() + opts.delayMs).toISOString(),
      sentByAi: true,
    });
    return { sent: false, queued: true };
  }

  // Quiet-hours guard (same window as SMS). Queue for the cron at local open -
  // scheduled_message carries the subject on the email channel.
  const quiet = await checkQuietHours(env, lead.org_id, lead.timezone);
  if (quiet?.blocked) {
    await queueScheduledMessage(env, {
      leadId: lead.id, orgId: lead.org_id,
      userId: lead.owner_id ?? settings.user_id,
      channel: "email", toAddress: lead.email, subject: subjectLine, body: finalBody,
      scheduledAt: quiet.until,
      sentByAi: true,
    });
    return { sent: false, queued: true };
  }

  const owner = lead.owner_id
    ? await queryFirst<{ name: string | null }>(env.D1DB, `SELECT name FROM "user" WHERE id = ?`, lead.owner_id)
    : null;

  const dispatch = await dispatchOutboundEmail(env, {
    userId: lead.owner_id ?? settings.user_id,
    to: lead.email,
    subject: subjectLine,
    body: finalBody,
    leadId: lead.id,
    senderName: owner?.name ?? null,
  });
  // No connected mailbox / provider rejection: queue a retry rather than drop it.
  if (!dispatch.ok) {
    await queueScheduledMessage(env, {
      leadId: lead.id, orgId: lead.org_id,
      userId: lead.owner_id ?? settings.user_id,
      channel: "email", toAddress: lead.email, subject: subjectLine, body: finalBody,
      scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      sentByAi: true,
    });
    return { sent: false, queued: true, reason: dispatch.error };
  }

  // Persist into the lead's email thread (append to the most recent one, else
  // create the email inbox/thread) - same shape as /api/inbox/send.
  let threadId = (await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT t.id FROM thread t
       JOIN thread_lead_assignments tla ON tla.thread_id = t.id
       JOIN inbox i ON i.id = t.inbox_id
      WHERE tla.lead_id = ? AND i.channel = 'email'
      ORDER BY t.id DESC LIMIT 1`,
    lead.id,
  ))?.id ?? null;

  if (threadId == null) {
    let inbox = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM inbox WHERE org_id = ? AND channel = 'email' LIMIT 1`, lead.org_id,
    );
    if (!inbox) {
      const ins = await execute(
        env.D1DB,
        `INSERT INTO inbox (name, channel, org_id, created_at) VALUES ('Email', 'email', ?, ?)`,
        lead.org_id, nowIso(),
      );
      inbox = { id: Number(ins.meta.last_row_id) };
    }
    const tIns = await execute(
      env.D1DB,
      `INSERT INTO thread (subject, inbox_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      dispatch.subject, inbox.id, nowIso(), nowIso(),
    );
    threadId = Number(tIns.meta.last_row_id);
    await execute(
      env.D1DB,
      `INSERT INTO thread_lead_assignments (thread_id, lead_id, assigned_at) VALUES (?, ?, ?)`,
      threadId, lead.id, nowIso(),
    );
  }

  await execute(
    env.D1DB,
    `INSERT INTO inbox_messages
       (thread_id, sender_id, sender_name, sender_email, subject, body, direction, channel,
        to_email, message_id, created_at, message_date, is_read, delivery_status, sent_at, tracking_token, sent_by_ai, lead_id)
     VALUES (?, ?, ?, ?, ?, ?, 'outbound', 'email', ?, ?, ?, ?, 1, 'sent', ?, ?, 1, ?)`,
    threadId, lead.owner_id ?? null, owner?.name ?? null, dispatch.fromEmail || null, dispatch.subject,
    dispatch.body, lead.email, dispatch.providerMessageId ?? null, nowIso(), nowIso(),
    nowIso(), dispatch.trackingToken, lead.id,
  );
  await execute(env.D1DB, `UPDATE thread SET updated_at = ? WHERE id = ?`, nowIso(), threadId);
  await bumpLeadActivity(env.D1DB, lead.id, nowIso());
  return { sent: true, queued: false };
}
