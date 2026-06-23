/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { getOrgWithStripeCustomer } from "../../_shared/billing.ts";
import { queryFirst } from "../../_shared/db.ts";
import { stripeCall } from "../../_shared/stripe.ts";

/**
 * POST /api/billing/portal-session
 * Returns a Stripe Customer Portal URL the user can open to update card,
 * change plan, view invoices, or cancel. Saves us from re-implementing all
 * of that ourselves - Stripe hosts the entire flow.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!env.STRIPE_SECRET_KEY) return error("Stripe is not configured", 503);

  // Free / comp / never-subscribed orgs have NO Stripe customer to manage - the
  // Portal would be an empty dead-end, and creating a customer here would attach
  // a free user to Stripe (which we explicitly avoid). Check first, WITHOUT
  // creating a customer, and send them to choose a plan instead.
  const existing = await queryFirst<{ stripe_customer_id: string | null }>(
    env.D1DB,
    `SELECT o.stripe_customer_id
       FROM membership m JOIN organization o ON o.id = m.org_id
      WHERE m.user_id = ? LIMIT 1`,
    user.id,
  );
  if (!existing) return error("Not part of an organization", 403);
  if (!existing.stripe_customer_id) {
    return error("No active subscription to manage. Choose a plan to subscribe.", 409);
  }

  const org = await getOrgWithStripeCustomer(env, user.id, user.email);
  if (!org) return error("Not part of an organization", 403);

  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/settings?tab=billing`;

  const resp = await stripeCall<{ url: string }>(env.STRIPE_SECRET_KEY, "/billing_portal/sessions", {
    body: {
      customer: org.stripeCustomerId,
      return_url: returnUrl,
    },
  });
  if (!resp.ok) return error(resp.error.message, 502);
  return json({ portal_url: resp.data.url });
};
