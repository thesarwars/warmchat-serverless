/// <reference types="@cloudflare/workers-types" />
import { queryFirst, execute } from "./db.ts";
import { stripeCall } from "./stripe.ts";
import type { Env } from "./env.ts";

/** Plans that gate paid-only features (SMS, calling, etc.). Add new tiers
 *  here when they're introduced. `free_channel` is intentionally absent. */
const PAID_PLANS = new Set(["starter", "growth", "custom_brokerage"]);

/**
 * Returns the org's current plan + subscription status, or null when the
 * caller isn't part of an org. Used by paid-only endpoints to gate access
 * server-side (UI-level gating in Onboarding/SMS cards is a usability hint,
 * not a security boundary).
 */
export async function getOrgPlan(env: Env, userId: number): Promise<
  { orgId: number; plan: string; subscriptionStatus: string } | null
> {
  const row = await queryFirst<{
    id: number; plan: string | null; subscription_status: string | null;
  }>(
    env.D1DB,
    `SELECT o.id, o.plan, o.subscription_status
       FROM membership m JOIN organization o ON o.id = m.org_id
      WHERE m.user_id = ? LIMIT 1`,
    userId,
  );
  if (!row) return null;
  return {
    orgId: row.id,
    plan: row.plan || "free_channel",
    subscriptionStatus: row.subscription_status || "free",
  };
}

/** True when the org has a paid plan AND an active-enough subscription status.
 *  'comp' is a 100%-off promo grant (paid plan, no Stripe) and must count as
 *  fully active so comp users can provision SMS / use every paid feature until
 *  the comp lapses - see [[comp-billing-model]]. */
export function isPaidPlanActive(plan: string, subscriptionStatus: string): boolean {
  if (!PAID_PLANS.has(plan)) return false;
  return subscriptionStatus === "active" || subscriptionStatus === "trialing" || subscriptionStatus === "comp";
}

/**
 * Throws a structured error (handled at the route boundary) when the caller
 * isn't on an active paid plan. Use in route handlers like:
 *   const gate = await requirePaidPlan(env, user.id);
 *   if (gate.error) return gate.error;
 */
export async function requirePaidPlan(env: Env, userId: number): Promise<{
  ok: true; orgId: number; plan: string
} | {
  ok: false; error: Response
}> {
  const info = await getOrgPlan(env, userId);
  if (!info) {
    return {
      ok: false,
      error: new Response(
        JSON.stringify({ message: "Not part of an organization" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  if (!isPaidPlanActive(info.plan, info.subscriptionStatus)) {
    return {
      ok: false,
      error: new Response(
        JSON.stringify({
          message:
            info.subscriptionStatus === "canceled"
              ? "Your subscription was canceled. Re-subscribe to access SMS features."
              : info.subscriptionStatus === "past_due"
                ? "Your subscription payment is past due. Update billing to restore access."
                : "This feature requires a paid plan. Upgrade to Starter or Growth.",
          plan: info.plan,
          subscription_status: info.subscriptionStatus,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  return { ok: true, orgId: info.orgId, plan: info.plan };
}

/**
 * Plan id (as used by the frontend in PlanSelection.tsx and stored on
 * organization.plan) -> Stripe price id. Built from env so prices can change
 * per deploy without code edits. Blank env values are dropped so unconfigured
 * plans surface a 501 from the checkout endpoint instead of sending Stripe
 * an empty price.
 */
export function planPriceMap(env: Env): Record<string, string> {
  const m: Record<string, string> = {};
  if (env.STRIPE_PRICE_FREE)    m.free_channel = env.STRIPE_PRICE_FREE;
  if (env.STRIPE_PRICE_STARTER) m.starter      = env.STRIPE_PRICE_STARTER;
  if (env.STRIPE_PRICE_GROWTH)  m.growth       = env.STRIPE_PRICE_GROWTH;
  return m;
}

/** Reverse-lookup: Stripe price id -> our internal plan id, or null if unknown. */
export function planFromPriceId(env: Env, priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  for (const [plan, id] of Object.entries(planPriceMap(env))) {
    if (id === priceId) return plan;
  }
  return null;
}

/**
 * Look up the caller's organization (membership required) and return both its
 * id and Stripe customer id, creating the Stripe customer on first use.
 */
export async function getOrgWithStripeCustomer(
  env: Env,
  userId: number,
  email: string,
): Promise<{ orgId: number; stripeCustomerId: string } | null> {
  const row = await queryFirst<{ id: number; name: string; stripe_customer_id: string | null }>(
    env.D1DB,
    `SELECT o.id, o.name, o.stripe_customer_id
       FROM membership m JOIN organization o ON o.id = m.org_id
      WHERE m.user_id = ? LIMIT 1`,
    userId,
  );
  if (!row) return null;
  if (row.stripe_customer_id) return { orgId: row.id, stripeCustomerId: row.stripe_customer_id };

  const created = await stripeCall<{ id: string }>(env.STRIPE_SECRET_KEY, "/customers", {
    body: {
      email,
      name: row.name,
      metadata: { org_id: String(row.id), user_id: String(userId) },
    },
  });
  if (!created.ok) throw new Error(`Stripe customer create failed: ${created.error.message}`);

  await execute(
    env.D1DB,
    `UPDATE organization SET stripe_customer_id = ? WHERE id = ?`,
    created.data.id, row.id,
  );
  return { orgId: row.id, stripeCustomerId: created.data.id };
}
