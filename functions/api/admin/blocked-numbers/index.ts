/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isSiteAdmin } from "../../../_shared/adminAccess.ts";
import { normalizeE164 } from "../../../_shared/phone.ts";
import { suppressPhone, unsuppressPhone } from "../../../_shared/suppression.ts";

/**
 * Admin blocked-numbers manager.
 *
 *   GET    /api/admin/blocked-numbers           - list every opted-out number
 *                                                 across every org, with the
 *                                                 lead name + agent owner if
 *                                                 known. Site-admin only.
 *   POST   /api/admin/blocked-numbers           - manually block a phone
 *                                                 (org_id + phone_e164).
 *   DELETE /api/admin/blocked-numbers?org_id&phone - unblock (lift suppression).
 *
 * The data comes from `sms_contact` joined with `lead` so we can show a
 * recognizable name next to each phone. Manual blocks are written via the
 * shared `suppressPhone` helper so the lead's sms_opt_out flag stays in sync
 * with the canonical sms_contact.opted_out flag.
 */

interface BlockedRow {
  contact_id: number;
  org_id: number;
  org_name: string | null;
  phone: string;
  opted_out_at: string | null;
  opt_in_status: string;
  opt_out_reason: string | null;
  blocked_by_user_id: number | null;
  blocked_by_name: string | null;
  lead_id: number | null;
  lead_name: string | null;
  agent_name: string | null;
}

interface Counts {
  total: number;
  by_reason: { keyword: number; manual_admin: number; other: number };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isSiteAdmin(env, user.id))) return error("Admin access required", 403);

  const url = new URL(request.url);
  const orgFilter = url.searchParams.get("org_id");
  const search = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

  const where: string[] = ["sc.opted_out = 1"];
  const args: unknown[] = [];
  if (orgFilter) { where.push("sc.org_id = ?"); args.push(Number(orgFilter)); }
  if (search) {
    where.push("(sc.phone_number_e164 LIKE ? OR l.name LIKE ?)");
    args.push(`%${search}%`, `%${search}%`);
  }
  const whereSql = where.join(" AND ");

  const rows = await queryAll<BlockedRow>(
    env.D1DB,
    `SELECT sc.id            AS contact_id,
            sc.org_id        AS org_id,
            o.name           AS org_name,
            sc.phone_number_e164 AS phone,
            sc.opted_out_at  AS opted_out_at,
            sc.opt_in_status AS opt_in_status,
            sc.opt_out_reason AS opt_out_reason,
            sc.blocked_by_user_id AS blocked_by_user_id,
            bu.name          AS blocked_by_name,
            l.id             AS lead_id,
            l.name           AS lead_name,
            ow.name          AS agent_name
       FROM sms_contact sc
       LEFT JOIN organization o ON o.id = sc.org_id
       LEFT JOIN lead l ON l.org_id = sc.org_id AND l.phone = sc.phone_number_e164
       LEFT JOIN "user" ow ON ow.id = l.owner_id
       LEFT JOIN "user" bu ON bu.id = sc.blocked_by_user_id
      WHERE ${whereSql}
      ORDER BY sc.opted_out_at DESC NULLS LAST, sc.id DESC
      LIMIT ? OFFSET ?`,
    ...args, limit, offset,
  );

  // Cheap aggregate counts for the dashboard tile (total + by-reason).
  const totalsRow = await queryFirst<{ total: number; keyword: number; manual: number; other: number }>(
    env.D1DB,
    `SELECT COUNT(1) AS total,
            SUM(CASE WHEN opt_out_reason = 'keyword' THEN 1 ELSE 0 END) AS keyword,
            SUM(CASE WHEN opt_out_reason = 'manual_admin' THEN 1 ELSE 0 END) AS manual,
            SUM(CASE WHEN opt_out_reason IS NULL OR opt_out_reason NOT IN ('keyword','manual_admin') THEN 1 ELSE 0 END) AS other
       FROM sms_contact WHERE opted_out = 1`,
  );

  const counts: Counts = {
    total: Number(totalsRow?.total ?? 0),
    by_reason: {
      keyword: Number(totalsRow?.keyword ?? 0),
      manual_admin: Number(totalsRow?.manual ?? 0),
      other: Number(totalsRow?.other ?? 0),
    },
  };

  return json({ rows, counts, limit, offset });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isSiteAdmin(env, user.id))) return error("Admin access required", 403);

  const body = (await readJson<{ org_id?: number; phone?: string }>(request)) || {};
  const orgId = Number(body.org_id);
  if (!Number.isInteger(orgId) || orgId <= 0) return error("org_id is required", 400);
  let phone: string;
  try { phone = normalizeE164(body.phone || ""); }
  catch (e) { return error((e as Error).message, 400); }

  await suppressPhone(env, orgId, phone, {
    reason: "manual_admin",
    blockedByUserId: user.id,
  });
  return json({ blocked: true, org_id: orgId, phone });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isSiteAdmin(env, user.id))) return error("Admin access required", 403);

  const url = new URL(request.url);
  const orgId = Number(url.searchParams.get("org_id"));
  const rawPhone = url.searchParams.get("phone") || "";
  if (!Number.isInteger(orgId) || orgId <= 0) return error("org_id is required", 400);
  let phone: string;
  try { phone = normalizeE164(rawPhone); }
  catch (e) { return error((e as Error).message, 400); }

  await unsuppressPhone(env, orgId, phone);
  return json({ unblocked: true, org_id: orgId, phone });
};
