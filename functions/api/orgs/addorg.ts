/// <reference types="@cloudflare/workers-types" />
/**
 * POST /api/orgs/addorg - alias the SPA still calls.
 */
import type { Env } from "../../_shared/env.ts";
export { onRequestPost } from "./index.ts";
void (null as unknown as Env);
