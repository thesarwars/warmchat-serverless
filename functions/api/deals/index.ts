/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isOrgMember, orgRole } from "../../_shared/orgAccess.ts";
import { callerOrgId } from "../../_shared/aiAgents.ts";
import { upsertDealForLead, setDealAssignees, MAX_DEALS_PER_ORG } from "../../_shared/deals.ts";

interface Body {
  lead_id?: number | null;
  name?: string | null;
  deal_type?: string | null;
  stage?: string | null;
  value?: number | null;
  commission?: number | null;
  close_date?: string | null;
  description?: string | null;
  probability?: number | null;
  status?: string | null;
  assignee_ids?: number[];
}

const BROKER_ROLES = new Set(["Owner", "Manager"]);

/**
 * POST /api/deals - create (or upsert, when a lead is linked) a deal in the
 * caller's org. The lead is OPTIONAL: a standalone deal can be created from the
 * Deals board with just a name + type. Everyone may attach a lead; only brokers
 * (Owner/Manager) may assign extra team members - the creator is always added.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<Body>(request)) || {};
  const leadId = Number.isInteger(Number(body.lead_id)) && Number(body.lead_id) > 0 ? Number(body.lead_id) : null;
  const name = (body.name ?? "").trim();
  if (leadId == null && !name) return error("A deal name or a lead is required", 400);

  // Resolve the org: from the linked lead when present, else the caller's org.
  let orgId: number | null;
  if (leadId != null) {
    const lead = await queryFirst<{ org_id: number | null }>(env.D1DB, `SELECT org_id FROM lead WHERE id = ?`, leadId);
    if (!lead?.org_id) return error("Lead not found", 404);
    orgId = lead.org_id;
  } else {
    orgId = await callerOrgId(env, user.id);
  }
  if (!orgId) return error("No organization", 403);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  // Cap total deals per org (high but finite).
  const countRow = await queryFirst<{ n: number }>(env.D1DB, `SELECT COUNT(*) AS n FROM deal WHERE org_id = ?`, orgId);
  if ((countRow?.n ?? 0) >= MAX_DEALS_PER_ORG) {
    return error(`You have reached the maximum of ${MAX_DEALS_PER_ORG} deals. Archive or delete some first.`, 400);
  }

  const dealId = await upsertDealForLead(env, orgId, leadId, {
    name: name || null,
    dealType: body.deal_type ?? null,
    stage: body.stage ?? null,
    value: body.value ?? null,
    commission: body.commission ?? null,
    closeDate: body.close_date ?? null,
    description: body.description ?? null,
    probability: body.probability ?? null,
    status: body.status ?? "open",
    statusSource: "manual",
  });

  // Team assignees: the creator always; brokers may add the rest.
  const role = await orgRole(env, user.id, orgId);
  const isBroker = role ? BROKER_ROLES.has(role) : false;
  const extra = isBroker && Array.isArray(body.assignee_ids) ? body.assignee_ids.map(Number) : [];
  await setDealAssignees(env, dealId, [user.id, ...extra]);

  return json({ id: dealId }, 201);
};
