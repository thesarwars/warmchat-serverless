/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { stripeCall } from "../../_shared/stripe.ts";

/**
 * POST /api/billing/confirm-payment
 * Body: { session_id }
 * Looks up the Checkout Session, verifies payment + subscription, and writes
 * the resulting plan/subscription back to organization. Called from the Stripe
 * success-redirect page (BillingSuccess.tsx).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!env.STRIPE_SECRET_KEY) return error("Stripe is not configured", 503);

  const body = (await readJson<{ session_id?: string }>(request)) || {};
  const sid = (body.session_id || "").trim();
  if (!sid) return error("session_id is required", 400);

  const sess = await stripeCall<{
    payment_status: string; subscription: string | null;
    customer: string; metadata: Record<string, string>; status: string;
  }>(env.STRIPE_SECRET_KEY, `/checkout/sessions/${encodeURIComponent(sid)}`);
  if (!sess.ok) return error(sess.error.message, 502);

  const planId = sess.data.metadata?.plan_id ?? null;
  const orgIdMeta = Number(sess.data.metadata?.org_id);
  const paid = sess.data.payment_status === "paid" || sess.data.status === "complete";

  if (!Number.isInteger(orgIdMeta)) return error("session is missing org_id metadata", 400);
  // Tenancy check: caller must belong to the org from metadata.
  const member = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM membership WHERE user_id = ? AND org_id = ? LIMIT 1`, user.id, orgIdMeta);
  if (!member) return error("Forbidden", 403);

  if (paid && planId) {
    await execute(
      env.D1DB,
      `UPDATE organization SET plan = ?, subscription_status = 'active',
              plan_started_at = COALESCE(plan_started_at, CURRENT_TIMESTAMP),
              stripe_customer_id = COALESCE(stripe_customer_id, ?),
              stripe_subscription_id = COALESCE(?, stripe_subscription_id)
        WHERE id = ?`,
      planId, sess.data.customer, sess.data.subscription, orgIdMeta,
    );
  }

  return json({
    success: paid,
    plan: planId,
    subscription_id: sess.data.subscription,
    payment_status: sess.data.payment_status,
  });
};
