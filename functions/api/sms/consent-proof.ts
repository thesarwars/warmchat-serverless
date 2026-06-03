/// <reference types="@cloudflare/workers-types" />
/**
 * GET /api/sms/consent-proof - alias for the consent module's GET handler.
 */
import type { Env } from "../../_shared/env.ts";
export { onRequestGet } from "./consent.ts";
void (null as unknown as Env);
