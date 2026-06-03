/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireCallerOrgRole } from "../../_shared/roleRequired.ts";

/** GET /api/orgs/all - orgs the caller belongs to (or owns). Owner/Manager. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await requireCallerOrgRole(env, user.id, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }
  const rows = await queryAll(
    env.D1DB,
    `SELECT DISTINCT o.id, o.name, o.owner_id, o.plan, o.subscription_status, o.timezone
       FROM organization o
       LEFT JOIN membership m ON m.org_id = o.id
      WHERE o.owner_id = ? OR m.user_id = ?
      ORDER BY o.id ASC`,
    user.id, user.id,
  );
  return json({ orgs: rows });
};
