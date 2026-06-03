/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { execute, nowIso } from "./db.ts";

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
  };
  const messageId = payload.id;
  if (!messageId) return "ignored:no-message-id";

  // Telnyx reports per-recipient status; for our 1:1 sends take the first.
  const status = (payload.to?.[0]?.status || "").toLowerCase();
  if (!status) return "ignored:no-status";

  const delivered = status === "delivered";
  const failed = status === "delivery_failed" || status === "failed" || status === "sending_failed";
  const normalized = delivered ? "delivered" : failed ? "failed" : status;

  await execute(
    env.D1DB,
    `UPDATE sms_message
        SET status = ?, delivered_at = COALESCE(?, delivered_at)
      WHERE provider_message_sid = ?`,
    normalized, delivered ? nowIso() : null, messageId,
  );
  return `status:${normalized}`;
}
