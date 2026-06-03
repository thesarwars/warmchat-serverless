/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll, queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/compliance/summary - per-org dashboard for the agent-facing
 * Compliance tab (/settings?tab=compliance). Returns three buckets in one
 * round-trip:
 *
 *   - opt_outs       SMS contacts who texted STOP (opt_out_reason='keyword').
 *   - unsubscribes   leads who clicked the email unsubscribe link.
 *   - blocks         agent + admin + import-driven manual blocks.
 *
 * All bucket lists are scoped to the caller's org. The tab is read-only -
 * only site admins can unblock (policy: keeps a central audit trail), so the
 * endpoint exposes lists + counts only.
 */

interface SmsRow {
  contact_id: number;
  phone: string;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  blocked_by_user_id: number | null;
  blocked_by_name: string | null;
  lead_id: number | null;
  lead_name: string | null;
}

interface EmailRow {
  lead_id: number;
  lead_name: string | null;
  email: string | null;
  last_email_opt_out_at: string | null;
}

const RECENT_LIMIT = 50;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!m) return error("User not part of organization", 403);
  const orgId = m.org_id;

  // Counts (one query each, all aggregates so the cost is bounded).
  const smsCounts = await queryFirst<{
    keyword: number; manual_admin: number; manual_agent: number; manual_import: number; other: number; total: number;
  }>(
    env.D1DB,
    `SELECT
        SUM(CASE WHEN opt_out_reason = 'keyword'       THEN 1 ELSE 0 END) AS keyword,
        SUM(CASE WHEN opt_out_reason = 'manual_admin'  THEN 1 ELSE 0 END) AS manual_admin,
        SUM(CASE WHEN opt_out_reason = 'manual_agent'  THEN 1 ELSE 0 END) AS manual_agent,
        SUM(CASE WHEN opt_out_reason = 'manual_import' THEN 1 ELSE 0 END) AS manual_import,
        SUM(CASE WHEN opt_out_reason IS NULL OR opt_out_reason NOT IN
            ('keyword','manual_admin','manual_agent','manual_import') THEN 1 ELSE 0 END) AS other,
        COUNT(1) AS total
       FROM sms_contact WHERE org_id = ? AND opted_out = 1`,
    orgId,
  );

  const emailTotal = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(1) AS n FROM lead WHERE org_id = ? AND email_opt_out = 1`,
    orgId,
  );

  // Recent SMS opt-outs (STOP keyword path - distinguished from manual blocks).
  const opt_outs = await queryAll<SmsRow>(
    env.D1DB,
    `SELECT sc.id              AS contact_id,
            sc.phone_number_e164 AS phone,
            sc.opted_out_at    AS opted_out_at,
            sc.opt_out_reason  AS opt_out_reason,
            sc.blocked_by_user_id,
            bu.name            AS blocked_by_name,
            l.id               AS lead_id,
            l.name             AS lead_name
       FROM sms_contact sc
       LEFT JOIN lead l ON l.org_id = sc.org_id AND l.phone = sc.phone_number_e164
       LEFT JOIN "user" bu ON bu.id = sc.blocked_by_user_id
      WHERE sc.org_id = ? AND sc.opted_out = 1 AND sc.opt_out_reason = 'keyword'
      ORDER BY sc.opted_out_at DESC NULLS LAST, sc.id DESC
      LIMIT ?`,
    orgId, RECENT_LIMIT,
  );

  // Recent manual blocks (admin / agent / import).
  const blocks = await queryAll<SmsRow>(
    env.D1DB,
    `SELECT sc.id              AS contact_id,
            sc.phone_number_e164 AS phone,
            sc.opted_out_at    AS opted_out_at,
            sc.opt_out_reason  AS opt_out_reason,
            sc.blocked_by_user_id,
            bu.name            AS blocked_by_name,
            l.id               AS lead_id,
            l.name             AS lead_name
       FROM sms_contact sc
       LEFT JOIN lead l ON l.org_id = sc.org_id AND l.phone = sc.phone_number_e164
       LEFT JOIN "user" bu ON bu.id = sc.blocked_by_user_id
      WHERE sc.org_id = ? AND sc.opted_out = 1
        AND sc.opt_out_reason IN ('manual_admin','manual_agent','manual_import')
      ORDER BY sc.opted_out_at DESC NULLS LAST, sc.id DESC
      LIMIT ?`,
    orgId, RECENT_LIMIT,
  );

  // Recent email unsubscribes.
  const unsubscribes = await queryAll<EmailRow>(
    env.D1DB,
    `SELECT id   AS lead_id,
            name AS lead_name,
            email,
            last_email_opt_out_at
       FROM lead
      WHERE org_id = ? AND email_opt_out = 1
      ORDER BY last_email_opt_out_at DESC NULLS LAST, id DESC
      LIMIT ?`,
    orgId, RECENT_LIMIT,
  );

  return json({
    counts: {
      sms: {
        keyword:       Number(smsCounts?.keyword ?? 0),
        manual_admin:  Number(smsCounts?.manual_admin ?? 0),
        manual_agent:  Number(smsCounts?.manual_agent ?? 0),
        manual_import: Number(smsCounts?.manual_import ?? 0),
        other:         Number(smsCounts?.other ?? 0),
        total:         Number(smsCounts?.total ?? 0),
      },
      email: {
        unsubscribed: Number(emailTotal?.n ?? 0),
      },
    },
    opt_outs,
    blocks,
    unsubscribes,
  });
};
