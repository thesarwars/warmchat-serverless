/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { getOrgWithStripeCustomer, planPriceMap } from "../../_shared/billing.ts";
import { stripeCall } from "../../_shared/stripe.ts";

/**
 * POST /api/billing/create-checkout-session
 * Body: { planId, cancelPath? }
 * Response: { checkout_url } - the URL to redirect the browser to.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!env.STRIPE_SECRET_KEY) return error("Stripe is not configured", 503);

  const body = (await readJson<{ planId?: string; cancelPath?: string; successPath?: string }>(request)) || {};
  const planId = (body.planId || "").trim();
  if (!planId) return error("planId is required", 400);
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

  const resp = await stripeCall<{ url: string; id: string }>(env.STRIPE_SECRET_KEY, "/checkout/sessions", {
    body: {
      mode: "subscription",
      customer: org.stripeCustomerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: { org_id: String(org.orgId), plan_id: planId, user_id: String(user.id) },
    },
  });
  if (!resp.ok) return error(resp.error.message, 502);
  return json({ checkout_url: resp.data.url, session_id: resp.data.id });
};
