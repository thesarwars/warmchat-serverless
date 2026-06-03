/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";

/**
 * GET /api/inbox/fetch/already/:userId - list inbox connections the user has
 * already linked.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const rows = await queryAll(
    env.D1DB,
    `SELECT id, email_address, provider, imap_host, smtp_host, can_receive, is_verified, status,
            elastic_from_email, elastic_email_inbound_route_added, created_at
       FROM inbox_connection WHERE user_id = ?`,
    user.id,
  );
  return json({ connections: rows });
};
