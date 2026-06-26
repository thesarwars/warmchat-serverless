/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryFirst } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";

/**
 * GET /api/dashboard/org/:orgId/performance - funnel counts over a date range.
 * `?start_date,end_date` (YYYY-MM-DD) or
 * `?range=today|7d|30d|month|all` (default all).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const url = new URL(request.url);
  const preset = url.searchParams.get("range") || "all";
  let startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  if (!startDate && preset !== "all") {
    const days = preset === "today" ? 1 : preset === "7d" ? 7 : preset === "month" ? 30 : 30;
    startDate = new Date(Date.now() - days * 864e5).toISOString();
  }
  // Build an inclusive [start, end] datetime filter fragment.
  const lo = startDate ? new Date(startDate).toISOString() : null;
  const hi = endDate ? new Date(`${endDate}T23:59:59Z`).toISOString() : null;
  const inRange = (col: string) =>
    `${lo ? ` AND datetime(${col}) >= datetime('${lo}')` : ""}${hi ? ` AND datetime(${col}) <= datetime('${hi}')` : ""}`;

  // Stages MUST line up with the dashboard ConversionFunnel UI, which maps rows
  // by label: New Leads / Engaged Leads / Appointments / Active Clients / Closed
  // Deals. Each is sourced from a real, channel-agnostic lead signal (not just
  // email threads) so a lead the user actually conversed with counts as Engaged.
  const leads = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(id) AS n FROM lead WHERE org_id = ?${inRange("created_at")}`, orgId);
  // Engaged = the lead has actually replied / had inbound activity on any channel
  // (SMS or email), or sits in the Engaged stage. This is why the old "0 engaged"
  // happened: the funnel only counted email-thread replies under a label the UI
  // never matched.
  const engaged = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM lead
      WHERE org_id = ?
        AND (last_reply_at IS NOT NULL
             OR LOWER(COALESCE(last_activity_direction,'')) = 'inbound'
             OR LOWER(COALESCE(status,'')) = 'engaged')${inRange("COALESCE(last_activity_at, created_at)")}`,
    orgId);
  const appointments = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(id) AS n FROM lead_appointment WHERE org_id=? AND COALESCE(status,'') != 'cancelled'${inRange("created_at")}`, orgId);
  const activeClients = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM lead
      WHERE org_id=? AND LOWER(COALESCE(status,'')) IN ('active client','under contract')${inRange("COALESCE(last_activity_at, created_at)")}`,
    orgId);
  // Closed = won leads (the reliable signal today) or any won deal.
  const closed = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM lead
      WHERE org_id=? AND LOWER(COALESCE(status,'')) IN ('closed','won','closed won','closed/won')${inRange("COALESCE(last_activity_at, created_at)")}`,
    orgId);

  const funnel = [
    { step: "new_leads", label: "New Leads", count: leads?.n ?? 0 },
    { step: "engaged", label: "Engaged Leads", count: engaged?.n ?? 0 },
    { step: "appointments", label: "Appointments", count: appointments?.n ?? 0 },
    { step: "active_clients", label: "Active Clients", count: activeClients?.n ?? 0 },
    { step: "closed", label: "Closed Deals", count: closed?.n ?? 0 },
  ];

  return json({
    range: { preset: startDate ? null : preset, start_date: lo, end_date: hi },
    funnel,
    computed_at: new Date().toISOString(),
  });
};
