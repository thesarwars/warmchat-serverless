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

  const leads = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(id) AS n FROM lead WHERE org_id = ?${inRange("created_at")}`, orgId);
  const replies = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(im.id) AS n FROM inbox_messages im JOIN thread t ON im.thread_id=t.id JOIN inbox i ON t.inbox_id=i.id
      WHERE i.org_id=? AND im.direction='inbound'${inRange("COALESCE(im.message_date, im.created_at)")}`,
    orgId);
  const appointments = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(id) AS n FROM lead_appointment WHERE org_id=? AND status != 'cancelled'${inRange("created_at")}`, orgId);
  const closings = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(id) AS n FROM deal WHERE org_id=? AND status='won'${inRange("closed_at")}`, orgId);

  const funnel = [
    { step: "leads", label: "Leads", count: leads?.n ?? 0 },
    { step: "replies", label: "Replies", count: replies?.n ?? 0 },
    { step: "conversations", label: "Conversations", count: replies?.n ?? 0 },
    { step: "appointments", label: "Appointments", count: appointments?.n ?? 0 },
    { step: "closings", label: "Closings", count: closings?.n ?? 0 },
  ];

  return json({
    range: { preset: startDate ? null : preset, start_date: lo, end_date: hi },
    funnel,
    computed_at: new Date().toISOString(),
  });
};
