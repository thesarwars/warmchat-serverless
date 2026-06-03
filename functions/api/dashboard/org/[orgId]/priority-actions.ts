/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";

interface Action {
  type: string;
  lead_id: number;
  lead_name: string;
  title: string;
  description: string;
  priority: "high" | "medium";
  cta: { label: string; action: string; deep_link: string };
  occurred_at: string | null;
  appointment_id?: number | null;
}

function leadName(r: { name: string | null; first_name: string | null; last_name: string | null }): string {
  return r.name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "Lead";
}

/**
 * GET /api/dashboard/org/:orgId/priority-actions - actionable lead list:
 * warm leads with no outreach, leads awaiting a reply, and unconfirmed
 * upcoming appointments.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const url = new URL(request.url);
  const warmDays = Math.max(1, Math.min(Number(url.searchParams.get("warm_lookback_days")) || 30, 365));
  const apptHorizonH = Math.max(1, Math.min(Number(url.searchParams.get("appointment_confirmation_horizon_hours")) || 24, 168));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 100));
  const perType = Math.max(1, Math.min(Number(url.searchParams.get("per_type_limit")) || limit, 100));
  const warmCutoff = new Date(Date.now() - warmDays * 864e5).toISOString();
  const nowIso = new Date().toISOString();
  const apptEnd = new Date(Date.now() + apptHorizonH * 36e5).toISOString();

  const items: Action[] = [];

  // Warm leads created recently with no outbound email/sms yet.
  const warm = await queryAll<{ id: number; name: string | null; first_name: string | null; last_name: string | null; created_at: string | null }>(
    env.D1DB,
    `SELECT l.id, l.name, l.first_name, l.last_name, l.created_at
       FROM lead l
      WHERE l.org_id = ? AND datetime(l.created_at) >= datetime(?)
        AND COALESCE(l.status,'') NOT IN ('Cold / Lost','Lost','Closed')
        AND LOWER(COALESCE(l.email,'')) NOT IN (
          SELECT LOWER(im.to_email) FROM inbox_messages im
            JOIN thread t ON im.thread_id=t.id JOIN inbox i ON t.inbox_id=i.id
           WHERE i.org_id = ? AND im.direction='outbound' AND im.to_email IS NOT NULL)
      ORDER BY l.created_at DESC LIMIT ?`,
    orgId, warmCutoff, orgId, perType,
  );
  for (const l of warm) {
    items.push({
      type: "warm_lead_no_outreach", lead_id: l.id, lead_name: leadName(l),
      title: "Warm lead, no outreach yet", description: `New lead ${leadName(l)} hasn't been contacted`,
      priority: "high", cta: { label: "Send message", action: "compose", deep_link: `/leads/${l.id}` },
      occurred_at: l.created_at,
    });
  }

  // Unconfirmed appointments within the horizon.
  const appts = await queryAll<{ id: number; lead_id: number; starts_at: string; name: string | null; first_name: string | null; last_name: string | null }>(
    env.D1DB,
    `SELECT a.id, a.lead_id, a.starts_at, l.name, l.first_name, l.last_name
       FROM lead_appointment a JOIN lead l ON l.id = a.lead_id
      WHERE a.org_id = ? AND a.status = 'proposed'
        AND datetime(a.starts_at) > datetime(?) AND datetime(a.starts_at) <= datetime(?)
      ORDER BY a.starts_at ASC LIMIT ?`,
    orgId, nowIso, apptEnd, perType,
  );
  for (const a of appts) {
    items.push({
      type: "appointment_unconfirmed", lead_id: a.lead_id, lead_name: leadName(a),
      title: "Appointment to confirm", description: `Confirm upcoming appointment with ${leadName(a)}`,
      priority: "high", cta: { label: "Confirm", action: "confirm_appointment", deep_link: `/leads/${a.lead_id}` },
      occurred_at: a.starts_at, appointment_id: a.id,
    });
  }

  const trimmed = items.slice(0, limit);
  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  for (const it of trimmed) {
    byType[it.type] = (byType[it.type] ?? 0) + 1;
    byPriority[it.priority] = (byPriority[it.priority] ?? 0) + 1;
  }

  return json({
    items: trimmed,
    count: trimmed.length,
    by_type: byType,
    by_priority: byPriority,
    thresholds: {
      warm_lookback_days: warmDays,
      awaiting_reply_min_hours: Number(url.searchParams.get("awaiting_reply_min_hours")) || 0,
      appointment_confirmation_horizon_hours: apptHorizonH,
      limit, per_type_limit: perType,
    },
    computed_at: nowIso,
  });
};
