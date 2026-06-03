/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * GET /api/email/threads - list email threads for the caller's org.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const threads = await queryAll(
    env.D1DB,
    `SELECT t.id, t.subject, t.created_at, t.updated_at, t.unread_count
       FROM thread t JOIN inbox i ON i.id = t.inbox_id
       JOIN membership m ON m.org_id = i.org_id
      WHERE m.user_id = ? AND i.channel = 'email'
      ORDER BY t.updated_at DESC LIMIT 100`,
    user.id,
  );
  return json({ threads });
};
