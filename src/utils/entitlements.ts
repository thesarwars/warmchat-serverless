/**
 * Single source of truth for "does this org have access to paid features
 * (SMS, AI, etc.) right now?". SMS gating must key off ACTIVE PAID ACCESS, not
 * the plan name alone - otherwise a user on a paid plan via a 100%-off promo
 * ('comp') or a free trial ('trialing') gets wrongly sent to the card/payment
 * screen even though they are already entitled.
 *
 * Mirrors the backend `isPaidPlanActive(plan, subscription_status)` in
 * functions/_shared/billing.ts so the FE routing and BE gate agree.
 */
export type BillingLike =
  | {
      plan?: string | null;
      subscription_status?: string | null;
      is_active?: boolean;
      comp_expires_at?: string | null;
    }
  | null
  | undefined;

const isPaidPlan = (plan?: string | null): boolean =>
  Boolean(plan) && plan !== "free_channel";

/**
 * True when the org is on a paid plan that is currently active - including
 * Stripe 'active' / 'trialing' and a 100%-off 'comp' promo grant. Prefers the
 * server-computed `is_active` flag (free_channel is excluded by the paid-plan
 * guard) and falls back to deriving it from subscription_status.
 */
export function hasActivePaidPlan(b: BillingLike): boolean {
  if (!b || !isPaidPlan(b.plan)) return false;
  if (typeof b.is_active === "boolean") return b.is_active;
  const s = b.subscription_status || "active";
  return s === "active" || s === "trialing" || s === "comp";
}

/** Access granted by a 100%-off promo - paid plan, no Stripe card on file. */
export function isCompedPromo(b: BillingLike): boolean {
  return isPaidPlan(b?.plan) && (b?.subscription_status ?? "") === "comp";
}

/**
 * User-facing notice for a comp/promo grant, or null when it doesn't apply.
 * Used to reassure the user that no card is required (e.g. on /upgrade).
 */
export function promoNotice(b: BillingLike): string | null {
  if (!isCompedPromo(b)) return null;
  const raw = b?.comp_expires_at;
  if (raw) {
    const ends = new Date(raw);
    if (!Number.isNaN(ends.getTime())) {
      return `Promo active — no card required until ${ends.toLocaleDateString()}.`;
    }
  }
  return "Promo active — no card required until promo ends.";
}
