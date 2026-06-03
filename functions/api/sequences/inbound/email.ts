/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute } from "../../../_shared/db.ts";

/**
 * POST /api/sequences/inbound/email - stop a sequence when the lead replies.
 * Body: { lead_email?, lead_id? } - pauses any active sequence_instances for
 * the lead.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await readJson<{ lead_email?: string; lead_id?: number }>(request);
  if (!body?.lead_email && !body?.lead_id) return error("lead_email or lead_id required", 400);
  if (body.lead_id) {
    await execute(
      env.D1DB,
      `UPDATE sequence_instances SET status = 'paused' WHERE lead_id = ? AND status = 'active'`,
      String(body.lead_id),
    );
  }
  return json({ success: true });
};
