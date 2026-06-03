import type { NewLeadForm, QuickFilterId } from "./types";

export const LEAD_FIELDS = [
  "name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "contact",
  "notes",
  "company",
  "property_address",
  "status",
  "source",
  "tags",
  "timezone",
  // Per-row SMS consent state, overriding the global "SMS Consent" radio. The
  // server parses common values: yes/y/1/true/opted_in -> opted_in; no/n/0/
  // false/opted_out/stop -> opted_out; anything else -> unknown.
  "sms_consent",
] as const;

export const LEAD_FIELD_LABELS_MAP: Record<string, string> = {
  name: "Name",
  first_name: "First Name",
  last_name: "Last Name",
  email: "Email",
  phone: "Phone",
  contact: "Phone or Email (one column)",
  notes: "Notes",
  company: "Company",
  property_address: "Property Address",
  status: "Stage",
  source: "Source",
  tags: "Tags",
  timezone: "Time Zone",
  sms_consent: "SMS Consent (per-row, overrides global)",
};

export const LEADS_PAGE_SIZE_OPTIONS = [100, 200, 300, 400, 500] as const;
export type LeadsPageSize = (typeof LEADS_PAGE_SIZE_OPTIONS)[number];

// Maximum stored length (characters) for each lead text field. Enforced in
// three places that MUST stay in sync: the Add/Edit modal (`maxLength` on the
// inputs + a save-time validation), the bulk-import backend (auto-caps and
// strips the overflow per row), and the manual/integration intake. The mirror
// copy lives in `functions/_shared/leadLimits.ts` - keep both aligned.
export const LEAD_TEXT_LIMITS = {
  name: 100,
  first_name: 60,
  last_name: 60,
  email: 254, // RFC 5321 max
  phone: 32,
  company: 120,
  area: 120,
  property_address: 200,
  source: 60,
  notes: 5000,
  timeline: 120,
  motivation: 500,
  financing_status: 120,
  occupancy_status: 60,
  property_type: 60,
  seller_price_expectations: 120,
  tag: 40,
} as const;

// The canonical pipeline Stage list. The stage IS the lead's `status` column -
// it shows as the Stage on the Leads page, drives the Pipeline (kanban) board,
// derives the lead Score (STAGE_SCORE below), feeds the dashboard funnel, and is
// the single source of truth for "hot" (score > HOT_SCORE_THRESHOLD). The AI
// auto-advances this as a conversation progresses.
export const STAGE_OPTIONS = [
  "New Lead",
  "Contacted",
  "Engaged",
  "Qualified",
  "Appointment Set",
  "Active Client",
  "Under Contract",
  "Closed",
  "Lost",
] as const;

// Stages shown as columns on the Pipeline board (Lost is excluded - it's a
// terminal/negative bucket, not a forward pipeline column).
export const PIPELINE_STAGES = STAGE_OPTIONS.filter((s) => s !== "Lost");

// Deterministic Stage -> Score (%) mapping. The lead's Score IS its stage's
// value here; there is no separate rubric. A lead is "hot" when its score is
// strictly above HOT_SCORE_THRESHOLD (so Qualified and beyond are hot).
export const STAGE_SCORE: Record<string, number> = {
  "Lost": 5,
  "New Lead": 10,
  "Contacted": 25,
  "Engaged": 45,
  "Qualified": 65,
  "Appointment Set": 80,
  "Active Client": 90,
  "Under Contract": 98,
  "Closed": 100,
};

export const HOT_SCORE_THRESHOLD = 45;
// The first stage at/above the hot threshold - used when an agent manually
// marks a lead hot (un-marking drops back to the highest non-hot stage).
export const FIRST_HOT_STAGE = "Qualified";
export const HIGHEST_NON_HOT_STAGE = "Engaged";

// Plain-English meaning of each stage, surfaced under the stage pickers.
export const STAGE_DESCRIPTIONS: Record<string, string> = {
  "New Lead": "Just added, not worked yet. The default for a fresh lead or list.",
  "Contacted": "Outreach has gone out; waiting on or starting a conversation.",
  "Engaged": "Actively replying and interested, but not yet qualified.",
  "Qualified": "Budget / timeline / intent confirmed - a real opportunity (hot).",
  "Appointment Set": "A showing or consultation is on the calendar.",
  "Active Client": "Actively touring or working with you toward a deal.",
  "Under Contract": "An offer is accepted and the deal is in escrow.",
  "Closed": "Deal done - the transaction has closed.",
  "Lost": "Unresponsive, went cold, or chose not to move forward.",
};

export const VIEW_OPTIONS = [
  "All Leads",
  "My Leads",
  "Unassigned",
  "Follow-Up Due",
  "Hot Prospects",
];

