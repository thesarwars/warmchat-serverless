/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/**
 * GET /api/leads/:leadId/ai-analysis -> the AI-maintained intelligence for a
 * lead (summary, score, next-best-action, temperature, stage). The [orgId]
 * param here is the lead id (the leads routes overload the segment name).
 * Powers the Leads AI panel + the Inbox lead summary.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const leadId = Number(params.orgId);
  if (!Number.isInteger(leadId)) return error("Invalid lead id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const lead = await queryFirst<{
    org_id: number | null; ai_summary: string | null; ai_summary_updated_at: string | null;
    lead_score: number | null; next_best_action: string | null; intent: string | null;
    status: string | null; qualification_status: string | null; lead_type: string | null;
  }>(
    env.D1DB,
    `SELECT org_id, ai_summary, ai_summary_updated_at, lead_score, next_best_action,
            intent, status, qualification_status, lead_type
       FROM lead WHERE id = ?`,
    leadId,
  );
  if (!lead?.org_id) return error("Lead not found", 404);
  if (!(await isOrgMember(env, user.id, lead.org_id))) return error("Forbidden", 403);

  return json({
    ai_summary: lead.ai_summary,
    ai_summary_updated_at: lead.ai_summary_updated_at,
    lead_score: lead.lead_score,
    next_best_action: lead.next_best_action,
    temperature: lead.intent,
    stage: lead.status,
    qualification_status: lead.qualification_status,
    lead_type: lead.lead_type,
  });
};
