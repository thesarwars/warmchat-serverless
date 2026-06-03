/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

const HIGH_INTENT = new Set(["high", "hot", "ready", "high_intent"]);

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/**
 * GET /api/dashboard/org/:orgId - landing overview. Empty tables yield
 * zeros/[]. Timestamp comparisons use datetime() to tolerate mixed TEXT formats.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("User not part of organization", 403);

  const url = new URL(request.url);
  const replyOverdueHours = Number(url.searchParams.get("reply_overdue_hours")) || 24;
  const hotLeadStaleDays = Number(url.searchParams.get("hot_lead_stale_days")) || 2;
  const apptHorizonH = Math.max(1, Math.min(Number(url.searchParams.get("appointment_confirmation_horizon_hours")) || 24, 168));

  const recentCutoff = isoAgo(30 * 864e5);
  const replyOverdueCutoff = isoAgo(replyOverdueHours * 36e5);
  const hotStaleCutoff = isoAgo(hotLeadStaleDays * 864e5);
  const nowIso = new Date().toISOString();
  const apptHorizonEnd = new Date(Date.now() + apptHorizonH * 36e5).toISOString();

  // ---- Automation cards ----
  const automations = await queryAll<{
    id: number; name: string | null; status: string | null; thread_id: number | null; leads: string | null;
  }>(env.D1DB, `SELECT id, name, status, thread_id, leads FROM automation WHERE org_id = ?`, String(orgId));

  let totalHot = 0, totalAppts = 0, totalCommission = 0, totalReplies = 0;
  const automationCards = [];
  for (const c of automations) {
    let replies = 0;
    if (c.thread_id) {
      const r = await queryFirst<{ n: number }>(
        env.D1DB,
        `SELECT COUNT(im.id) AS n FROM inbox_messages im
           JOIN thread t ON im.thread_id = t.id JOIN inbox i ON t.inbox_id = i.id
          WHERE i.org_id = ? AND im.direction = 'inbound'
            AND COALESCE(im.channel,'email') = 'email' AND t.id = ?`,
        orgId, c.thread_id,
      );
      replies = r?.n ?? 0;
    }
    const hot = 0;
    let appts = 0, commission = 0;
    try {
      const leads = JSON.parse(c.leads || "[]") as Array<Record<string, unknown>>;
      for (const l of leads) {
        if ((l.status as string) === "Appointment") appts++;
        commission += Number(l.commission ?? 0) || 0;
      }
    } catch { /* ignore malformed leads json */ }
    totalHot += hot; totalAppts += appts; totalCommission += commission; totalReplies += replies;
    automationCards.push({
      id: c.id, name: c.name ?? "", replies, hot_leads: hot, appointments: appts,
      est_commission: commission, status: c.status, type: c.name ?? "",
    });
  }

  // ---- Per-thread inbound/outbound aggregates ----
  const inbound = await queryAll<{ thread_id: number; inbound_count: number; last_inbound: string }>(
    env.D1DB,
    `SELECT im.thread_id, COUNT(im.id) AS inbound_count,
            MAX(COALESCE(im.message_date, im.created_at)) AS last_inbound
       FROM inbox_messages im JOIN thread t ON im.thread_id = t.id JOIN inbox i ON t.inbox_id = i.id
      WHERE i.org_id = ? AND im.direction = 'inbound' GROUP BY im.thread_id`,
    orgId,
  );
  const outbound = await queryAll<{ thread_id: number; last_outbound: string }>(
    env.D1DB,
    `SELECT im.thread_id, MAX(COALESCE(im.message_date, im.created_at)) AS last_outbound
       FROM inbox_messages im JOIN thread t ON im.thread_id = t.id JOIN inbox i ON t.inbox_id = i.id
      WHERE i.org_id = ? AND im.direction = 'outbound' GROUP BY im.thread_id`,
    orgId,
  );
  const outByThread = new Map(outbound.map((o) => [o.thread_id, o.last_outbound]));

  let newConversations = 0, unrepliedOverdue = 0, hotNoFollowup = 0;
  const deltas: number[] = [];
  for (const row of inbound) {
    const lastIn = Date.parse(row.last_inbound);
    const lastOut = outByThread.has(row.thread_id) ? Date.parse(outByThread.get(row.thread_id)!) : 0;
    if (!Number.isNaN(lastIn) && row.last_inbound >= recentCutoff) newConversations++;
    if (row.last_inbound <= replyOverdueCutoff && lastOut < lastIn) unrepliedOverdue++;
    if (row.inbound_count >= 2 && (outByThread.get(row.thread_id) ?? "1970") <= hotStaleCutoff) hotNoFollowup++;
    if (lastOut > lastIn) deltas.push((lastOut - lastIn) / 1000);
  }
  const avgResponseSeconds = deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;

  // ---- Appointments to confirm ----
  const apptRow = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM lead_appointment
      WHERE org_id = ? AND status = 'proposed'
        AND datetime(starts_at) > datetime(?) AND datetime(starts_at) <= datetime(?)`,
    orgId, nowIso, apptHorizonEnd,
  );

  // ---- Today's + upcoming appointment list (used by the dashboard schedule card) ----
  const upcomingEnd = new Date(Date.now() + 7 * 864e5).toISOString();
  const upcomingAppts = await queryAll<{
    id: number; lead_id: number | null; appointment_type: string | null;
    starts_at: string | null; meeting_type: string | null; status: string | null;
    notes: string | null; external_meeting_url: string | null;
    first_name: string | null; last_name: string | null;
  }>(
    env.D1DB,
    `SELECT a.id, a.lead_id, a.appointment_type, a.starts_at, a.meeting_type, a.status,
            a.notes, a.external_meeting_url,
            l.first_name, l.last_name
       FROM lead_appointment a
       LEFT JOIN lead l ON l.id = a.lead_id
      WHERE a.org_id = ? AND COALESCE(a.status,'') != 'cancelled'
        AND datetime(a.starts_at) >= datetime(?)
        AND datetime(a.starts_at) <= datetime(?)
      ORDER BY datetime(a.starts_at) ASC LIMIT 8`,
    orgId, nowIso, upcomingEnd,
  );
  const appointmentList = upcomingAppts.map((a) => {
    const nameParts = [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
    return {
      id: a.id,
      lead_id: a.lead_id,
      title: a.appointment_type || "Appointment",
      starts_at: a.starts_at,
      meeting_type: a.meeting_type,
      status: a.status,
      notes: a.notes,
      external_meeting_url: a.external_meeting_url,
      with_name: nameParts || null,
    };
  });

  // ---- High-intent inbound (last 30d) ----
  const metas = await queryAll<{ meta: string | null }>(
    env.D1DB,
    `SELECT im.meta FROM inbox_messages im JOIN thread t ON im.thread_id = t.id JOIN inbox i ON t.inbox_id = i.id
      WHERE i.org_id = ? AND im.direction = 'inbound'
        AND datetime(COALESCE(im.message_date, im.created_at)) >= datetime(?)`,
    orgId, recentCutoff,
  );
  let highIntent = 0;
  for (const m of metas) {
    try {
      const meta = JSON.parse(m.meta || "{}");
      const intent = String(meta.intent ?? meta.ai_intent ?? "").trim().toLowerCase();
      if (HIGH_INTENT.has(intent)) highIntent++;
    } catch { /* ignore */ }
  }

  // ---- Pipeline value + deals in progress ----
  const org = await queryFirst<{ average_deal_price: number; commission_percent: number }>(
    env.D1DB, `SELECT average_deal_price, commission_percent FROM organization WHERE id = ?`, orgId,
  );
  const avgPrice = org?.average_deal_price ?? 400000;
  const commissionPct = org?.commission_percent ?? 2.5;
  const pipe = await queryFirst<{ total: number }>(
    env.D1DB,
    `SELECT COALESCE(SUM(COALESCE(estimated_price, ?)), 0) * ? / 100.0 AS total
       FROM lead WHERE org_id = ? AND COALESCE(status,'') NOT IN ('Cold / Lost','Lost','Closed')`,
    avgPrice, commissionPct, orgId,
  );
  const deals = await queryFirst<{ count: number; value: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS count, COALESCE(SUM(COALESCE(value, ?)), 0) AS value
       FROM deal WHERE org_id = ? AND status = 'open'`,
    avgPrice, orgId,
  );

  return json({
    summary: {
      new_conversations: newConversations,
      hot_leads: totalHot,
      appointments: totalAppts,
      est_commission: Math.round(totalCommission * 100) / 100,
      total_replies: totalReplies,
      estimated_pipeline_value: Math.round((pipe?.total ?? 0) * 100) / 100,
      deals_in_progress: deals?.count ?? 0,
      deals_in_progress_value: Math.round((deals?.value ?? 0) * 100) / 100,
    },
    needs_attention: {
      unreplied_inbound: unrepliedOverdue,
      hot_leads_no_followup: hotNoFollowup,
      appointments_to_confirm: apptRow?.n ?? 0,
      high_intent_replies: highIntent,
      has_alerts: Boolean(unrepliedOverdue || hotNoFollowup || (apptRow?.n ?? 0) || highIntent),
      thresholds: {
        reply_overdue_hours: replyOverdueHours,
        hot_lead_stale_days: hotLeadStaleDays,
        appointment_confirmation_horizon_hours: apptHorizonH,
      },
    },
    response_time: { avg_response_seconds: avgResponseSeconds },
    automations: automationCards,
    upcoming_appointments: appointmentList,
    last_updated: nowIso,
  });
};
