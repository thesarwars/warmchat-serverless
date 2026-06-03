/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { callerOrgId } from "../../../_shared/aiAgents.ts";
import { AI_LIMITS, clampText } from "../../../_shared/aiLimits.ts";

// Lead types a qualification question can apply to. `all` always applies.
const APPLIES_TO = new Set(["all", "buyer", "seller", "renter", "open_house"]);
function normalizeAppliesTo(v: unknown): string {
  const s = clampText(v, 20)?.toLowerCase() || "all";
  return APPLIES_TO.has(s) ? s : "all";
}

interface Row {
  id: number; applies_to: string; question: string; guidance: string | null;
  enabled: number; position: number;
}

/** GET /api/ai/qualifications?applies_to= -> the caller's qualification questions. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const url = new URL(request.url);
  const appliesTo = url.searchParams.get("applies_to");
  const where = ["org_id = ?", "user_id = ?"];
  const args: unknown[] = [orgId, user.id];
  if (appliesTo) { where.push("applies_to = ?"); args.push(normalizeAppliesTo(appliesTo)); }

  const rows = await queryAll<Row>(
    env.D1DB,
    `SELECT id, applies_to, question, guidance, enabled, position
       FROM ai_qualification WHERE ${where.join(" AND ")} ORDER BY applies_to, position, id`,
    ...args,
  );
  return json({ entries: rows.map((r) => ({ ...r, enabled: Boolean(r.enabled) })) });
};

interface Body {
  applies_to?: string; question?: string | null; guidance?: string | null;
  enabled?: boolean; position?: number;
}

/** POST /api/ai/qualifications -> create a qualification question. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<Body>(request)) || {};

  // Cap the number of entries so the system prompt cannot be flooded.
  const countRow = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(*) AS n FROM ai_qualification WHERE org_id = ? AND user_id = ?`, orgId, user.id);
  if ((countRow?.n ?? 0) >= AI_LIMITS.qualificationMaxEntries) {
    return error(`You can store at most ${AI_LIMITS.qualificationMaxEntries} qualification questions. Delete some before adding more.`, 400);
  }

  const question = clampText(body.question, AI_LIMITS.qualificationQuestion);
  if (!question) return error("A question is required.", 400);
  const guidance = clampText(body.guidance, AI_LIMITS.qualificationGuidance);

  const ins = await execute(
    env.D1DB,
    `INSERT INTO ai_qualification (org_id, user_id, applies_to, question, guidance, enabled, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    orgId, user.id, normalizeAppliesTo(body.applies_to), question, guidance,
    body.enabled === false ? 0 : 1, Number(body.position) || 0,
  );
  return json({ id: Number(ins.meta.last_row_id) }, 201);
};
