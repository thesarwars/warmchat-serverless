/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * POST /api/notifications/subscribe
 * Persists a Web Push subscription (PushSubscription.toJSON() shape).
 * Idempotent: upserts on `endpoint`.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(request)) || {};
  const endpoint = (body.endpoint || "").trim();
  const p256dh = (body.keys?.p256dh || "").trim();
  const auth = (body.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    return error("endpoint, keys.p256dh, and keys.auth are required", 400);
  }

  const existing = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM push_subscription WHERE endpoint = ?`, endpoint);
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE push_subscription SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?, revoked_at = NULL WHERE id = ?`,
      user.id, p256dh, auth, request.headers.get("User-Agent"), existing.id,
    );
    return json({ subscribed: true, id: existing.id });
  }
  const ins = await execute(
    env.D1DB,
    `INSERT INTO push_subscription (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)`,
    user.id, endpoint, p256dh, auth, request.headers.get("User-Agent"),
  );
  return json({ subscribed: true, id: Number(ins.meta.last_row_id) }, 201);
};
