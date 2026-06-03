/// <reference types="@cloudflare/workers-types" />

/**
 * Maximum stored length (characters) for each lead text field. This is the
 * server-side mirror of `LEAD_TEXT_LIMITS` in
 * `src/components/leads/constants.ts` - keep BOTH copies in sync. The frontend
 * blocks over-long input on the Add/Edit form; this enforces the same ceiling
 * on every server write path (bulk import, manual create, integration upsert)
 * so a value can never exceed the limit once stored, regardless of source.
 */
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

export type LeadTextField = keyof typeof LEAD_TEXT_LIMITS;

/**
 * Auto-cap a value to a field's max length, trimming trailing whitespace left
 * by the slice. Unknown fields pass through untouched. Used by the import path
 * to "auto cap and strip the rest" instead of rejecting an over-long row.
 */
export function capLeadField<T extends string | null | undefined>(
  field: LeadTextField,
  value: T,
): T {
  if (value == null) return value;
  const max = LEAD_TEXT_LIMITS[field];
  const s = String(value);
  if (s.length <= max) return value;
  return s.slice(0, max).trimEnd() as T;
}
