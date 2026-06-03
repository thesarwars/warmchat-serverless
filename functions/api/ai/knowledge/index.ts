/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { callerOrgId } from "../../../_shared/aiAgents.ts";
import { AI_LIMITS, clampText } from "../../../_shared/aiLimits.ts";

interface Row {
  id: number; category: string; question: string | null; answer: string | null;
  source: string | null; enabled: number; position: number;
}

/** GET /api/ai/knowledge?category= -> the caller's knowledge entries (FAQs/custom answers/sources). */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const where = ["org_id = ?", "user_id = ?"];
  const args: unknown[] = [orgId, user.id];
  if (category) { where.push("category = ?"); args.push(category); }

  const rows = await queryAll<Row>(
    env.D1DB,
    `SELECT id, category, question, answer, source, enabled, position
       FROM ai_knowledge_entry WHERE ${where.join(" AND ")} ORDER BY category, position, id`,
    ...args,
  );
  return json({ entries: rows.map((r) => ({ ...r, enabled: Boolean(r.enabled) })) });
};

interface Body {
  category?: string; question?: string | null; answer?: string | null;
  source?: string | null; enabled?: boolean; position?: number;
}

/** POST /api/ai/knowledge -> create an entry. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<Body>(request)) || {};

  // Cap the number of entries so the system prompt cannot be flooded.
  const countRow = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(*) AS n FROM ai_knowledge_entry WHERE org_id = ? AND user_id = ?`, orgId, user.id);
  if ((countRow?.n ?? 0) >= AI_LIMITS.faqMaxEntries) {
    return error(`You can store at most ${AI_LIMITS.faqMaxEntries} knowledge entries. Delete some before adding more.`, 400);
  }

  const question = clampText(body.question, AI_LIMITS.faqQuestion);
  const answer = clampText(body.answer, AI_LIMITS.faqAnswer);
  const source = clampText(body.source, AI_LIMITS.profileShort);
  if (!answer) return error("An answer is required.", 400);

  const ins = await execute(
    env.D1DB,
    `INSERT INTO ai_knowledge_entry (org_id, user_id, category, question, answer, source, enabled, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    orgId, user.id, clampText(body.category, 40) || "general", question, answer,
    source, body.enabled === false ? 0 : 1, Number(body.position) || 0,
  );
  return json({ id: Number(ins.meta.last_row_id) }, 201);
};
