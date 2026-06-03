/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { getUsageSummary } from "../../../_shared/usageCounter.ts";
import { planLimitsFor } from "../../../_shared/plans.ts";

/**
 * GET /api/auth/profile/me - current user with their org + role.
 * Returns the shape the frontend consumes: { id, name, email,
 * is_email_confirmed, org, role }.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const membership = await queryFirst<{
    org_id: number;
    org_name: string;
    plan: string | null;
    subscription_status: string | null;
    role_name: string | null;
  }>(
    env.D1DB,
    `SELECT o.id   AS org_id,
            o.name AS org_name,
            o.plan AS plan,
            o.subscription_status AS subscription_status,
            r.name AS role_name
       FROM membership m
       JOIN organization o ON o.id = m.org_id
       LEFT JOIN role r ON r.id = m.role_id
      WHERE m.user_id = ?
      LIMIT 1`,
    user.id,
  );

  const plan = membership?.plan || "free_channel";
  const usageSummary = membership
    ? await getUsageSummary(env, membership.org_id, plan)
    : null;

  return json({
    id: user.id,
    name: user.name,
    email: user.email,
    is_email_confirmed: Boolean(user.is_email_confirmed),
    user: { id: user.id, name: user.name, email: user.email },
    org: membership
      ? {
          id: membership.org_id,
          name: membership.org_name,
          plan: membership.plan,
          subscription_status: membership.subscription_status,
        }
      : null,
    organization: membership
      ? {
          id: membership.org_id,
          name: membership.org_name,
          plan: membership.plan,
          subscription_status: membership.subscription_status,
        }
      : null,
    plan: { name: plan, limits: planLimitsFor(plan) },
    usage_summary: usageSummary,
    role: membership?.role_name ?? null,
  });
};
