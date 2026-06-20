/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/**
 * GET /api/automations/:id/logs - per-workflow activity log (Ai_outbound.md
 * "Logs"). Derived from scheduled_message rows for this automation joined to the
 * lead: message sent, scheduled/queued, stopped (cancelled = lead replied /
 * appointment booked), failed. Newest first.
 */
interface Row {
  id: number; contact_id: number | null; channel: string; status: string;
  scheduled_at: string | null; sent_at: string | null; error_message: string | null;
  body: string | null; created_at: string;
  first_name: string | null; last_name: string | null; lead_name: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Message sent",
  failed: "Failed",
  cancelled: "Stopped (lead replied or booked)",
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid automation id", 400);

  const automation = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM automation WHERE id = ?`, id);
  if (!automation) return error("Automation not found", 404);
  const orgId = Number(automation.org_id);
  if (!(await isOrgMember(env, user.id, orgId))) return error("User not part of organization", 403);

  const rows = await queryAll<Row>(
    env.D1DB,
    `SELECT sm.id, sm.contact_id, sm.channel, sm.status, sm.scheduled_at, sm.sent_at,
            sm.error_message, sm.body, sm.created_at,
            l.first_name, l.last_name, l.name AS lead_name
       FROM scheduled_message sm
       LEFT JOIN lead l ON l.id = sm.contact_id
      WHERE sm.automation_id = ?
      ORDER BY datetime(COALESCE(sm.sent_at, sm.scheduled_at, sm.created_at)) DESC
      LIMIT 200`,
    id,
  );

  const events = rows.map((r) => ({
    id: r.id,
    lead_id: r.contact_id,
    lead: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.lead_name || "Lead",
    channel: r.channel,
    status: r.status,
    label: STATUS_LABEL[r.status] || r.status,
    at: r.sent_at || r.scheduled_at || r.created_at,
    error: r.error_message,
    preview: (r.body || "").slice(0, 120),
  }));

  // Rollup over the WHOLE campaign (not just the 200-row event feed above, which
  // would undercount a large campaign). Drives the live "X sent · Y queued ·
  // sending now" status the UI polls.
  const agg = await queryFirst<{
    enrolled: number; sent: number; queued: number; sending: number; stopped: number; failed: number; total: number;
  }>(
    env.D1DB,
    `SELECT COUNT(DISTINCT contact_id) AS enrolled,
            SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent,
            SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) AS queued,
            SUM(CASE WHEN status='sending' THEN 1 ELSE 0 END) AS sending,
            SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS stopped,
            SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
            COUNT(*) AS total
       FROM scheduled_message WHERE automation_id = ?`,
    id,
  );

  // "Sending now" = there's a live queue with at least one message already due.
  const dueNow = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM scheduled_message
      WHERE automation_id = ? AND status = 'scheduled' AND datetime(scheduled_at) <= datetime('now')`,
    id,
  );

  return json({
    events,
    summary: {
      enrolled: Number(agg?.enrolled ?? 0),
      sent: Number(agg?.sent ?? 0),
      queued: Number(agg?.queued ?? 0),
      sending: Number(agg?.sending ?? 0),
      stopped: Number(agg?.stopped ?? 0),
      failed: Number(agg?.failed ?? 0),
      total: Number(agg?.total ?? 0),
      due_now: Number(dueNow?.n ?? 0),
    },
  });
};
