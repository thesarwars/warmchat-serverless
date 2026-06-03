/// <reference types="@cloudflare/workers-types" />
/**
 * Alias of /api/gmail/pubsub for older Pub/Sub subscriptions that point at
 * /api/gmail/webhooks/google/gmail/pubsub. Same behavior.
 */
import type { Env } from "../../../../../_shared/env.ts";
export { onRequestPost } from "../../../pubsub.ts";
void (null as unknown as Env);
