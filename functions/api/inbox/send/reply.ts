/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { dispatchOutboundEmail } from "../../../_shared/outboundEmail.ts";
import { checkUsageLimit, incrementUsage, getOrgPlan } from "../../../_shared/usageCounter.ts";
import { notifyQuotaExceeded } from "../../../_shared/quotaNotify.ts";
import { checkQuietHours } from "../../../_shared/quietHours.ts";

/**
 * POST /api/inbox/send/reply - send an outbound email and persist it.
 *
 * Dispatches through the connected provider (Elastic for business, Gmail for
 * personal) via dispatchOutboundEmail. If thread_id is provided we append to
 * it; otherwise we find-or-create an email inbox + a new thread. The DB row is
 * only written after the provider accepts the message, and provider errors are
 * returned as HTTP errors so delivery failures are visible.
 */

interface ReplyAttachment {
  storage_key?: string;
  name?: string;
  content_type?: string;
  size?: number;
  url?: string;
}

interface ReplyPayload {
  thread_id?: number | null;
  subject?: string;
  message?: string;
  body?: string;
  to_email?: string;
  to?: string;
  org_id?: number | string;
  lead_ids?: Array<number | string>;
  sender_type?: string;
  sender_name?: string;
  attachments?: ReplyAttachment[];
  confirm_quiet_hours?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  // Frontend sends `body`; older callers send `message`. Accept either.
  const payload = (await readJson<ReplyPayload>(request)) || {};

  const rawMessage = (payload.message ?? payload.body ?? "").trim();
  if (!rawMessage) return error("message is required", 400);
  const toEmail = (payload.to_email ?? payload.to ?? "").trim();
  if (!toEmail) return error("recipient (to) is required", 400);

  const rawThreadId = payload.thread_id;
  const threadIdNum =
    rawThreadId === null || rawThreadId === undefined || (rawThreadId as unknown) === ""
      ? null
      : Number(rawThreadId);

  // ---- Resolve org (from thread, payload, or membership) + verify access ----
  let orgId: number;
  let existingThread: { id: number; subject: string | null; org_id: number } | null = null;

