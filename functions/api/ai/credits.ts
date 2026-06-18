/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { queryFirst } from "../../_shared/db.ts";
import { getOrgPlan, getUsageSummary } from "../../_shared/usageCounter.ts";

/**
 * GET /api/ai/credits - AI Assist credit balance for the current month.
 *
 * "Credits" map onto the org's monthly AI usage quota (usageCounter): each
 * AI Assist generation spends `cost` credits (1 SMS / 2 email). The Inbox uses
 * `remaining` to warn before generating and to block when there aren't enough.
 * `remaining: null` means unlimited (no warning/limit).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!membership) {
    return json({ used: 0, limit: "unlimited", remaining: null, cost: { sms: 1, email: 2 } });
  }

  const plan = await getOrgPlan(env, membership.org_id);
  const summary = await getUsageSummary(env, membership.org_id, plan);
  return json({
    used: summary.ai.used,
    limit: summary.ai.limit,
    remaining: summary.ai.remaining,
    month: summary.month,
    cost: { sms: 1, email: 2 },
  });
};
