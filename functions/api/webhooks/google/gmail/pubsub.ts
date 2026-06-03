/// <reference types="@cloudflare/workers-types" />
/**
 * Root-level Google Pub/Sub alias - `/api/webhooks/google/gmail/pubsub`.
 */
import type { Env } from "../../../../_shared/env.ts";
export { onRequestPost } from "../../../gmail/pubsub.ts";
void (null as unknown as Env);
