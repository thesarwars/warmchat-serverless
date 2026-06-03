/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { callerOrgId } from "../../../_shared/aiAgents.ts";
import { AI_LIMITS, clampText } from "../../../_shared/aiLimits.ts";

/** PATCH / DELETE /api/ai/responders/:id - edit or remove a custom inbound responder. */
const UPDATABLE = ["name", "trigger", "keywords", "tone", "message", "enabled"] as const;
const COLUMN: Record<string, string> = { trigger: "trigger_label" };
const MAXLEN: Record<string, number> = {
  name: AI_LIMITS.responderName, trigger: AI_LIMITS.responderTrigger, keywords: AI_LIMITS.responderKeywords,
  tone: AI_LIMITS.responderTone, message: AI_LIMITS.responderMessage,
};

async function owned(env: Env, id: number, userId: number, orgId: number): Promise<boolean> {
  const row = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM inbound_responder WHERE id = ? AND user_id = ? AND org_id = ?`, id, userId, orgId);
  return Boolean(row);
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);
  if (!(await owned(env, id, user.id, orgId))) return error("Responder not found", 404);

  const body = (await readJson<Record<string, unknown>>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const k of UPDATABLE) {
    if (k in body) {
      sets.push(`${COLUMN[k] || k} = ?`);
      args.push(k === "enabled" ? (body[k] ? 1 : 0) : clampText(body[k], MAXLEN[k] ?? AI_LIMITS.responderMessage));
    }
  }
  if (!sets.length) return json({ message: "Nothing to update" });
  await execute(env.D1DB, `UPDATE inbound_responder SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args, id);
  return json({ success: true, id });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);
  if (!(await owned(env, id, user.id, orgId))) return error("Responder not found", 404);

  await execute(env.D1DB, `DELETE FROM inbound_responder WHERE id = ?`, id);
  return new Response(null, { status: 204 });
};
