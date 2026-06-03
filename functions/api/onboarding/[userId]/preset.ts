/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/** POST /api/onboarding/:userId/preset - record selected sequence preset. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const targetId = Number(params.userId);
  if (targetId !== user.id) return error("Forbidden", 403);

  const body = (await readJson<{ preset_id?: number }>(request)) || {};
  const presetId = Number(body.preset_id);
  if (!Number.isInteger(presetId)) return error("preset_id is required", 400);

  const existing = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM onboarding_progress WHERE user_id = ?`, user.id);
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE onboarding_progress SET selected_preset = ?, updated_at = ? WHERE user_id = ?`,
      presetId, nowIso(), user.id,
    );
  } else {
    await execute(
      env.D1DB,
      `INSERT INTO onboarding_progress (user_id, selected_preset, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      user.id, presetId, nowIso(), nowIso(),
    );
  }
  return json({ selected_preset: presetId });
};
