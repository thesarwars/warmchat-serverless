/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { stripeCall } from "./stripe.ts";

/**
 * Shared promotion-code lookup + description. Admins create coupons + promotion
 * codes in the Stripe dashboard; the app only LOOKS THEM UP (to validate a code
 * the user typed) and APPLIES them to a checkout session. No code is created
 * here. Lookup is case-tolerant (Stripe treats codes case-insensitively at
 * redemption, but the list filter is exact) so "warm731" and "WARM731" both
 * resolve to the dashboard's "Warm731".
 */
export interface StripeCoupon {
  id?: string;
  name?: string | null;
  percent_off?: number | null;
  amount_off?: number | null;
  currency?: string | null;
  duration?: string | null; // "once" | "repeating" | "forever"
  duration_in_months?: number | null;
  valid?: boolean;
}
export interface StripePromotionCode {
  id: string;
  code: string;
  active: boolean;
  expires_at?: number | null;
  coupon?: StripeCoupon;
}

/** Find an ACTIVE promotion code by the user-entered code (case-tolerant). */
export async function findActivePromotionCode(
  env: Env,
  rawCode: string,
): Promise<StripePromotionCode | null> {
  const code = (rawCode || "").trim();
  if (!code || !env.STRIPE_SECRET_KEY) return null;
  // Try the code as typed, then upper/lower, deduped - covers any casing.
  const variants = [...new Set([code, code.toUpperCase(), code.toLowerCase()])];
  for (const v of variants) {
    const resp = await stripeCall<{ data: StripePromotionCode[] }>(
      env.STRIPE_SECRET_KEY,
      `/promotion_codes?code=${encodeURIComponent(v)}&active=true&limit=1`,
      // Pin so the embedded coupon keeps its classic shape (percent_off,
      // duration, duration_in_months) for an accurate human description.
      { apiVersion: "2023-10-16" },
    );
    if (resp.ok) {
      const pc = resp.data.data?.[0];
      if (pc && pc.active && pc.coupon?.valid !== false) return pc;
    }
  }
  return null;
}

/** "100% off for 3 months" / "$20 off once" / "15% off". */
export function describeCoupon(coupon: StripeCoupon | undefined): string {
  if (!coupon) return "Discount applied";
  const off = coupon.percent_off != null
    ? `${coupon.percent_off}% off`
    : coupon.amount_off != null
      ? `$${(coupon.amount_off / 100).toFixed(2).replace(/\.00$/, "")} off`
      : "Discount";
  let when = "";
  if (coupon.duration === "forever") when = " forever";
  else if (coupon.duration === "repeating" && coupon.duration_in_months) {
    when = ` for ${coupon.duration_in_months} month${coupon.duration_in_months === 1 ? "" : "s"}`;
  } else if (coupon.duration === "once") when = " on your first payment";
  return `${off}${when}`;
}
