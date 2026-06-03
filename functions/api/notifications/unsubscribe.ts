/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/** POST /api/notifications/unsubscribe - revoke a Web Push subscription. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<{ endpoint?: string }>(request)) || {};
  const endpoint = (body.endpoint || "").trim();
  if (!endpoint) return error("endpoint is required", 400);

  await execute(
    env.D1DB,
    `UPDATE push_subscription SET revoked_at = ? WHERE endpoint = ? AND user_id = ?`,
    nowIso(), endpoint, user.id,
  );
  return json({ unsubscribed: true });
};
