/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/** PUT/POST /api/onboarding/:userId/step - advance onboarding step. */
async function setStep(env: Env, userId: number, step: number) {
  const existing = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM onboarding_progress WHERE user_id = ?`, userId);
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE onboarding_progress SET step = ?, updated_at = ? WHERE user_id = ?`,
      step, nowIso(), userId,
    );
  } else {
    await execute(
      env.D1DB,
      `INSERT INTO onboarding_progress (user_id, step, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      userId, step, nowIso(), nowIso(),
    );
  }
}

async function handle(context: EventContext<Env, "userId", Record<string, unknown>>) {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const targetId = Number(params.userId);
  if (!Number.isInteger(targetId)) return error("Invalid user id", 400);
  if (targetId !== user.id) return error("Forbidden", 403);

  const body = (await readJson<{ step?: number }>(request)) || {};
  const step = Number(body.step);
  if (!Number.isInteger(step)) return error("step must be an integer", 400);

  await setStep(env, targetId, step);
  return json({ step });
}
export const onRequestPut: PagesFunction<Env> = handle;
export const onRequestPost: PagesFunction<Env> = handle;
