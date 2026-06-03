/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";

/**
 * POST /api/webhooks/calling/telnyx/inbound - DEPRECATED.
 *
 * Telnyx Voice API Apps only support ONE webhook URL, and that URL is
 * configured to /api/webhooks/calling/telnyx/status, where direction=incoming
 * call.initiated events are now handled by `handleIncomingInitiated`.
 *
 * This stub exists only to make stale configurations visible: anything that
 * still POSTs here gets an explicit 410 in the logs instead of a silent 404.
 * Safe to delete once we're confident no older Telnyx app still points here.
 */
export const onRequestPost: PagesFunction<Env> = async () => {
  return new Response(
    JSON.stringify({
      error: "gone",
      message: "Inbound voice webhooks are handled by /api/webhooks/calling/telnyx/status. Update the Telnyx Voice API App webhook URL.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
};