export const LEAD_TYPE_OPTIONS = [
  "Buyer",
  "Seller",
  "Unknown",
  "Both",
  "Investor",
  "Renter",
  "Agent Referral",
] as const;

export const AI_STATUS_OPTIONS = [
  "AI Off",
  "Automation Only",
  "AI Active",
  "AI Paused",
  "Awaiting Reply",
  "Human Takeover",
  "Appointment Booked",
  "AI Complete",
] as const;

export const SOURCE_OPTIONS = [
  "Zillow",
  "Realtor.com",
  "Open House",
  "Cold Calling",
  "Website",
  "Google Ads",
  "Facebook Ads",
  "Instagram",
  "Referral",
  "Imported",
  "Inbound SMS",
  "Manual",
  "CRM Import",
  "Other",
] as const;

export const PRICE_RANGE_OPTIONS = [
  "Under $300k",
  "$300k-$500k",
  "$500k-$750k",
  "$750k-$1M",
  "$1M+",
] as const;

export const QUICK_FILTERS: { id: QuickFilterId; label: string }[] = [
  { id: "hot",             label: "Hot Leads" },
  { id: "needs_reply",     label: "Needs Reply" },
  { id: "buyers",          label: "Buyers" },
  { id: "sellers",         label: "Sellers" },
  { id: "ai_active",       label: "AI Active" },
  { id: "ai_recommended",  label: "AI Recommended" },
  { id: "appointment_set", label: "Appointment Set" },
];

export const IMPORT_STEP_LABELS = [
  "Upload File",
  "Map Columns",
  "Duplicate Handling",
  "AI Follow-Up",
  "SMS Consent & Tags",
  "Review & Import",
];

export const IMPORT_MAPPING_FIELD_STYLES: Record<
  "none" | "auto" | "manual",
  string
> = {
  none: "border border-gray-200 bg-white",
  auto: "border-2 border-green-400 bg-green-50",
  manual: "border-2 border-orange-400 bg-orange-50",
};

export const DUPLICATE_HANDLING_OPTIONS = [
  {
    value: "skip" as const,
    label: "Ignore duplicates",
    desc: "Skip rows that already exist and import only new valid leads.",
  },
  {
    value: "update" as const,
    label: "Replace duplicates",
    desc: "Update existing leads with the new mapped values from this import.",
  },
];

export const IMPORT_SMS_CONSENT_OPTIONS = [
  {
    value: "opted_in" as const,
    label: "Already opted in",
    desc: "Contacts gave explicit prior consent. SMS can be sent immediately.",
  },
  {
    value: "unknown" as const,
    label: "Unknown / prior relationship",
    desc: "Opt-in status uncertain. A one-time confirmation SMS will be sent first.",
  },
  {
    value: "no_sms" as const,
    label: "Do not SMS",
    desc: "Never send SMS to these contacts.",
  },
];

export const ADD_LEAD_SMS_CONSENT_OPTIONS = [
  {
    value: "opted_in" as const,
    label: "Already opted in",
    desc: "Contact gave explicit prior consent. SMS can be sent immediately.",
  },
  {
    value: "unknown" as const,
    label: "Unknown / prior relationship",
    desc: "Opt-in status uncertain. A one-time confirmation SMS will be sent first.",
  },
  {
    value: "no_sms" as const,
    label: "Do not SMS",
    desc: "Never send SMS to this contact. Campaigns, AI follow-up, and manual sends are all blocked.",
  },
];

export const COUNTRY_CODES = [
  { code: "+1", name: "US" },
  { code: "+44", name: "UK" },
  { code: "+91", name: "IN" },
  { code: "+61", name: "AU" },
  { code: "+49", name: "DE" },
  { code: "+33", name: "FR" },
  { code: "+81", name: "JP" },
  { code: "+92", name: "PK" },
  { code: "+39", name: "IT" },
  { code: "+55", name: "BR" },
  { code: "+27", name: "ZA" },
];

export const DEFAULT_NEW_LEAD: NewLeadForm = {
  name: "",
  email: "",
  company: "",
  status: "New Lead",
  phone: "",
  countryCode: "+1",
  source: "",
  price_range: "",
  notes: "",
  email_notifications_enabled: true,
  sms_notifications_enabled: true,
  tags: "",
  tagsArray: [],
  lead_type: "Unknown",
  // intent (the legacy Hot/Warm/Cold temperature) is no longer a user-facing
  // field - the Stage (status) drives Score + hot now. Kept blank for the DB
  // column; the AI may still write it but nothing reads it for hot/score.
  intent: "",
  ai_status: "AI Active",
  area: "",
  timezone: "",
};
