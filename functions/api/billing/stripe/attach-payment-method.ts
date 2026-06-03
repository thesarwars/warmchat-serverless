/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { getOrgWithStripeCustomer } from "../../../_shared/billing.ts";
import { stripeCall } from "../../../_shared/stripe.ts";

/**
 * POST /api/billing/stripe/attach-payment-method
 * Body: { payment_method_id }
 * Attaches a PaymentMethod (collected client-side) to the org's Stripe
 * customer and sets it as the default for invoices. Returns `{ success, role_update }`
 * matching the frontend's StripePaymentForm expectations.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!env.STRIPE_SECRET_KEY) return error("Stripe is not configured", 503);

  const body = (await readJson<{ payment_method_id?: string }>(request)) || {};
  const pmId = (body.payment_method_id || "").trim();
  if (!pmId) return error("payment_method_id is required", 400);

  const org = await getOrgWithStripeCustomer(env, user.id, user.email);
  if (!org) return error("Not part of an organization", 403);

  const attach = await stripeCall(env.STRIPE_SECRET_KEY, `/payment_methods/${pmId}/attach`, {
    body: { customer: org.stripeCustomerId },
  });
  if (!attach.ok) return error(attach.error.message, 502);

  const setDefault = await stripeCall(env.STRIPE_SECRET_KEY, `/customers/${org.stripeCustomerId}`, {
    body: { "invoice_settings[default_payment_method]": pmId },
  });
  if (!setDefault.ok) return error(setDefault.error.message, 502);

  return json({ success: true, role_update: null });
};
