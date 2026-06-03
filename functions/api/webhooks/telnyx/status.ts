/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json } from "../../../_shared/http.ts";
import { applyTelnyxStatus } from "../../../_shared/telnyxStatus.ts";

/**
 * POST /api/webhooks/telnyx/status - outbound SMS delivery receipts.
 *
 * In Telnyx API v2 the Messaging Profile has a SINGLE webhook field, so
 * delivery receipts normally arrive at /api/webhooks/telnyx/inbound instead.
 * This endpoint still works if you point a separate status URL here (some
 * older profile layouts allow it) - it shares the same update logic.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  let body: { data?: { event_type?: string; payload?: Record<string, unknown> } };
  try { body = await request.json(); } catch { return json({ ok: true, ignored: "bad json" }); }
  const tag = await applyTelnyxStatus(env, body.data || {});
  return json({ ok: true, handled: tag });
};
