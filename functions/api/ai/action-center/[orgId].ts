/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/**
 * GET /api/ai/action-center/:orgId -> what needs the agent now. Powers the
 * AI Agent "Action Center" tab:
 *   - ready:   leads the AI qualified / flagged hot (ready to book/call)
 *   - urgent:  open hot-lead escalations the cron is chasing
 *   - opportunities: leads with an AI next-best-action suggestion
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const ready = await queryAll<{ id: number; name: string | null; first_name: string | null; intent: string | null; lead_score: number | null; status: string | null; next_best_action: string | null }>(
    env.D1DB,
    `SELECT id, name, first_name, intent, lead_score, status, next_best_action
       FROM lead
      WHERE org_id = ? AND COALESCE(ai_status,'') NOT IN ('off')
        AND (LOWER(COALESCE(intent,'')) = 'hot' OR LOWER(COALESCE(qualification_status,'')) = 'booking-ready')
      ORDER BY lead_score IS NULL, lead_score DESC LIMIT 10`,
    orgId,
  );

  const urgent = await queryAll<{ id: number; lead_id: number; reason: string; level: number; created_at: string; lead_name: string | null }>(
    env.D1DB,
    `SELECT e.id, e.lead_id, e.reason, e.level, e.created_at, l.name AS lead_name
       FROM lead_escalation e JOIN lead l ON l.id = e.lead_id
      WHERE e.org_id = ? AND e.status = 'open'
      ORDER BY e.level DESC, datetime(e.created_at) ASC LIMIT 10`,
    orgId,
  );

  const opportunities = await queryAll<{ id: number; name: string | null; first_name: string | null; next_best_action: string | null; lead_score: number | null }>(
    env.D1DB,
    `SELECT id, name, first_name, next_best_action, lead_score
       FROM lead
      WHERE org_id = ? AND next_best_action IS NOT NULL
        AND LOWER(COALESCE(intent,'')) != 'hot' AND COALESCE(ai_status,'') NOT IN ('off')
      ORDER BY lead_score IS NULL, lead_score DESC LIMIT 8`,
    orgId,
  );

  return json({
    ready: ready.map((r) => ({ lead_id: r.id, name: r.name || r.first_name || "Lead", intent: r.intent, score: r.lead_score, status: r.status, action: r.next_best_action })),
    urgent: urgent.map((u) => ({ escalation_id: u.id, lead_id: u.lead_id, name: u.lead_name || "Lead", reason: u.reason, level: u.level })),
    opportunities: opportunities.map((o) => ({ lead_id: o.id, name: o.name || o.first_name || "Lead", action: o.next_best_action, score: o.lead_score })),
    counts: { ready: ready.length, urgent: urgent.length, opportunities: opportunities.length },
  });
};
