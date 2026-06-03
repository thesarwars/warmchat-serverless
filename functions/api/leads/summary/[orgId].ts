/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { hotStatusSql } from "../../../_shared/leadStage.ts";

/**
 * GET /api/leads/summary/:orgId - top-card counts for the Leads page.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 864e5).toISOString();
  const c1 = iso(1);
  const c7 = iso(7);
  const c14 = iso(14);
  const c28 = iso(28);
  const c30 = iso(30);
  const c60 = iso(60);

  // Hot predicate mirrors the leads-list quick=hot_leads filter (Stage-derived
  // score > 45) so the KPI card and the filtered table agree on what "hot" means.
  const HOT = hotStatusSql("status");
  // Needs-reply mirrors quick=needs_reply (lead is awaiting our reply).
  const NEEDS_REPLY = `LOWER(IFNULL(ai_status, '')) IN ('awaiting reply', 'awaiting')`;

  // One pass over the org's leads computes: total, new-today, the current
  // total hot count, the needs-reply count, and - for both new and hot - the
  // current vs previous-period counts at 7/14/30-day windows (so the card's
  // 7d/14d/30d toggle is purely client-side, no refetch). Previous period is
  // the equal-length window immediately before the current one.
  const agg = await queryFirst<{
    total: number; new_today: number; hot_total: number; needs_reply: number;
    new_cur_7: number; new_prev_7: number; new_cur_14: number; new_prev_14: number; new_cur_30: number; new_prev_30: number;
    hot_cur_7: number; hot_prev_7: number; hot_cur_14: number; hot_prev_14: number; hot_cur_30: number; hot_prev_30: number;
  }>(
    env.D1DB,
    `SELECT
       COUNT(id) AS total,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_today,
       SUM(CASE WHEN ${HOT} THEN 1 ELSE 0 END) AS hot_total,
       SUM(CASE WHEN ${NEEDS_REPLY} THEN 1 ELSE 0 END) AS needs_reply,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_cur_7,
       SUM(CASE WHEN created_at < ? AND created_at >= ? THEN 1 ELSE 0 END) AS new_prev_7,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_cur_14,
       SUM(CASE WHEN created_at < ? AND created_at >= ? THEN 1 ELSE 0 END) AS new_prev_14,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_cur_30,
       SUM(CASE WHEN created_at < ? AND created_at >= ? THEN 1 ELSE 0 END) AS new_prev_30,
       SUM(CASE WHEN ${HOT} AND created_at >= ? THEN 1 ELSE 0 END) AS hot_cur_7,
       SUM(CASE WHEN ${HOT} AND created_at < ? AND created_at >= ? THEN 1 ELSE 0 END) AS hot_prev_7,
       SUM(CASE WHEN ${HOT} AND created_at >= ? THEN 1 ELSE 0 END) AS hot_cur_14,
       SUM(CASE WHEN ${HOT} AND created_at < ? AND created_at >= ? THEN 1 ELSE 0 END) AS hot_prev_14,
       SUM(CASE WHEN ${HOT} AND created_at >= ? THEN 1 ELSE 0 END) AS hot_cur_30,
       SUM(CASE WHEN ${HOT} AND created_at < ? AND created_at >= ? THEN 1 ELSE 0 END) AS hot_prev_30
     FROM lead WHERE org_id = ?`,
    c1,
    c7, c7, c14, c14, c14, c28, c30, c30, c60,
    c7, c7, c14, c14, c14, c28, c30, c30, c60,
    orgId,
  );

  const contacted = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(DISTINCT l.id) AS n FROM lead l
      WHERE l.org_id = ? AND (
        EXISTS (
          SELECT 1 FROM inbox_messages im
            JOIN thread t ON im.thread_id=t.id JOIN inbox i ON t.inbox_id=i.id
           WHERE i.org_id = l.org_id AND im.direction='outbound'
             AND LOWER(im.to_email) = LOWER(l.email))
        OR EXISTS (
          SELECT 1 FROM sms_message m
            JOIN sms_conversation c ON m.conversation_id=c.id
            JOIN sms_contact ct ON c.contact_id=ct.id
           WHERE m.org_id = l.org_id AND m.direction='outbound' AND ct.phone_number_e164 = l.phone)
      )`,
    orgId,
  );

  const totalLeads = agg?.total ?? 0;
  const contactedCount = contacted?.n ?? 0;
  const pct = totalLeads > 0 ? Math.round((contactedCount / totalLeads) * 10000) / 100 : 0;

  const period = (cur: number, prev: number) => ({ current: cur, prev, delta: cur - prev });
  const newLeadsByPeriod = {
    "7": period(agg?.new_cur_7 ?? 0, agg?.new_prev_7 ?? 0),
    "14": period(agg?.new_cur_14 ?? 0, agg?.new_prev_14 ?? 0),
    "30": period(agg?.new_cur_30 ?? 0, agg?.new_prev_30 ?? 0),
  };
  const hotLeadsByPeriod = {
    "7": period(agg?.hot_cur_7 ?? 0, agg?.hot_prev_7 ?? 0),
    "14": period(agg?.hot_cur_14 ?? 0, agg?.hot_prev_14 ?? 0),
    "30": period(agg?.hot_cur_30 ?? 0, agg?.hot_prev_30 ?? 0),
  };

  return json({
    total_leads: totalLeads,
    new_today: agg?.new_today ?? 0,
    hot_leads: agg?.hot_total ?? 0,
    needs_reply: agg?.needs_reply ?? 0,
    new_leads_by_period: newLeadsByPeriod,
    hot_leads_by_period: hotLeadsByPeriod,
    contacted_count: contactedCount,
    contacted_percentage: pct,
  });
};
