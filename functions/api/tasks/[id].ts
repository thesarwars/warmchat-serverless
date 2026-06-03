/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isOrgMember } from "../../_shared/orgAccess.ts";

const UPDATABLE = ["title", "description", "type", "priority", "due_at", "status", "lead_id", "deal_id", "user_id"] as const;

async function authTask(env: Env, userId: number, taskId: number): Promise<{ org_id: number } | null> {
  const t = await queryFirst<{ org_id: number }>(env.D1DB, `SELECT org_id FROM task WHERE id = ?`, taskId);
  if (!t) return null;
  if (!(await isOrgMember(env, userId, t.org_id))) return null;
  return t;
}

/** PATCH /api/tasks/:id - update status / fields. */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid task id", 400);
  if (!(await authTask(env, user.id, id))) return error("Task not found", 404);

  const body = (await readJson<Record<string, unknown>>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const k of UPDATABLE) {
    if (k in body) { sets.push(`${k} = ?`); args.push(body[k] ?? null); }
  }
  if (!sets.length) return json({ message: "Nothing to update" });
  await execute(env.D1DB, `UPDATE task SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args, id);
  return json({ message: "Task updated" });
};

/** DELETE /api/tasks/:id */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid task id", 400);
  if (!(await authTask(env, user.id, id))) return error("Task not found", 404);
  await execute(env.D1DB, `DELETE FROM task WHERE id = ?`, id);
  return json({ message: "Task deleted" });
};
