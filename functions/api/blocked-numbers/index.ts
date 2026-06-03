/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll, queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/blocked-numbers - read-only list of opted-out phone numbers for
 * the caller's own org. Used by the agent-facing "Blocked Numbers" view so
 * agents can see who has opted out without granting them the unblock
 * privilege (that lives on /admin/blocked for site admins only).
 *
 * Returns the same row shape as the admin endpoint, scoped to the requester's
 * org via membership.
 */

interface BlockedRow {
  contact_id: number;
  phone: string;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  lead_id: number | null;
  lead_name: string | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!m) return error("User not part of organization", 403);

  const rows = await queryAll<BlockedRow>(
    env.D1DB,
    `SELECT sc.id        AS contact_id,
            sc.phone_number_e164 AS phone,
            sc.opted_out_at AS opted_out_at,
            sc.opt_out_reason AS opt_out_reason,
            l.id          AS lead_id,
            l.name        AS lead_name
       FROM sms_contact sc
       LEFT JOIN lead l ON l.org_id = sc.org_id AND l.phone = sc.phone_number_e164
      WHERE sc.org_id = ? AND sc.opted_out = 1
      ORDER BY sc.opted_out_at DESC NULLS LAST, sc.id DESC
      LIMIT 500`,
    m.org_id,
  );

  const totals = await queryFirst<{ total: number; keyword: number; manual: number }>(
    env.D1DB,
    `SELECT COUNT(1) AS total,
            SUM(CASE WHEN opt_out_reason = 'keyword' THEN 1 ELSE 0 END) AS keyword,
            SUM(CASE WHEN opt_out_reason = 'manual_admin' THEN 1 ELSE 0 END) AS manual
       FROM sms_contact WHERE org_id = ? AND opted_out = 1`,
    m.org_id,
  );

  return json({
    rows,
    counts: {
      total: Number(totals?.total ?? 0),
      by_reason: {
        keyword: Number(totals?.keyword ?? 0),
        manual_admin: Number(totals?.manual ?? 0),
      },
    },
  });
};
