/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { execute, queryFirst } from "../../../../../_shared/db.ts";
import { requireUser } from "../../../../../_shared/auth.ts";
import { canAccessCall } from "../../../../../_shared/callingAccess.ts";

/**
 * PATCH /api/calling/calls/:callId/tasks/:taskId - toggle an AI next-step's
 * done flag from the detail-panel checklist. Body: { done: boolean }.
 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const callId = String(params.callId || "");
  const taskId = String(params.taskId || "");
  if (!callId || !taskId) return error("callId and taskId are required", 400);
  if (!(await canAccessCall(env, user.id, callId))) return error("Forbidden", 403);

  const body = (await readJson<{ done?: boolean }>(request)) || {};
  const done = body.done ? 1 : 0;

  const task = await queryFirst<{ id: string }>(
    env.D1DB, `SELECT id FROM call_tasks WHERE id = ? AND call_id = ?`, taskId, callId);
  if (!task) return error("Task not found", 404);

  await execute(env.D1DB, `UPDATE call_tasks SET done = ? WHERE id = ?`, done, taskId);
  return json({ id: taskId, done: done === 1 });
};
