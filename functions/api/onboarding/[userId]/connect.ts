/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * POST /api/onboarding/:userId/connect - mark a channel (email|sms) connected
 * for the onboarding flow. Idempotent: upserts onboarding_progress.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const targetId = Number(params.userId);
  if (targetId !== user.id) return error("Forbidden", 403);

  const body = (await readJson<{ channel?: string }>(request)) || {};
  const channel = (body.channel || "").toLowerCase();
  if (channel !== "email" && channel !== "sms") {
    return error("channel must be 'email' or 'sms'", 400);
  }
  const col = channel === "email" ? "email_connected" : "sms_connected";

  const existing = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM onboarding_progress WHERE user_id = ?`, user.id);
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE onboarding_progress SET ${col} = 1, updated_at = ? WHERE user_id = ?`,
      nowIso(), user.id,
    );
  } else {
    await execute(
      env.D1DB,
      `INSERT INTO onboarding_progress (user_id, ${col}, created_at, updated_at) VALUES (?, 1, ?, ?)`,
      user.id, nowIso(), nowIso(),
    );
  }
  return json({ channel, connected: true });
};
