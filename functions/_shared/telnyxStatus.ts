/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, execute, nowIso } from "./db.ts";
import { queueScheduledMessage } from "./autoResponse.ts";

/**
 * Apply a Telnyx outbound delivery-receipt event to sms_message.
 *
 * Telnyx API v2 uses a UNIFIED webhook: the same Messaging Profile webhook URL
 * receives both inbound (`message.received`) and outbound status events
 * (`message.sent`, `message.finalized`). The number-level console only exposes
 * a single "Webhook URL" field, so /api/webhooks/telnyx/inbound is the one URL
 * to configure - it dispatches status events here.
 *
 * Returns a short tag describing what happened (for the webhook's JSON ack).
 */
export async function applyTelnyxStatus(
  env: Env, data: { event_type?: string; payload?: Record<string, unknown> },
): Promise<string> {
  const eventType = data.event_type || "";
  // Only outbound lifecycle events carry a delivery status.
  if (eventType !== "message.sent" && eventType !== "message.finalized") {
    return `ignored:${eventType || "unknown"}`;
  }

  const payload = (data.payload || {}) as {
    id?: string;
    to?: Array<{ phone_number?: string; status?: string }>;
    errors?: Array<{ code?: string; detail?: string }>;
  };
  const messageId = payload.id;
  if (!messageId) return "ignored:no-message-id";

  // Telnyx reports per-recipient status; for our 1:1 sends take the first.
  const status = (payload.to?.[0]?.status || "").toLowerCase();
  if (!status) return "ignored:no-status";

  const delivered = status === "delivered";
  const failed = status === "delivery_failed" || status === "failed" || status === "sending_failed";
  const normalized = delivered ? "delivered" : failed ? "failed" : status;
  const errCode = failed ? (payload.errors?.[0]?.code || null) : null;

  // Record the outcome (+ the carrier error code on failure) so the inbox can
  // show WHY a message did not land instead of a misleading "sent".
  await execute(
    env.D1DB,
    `UPDATE sms_message
        SET status = ?, error_code = ?, delivered_at = COALESCE(?, delivered_at)
      WHERE provider_message_sid = ?`,
    normalized, errCode, delivered ? nowIso() : null, messageId,
  );

  // Auto-recover from a TEMPORARY carrier spam block (Telnyx 40002): re-queue the
  // same AI message with a backoff so it delivers once the filter clears - no
  // human intervention. Capped so we never hammer a filtered number.
  if (failed && errCode === "40002") {
    await retrySpamBlocked(env, messageId);
  }

  return `status:${normalized}${errCode ? `(${errCode})` : ""}`;
}

/** Re-queue an AI SMS the carrier temporarily spam-blocked (40002), capped. */
async function retrySpamBlocked(env: Env, providerMessageSid: string): Promise<void> {
  const msg = await queryFirst<{ org_id: number; conversation_id: number; body: string | null; sent_by_ai: number | null }>(
    env.D1DB,
    `SELECT org_id, conversation_id, body, sent_by_ai FROM sms_message WHERE provider_message_sid = ? LIMIT 1`,
    providerMessageSid,
  );
  if (!msg || msg.sent_by_ai !== 1 || !msg.body) return;
  const contact = await queryFirst<{ phone: string | null }>(
    env.D1DB,
    `SELECT ct.phone_number_e164 AS phone
       FROM sms_conversation c JOIN sms_contact ct ON ct.id = c.contact_id
      WHERE c.id = ? LIMIT 1`,
    msg.conversation_id,
  );
  if (!contact?.phone) return;
  const lead = await queryFirst<{ id: number; owner_id: number | null }>(
    env.D1DB, `SELECT id, owner_id FROM lead WHERE org_id = ? AND phone = ? LIMIT 1`, msg.org_id, contact.phone,
  );
  if (!lead) return;
  // Cap retries: count identical re-queues in the last 2h (max 2 attempts).
  const sinceIso = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const prior = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM scheduled_message
      WHERE org_id = ? AND to_address = ? AND body = ? AND created_at > ?`,
    msg.org_id, contact.phone, msg.body, sinceIso,
  );
  if (Number(prior?.n ?? 0) >= 2) return;
  let userId = lead.owner_id;
  if (!userId) {
    const owner = await queryFirst<{ user_id: number }>(
      env.D1DB, `SELECT user_id FROM membership WHERE org_id = ? LIMIT 1`, msg.org_id,
    );
    userId = owner?.user_id ?? null;
  }
  if (!userId) return;
  const backoffMin = Number(prior?.n ?? 0) === 0 ? 15 : 45;
  await queueScheduledMessage(env, {
    leadId: lead.id, orgId: msg.org_id, userId,
    channel: "sms", toAddress: contact.phone, body: msg.body,
    scheduledAt: new Date(Date.now() + backoffMin * 60_000).toISOString(),
    sentByAi: true,
  });
}
