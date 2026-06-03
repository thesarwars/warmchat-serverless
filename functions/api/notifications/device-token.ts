/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

const PLATFORMS = new Set(["ios", "android", "web"]);

/** POST /api/notifications/device-token - register an FCM device token. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<{ token?: string; platform?: string }>(request)) || {};
  const token = (body.token || "").trim();
  const platform = (body.platform || "").toLowerCase();
  if (!token) return error("token is required", 400);
  if (!PLATFORMS.has(platform)) return error("platform must be ios|android|web", 400);

  const existing = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM device_token WHERE token = ?`, token);
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE device_token SET user_id = ?, platform = ?, last_seen_at = ?, revoked_at = NULL WHERE id = ?`,
      user.id, platform, nowIso(), existing.id,
    );
    return json({ registered: true, id: existing.id });
  }
  const ins = await execute(
    env.D1DB,
    `INSERT INTO device_token (user_id, token, platform, last_seen_at) VALUES (?, ?, ?, ?)`,
    user.id, token, platform, nowIso(),
  );
  return json({ registered: true, id: Number(ins.meta.last_row_id) }, 201);
};

/** DELETE /api/notifications/device-token - revoke by token (passed in body). */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<{ token?: string }>(request)) || {};
  const token = (body.token || "").trim();
  if (!token) return error("token is required", 400);
  await execute(
    env.D1DB,
    `UPDATE device_token SET revoked_at = ? WHERE token = ? AND user_id = ?`,
    nowIso(), token, user.id,
  );
  return new Response(null, { status: 204 });
};
