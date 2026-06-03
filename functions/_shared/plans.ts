/**
 * Plan limits.
 * Used by automation endpoints to enforce active-automation / channel caps.
 */

export interface PlanLimits {
  channels: string[];
  max_active_channels: number | "unlimited";
  monthly_sends: number;
  monthly_email_sends: number;
  monthly_sms_sends: number;
  active_automations: number | "unlimited";
  automations: boolean;
  ai_features: boolean;
  ai_limit: number;
  team_members: number | "unlimited";
  branding: boolean;
  analytics: string;
  // Voice minutes included per billing cycle. Stamped onto
  // billing_cycles.plan_minute_limit when a cycle is created (outbound call +
  // status webhook) and gates outbound calling. Matches the "calling minutes"
  // the pricing UI advertises (PricingPlan.tsx / PlanSelection.tsx).
  calling_minutes: number;
}

export const PLANS: Record<string, { price: number; limits: PlanLimits }> = {
  free_channel: {
    price: 0,
    limits: {
      channels: ["email"],
      max_active_channels: 1,
      monthly_sends: 500,
      monthly_email_sends: 500,
      monthly_sms_sends: 0,
      active_automations: 1,
      automations: true,
      ai_features: false,
      ai_limit: 0,
      team_members: 1,
      branding: true,
      analytics: "basic",
      calling_minutes: 0,
    },
  },
  starter: {
    price: 89,
    limits: {
      channels: ["email", "sms"],
      max_active_channels: 2,
      monthly_sends: 10000,
      monthly_email_sends: 10000,
      monthly_sms_sends: 1250,
      active_automations: 5,
      automations: true,
      ai_features: true,
      ai_limit: 2500,
      team_members: 1,
      branding: false,
      analytics: "basic",
      calling_minutes: 1000,
    },
  },
  growth: {
    price: 149,
    limits: {
      channels: ["email", "sms"],
      max_active_channels: 2,
      monthly_sends: 20000,
      monthly_email_sends: 20000,
      monthly_sms_sends: 2500,
      active_automations: "unlimited",
      automations: true,
      ai_features: true,
      ai_limit: 15000,
      team_members: 1,
      branding: false,
      analytics: "advanced",
      calling_minutes: 3750,
    },
  },
  // Custom Brokerage tier (contact-sales, no fixed Stripe price). Unlocks the
  // Team section (Users/Teams/Offices/Lead Routing) - which is gated to this
  // plan only, not Starter/Growth. Limits are generous placeholders until
  // per-contract limits are introduced.
  custom_brokerage: {
    price: 0,
    limits: {
      channels: ["email", "sms"],
      max_active_channels: "unlimited",
      monthly_sends: 100000,
      monthly_email_sends: 100000,
      monthly_sms_sends: 25000,
      active_automations: "unlimited",
      automations: true,
      ai_features: true,
      ai_limit: 100000,
      team_members: "unlimited",
      branding: false,
      analytics: "advanced",
      calling_minutes: 10000,
    },
  },
};

export function planLimitsFor(plan: string | null | undefined): PlanLimits {
  const key = plan && PLANS[plan] ? plan : "free_channel";
  return PLANS[key]!.limits;
}

/** Calling minutes included with an org's plan (the billing-cycle limit). */
export function planMinuteLimit(plan: string | null | undefined): number {
  return planLimitsFor(plan).calling_minutes;
}
