/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { applyTelnyxStatus } from "../../../_shared/telnyxStatus.ts";
import { processInboundSms } from "../../../_shared/inboundProcessing.ts";

/**
 * POST /api/webhooks/telnyx/inbound - the SINGLE Telnyx Messaging Profile
 * webhook (API v2 unifies inbound + outbound into one URL). It routes:
 *   - `message.received`                    -> record inbound SMS + drive AI Follow-Up
 *   - `message.sent` / `message.finalized`  -> update delivery status
 *
 * AI Follow-Up dispatch (after persisting the inbound message):
 *   - Match the inbound to an existing lead by E.164 phone.
 *   - Load the owning agent's auto_response_settings; if disabled, stop.
 *   - Cancel any pending follow-ups for that lead (stop-on-reply).
 *   - If no lead matched and the org allows inbound-from-unknown, create an
 *     "Inbound SMS" lead and queue the general instant reply.
 *   - Otherwise hand off to advanceQualification() to either advance the
 *     qualification flow or surface booking/cold intent.
 *
 * Signature verification: Ed25519 of `t|body` using TELNYX_PUBLIC_KEY.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const raw = await request.text();
  if (env.TELNYX_PUBLIC_KEY) {
    const ok = await verifyTelnyxSig(env.TELNYX_PUBLIC_KEY, request, raw);
    if (!ok) return error("Invalid signature", 401);
  }
  const payload = parseJson(raw);
  const data = (payload?.data || {}) as { event_type?: string; payload?: Record<string, unknown> };

  // Outbound delivery receipts arrive on this SAME URL - handle and return.
  if (data.event_type === "message.sent" || data.event_type === "message.finalized") {
    const tag = await applyTelnyxStatus(env, data);
    return json({ ok: true, handled: tag });
  }
  if (data.event_type !== "message.received") return json({ ok: true, ignored: data.event_type });

  const inner = (data.payload || {}) as {
    text?: string; from?: { phone_number?: string };
    to?: Array<{ phone_number?: string }>;
    received_at?: string; id?: string;
    media?: Array<{ url?: string; content_type?: string }>;
  };
  // Inbound MMS: store a text PLACEHOLDER for any image, never the bytes/URL -
  // the AI's conversation history must not be flooded with image data.
  const media = Array.isArray(inner.media) ? inner.media : [];
  const baseText = inner.text || "";
  const text = media.length
    ? (baseText.trim() ? `${baseText} [image attachment]` : "[image attachment]")
    : baseText;
  const result = await processInboundSms(env, {
    fromNumber: inner.from?.phone_number || "",
    toNumber: inner.to?.[0]?.phone_number || "",
    text,
    receivedAt: inner.received_at || null,
    // Idempotency key: on a retry (our LLM reply can be slow enough to time out
    // Telnyx's webhook), processInboundSms sees this id already recorded and
    // returns without sending a second reply.
    providerMessageId: inner.id || null,
  });
  return json(result);
};

function parseJson(raw: string): { data?: unknown } | null {
  try { return JSON.parse(raw); } catch { return null; }
}

async function verifyTelnyxSig(publicKeyB64: string, req: Request, raw: string): Promise<boolean> {
  const sig = req.headers.get("telnyx-signature-ed25519");
  const ts = req.headers.get("telnyx-timestamp");
  if (!sig || !ts) return false;
  const message = new TextEncoder().encode(`${ts}|${raw}`);
  const keyBytes = Uint8Array.from(atob(publicKeyB64), (c) => c.charCodeAt(0));
  try {
    const key = await crypto.subtle.importKey(
      "raw", keyBytes as unknown as BufferSource,
      { name: "Ed25519" }, false, ["verify"],
    );
    const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
    return crypto.subtle.verify("Ed25519", key, sigBytes as unknown as BufferSource, message as unknown as BufferSource);
  } catch {
    return false;
  }
}
