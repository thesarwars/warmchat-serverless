/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { queryFirst, queryAll } from "../../../_shared/db.ts";
import { enrollLeads } from "../../../_shared/sequenceService.ts";

/** POST /api/sequences/:sequenceId/enroll - add leads to a sequence. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const sequenceId = String(params.sequenceId || "");
  if (!sequenceId) return error("sequenceId required", 400);

  const seq = await queryFirst<{ org_id: number | null }>(
    env.D1DB, `SELECT org_id FROM sequences WHERE id = ?`, sequenceId,
  );
  if (!seq) return error("Sequence not found", 404);
  if (!seq.org_id) return error("Sequence has no org", 500);

  const body = await readJson<{
    lead_ids?: number[];
    extra_data?: Record<string, unknown>;
  }>(request);
  const ids = (body?.lead_ids || []).filter((n) => Number.isInteger(n));
  if (!ids.length) return error("lead_ids required", 400);

  const placeholders = ids.map(() => "?").join(",");
  const leads = await queryAll<{ id: number; email: string | null; phone: string | null }>(
    env.D1DB,
    `SELECT id, email, phone FROM lead WHERE id IN (${placeholders}) AND org_id = ?`,
    ...ids, seq.org_id,
  );
  const enrollInputs = leads.map((l) => ({ lead_id: l.id, lead_contact: l.email || l.phone || "" }));
  await enrollLeads(env, sequenceId, enrollInputs, user.id, seq.org_id, body?.extra_data);
  return json({ success: true, enrolled: enrollInputs.length });
};
