/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/** POST /api/notifications/read-all -> { updated } (count marked read). */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const res = await execute(
    env.D1DB,
    `UPDATE notification SET is_read = 1, read_at = ? WHERE user_id = ? AND is_read = 0`,
    nowIso(), user.id,
  );
  return json({ updated: res.meta.changes ?? 0 });
};
