
type LeadKpiPeriod = { current: number; prev: number; delta: number };

export type LeadSummary = {
  total_leads?: number;
  new_today?: number;
  hot_leads?: number;
  contacted_percentage?: number;
  needs_reply?: number;
  // Keyed by window length in days ("7" | "14" | "30"); each entry compares the
  // current window to the equal-length window immediately before it.
  new_leads_by_period?: Record<string, LeadKpiPeriod>;
  hot_leads_by_period?: Record<string, LeadKpiPeriod>;
};

export type CsvRow = Record<string, string>;

export type ImportSkipReason = {
  row_number?: number;
  reason?: string;
  message?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type ImportSheetMeta = { name: string; row_count: number };

export type QuickFilterId =
  | "hot"
  | "needs_reply"
  | "buyers"
  | "sellers"
  | "ai_active"
  | "ai_recommended"
  | "appointment_set";

// type LeadsFilterPayload = {
//   area?: string[];
//   price?: string[];
//   source?: string[];
//   stage?: string[];
// };

export type SmsConsentStatus = "opted_in" | "unknown" | "no_sms";

export type DuplicateHandling = "skip" | "update";

export type ImportStep = 1 | 2 | 3 | 4 | 5 | 6;

// type ImportMappingStatus = "none" | "auto" | "manual";

export type ImportResult = {
  imported?: number;
  total_rows?: number;
  skipped?: number;
  errors?: number;
  created?: number;
  updated?: number;
  imported_lead_ids?: number[];
  message?: string;
  skip_reasons?: ImportSkipReason[];
};

export type NewLeadForm = {
  name: string;
  email: string;
  company: string;
  status: string;
  phone: string;
  countryCode: string;
  source: string;
  price_range: string;
  notes: string;
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  tags: string;
  tagsArray: string[];
  lead_type: string;
  intent: string;
  ai_status: string;
  area: string;
  // IANA timezone for quiet-hours / clock; blank = auto-detect from phone area code.
  timezone: string;
  // AI Qualification capture (was an EditLeadModal-only section; now folded
  // into the unified Add/Edit modal so the AI agent's extracted fields are
  // editable from the same place. All optional - blank/undefined leaves
  // the lead row untouched on save).
  property_address?: string;
  timeline?: string;
  pre_approved?: boolean | null;
  motivation?: string;
  occupancy_status?: string;
  interest_level?: string;
  financing_status?: string;
  bedrooms?: string;
  bathrooms?: string;
  property_type?: string;
  seller_price_expectations?: string;
  qualification_step?: number;
  qualification_status?: string;
};

export type EditingLead = {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
  status?: string;
  phone?: string;
  countryCode?: string;
  countrySearch?: string;
  source?: string;
  price_range?: string;
  property_address?: string;
  notes?: string;
  email_notifications_enabled?: boolean;
  sms_notifications_enabled?: boolean;
  /** Compliance flags from the leads API serializer - drive the table badges
   *  and the per-row "blocked" indicator. */
  sms_opt_out?: boolean | null;
  email_opt_out?: boolean | null;
  /** SMS consent state ('opted_in' | 'opted_out' | 'unknown' | null). Drives
   *  the green-check indicator for opted-in leads. */
  sms_consent_status?: string | null;
  /** Why an opted-out number is blocked. Drives the table tooltip text:
   *   'keyword'       -> "Texted STOP"
   *   'manual_admin'  -> "Blocked by admin"
   *   'manual_agent'  -> "Blocked by agent"
   *   'manual_import' -> "Marked opted-out at import"
   *   null            -> "Opted out"
   */
  sms_opt_out_reason?: string | null;
  tags?: string | string[];
  tagsArray?: string[];
  lead_type?: string;
  intent?: string;
  ai_status?: string;
  area?: string;
  stage?: string;
  pipeline_stage?: string;
  updated_at?: string | null;
  last_activity_at?: string | null;
  budget?: string | null;
  range?: string | null;
  team?: string | null;
  team_name?: string | null;
  agent?: string | null;
  agent_name?: string | null;
  agent_id?: number | string | null;
  owner_id?: number | string | null;
  owner_name?: string | null;
  assigned_agent?: string | null;
  user_id?: number | string | null;
  org_id?: number | null;
  created_at?: string | null;
  timezone?: string | null;
  timezone_source?: string | null;
  timeline?: string | null;
  pre_approved?: boolean | null;
  motivation?: string | null;
  occupancy_status?: string | null;
  financing_status?: string | null;
  interest_level?: string | null;
  bedrooms?: number | string | null;
  bathrooms?: number | string | null;
  property_type?: string | null;
  seller_price_expectations?: string | null;
  qualification_step?: number | null;
  qualification_status?: string | null;
};

// export type { ImportAiSettings };
