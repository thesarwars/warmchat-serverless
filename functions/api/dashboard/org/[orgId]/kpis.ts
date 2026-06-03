/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryFirst, queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";
import { hotStatusSql } from "../../../../_shared/leadStage.ts";

/**
 * GET /api/dashboard/org/:orgId/kpis?window=30 -> the AI-KPI engine. Live
 * aggregates over leads/deals/appointments so the dashboard + AI Agent
 * "self-update" as the agent maintains records (docs: "Smart Filters Update
 * Automatically" / AI KPI Engine). Single indexed aggregate queries (free-tier
 * friendly).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const windowDays = Math.min(Math.max(Number(new URL(request.url).searchParams.get("window")) || 30, 1), 365);
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  const totals = await queryFirst<{
    total: number; recent: number; qualified: number; hot: number;
    replied: number; buyers: number; sellers: number; avg_price: number | null;
  }>(
    env.D1DB,
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN datetime(created_at) >= datetime(?) THEN 1 ELSE 0 END) AS recent,
       SUM(CASE WHEN LOWER(COALESCE(status,'')) = 'qualified'
                  OR LOWER(COALESCE(qualification_status,'')) IN ('qualified','booking-ready') THEN 1 ELSE 0 END) AS qualified,
       SUM(CASE WHEN ${hotStatusSql("status")} THEN 1 ELSE 0 END) AS hot,
       SUM(CASE WHEN last_reply_at IS NOT NULL THEN 1 ELSE 0 END) AS replied,
       SUM(CASE WHEN LOWER(COALESCE(lead_type,'')) = 'buyer' THEN 1 ELSE 0 END) AS buyers,
       SUM(CASE WHEN LOWER(COALESCE(lead_type,'')) = 'seller' THEN 1 ELSE 0 END) AS sellers,
       AVG(estimated_price) AS avg_price
     FROM lead WHERE org_id = ?`,
    since, orgId,
  );

  const appts = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM lead_appointment WHERE org_id = ? AND status != 'cancelled'`, orgId);
  const deals = await queryFirst<{ won: number; pipeline: number | null }>(
    env.D1DB,
    `SELECT
       SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won,
       SUM(CASE WHEN status NOT IN ('won','lost','archived') THEN COALESCE(value, 0) ELSE 0 END) AS pipeline
     FROM deal WHERE org_id = ?`, orgId);
  const byArea = await queryAll<{ area: string | null; n: number }>(
    env.D1DB,
    `SELECT area, COUNT(*) AS n FROM lead WHERE org_id = ? AND area IS NOT NULL AND area != ''
      GROUP BY area ORDER BY n DESC LIMIT 8`, orgId);
  // What the AI actually did TODAY (distinct leads per category) - powers the AI
  // Agent autopilot banner. Aggregated server-side over ai_activity_log so it is
  // accurate regardless of volume (the activity-log list endpoint caps at 100
  // rows). COUNT(DISTINCT ...) ignores NULL lead_ids, so each lead counts once.
  const aiToday = await queryFirst<{ conversations: number; records: number; moved: number }>(
    env.D1DB,
    `SELECT
       COUNT(DISTINCT CASE WHEN event IN ('reply.sent','message.sent') THEN lead_id END) AS conversations,
       COUNT(DISTINCT CASE WHEN event = 'lead.updated' THEN lead_id END) AS records,
       COUNT(DISTINCT CASE WHEN event IN ('lead.stage_changed','lead.qualified') THEN lead_id END) AS moved
     FROM ai_activity_log WHERE org_id = ? AND date(created_at) = date('now')`, orgId);

  const total = Number(totals?.total ?? 0);
  const appointmentsSet = Number(appts?.n ?? 0);
  const replied = Number(totals?.replied ?? 0);
  const dealsWon = Number(deals?.won ?? 0);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

  return json({
    window_days: windowDays,
    total_leads: total,
    new_leads: Number(totals?.recent ?? 0),
    qualified_leads: Number(totals?.qualified ?? 0),
    hot_leads: Number(totals?.hot ?? 0),
    appointments_set: appointmentsSet,
    appointment_rate: pct(appointmentsSet, total),
    response_rate: pct(replied, total),
    conversion_rate: pct(dealsWon, total),
    deals_closed: dealsWon,
    pipeline_value: Math.round(Number(deals?.pipeline ?? 0)),
    buyers_count: Number(totals?.buyers ?? 0),
    sellers_count: Number(totals?.sellers ?? 0),
    avg_price_point: totals?.avg_price ? Math.round(totals.avg_price) : 0,
    leads_by_area: byArea.map((a) => ({ area: a.area, count: Number(a.n) })),
    ai_today: {
      conversations: Number(aiToday?.conversations ?? 0),
      records: Number(aiToday?.records ?? 0),
      moved: Number(aiToday?.moved ?? 0),
    },
  });
};
