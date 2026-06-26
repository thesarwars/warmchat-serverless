/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/** GET /api/ai/fetch/template-categories?org_id=N */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(new URL(request.url).searchParams.get("org_id"));
  if (!Number.isInteger(orgId)) return error("org_id is required", 400);
  // Tenant isolation: only the caller's own org (was trusting the ?org_id param).
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);
  const rows = await queryAll(
    env.D1DB,
    `SELECT id, name, is_active FROM template_categories WHERE org_id = ? AND is_active = 1 ORDER BY id`,
    orgId,
  );
  return json(rows);
};
