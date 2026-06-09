/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryFirst, queryAll, execute } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";
import { hotStatusSql } from "../../../../_shared/leadStage.ts";

/**
 * Per-agent + per-workspace sales (commission) goals. user_id = 0 means the
 * whole-workspace goal; any other user_id is that agent's personal goal. Created
 * lazily (idempotent) so this works without a separate migration step.
 */
async function ensureGoalTable(db: D1Database): Promise<void> {
  await execute(db, `CREATE TABLE IF NOT EXISTS sales_goal (
    id INTEGER PRIMARY KEY,
    org_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL DEFAULT 0,
    year INTEGER NOT NULL,
    commission_goal REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await execute(db, `CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_goal ON sales_goal (org_id, user_id, year)`);
}

/**
 * GET /api/dashboard/org/:orgId/goals?year=YYYY -> Admin ▸ Goals tab (live).
 * Commission/deals from won `deal` rows (attributed to agents via lead.owner_id);
 * goals derived from the org's annual target (organization.goal_pipeline_value
 * × commission_percent), split evenly across members since per-agent goals
 * aren't stored yet. Closed/commission filter by the selected year; pipeline +
 * coach reflect current state.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const yearNum = Number(new URL(request.url).searchParams.get("year")) || new Date().getFullYear();
  const year = String(Math.min(Math.max(yearNum, 2000), 2100));
  await ensureGoalTable(env.D1DB);

  const org = await queryFirst<{
    name: string | null; owner_id: number | null; average_deal_price: number | null;
    commission_percent: number | null; goal_pipeline_value: number | null;
    goal_deals_closed: number | null; goal_appointments: number | null;
  }>(env.D1DB,
    `SELECT name, owner_id, average_deal_price, commission_percent, goal_pipeline_value, goal_deals_closed, goal_appointments
       FROM organization WHERE id = ?`, orgId);
  const commissionPct = Number(org?.commission_percent ?? 2.5);
  const avgDealPrice = Number(org?.average_deal_price ?? 400000);
  const annualRevGoal = Number(org?.goal_pipeline_value ?? 0);
  const teamCommissionGoal = annualRevGoal * commissionPct / 100;

  // Members = org owner + membership rows.
  const members = await queryAll<{ id: number; name: string | null; email: string | null }>(
    env.D1DB,
    `SELECT u.id, u.name, u.email FROM membership m JOIN "user" u ON u.id = m.user_id WHERE m.org_id = ?`, orgId);
  const roster: { id: number; name: string; role: string }[] = [];
  if (org?.owner_id) {
    const owner = members.find((m) => m.id === org.owner_id)
      ?? await queryFirst<{ id: number; name: string | null; email: string | null }>(
        env.D1DB, `SELECT id, name, email FROM "user" WHERE id = ?`, org.owner_id);
    if (owner) roster.push({ id: owner.id, name: owner.name || owner.email || "Owner", role: "Owner" });
  }
  for (const m of members) {
    if (roster.some((r) => r.id === m.id)) continue;
    roster.push({ id: m.id, name: m.name || m.email || "Agent", role: "Agent" });
  }
  const memberCount = Math.max(1, roster.length);
  // Stored goals (workspace = user_id 0) override the derived even-split default.
  const storedWs = await queryFirst<{ g: number }>(
    env.D1DB, `SELECT commission_goal AS g FROM sales_goal WHERE org_id = ? AND user_id = 0 AND year = ?`, orgId, year);
  const storedAgents = await queryAll<{ uid: number; g: number }>(
    env.D1DB, `SELECT user_id AS uid, commission_goal AS g FROM sales_goal WHERE org_id = ? AND user_id != 0 AND year = ?`, orgId, year);
  const storedAgentMap = new Map(storedAgents.map((r) => [Number(r.uid), Number(r.g)]));
  const effectiveTeamGoal = storedWs ? Number(storedWs.g) : teamCommissionGoal;
  const perAgentGoal = effectiveTeamGoal > 0 ? Math.round(effectiveTeamGoal / memberCount) : 0;

  // Earned (won-deal commission) per agent, this year.
  const earnedRows = await queryAll<{ uid: number | null; earned: number; deals: number }>(
    env.D1DB,
    `SELECT l.owner_id AS uid,
            COALESCE(SUM(COALESCE(d.commission, COALESCE(d.value,0) * ? / 100.0)), 0) AS earned,
            COUNT(*) AS deals
       FROM deal d JOIN lead l ON l.id = d.lead_id
      WHERE d.org_id = ? AND d.status = 'won'
        AND strftime('%Y', COALESCE(d.closed_at, d.updated_at)) = ?
      GROUP BY l.owner_id`, commissionPct, orgId, year);
  const earnedMap = new Map(earnedRows.map((r) => [Number(r.uid), Number(r.earned)]));

  // Org totals (this year) + current pipeline.
  const closedYear = await queryFirst<{ deals: number; revenue: number; commission: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS deals,
            COALESCE(SUM(COALESCE(value,0)), 0) AS revenue,
            COALESCE(SUM(COALESCE(commission, COALESCE(value,0) * ? / 100.0)), 0) AS commission
       FROM deal WHERE org_id = ? AND status = 'won'
        AND strftime('%Y', COALESCE(closed_at, updated_at)) = ?`, commissionPct, orgId, year);
  const openDeals = await queryFirst<{ n: number; v: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE(value, ?)), 0) AS v FROM deal WHERE org_id = ? AND status = 'open'`,
    avgDealPrice, orgId);
  const underContract = await queryFirst<{ v: number }>(
    env.D1DB,
    `SELECT COALESCE(SUM(COALESCE(estimated_price, 0)), 0) AS v FROM lead WHERE org_id = ? AND LOWER(COALESCE(status,'')) = 'under contract'`, orgId);
  const apptMonth = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM lead_appointment WHERE org_id = ? AND COALESCE(status,'') != 'cancelled'
        AND strftime('%Y-%m', starts_at) = strftime('%Y-%m','now')`, orgId);
  const hot = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(*) AS n FROM lead WHERE org_id = ? AND (${hotStatusSql("status")})`, orgId);

  const commissionEarned = Math.round(Number(closedYear?.commission ?? 0));
  const dealsClosed = Number(closedYear?.deals ?? 0);
  const closedRevenue = Math.round(Number(closedYear?.revenue ?? 0));
  const activePipeline = Math.round(Number(openDeals?.v ?? 0));

  const statusFor = (pct: number, goal: number) => (goal <= 0 ? "Set goal" : pct >= 70 ? "On Track" : pct >= 40 ? "Behind" : "At Risk");
  const agents = roster.map((r) => {
    const earned = Math.round(earnedMap.get(r.id) ?? 0);
    const goal = storedAgentMap.get(r.id) ?? perAgentGoal;
    const pct = goal > 0 ? Math.round((earned / goal) * 100) : 0;
    return { id: r.id, name: r.name, role: r.role, earned, goal, pct: Math.min(pct, 100), status: statusFor(pct, goal) };
  }).sort((a, b) => b.earned - a.earned);

  // ---- AI Goal Coach (current user's view) --------------------------------
  const personalEarned = Math.round(earnedMap.get(user.id) ?? 0);
  const personalGoal = storedAgentMap.get(user.id) ?? perAgentGoal;
  const avgDealCommission = dealsClosed > 0 ? commissionEarned / dealsClosed : avgDealPrice * commissionPct / 100;
  const commissionGap = Math.max(0, personalGoal - personalEarned);
  const dealsNeeded = avgDealCommission > 0 ? Math.ceil(commissionGap / avgDealCommission) : 0;
  const apptGap = Math.max(0, Number(org?.goal_appointments ?? 0) - Number(apptMonth?.n ?? 0));
  const hotLeads = Number(hot?.n ?? 0);
  const coachItems: { icon: string; text: string }[] = [];
  if (personalGoal > 0 && dealsNeeded > 0) coachItems.push({ icon: "calendarCheck", text: `Close ${dealsNeeded} more deal${dealsNeeded > 1 ? "s" : ""}` });
  if (apptGap > 0) coachItems.push({ icon: "calendar", text: `Book ${apptGap} more appointment${apptGap > 1 ? "s" : ""}` });
  if (hotLeads > 0) coachItems.push({ icon: "message", text: `Follow up with ${hotLeads} warm lead${hotLeads > 1 ? "s" : ""}` });
  if (coachItems.length === 0) coachItems.push({ icon: "checkCircle", text: "You're on pace — keep nurturing your pipeline" });
  const onTrack = personalGoal <= 0 ? true : (personalEarned / personalGoal) >= 0.6;

  return json({
    year: Number(year),
    team_name: org?.name || "Workspace",
    member_count: roster.length,
    me: user.id,
    team_goal: Math.round(effectiveTeamGoal),
    kpis: {
      commission_earned: commissionEarned,
      deals_closed: dealsClosed,
      upcoming_deals: Number(openDeals?.n ?? 0),
      upcoming_value: activePipeline,
      goal_progress: effectiveTeamGoal > 0 ? Math.min(100, Math.round((commissionEarned / effectiveTeamGoal) * 100)) : 0,
      goal_set: effectiveTeamGoal > 0,
    },
    agents,
    coach: {
      personal_goal: personalGoal,
      on_track: onTrack,
      items: coachItems,
    },
    pipeline: {
      closed_revenue: closedRevenue,
      under_contract: Math.round(Number(underContract?.v ?? 0)),
      active_pipeline: activePipeline,
    },
    last_updated: new Date().toISOString(),
  });
};

/**
 * PUT /api/dashboard/org/:orgId/goals -> set a commission goal for the whole
 * workspace (user_id = 0), an agent, or yourself. Admins manage goals; the
 * Admin tab is admin-gated and org membership is verified here.
 * Body: { user_id?: number, year?: number, commission_goal: number }.
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  let body: { user_id?: number; year?: number; commission_goal?: number };
  try { body = await request.json(); } catch { return error("Invalid body", 400); }
  const targetUser = Number.isInteger(body.user_id) ? Number(body.user_id) : 0;
  const yearNum = Number(body.year) || new Date().getFullYear();
  const year = Math.min(Math.max(yearNum, 2000), 2100);
  const goal = Math.max(0, Math.round(Number(body.commission_goal) || 0));

  if (targetUser !== 0 && !(await isOrgMember(env, targetUser, orgId))) {
    return error("Target user is not a member of this org", 400);
  }

  await ensureGoalTable(env.D1DB);
  await execute(env.D1DB,
    `INSERT INTO sales_goal (org_id, user_id, year, commission_goal, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(org_id, user_id, year)
     DO UPDATE SET commission_goal = excluded.commission_goal, updated_at = CURRENT_TIMESTAMP`,
    orgId, targetUser, year, goal);

  return json({ ok: true, user_id: targetUser, year, commission_goal: goal });
};
