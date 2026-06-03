/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/** GET /api/notifications/unread-count -> { unread_count }. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const row = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM notification WHERE user_id = ? AND is_read = 0`,
    user.id,
  );
  return json({ unread_count: row?.n ?? 0 });
};
