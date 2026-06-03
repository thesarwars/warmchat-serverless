/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireCallerOrgRole } from "../../_shared/roleRequired.ts";

/**
 * GET /api/auth/users - users in the caller's org(s) with their role.
 * Owner/Manager only.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await requireCallerOrgRole(env, user.id, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  const rows = await queryAll<{
    id: number; name: string | null; email: string;
    org_id: number; org_name: string; role_id: number | null; role_name: string | null;
  }>(
    env.D1DB,
    `SELECT u.id, u.name, u.email,
            o.id AS org_id, o.name AS org_name,
            r.id AS role_id, r.name AS role_name
       FROM membership m
       JOIN "user" u ON u.id = m.user_id
       JOIN organization o ON o.id = m.org_id
       LEFT JOIN role r ON r.id = m.role_id
      WHERE m.org_id IN (SELECT org_id FROM membership WHERE user_id = ?)
      ORDER BY u.id ASC`,
    user.id,
  );
  return json({ users: rows });
};
