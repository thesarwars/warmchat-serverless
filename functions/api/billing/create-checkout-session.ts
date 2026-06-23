/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { getOrgWithStripeCustomer, getOrgPlan, planPriceMap } from "../../_shared/billing.ts";
import { execute } from "../../_shared/db.ts";
import { stripeCall } from "../../_shared/stripe.ts";
import { findActivePromotionCode, type StripeCoupon } from "../../_shared/promo.ts";

/**
 * A 100%-off promo grants a comp: instant paid access in D1 with NO Stripe
 * customer/subscription/card. `comp_expires_at` (this function) is the clock the
 * comp-expiry cron uses to revert the org to free_channel + alert the owner.
 *   - duration "forever"   -> null (permanent comp, never expires)
 *   - duration "repeating" -> +duration_in_months months
 *   - duration "once"      -> +1 month (one billing cycle of free access)
 */
function compExpiresAt(coupon: StripeCoupon | undefined): string | null {
  if (!coupon || coupon.duration === "forever") return null;
  const months = coupon.duration === "repeating" ? (coupon.duration_in_months || 1) : 1;
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/**
 * POST /api/billing/create-checkout-session
 * Body: { planId, cancelPath?, successPath?, promoCode? }
 * Response:
 *   - { checkout_url } - redirect the browser to Stripe Checkout (real payment), OR
 *   - { comped: true, plan, expires_at } - a 100%-off promo was applied; the org
 *     was granted the plan in D1 with NO Stripe contact. The client should skip
 *     Stripe entirely and land the user in the app on the paid plan.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!env.STRIPE_SECRET_KEY) return error("Stripe is not configured", 503);

  const body = (await readJson<{ planId?: string; cancelPath?: string; successPath?: string; promoCode?: string }>(request)) || {};
  const planId = (body.planId || "").trim();
  const promoCodeRaw = (body.promoCode || "").trim();
  if (!planId) return error("planId is required", 400);
  // Free is a pure D1 state - it must NEVER start a Stripe session (today
  // free_channel still resolves a price via STRIPE_PRICE_FREE, so without this
  // guard a stray planId would build a real subscription and force a card page).
  if (planId === "free_channel") return error("The Free plan does not require checkout.", 400);

  // Resolve the promo BEFORE touching Stripe. A 100%-off code is a COMP: grant
  // the paid plan in D1 with no Stripe customer/subscription/card. (Partial
  // discounts fall through to real Checkout below, where the discount is applied
  // and a card is collected for the remaining charge.)
  const promo = promoCodeRaw ? await findActivePromotionCode(env, promoCodeRaw) : null;
  if (promo && promo.coupon?.percent_off === 100) {
    const org = await getOrgPlan(env, user.id);
    if (!org) return error("Not part of an organization", 403);
    const expiresAt = compExpiresAt(promo.coupon);
    await execute(
      env.D1DB,
      `UPDATE organization
          SET plan = ?, subscription_status = 'comp', promo_code = ?,
              comp_expires_at = ?, plan_started_at = COALESCE(plan_started_at, CURRENT_TIMESTAMP)
        WHERE id = ?`,
      planId, promo.code, expiresAt, org.orgId,
    );
    return json({ comped: true, plan: planId, expires_at: expiresAt });
  }

  const priceId = planPriceMap(env)[planId];
  if (!priceId) {
    return error(
      `No Stripe price configured for plan "${planId}". Set STRIPE_PRICE_${planId.toUpperCase()} in wrangler.toml / .dev.vars to the price id from your Stripe account.`,
      501,
    );
  }

  const org = await getOrgWithStripeCustomer(env, user.id, user.email);
  if (!org) return error("Not part of an organization", 403);

  const origin = new URL(request.url).origin;
  const cancelUrl = `${origin}${body.cancelPath || "/pricing"}`;
  // Thread the return path through Stripe's success_url so BillingSuccess can
  // route correctly without needing a localStorage flag (which is per-device
  // and survives logout). Stripe substitutes {CHECKOUT_SESSION_ID} into the
  // URL but leaves other query params intact.
  const returnParam = body.successPath
    ? `&return=${encodeURIComponent(body.successPath)}`
    : "";
  const successUrl = `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}${returnParam}`;

  // NO "Add promotion code" box on the hosted Stripe page (no
  // allow_promotion_codes). All promo handling happens BEFORE checkout: a
  // 100%-off code comps out above (never reaches Stripe), and a partial code is
  // pre-applied via `discounts` below. Anyone reaching this page pays the regular
  // price (minus a pre-applied partial discount). This deliberately prevents a
  // 100%-off code from being entered ON Stripe, which would create a real
  // coupon'd subscription with no card and bypass our comp model.
  //
  // payment_method_collection 'if_required': skip the card page when the amount
  // due now is $0 (e.g. a pre-applied discount that nets zero), but still collect
  // a card whenever a real charge is due.
  const sessionBody: Record<string, unknown> = {
    mode: "subscription",
    customer: org.stripeCustomerId,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_collection: "if_required",
    metadata: { org_id: String(org.orgId), plan_id: planId, user_id: String(user.id) },
  };
  if (promo) {
    sessionBody["discounts[0][promotion_code]"] = promo.id;
  }

  const resp = await stripeCall<{ url: string; id: string }>(env.STRIPE_SECRET_KEY, "/checkout/sessions", {
    body: sessionBody,
  });
  if (!resp.ok) return error(resp.error.message, 502);
  return json({ checkout_url: resp.data.url, session_id: resp.data.id });
};
