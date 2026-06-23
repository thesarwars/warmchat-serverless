/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { getOrgPlan } from "../../_shared/billing.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { stripeCall } from "../../_shared/stripe.ts";

/**
 * POST /api/billing/cancel - cancel the org's plan.
 *
 *   - Real Stripe subscription -> schedule cancellation at the END of the billing
 *     period (cancel_at_period_end=true) so the user keeps access until then. The
 *     customer.subscription.deleted webhook reverts the org to free + alerts when
 *     the period actually ends.
 *   - Comp (100%-off promo, no Stripe subscription) -> revert to free immediately.
 *   - Free / nothing to cancel -> 400.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const org = await getOrgPlan(env, user.id);
  if (!org) return error("Not part of an organization", 403);

  // Comp grant carries no Stripe subscription - "cancel" = drop to free now.
  if (org.subscriptionStatus === "comp") {
    await execute(
      env.D1DB,
      `UPDATE organization
          SET plan = 'free_channel', subscription_status = 'free',
              comp_expires_at = NULL, promo_code = NULL, plan_started_at = NULL
        WHERE id = ?`,
      org.orgId,
    );
    return json({ canceled: true, immediate: true, message: "Your promo plan was canceled - you're back on the Free plan." });
  }

  const row = await queryFirst<{ stripe_subscription_id: string | null }>(
    env.D1DB,
    `SELECT stripe_subscription_id FROM organization WHERE id = ?`,
    org.orgId,
  );
  if (!row?.stripe_subscription_id) return error("No active subscription to cancel.", 400);
  if (!env.STRIPE_SECRET_KEY) return error("Stripe is not configured", 503);

  // Schedule cancel at period end - user keeps access until then; the
  // subscription.deleted webhook handles the downgrade + alert at that point.
  const resp = await stripeCall<{ current_period_end?: number; cancel_at_period_end?: boolean }>(
    env.STRIPE_SECRET_KEY,
    `/subscriptions/${row.stripe_subscription_id}`,
    { body: { cancel_at_period_end: "true" } },
  );
  if (!resp.ok) return error(resp.error.message, 502);

  const endsAt = resp.data.current_period_end
    ? new Date(resp.data.current_period_end * 1000).toISOString()
    : null;
  return json({ canceled: true, cancel_at_period_end: true, ends_at: endsAt });
};
