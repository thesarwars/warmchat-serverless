/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";

/**
 * POST /api/webhooks/calling/telnyx/sms - stub.
 *
 * The WarmChats SMS path is handled by /api/webhooks/telnyx/{inbound,status}
 * (separate top-level routes. This handler exists only
 * because Telnyx Voice Call Control Applications insist on a webhook URL
 * for all event categories on the same connection, and we'd rather log+ack
 * than let Telnyx retry a 404.
 */
export const onRequestPost: PagesFunction<Env> = async () => {
  return new Response(null, { status: 200 });
};
