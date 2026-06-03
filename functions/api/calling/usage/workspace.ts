/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { resolveOrgId } from "../../../_shared/callingAccess.ts";
import { planMinuteLimit } from "../../../_shared/plans.ts";

/**
 * GET /api/calling/usage/workspace - billing-cycle usage snapshot for the UI
 * (CallingUsagePage + the dialer's "minutes left" hint). Mirrors the
 * GetUsageStatsByWorkspaceHandler response shape from the calling service so
 * the existing components render unchanged.
 *
 * Without an active billing cycle row we still return the canonical shape
 * with zeros so the UI doesn't blow up - the cycle gets created lazily by
 * the outbound endpoint and the cron rollover.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await resolveOrgId(env, user.id);
  if (!orgId) return error("Not part of an organization", 403);

  const url = new URL(request.url);
  const cycleId = url.searchParams.get("billingCycleId");

  const cycle = cycleId
    ? await queryFirst<{ id: string; start_date: string; end_date: string; plan_minute_limit: number }>(
        env.D1DB,
        `SELECT id, start_date, end_date, plan_minute_limit FROM billing_cycles WHERE id = ? AND org_id = ?`,
        cycleId, orgId,
      )
    : await queryFirst<{ id: string; start_date: string; end_date: string; plan_minute_limit: number }>(
        env.D1DB,
        `SELECT id, start_date, end_date, plan_minute_limit FROM billing_cycles
          WHERE org_id = ? AND status = 'ACTIVE'
          ORDER BY start_date DESC LIMIT 1`,
        orgId,
      );

  if (!cycle) {
    // No billing cycle yet (the org hasn't placed a call this period - the
    // cycle is created lazily on the first call by ensureBillingCycle). Surface
    // the plan's included minutes from the same source of truth so the displayed
    // allowance matches what the cycle will be stamped with on the first call.
    const org = await queryFirst<{ plan: string | null }>(
      env.D1DB,
      `SELECT plan FROM organization WHERE id = ?`,
      orgId,
    );
    const planLimit = planMinuteLimit(org?.plan);
    return json({
      billingCycle: { id: "", startDate: "", endDate: "", planLimit },
      usage: {
        totalMinutes: 0, totalCost: 0, totalCalls: 0,
        percentageUsed: 0, remainingMinutes: planLimit, isOverLimit: false,
      },
      breakdown: { byStatus: {} },
    });
  }

  const totals = await queryFirst<{ total_minutes: number; total_cost: number; total_calls: number }>(
    env.D1DB,
    `SELECT COALESCE(SUM(minutes), 0) AS total_minutes,
            COALESCE(SUM(cost), 0)    AS total_cost,
            COUNT(*)                  AS total_calls
       FROM usage_records WHERE org_id = ? AND billing_cycle_id = ?`,
    orgId, cycle.id,
  );

  const byStatusRows = await env.D1DB.prepare(
    `SELECT status, COUNT(*) AS n FROM calls
      WHERE org_id = ? AND created_at >= ? AND created_at < ?
      GROUP BY status`,
  ).bind(orgId, cycle.start_date, cycle.end_date).all<{ status: string; n: number }>();
  const byStatus: Record<string, number> = {};
  for (const r of byStatusRows.results ?? []) byStatus[r.status] = r.n;

  const total = totals?.total_minutes ?? 0;
  const planLimit = cycle.plan_minute_limit;
  const pct = planLimit > 0 ? (total / planLimit) * 100 : 0;

  return json({
    billingCycle: {
      id: cycle.id,
      startDate: cycle.start_date,
      endDate: cycle.end_date,
      planLimit,
    },
    usage: {
      totalMinutes: total,
      totalCost: totals?.total_cost ?? 0,
      totalCalls: totals?.total_calls ?? 0,
      percentageUsed: Math.round(pct * 10) / 10,
      remainingMinutes: Math.max(0, planLimit - total),
      isOverLimit: total > planLimit,
    },
    breakdown: { byStatus },
  });
};
