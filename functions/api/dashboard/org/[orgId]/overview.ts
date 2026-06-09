/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryFirst, queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";

/**
 * GET /api/dashboard/org/:orgId/overview -> the Admin ▸ Overview command center.
 * One live snapshot over deal / lead / lead_appointment so the tab reflects real
 * pipeline, appointments, conversion and closings (no sample data). Single
 * indexed aggregate queries (free-tier friendly). All money is raw dollars; the
 * client formats it.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  // Org defaults used as fallbacks for missing deal value / commission.
  const org = await queryFirst<{ average_deal_price: number | null; commission_percent: number | null }>(
    env.D1DB,
    `SELECT average_deal_price, commission_percent FROM organization WHERE id = ?`, orgId);
  const avgDealPrice = Number(org?.average_deal_price ?? 400000);
  const commissionPct = Number(org?.commission_percent ?? 2.5);

  // ---- KPI row -------------------------------------------------------------
  // Pipeline value = total value of open deals (deal.value, fallback org avg).
  const pipeline = await queryFirst<{ v: number | null }>(
    env.D1DB,
    `SELECT COALESCE(SUM(COALESCE(value, ?)), 0) AS v FROM deal WHERE org_id = ? AND status = 'open'`,
    avgDealPrice, orgId);

  // Appointments this calendar month (non-cancelled, by scheduled date).
  const apptMonth = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM lead_appointment
      WHERE org_id = ? AND COALESCE(status,'') != 'cancelled'
        AND strftime('%Y-%m', starts_at) = strftime('%Y-%m','now')`, orgId);

  // Lead -> appointment conversion across all leads.
  const leadConv = await queryFirst<{ total: number; booked: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN appointment_booked = 1 THEN 1 ELSE 0 END) AS booked
       FROM lead WHERE org_id = ?`, orgId);

  // Deals closed (won) this month.
  const closedMonth = await queryFirst<{ deals: number; volume: number | null; commission: number | null }>(
    env.D1DB,
    `SELECT COUNT(*) AS deals,
            COALESCE(SUM(COALESCE(value, 0)), 0) AS volume,
            COALESCE(SUM(COALESCE(commission, COALESCE(value, 0) * ? / 100.0)), 0) AS commission
       FROM deal
      WHERE org_id = ? AND status = 'won'
        AND strftime('%Y-%m', COALESCE(closed_at, updated_at)) = strftime('%Y-%m','now')`,
    commissionPct, orgId);

  // ---- Appointments booked, last 14 days (by created date) -----------------
  const apptByDay = await queryAll<{ d: string; n: number }>(
    env.D1DB,
    `SELECT date(created_at) AS d, COUNT(*) AS n FROM lead_appointment
      WHERE org_id = ? AND COALESCE(status,'') != 'cancelled'
        AND date(created_at) >= date('now','-13 days')
      GROUP BY date(created_at)`, orgId);
  const dayMap = new Map(apptByDay.map((r) => [r.d, Number(r.n)]));
  const apptChart: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    apptChart.push(dayMap.get(d) ?? 0);
  }

  // ---- Appointments by type (top 5, non-cancelled) -------------------------
  const apptTypes = await queryAll<{ label: string | null; value: number }>(
    env.D1DB,
    `SELECT COALESCE(NULLIF(TRIM(appointment_type),''), 'Other') AS label, COUNT(*) AS value
       FROM lead_appointment
      WHERE org_id = ? AND COALESCE(status,'') != 'cancelled'
      GROUP BY label ORDER BY value DESC LIMIT 5`, orgId);

  // ---- Upcoming appointments (next 5) --------------------------------------
  const upcoming = await queryAll<{
    appointment_type: string | null; starts_at: string; meeting_type: string | null;
    first_name: string | null; last_name: string | null; lead_name: string | null;
    property_address: string | null; agent_name: string | null;
  }>(
    env.D1DB,
    `SELECT a.appointment_type, a.starts_at, a.meeting_type,
            l.first_name, l.last_name, l.name AS lead_name, l.property_address,
            u.name AS agent_name
       FROM lead_appointment a
       LEFT JOIN lead l ON l.id = a.lead_id
       LEFT JOIN "user" u ON u.id = l.owner_id
      WHERE a.org_id = ? AND COALESCE(a.status,'') != 'cancelled'
        AND datetime(a.starts_at) >= datetime('now')
      ORDER BY datetime(a.starts_at) ASC LIMIT 5`, orgId);

  // ---- Recent closings (won deals, latest 4) -------------------------------
  const closings = await queryAll<{
    value: number | null; name: string | null; property_address: string | null;
    area: string | null; lead_name: string | null;
  }>(
    env.D1DB,
    `SELECT d.value, d.name, l.property_address, l.area, l.name AS lead_name
       FROM deal d
       LEFT JOIN lead l ON l.id = d.lead_id
      WHERE d.org_id = ? AND d.status = 'won'
      ORDER BY datetime(COALESCE(d.closed_at, d.updated_at)) DESC LIMIT 4`, orgId);

  const totalLeads = Number(leadConv?.total ?? 0);
  const bookedLeads = Number(leadConv?.booked ?? 0);
  const closedDeals = Number(closedMonth?.deals ?? 0);
  const volume = Number(closedMonth?.volume ?? 0);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

  const nameOf = (first: string | null, last: string | null, full: string | null) =>
    [first, last].filter(Boolean).join(" ").trim() || full || "Lead";

  return json({
    kpis: {
      pipeline_value: Math.round(Number(pipeline?.v ?? 0)),
      appointments: Number(apptMonth?.n ?? 0),
      lead_to_appt: pct(bookedLeads, totalLeads),
      closed_deals: closedDeals,
    },
    appt_chart: apptChart,
    appt_types: apptTypes.map((t) => ({ label: t.label || "Other", value: Number(t.value) })),
    appt_upcoming: upcoming.map((a) => ({
      title: a.appointment_type || "Appointment",
      who: nameOf(a.first_name, a.last_name, a.lead_name),
      loc: a.property_address || (a.meeting_type === "phone" ? "Phone call" : a.meeting_type === "google_meet" ? "Video call" : "Office"),
      when: a.starts_at,
      agent: a.agent_name || "Unassigned",
      kind: a.appointment_type || "Appt",
    })),
    closed: {
      deals: closedDeals,
      volume: Math.round(volume),
      commission: Math.round(Number(closedMonth?.commission ?? 0)),
      avg_deal: closedDeals > 0 ? Math.round(volume / closedDeals) : 0,
    },
    closings: closings.map((c) => ({
      addr: c.property_address || c.name || c.lead_name || "Closed deal",
      city: c.area || "",
      price: Math.round(Number(c.value ?? 0)),
    })),
    last_updated: new Date().toISOString(),
  });
};
