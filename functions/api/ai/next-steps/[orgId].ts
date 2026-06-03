/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/**
 * GET /api/ai/next-steps/:orgId -> the "AI Next Steps" guidance (docs: Main AI
 * Goal "Dashboard Should Show AI Guidance"). Built from the AI-maintained
 * lead.next_best_action + intent/score, plus headline summary counts.
 */
interface LeadRow {
  id: number; name: string | null; first_name: string | null;
  next_best_action: string | null; lead_score: number | null;
  intent: string | null; status: string | null; lead_type: string | null;
  appointment_booked: number | null; area: string | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const rows = await queryAll<LeadRow>(
    env.D1DB,
    `SELECT id, name, first_name, next_best_action, lead_score, intent, status, lead_type, appointment_booked, area
       FROM lead
      WHERE org_id = ?
        AND COALESCE(ai_status, '') NOT IN ('off')
        AND (next_best_action IS NOT NULL OR LOWER(COALESCE(intent,'')) = 'hot'
             OR LOWER(COALESCE(qualification_status,'')) = 'booking-ready')
      ORDER BY lead_score IS NULL, lead_score DESC, datetime(last_reply_at) DESC
      LIMIT 12`,
    orgId,
  );

  const items = rows.map((r) => ({
    lead_id: r.id,
    name: r.name || r.first_name || "Lead",
    action: r.next_best_action || (r.intent === "hot" ? "Call now" : "Follow up"),
    score: r.lead_score ?? null,
    intent: r.intent,
    lead_type: r.lead_type,
    area: r.area,
  }));

  const summary = await queryFirst<{ hot: number; ready: number; nurturing: number; missing: number }>(
    env.D1DB,
    `SELECT
       SUM(CASE WHEN LOWER(COALESCE(intent,'')) = 'hot' THEN 1 ELSE 0 END) AS hot,
       SUM(CASE WHEN appointment_booked = 1 OR LOWER(COALESCE(qualification_status,'')) = 'booking-ready' THEN 1 ELSE 0 END) AS ready,
       SUM(CASE WHEN LOWER(COALESCE(intent,'')) = 'warm' THEN 1 ELSE 0 END) AS nurturing,
       SUM(CASE WHEN next_best_action LIKE 'Ask%' THEN 1 ELSE 0 END) AS missing
     FROM lead WHERE org_id = ? AND COALESCE(ai_status,'') NOT IN ('off')`,
    orgId,
  );

  return json({
    items,
    summary: {
      hot_need_response: Number(summary?.hot ?? 0),
      ready_to_book: Number(summary?.ready ?? 0),
      nurturing: Number(summary?.nurturing ?? 0),
      missing_info: Number(summary?.missing ?? 0),
    },
  });
};
