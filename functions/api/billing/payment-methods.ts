/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { queryFirst } from "../../_shared/db.ts";
import { stripeCall } from "../../_shared/stripe.ts";

interface CardPM {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

/**
 * GET /api/billing/payment-methods - the org's saved Stripe cards (READ-ONLY).
 *
 * Reads the customer id from the CALLER's own org row (so one org can't read
 * another's cards) and NEVER creates a Stripe customer - free / comp orgs with no
 * customer just return { cards: [] }.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const orgRow = await queryFirst<{ stripe_customer_id: string | null }>(
    env.D1DB,
    `SELECT o.stripe_customer_id
       FROM membership m JOIN organization o ON o.id = m.org_id
      WHERE m.user_id = ? LIMIT 1`,
    user.id,
  );
  const customerId = orgRow?.stripe_customer_id;
  if (!customerId || !env.STRIPE_SECRET_KEY) return json({ cards: [] });

  // Default payment method (drives the "Default" chip) - best-effort.
  let defaultPm: string | null = null;
  const cust = await stripeCall<{
    invoice_settings?: { default_payment_method?: string | null };
    default_source?: string | null;
  }>(env.STRIPE_SECRET_KEY, `/customers/${customerId}`);
  if (cust.ok) defaultPm = cust.data.invoice_settings?.default_payment_method || cust.data.default_source || null;

  const list = await stripeCall<{
    data?: Array<{ id: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } }>;
  }>(env.STRIPE_SECRET_KEY, `/customers/${customerId}/payment_methods?type=card`);
  if (!list.ok) return json({ cards: [] });

  const cards: CardPM[] = (list.data.data || []).map((m) => ({
    id: m.id,
    brand: m.card?.brand ?? null,
    last4: m.card?.last4 ?? null,
    exp_month: m.card?.exp_month ?? null,
    exp_year: m.card?.exp_year ?? null,
    is_default: m.id === defaultPm,
  }));
  cards.sort((a, b) => Number(b.is_default) - Number(a.is_default)); // default first
  return json({ cards });
};
