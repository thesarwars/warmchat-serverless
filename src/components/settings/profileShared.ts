export type NotificationSettings = {
  notify_sms_inbound: boolean;
  notify_email_inbound: boolean;
  notify_calls: boolean;
  notify_appointments: boolean;
  notify_billing: boolean;
  notify_system: boolean;
  notify_ai_reply: boolean;
  notify_via_web_push: boolean;
  notify_via_mobile_push: boolean;
  notify_via_email_digest: boolean;
  notify_in_app_toast: boolean;
  notify_sound: boolean;
};

export type SettingKey = keyof NotificationSettings;

type Limits = Record<string, unknown>;

export interface ProfileResponse {
  user?: {
    id: number;
    name: string;
    email: string;
    // Agent's real-world mailing address - rendered in CAN-SPAM footers on
    // marketing emails (automations + sequences). Empty until the agent fills
    // it in on the Account page; marketing email sends fail without it.
    business_address?: string | null;
  };
  organization?: {
    id: number;
    name: string;
    about?: string | null;
    plan: string;
    subscription_status: string;
  };
  plan?: { name: string; price: number; limits: Limits };
  usage?: {
    month?: string;
    emails_sent?: number;
    sms_sent?: number;
    ai_requests?: number;
    email?: { used: number; limit: unknown; remaining: number | null };
    sms?: { used: number; limit: unknown; remaining: number | null };
    ai?: { used: number; limit: unknown; remaining: number | null };
  };
  usage_summary?: {
    email?: { used: number; limit: unknown; remaining: number | null };
    sms?: { used: number; limit: unknown; remaining: number | null };
    ai?: { used: number; limit: unknown; remaining: number | null };
    emails?: { used: number; limit: unknown; remaining: number | null };
  };
  phone_numbers?: { id: number; phone_number: string; verified: boolean }[];
}

export const PLAN_LIMITS: Record<string, Record<string, unknown>> = {
  free_channel: {
    channels: "email",
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
  },
  starter: {
    channels: "email,sms",
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
  },
  growth: {
    channels: "email,sms",
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
  },
  custom_brokerage: {
    channels: "email,sms",
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
  },
};

export const PLAN_PRICE: Record<string, string> = {
  free_channel: "Free",
  starter: "$89/mo",
  growth: "$149/mo",
  custom_brokerage: "Custom",
};

export function resolvePlanName(
  billingPlan: string | null,
  orgPlan?: string,
  storedPlan?: string | null,
) {
  return billingPlan || orgPlan || storedPlan || "free_channel";
}

export function formatPlanLabel(planName: string) {
  if (planName === "free_channel") return "Free";
  if (planName === "custom_brokerage") return "Custom Brokerage";
  return planName;
}

export function buildUsageRows(
  profile: ProfileResponse | null,
  limits: Record<string, unknown>,
) {
  const usageSummary = profile?.usage_summary;
  const usageWithChannels = profile?.usage?.email ? profile.usage : null;
  const usageFallback = profile?.usage || {};

  return [
    {
      label: "Emails",
      used:
        usageSummary?.email?.used ??
        usageSummary?.emails?.used ??
        usageWithChannels?.email?.used ??
        usageFallback.emails_sent ??
        0,
      limit:
        usageSummary?.email?.limit ??
        usageSummary?.emails?.limit ??
        usageWithChannels?.email?.limit ??
        limits.monthly_email_sends ??
        limits.monthly_sends,
    },
    {
      label: "SMS",
      used:
        usageSummary?.sms?.used ??
        usageWithChannels?.sms?.used ??
        usageFallback.sms_sent ??
        0,
      limit:
        usageSummary?.sms?.limit ??
        usageWithChannels?.sms?.limit ??
        limits.monthly_sms_sends ??
        limits.monthly_sends,
    },
    {
      label: "AI",
      used:
        usageSummary?.ai?.used ??
        usageWithChannels?.ai?.used ??
        usageFallback.ai_requests ??
        0,
      limit:
        usageSummary?.ai?.limit ??
        usageWithChannels?.ai?.limit ??
        limits.ai_limit,
    },
  ];
}
