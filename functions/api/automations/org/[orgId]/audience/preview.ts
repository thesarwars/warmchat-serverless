/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { queryAll } from "../../../../../_shared/db.ts";
import { requireUser } from "../../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../../_shared/orgAccess.ts";

interface PreviewBody {
  all_leads?: boolean;
  buckets?: string[];
  tag_ids?: Array<number | string>;
  lead_ids?: Array<number | string>;
}

/**
 * POST /api/automations/org/:orgId/audience/preview - live "X leads selected"
 * counter for the create wizard.
 * Body: { all_leads?, buckets?, tag_ids?, lead_ids? }
 * Response: { count, lead_ids } (capped at 1000)
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("User not part of organization", 403);

  const body = (await readJson<PreviewBody>(request)) || {};
  const allLeads = Boolean(body.all_leads);
  const buckets = (body.buckets || []).map((b) => String(b).trim().toLowerCase());
  const tagIds = (body.tag_ids || []).map((t) => Number(t)).filter((n) => Number.isInteger(n));
  const explicitIds = (body.lead_ids || []).map((l) => Number(l)).filter((n) => Number.isInteger(n));

  if (allLeads) {
    const rows = await queryAll<{ id: number }>(
      env.D1DB, `SELECT id FROM lead WHERE org_id = ? LIMIT 1000`, orgId,
    );
    const totalRow = await queryAll<{ n: number }>(
      env.D1DB, `SELECT COUNT(id) AS n FROM lead WHERE org_id = ?`, orgId,
    );
    return json({ count: totalRow[0]?.n ?? rows.length, lead_ids: rows.map((r) => r.id) });
  }

  const matching = new Set<number>(explicitIds);
  if (buckets.includes("buyer")) {
    const rows = await queryAll<{ id: number }>(
      env.D1DB,
      `SELECT id FROM lead WHERE org_id = ? AND LOWER(COALESCE(status, '')) LIKE '%buyer%'`,
      orgId,
    );
    for (const r of rows) matching.add(r.id);
  }
  if (buckets.includes("seller")) {
    const rows = await queryAll<{ id: number }>(
      env.D1DB,
      `SELECT id FROM lead WHERE org_id = ? AND LOWER(COALESCE(status, '')) LIKE '%seller%'`,
      orgId,
    );
    for (const r of rows) matching.add(r.id);
  }
  if (buckets.includes("new")) {
    const rows = await queryAll<{ id: number }>(
      env.D1DB,
      `SELECT id FROM lead WHERE org_id = ? AND LOWER(COALESCE(status, '')) = 'new'`,
      orgId,
    );
    for (const r of rows) matching.add(r.id);
  }
  if (tagIds.length > 0) {
    const placeholders = tagIds.map(() => "?").join(",");
    const rows = await queryAll<{ lead_id: number }>(
      env.D1DB,
      `SELECT lt.lead_id FROM lead_tags lt
         JOIN lead l ON l.id = lt.lead_id
        WHERE lt.tag_id IN (${placeholders}) AND l.org_id = ?`,
      ...tagIds, orgId,
    );
    for (const r of rows) matching.add(r.lead_id);
  }

  if (matching.size === 0) return json({ count: 0, lead_ids: [] });

  const ids = [...matching];
  const placeholders = ids.map(() => "?").join(",");
  const total = await queryAll<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM lead WHERE org_id = ? AND id IN (${placeholders})`,
    orgId, ...ids,
  );
  const cappedRows = await queryAll<{ id: number }>(
    env.D1DB,
    `SELECT id FROM lead WHERE org_id = ? AND id IN (${placeholders}) LIMIT 1000`,
    orgId, ...ids,
  );
  return json({ count: total[0]?.n ?? cappedRows.length, lead_ids: cappedRows.map((r) => r.id) });
};
