/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";
import { computeOrgAutomationSummary } from "../../../../_shared/automationAnalytics.ts";

/**
 * GET /api/automations/org/:orgId/summary - top KPI row for the Automations page.
 * Returns contacts_reached / reply_rate / positive_replies / appointments_booked
 * (+ older fields), via compute_org_automation_summary.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("User not part of organization", 403);

  return json(await computeOrgAutomationSummary(env, orgId));
};
