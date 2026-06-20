/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { findActivePromotionCode, describeCoupon } from "../../_shared/promo.ts";

/**
 * POST /api/billing/validate-promo  Body: { code }
 * Returns { valid: true, code, description } when the code is an active Stripe
 * promotion code, else { valid: false }. The discount itself is applied later
 * at checkout (create-checkout-session) - this only validates + describes it so
 * the signup field can confirm the code before the user pays.
 *
 * PUBLIC (no auth): the promo field lives on the signup page, where the user
 * isn't logged in yet. It only reads shareable promo codes (no user data) and
 * returns valid/description - nothing sensitive.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (!env.STRIPE_SECRET_KEY) return error("Stripe is not configured", 503);

  const body = (await readJson<{ code?: string }>(request)) || {};
  const code = (body.code || "").trim();
  if (!code) return error("code is required", 400);

  const pc = await findActivePromotionCode(env, code);
  if (!pc) return json({ valid: false });

  return json({ valid: true, code: pc.code, description: describeCoupon(pc.coupon) });
};
