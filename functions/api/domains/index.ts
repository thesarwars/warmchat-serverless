/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireOrgRole } from "../../_shared/roleRequired.ts";
import { getDomainRecords } from "../../_shared/elasticEmail.ts";

/** POST /api/domains/ - register a sender domain. Owner/Manager. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ domain?: string; org_id?: number }>(request);
  const domain = (body?.domain || "").trim().toLowerCase();
  if (!domain) return error("domain is required", 400);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  const orgId = body?.org_id ?? m?.org_id;
  if (!orgId) return error("User is not part of any organization", 403);
  if (!(await requireOrgRole(env, user.id, orgId, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  const rec = (await getDomainRecords(env, domain)).data;
  await execute(
    env.D1DB,
    `INSERT INTO email_domain
       (org_id, domain, status, spf_name, spf_value, dkim_name, dkim_value,
        tracking_name, tracking_value, created_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(org_id, domain) DO UPDATE SET status = 'pending'`,
    orgId, domain,
    "@", rec?.spfValue || "v=spf1 include:_spf.elasticemail.com ~all",
    rec?.dkimSelector || "api._domainkey", rec?.dkimValue || "",
    rec?.trackingHost || `tracking.${domain}`, rec?.trackingValue || "api.elasticemail.com",
    nowIso(),
  );
  const row = await queryFirst(env.D1DB, `SELECT * FROM email_domain WHERE org_id = ? AND domain = ?`, orgId, domain);
  return json({ success: true, domain: row }, 201);
};
