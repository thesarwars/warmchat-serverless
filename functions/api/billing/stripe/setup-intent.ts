/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { getOrgWithStripeCustomer } from "../../../_shared/billing.ts";
import { stripeCall } from "../../../_shared/stripe.ts";

/**
 * GET / POST /api/billing/stripe/setup-intent
 * Returns a SetupIntent client_secret so the frontend's Stripe.js can collect
 * a payment method, attach it to the customer, and confirm via Stripe Elements.
 */
async function handle(context: EventContext<Env, string, Record<string, unknown>>) {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!env.STRIPE_SECRET_KEY) return error("Stripe is not configured", 503);

  const org = await getOrgWithStripeCustomer(env, user.id, user.email);
  if (!org) return error("Not part of an organization", 403);

  const resp = await stripeCall<{ client_secret: string; id: string }>(env.STRIPE_SECRET_KEY, "/setup_intents", {
    body: {
      customer: org.stripeCustomerId,
      "payment_method_types[0]": "card",
      usage: "off_session",
      metadata: { org_id: String(org.orgId), user_id: String(user.id) },
    },
  });
  if (!resp.ok) return error(resp.error.message, 502);
  return json({ client_secret: resp.data.client_secret, setup_intent_id: resp.data.id });
}
export const onRequestGet: PagesFunction<Env> = handle;
export const onRequestPost: PagesFunction<Env> = handle;