  if (threadIdNum !== null && Number.isInteger(threadIdNum)) {
    existingThread = await queryFirst(
      env.D1DB,
      `SELECT t.id, t.subject, i.org_id FROM thread t JOIN inbox i ON t.inbox_id = i.id WHERE t.id = ?`,
      threadIdNum,
    );
    if (!existingThread) return error("Thread not found", 404);
    orgId = existingThread.org_id;
  } else {
    orgId = Number(payload.org_id);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      const m = await queryFirst<{ org_id: number }>(
        env.D1DB,
        `SELECT org_id FROM membership WHERE user_id = ? ORDER BY id LIMIT 1`,
        user.id,
      );
      if (!m) return error("User not part of organization", 403);
      orgId = m.org_id;
    }
  }
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  // ---- Quiet-hours guard (same pattern as inbox/send.ts and messages/send.ts) ----
  // Only blocks human-initiated sends when the lead's local hour is outside the
  // org's [quiet_hours_start, quiet_hours_end) window. The user can override by
  // re-submitting with confirm_quiet_hours: true.
  const leadIdForGuard = Number(payload.lead_ids?.[0]);
  if (Number.isInteger(leadIdForGuard) && leadIdForGuard > 0 && !payload.confirm_quiet_hours) {
    const leadRow = await queryFirst<{ timezone: string | null }>(
      env.D1DB,
      `SELECT timezone FROM lead WHERE id = ? AND org_id = ?`,
      leadIdForGuard, orgId,
    );
    const quiet = await checkQuietHours(env, orgId, leadRow?.timezone ?? null);
    if (quiet?.blocked) {
      // Return 200 so Cloudflare doesn't log this as an error - the client
      // detects the QUIET_HOURS code in the body and prompts for confirmation.
      return json({
        error: `Quiet hours in lead local time (${quiet.hour}:00, ${quiet.timezone})`,
        code: "QUIET_HOURS",
        hour: quiet.hour,
        timezone: quiet.timezone,
        until: quiet.until,
      });
    }
  }

  // ---- Enforce the plan's monthly email limit before dispatching ----
  const plan = await getOrgPlan(env, orgId);
  if (!(await checkUsageLimit(env, orgId, plan, "email", 1))) {
    await notifyQuotaExceeded(env, orgId, "email");
    return error("Monthly email limit reached for your plan", 403);
  }

  // ---- Sanitize attachments to the fields we trust + need downstream ----
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
        .filter((a): a is ReplyAttachment => !!a && typeof a === "object")
        .map((a): { storage_key?: string; name?: string; content_type?: string; url?: string } => ({
          ...(a.storage_key !== undefined ? { storage_key: a.storage_key } : {}),
          ...(a.name !== undefined ? { name: a.name } : {}),
          ...(a.content_type !== undefined ? { content_type: a.content_type } : {}),
          ...(a.url !== undefined ? { url: a.url } : {}),
        }))
    : [];

  // ---- Dispatch through the connected provider (errors surface as HTTP) ----
  const dispatch = await dispatchOutboundEmail(env, {
    userId: user.id,
    to: toEmail,
    subject: payload.subject?.trim() || existingThread?.subject || "(no subject)",
    body: rawMessage,
    leadId: Number(payload.lead_ids?.[0]) || null,
    senderType: payload.sender_type ?? null,
    senderName: payload.sender_name || user.name || null,
    attachments,
  });
  if (!dispatch.ok) {
    if (dispatch.code === "NEEDS_REAUTH") {
      return json({ error: dispatch.error, code: dispatch.code }, dispatch.status);
    }
    return error(dispatch.error, dispatch.status);
  }
  const { subject, body: message, fromEmail, providerMessageId, channel } = dispatch;
  const senderName = (payload.sender_name || user.name || "").trim();

  // ---- Persist (only after the provider accepted the message) ----
  let threadId: number;
  if (existingThread) {
    threadId = existingThread.id;
  } else {
    let inboxRow = await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM inbox WHERE org_id = ? AND channel = 'email' ORDER BY id LIMIT 1`,
      orgId,
    );
    if (!inboxRow) {
      const created = await execute(
        env.D1DB,
        `INSERT INTO inbox (name, channel, org_id) VALUES ('Email', 'email', ?)`,
        orgId,
      );
      inboxRow = { id: Number(created.meta.last_row_id) };
    }
    const threadIns = await execute(
      env.D1DB,
      `INSERT INTO thread (subject, inbox_id, unread_count) VALUES (?, ?, 0)`,
      subject, inboxRow.id,
    );
    threadId = Number(threadIns.meta.last_row_id);
  }

  const ins = await execute(
    env.D1DB,
    `INSERT INTO inbox_messages
       (thread_id, sender_id, sender_name, sender_email, to_email, subject, body,
        direction, channel, message_id, created_at, message_date, is_read,
        delivery_status, sent_at, tracking_token, attachments)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'outbound', 'email', ?, ?, ?, 1, 'sent', ?, ?, ?)`,
    threadId, user.id, senderName || null, fromEmail || null, toEmail,
    subject, message, providerMessageId ?? null, nowIso(), nowIso(),
    nowIso(), dispatch.trackingToken,
    attachments.length ? JSON.stringify(attachments) : null,
  );
  await execute(env.D1DB, `UPDATE thread SET updated_at = ? WHERE id = ?`, nowIso(), threadId);
  await incrementUsage(env, orgId, "email", 1);

  return json(
    {
      status: "sent",
      thread_id: threadId,
      message_id: Number(ins.meta.last_row_id),
      provider_message_id: providerMessageId ?? null,
      channel,
    },
    201,
  );
};
