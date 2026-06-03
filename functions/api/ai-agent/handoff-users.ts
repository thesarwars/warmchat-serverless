/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll, queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/ai-agent/handoff-users - members of the caller's org who can be
 * picked as the AI Follow-Up handoff target.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!m) return error("User not part of organization", 403);

  const users = await queryAll<{ id: number; name: string | null; email: string }>(
    env.D1DB,
    `SELECT u.id, u.name, u.email
       FROM "user" u
       JOIN membership mb ON mb.user_id = u.id
      WHERE mb.org_id = ?
      ORDER BY u.id = ? DESC, u.name COLLATE NOCASE`,
    m.org_id, user.id,
  );
  return json({ users });
};
