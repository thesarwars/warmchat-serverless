/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { AI_LIMITS, clampText } from "../../../_shared/aiLimits.ts";

const UPDATABLE = ["category", "question", "answer", "source", "enabled", "position"] as const;
const FIELD_MAX: Record<string, number> = {
  category: 40, question: AI_LIMITS.faqQuestion, answer: AI_LIMITS.faqAnswer, source: AI_LIMITS.profileShort,
};

async function authEntry(env: Env, userId: number, id: number): Promise<boolean> {
  const row = await queryFirst<{ org_id: number }>(env.D1DB, `SELECT org_id FROM ai_knowledge_entry WHERE id = ?`, id);
  if (!row) return false;
  return isOrgMember(env, userId, row.org_id);
}

/** PATCH /api/ai/knowledge/:id */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);
  if (!(await authEntry(env, user.id, id))) return error("Not found", 404);

  const body = (await readJson<Record<string, unknown>>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const k of UPDATABLE) {
    if (k in body) {
      sets.push(`${k} = ?`);
      if (k === "enabled") args.push(body[k] ? 1 : 0);
      else if (k === "position") args.push(Number(body[k]) || 0);
      else args.push(clampText(body[k], FIELD_MAX[k] ?? AI_LIMITS.faqAnswer));
    }
  }
  if (!sets.length) return json({ message: "Nothing to update" });
  await execute(env.D1DB, `UPDATE ai_knowledge_entry SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args, id);
  return json({ message: "Updated" });
};

/** DELETE /api/ai/knowledge/:id */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);
  if (!(await authEntry(env, user.id, id))) return error("Not found", 404);
  await execute(env.D1DB, `DELETE FROM ai_knowledge_entry WHERE id = ?`, id);
  return json({ message: "Deleted" });
};
