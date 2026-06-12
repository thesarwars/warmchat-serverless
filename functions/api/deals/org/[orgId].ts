/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

interface DealRow {
  id: number; lead_id: number | null;
  name: string | null; deal_type: string | null;
  stage: string | null; value: number | null; commission: number | null;
  close_date: string | null; description: string | null; probability: number | null;
  status: string; status_source: string;
  ai_suggested_stage: string | null; ai_suggestion_reason: string | null;
  next_task: string | null;
  closed_at: string | null; created_at: string | null; updated_at: string | null;
  lead_name: string | null; lead_first: string | null; lead_last: string | null;
  lead_type: string | null; phone: string | null; email: string | null;
  owner_name: string | null;
}

interface AssigneeRow { deal_id: number; user_id: number; user_name: string | null; user_email: string }
interface Assignee { id: number; name: string }

const ser = (r: DealRow, assignees: Assignee[]) => {
  const leadName = (r.lead_name || [r.lead_first, r.lead_last].filter(Boolean).join(" ")).trim();
  const name = (r.name || "").trim() || leadName || "Untitled deal";
  return {
    id: r.id, lead_id: r.lead_id,
    name,
    lead_type: r.deal_type || r.lead_type,
    phone: r.phone, email: r.email,
    stage: r.stage, value: r.value, commission: r.commission,
    close_date: r.close_date, description: r.description, probability: r.probability,
    status: r.status, status_source: r.status_source,
    // Pending AI stage suggestion (null once applied/dismissed). Only surfaced
    // while it still differs from the deal's current stage.
    ai_suggested_stage: r.ai_suggested_stage !== r.stage ? r.ai_suggested_stage : null,
    ai_suggestion_reason: r.ai_suggestion_reason,
    next_task: r.next_task,
    closed_at: r.closed_at, created_at: r.created_at, updated_at: r.updated_at,
    agent: r.owner_name || assignees[0]?.name || "",
    assignees,
  };
};

/**
 * GET /api/deals/org/:orgId -> { deals:[...], summary }. The lead is joined in
 * when linked (name / type / contact / owner); standalone deals use their own
 * name + deal_type. Each deal carries its assigned team members. Optional
 * ?status filter (defaults to open + won so the kanban shows the live pipeline).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const status = new URL(request.url).searchParams.get("status");
  const where = status ? "AND d.status = ?" : "AND d.status IN ('open', 'won')";
  const rows = await queryAll<DealRow>(
    env.D1DB,
    `SELECT d.id, d.lead_id, d.name, d.deal_type, d.stage, d.value, d.commission,
            d.close_date, d.description, d.probability, d.status, d.status_source,
            d.ai_suggested_stage, d.ai_suggestion_reason,
            (SELECT t.title FROM task t
              WHERE (t.deal_id = d.id OR (d.lead_id IS NOT NULL AND t.lead_id = d.lead_id))
                AND t.status = 'open'
              ORDER BY t.id DESC LIMIT 1) AS next_task,
            d.closed_at, d.created_at, d.updated_at,
            l.name AS lead_name, l.first_name AS lead_first, l.last_name AS lead_last,
            l.lead_type AS lead_type, l.phone AS phone, l.email AS email,
            u.name AS owner_name
       FROM deal d
       LEFT JOIN lead l ON l.id = d.lead_id
       LEFT JOIN "user" u ON u.id = l.owner_id
      WHERE d.org_id = ? ${where}
      ORDER BY d.updated_at DESC`,
    ...(status ? [orgId, status] : [orgId]),
  );

  // Assignees for every deal in the org, grouped by deal_id.
  const assigneeRows = await queryAll<AssigneeRow>(
    env.D1DB,
    `SELECT da.deal_id, da.user_id, u.name AS user_name, u.email AS user_email
       FROM deal_assignee da
       JOIN deal d ON d.id = da.deal_id
       JOIN "user" u ON u.id = da.user_id
      WHERE d.org_id = ?
      ORDER BY da.id`,
    orgId,
  );
  const byDeal = new Map<number, Assignee[]>();
  for (const a of assigneeRows) {
    const nm = (a.user_name || a.user_email || "").trim() || "Member";
    const list = byDeal.get(a.deal_id) ?? [];
    list.push({ id: a.user_id, name: nm });
    byDeal.set(a.deal_id, list);
  }

  const deals = rows.map((r) => ser(r, byDeal.get(r.id) ?? []));
  const pipelineValue = deals.filter((d) => d.status === "open").reduce((s, d) => s + (d.value || 0), 0);
  const wonValue = deals.filter((d) => d.status === "won").reduce((s, d) => s + (d.value || 0), 0);
  const summary = {
    total: deals.length,
    open: deals.filter((d) => d.status === "open").length,
    won: deals.filter((d) => d.status === "won").length,
    pipeline_value: pipelineValue,
    won_value: wonValue,
  };
  return json({ deals, summary });
};
