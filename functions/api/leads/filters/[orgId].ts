/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/**
 * GET /api/leads/filters/:orgId - available filter values for the Leads page.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const prices = await queryAll<{ price_range: string }>(
    env.D1DB, `SELECT DISTINCT price_range FROM lead WHERE org_id=? AND price_range IS NOT NULL AND price_range <> ''`, orgId);
  const areas = await queryAll<{ area: string }>(
    env.D1DB, `SELECT DISTINCT area FROM lead WHERE org_id=? AND area IS NOT NULL AND area <> ''`, orgId);

  return json({
    stage: ["New", "Warm", "Hot Prospect", "Nurture", "Cold / Lost"],
    source: ["Open House", "Social Media", "Website", "Referral", "Zillow", "Other"],
    price: prices.map((p) => p.price_range),
    area: areas.map((a) => a.area),
    lead_type: ["buyer", "seller", "unknown"],
    ai_status: ["off", "active", "paused", "completed"],
    quick_filters: [
      { key: "hot_leads", label: "Hot Leads" },
      { key: "needs_reply", label: "Needs Reply" },
      { key: "ai_active", label: "AI Active" },
      { key: "no_response", label: "No Response" },
    ],
  });
};
