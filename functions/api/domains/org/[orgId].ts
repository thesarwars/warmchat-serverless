/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/** GET /api/domains/org/:orgId - list verified + pending domains for the org. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId) || !(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);
  const rows = await queryAll(env.D1DB, `SELECT * FROM email_domain WHERE org_id = ?`, orgId);
  return json({ domains: rows });
};
