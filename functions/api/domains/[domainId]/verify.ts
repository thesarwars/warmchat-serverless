/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { requireOrgRole } from "../../../_shared/roleRequired.ts";
import { verifyDomain } from "../../../_shared/elasticEmail.ts";

/** POST /api/domains/:domainId/verify - trigger DNS verification. Owner/Manager. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.domainId);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  const row = await queryFirst<{ domain: string; org_id: number }>(
    env.D1DB, `SELECT domain, org_id FROM email_domain WHERE id = ?`, id);
  if (!row) return error("Domain not found", 404);
  if (!(await requireOrgRole(env, user.id, row.org_id, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  const r = await verifyDomain(env, row.domain);
  if (!r.ok) return error(r.error || "Verification failed", 502);
  await execute(env.D1DB, `UPDATE email_domain SET status = 'verified', verified_at = ? WHERE id = ?`, nowIso(), id);
  return json({ success: true });
};
