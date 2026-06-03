/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json } from "../../../_shared/http.ts";

/**
 * POST /api/webhooks/telnyx/calls - Telnyx Voice events.
 * The /api/calling/* feature is not implemented in this serverless backend
 * (see ROUTE_PARITY.md). Acking 200 so Telnyx doesn't retry, but no logic.
 */
export const onRequestPost: PagesFunction<Env> = async () => {
  return json({ ok: true });
};
