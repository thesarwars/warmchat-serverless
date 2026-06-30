/// <reference types="@cloudflare/workers-types" />

/**
 * Shared lead create/update used by BOTH the session endpoint
 * (POST /api/leads, mode "create") and the external integration intake
 * (POST /api/integrations/v1/leads, mode "upsert"). Centralizing it keeps phone
 * normalization, timezone inference, and dedup identical across both paths.
 *
 * mode "create": reject an email/phone duplicate with 409 (the app's existing
 *   manual-add behavior).
 * mode "upsert": find an existing lead by external_id -> email -> phone and
 *   update it in place; otherwise insert. This is what an idempotent Zapier
 *   action needs so re-runs don't create duplicate leads.
 */
import { queryFirst, execute } from "./db.ts";
import { capLeadField } from "./leadLimits.ts";
import { tryNormalizeE164 } from "./phone.ts";
import { normalizedPhoneSql } from "./smsCompliance.ts";
import { normalizeTimezone } from "./timezoneAliases.ts";
import { usAreaCodeToTimezone } from "./usAreaCodeTimezone.ts";
import { dispatchZapierEvent } from "./zapierDispatch.ts";
import { toLeadView } from "./integrationApi.ts";
import type { Env } from "./env.ts";

type WaitUntil = (promise: Promise<unknown>) => void;

export interface LeadIntakeInput {
  orgId: number;
  ownerId: number | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  platform?: string | null;
  status?: string | null;
  estimated_price?: number | null;
  lead_type?: string | null;
  intent?: string | null;
  notes?: string | null;
  timezone?: string | null;
  timezone_source?: string | null;
  auto_followup_action?: string | null;
  external_id?: string | null;
  sms_consent_status?: string | null;
}

export type LeadIntakeResult =
  | { ok: true; leadId: number; created: boolean; lead: Record<string, unknown> }
  | { ok: false; status: number; message: string };

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Find an existing lead by external_id, then email, then phone (last-10-digit match). */
async function findExisting(
  env: Env,
  orgId: number,
  externalId: string | null,
  email: string | null,
  phone: string | null,
): Promise<number | null> {
  if (externalId) {
    const row = await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM lead WHERE org_id = ? AND external_id = ? LIMIT 1`,
      orgId,
      externalId,
    );
    if (row) return row.id;
  }
  if (email) {
    const row = await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM lead WHERE org_id = ? AND LOWER(email) = LOWER(?) LIMIT 1`,
      orgId,
      email,
    );
    if (row) return row.id;
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    const suffix = digits.length >= 10 ? digits.slice(-10) : digits;
    if (suffix) {
      const row = await queryFirst<{ id: number }>(
        env.D1DB,
        `SELECT id FROM lead
           WHERE org_id = ?
             AND phone IS NOT NULL
             AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '.', '')
                 LIKE ?
           LIMIT 1`,
        orgId,
        `%${suffix}`,
      );
      if (row) return row.id;
    }
  }
  return null;
}

export async function createOrUpdateLead(
  env: Env,
  input: LeadIntakeInput,
  mode: "create" | "upsert",
  waitUntil?: WaitUntil,
): Promise<LeadIntakeResult> {
  // Auto-cap text fields to their stored max length (mirrors the import path
  // and the Add/Edit form's maxLength) so no source can exceed the limit.
  const firstName = capLeadField("first_name", str(input.first_name));
  const lastName = capLeadField("last_name", str(input.last_name));
  const name = capLeadField(
    "name",
    str(input.name) || [firstName, lastName].filter(Boolean).join(" ").trim() || null,
  );
  const email = capLeadField("email", str(input.email));
  const company = capLeadField("company", str(input.company));
  const source = capLeadField("source", str(input.source));
  const notes = capLeadField("notes", str(input.notes));
  const rawPhone = str(input.phone);
  if (!name && !email && !rawPhone) {
    return { ok: false, status: 400, message: "A lead needs at least a name, email, or phone" };
  }

  const phone = capLeadField("phone", rawPhone ? tryNormalizeE164(rawPhone) ?? rawPhone : null);
  const externalId = str(input.external_id);

  // Resolve timezone: explicit (validated) wins, else infer from a US area code.
  let timezone: string | null = null;
  let timezoneSource: string | null = null;
  const tzIn = str(input.timezone);
  if (tzIn) {
    const normalized = normalizeTimezone(tzIn);
    if (!normalized) return { ok: false, status: 400, message: "Invalid timezone" };
    timezone = normalized;
    timezoneSource = input.timezone_source === "import" ? "import" : "manual";
  } else if (phone) {
    const guess = usAreaCodeToTimezone(phone);
    if (guess) {
      timezone = guess;
      timezoneSource = "area_code";
    }
  }

  const autoFollowupAction = input.auto_followup_action
    ? String(input.auto_followup_action).trim().toLowerCase() || null
    : null;

  const existingId = mode === "upsert" ? await findExisting(env, input.orgId, externalId, email, phone) : null;

  if (mode === "create") {
    if (email) {
      const dup = await queryFirst<{ id: number }>(
        env.D1DB,
        `SELECT id FROM lead WHERE org_id = ? AND LOWER(email) = LOWER(?) LIMIT 1`,
        input.orgId,
        email,
      );
      if (dup) return { ok: false, status: 409, message: "A lead with this email already exists in this organization." };
    }
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      const suffix = digits.length >= 10 ? digits.slice(-10) : digits;
      if (suffix) {
        const dup = await queryFirst<{ id: number }>(
          env.D1DB,
          `SELECT id FROM lead
             WHERE org_id = ?
               AND phone IS NOT NULL
               AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '.', '')
                   LIKE ?
             LIMIT 1`,
          input.orgId,
          `%${suffix}`,
        );
        if (dup) return { ok: false, status: 409, message: "A lead with this phone already exists in this organization." };
      }
    }
  }

  let leadId: number;
  let created: boolean;

  if (existingId) {
    // Upsert update: only overwrite columns the caller actually provided
    // (COALESCE(?, col) leaves the existing value when the new one is null).
    await execute(
      env.D1DB,
      `UPDATE lead SET
         name = COALESCE(?, name),
         first_name = COALESCE(?, first_name),
         last_name = COALESCE(?, last_name),
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         company = COALESCE(?, company),
         source = COALESCE(?, source),
         platform = COALESCE(?, platform),
         external_id = COALESCE(?, external_id),
         estimated_price = COALESCE(?, estimated_price),
         lead_type = COALESCE(?, lead_type),
         intent = COALESCE(?, intent),
         notes = COALESCE(?, notes),
         timezone = COALESCE(?, timezone),
         timezone_source = COALESCE(?, timezone_source),
         sms_consent_status = COALESCE(?, sms_consent_status),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      name,
      firstName,
      lastName,
      email,
      phone,
      company,
      source,
      str(input.platform),
      externalId,
      input.estimated_price ?? null,
      str(input.lead_type),
      str(input.intent),
      notes,
      timezone,
      timezoneSource,
      str(input.sms_consent_status),
      existingId,
    );
    leadId = existingId;
    created = false;
  } else {
    // "Do not SMS" leads never need AI proactive outreach - keep them off the
    // AI flow by default so they don't surface in dashboards / activity feeds
    // as AI-active. Agent can still flip them back on later from the lead
    // editor. Other consent states inherit the DB default ('active').
    const initialAiStatus = str(input.sms_consent_status) === "no_sms"
      ? "off"
      : null;
    const insert = await execute(
      env.D1DB,
      `INSERT INTO lead
         (name, first_name, last_name, email, phone, company, source, platform, status,
          estimated_price, lead_type, intent, notes, timezone, timezone_source,
          auto_followup_action, external_id, sms_consent_status,
          ai_status, owner_id, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         COALESCE(?, 'active'), ?, ?)`,
      name,
      firstName,
      lastName,
      email,
      phone,
      company,
      source,
      str(input.platform),
      str(input.status) ?? "New Lead",
      input.estimated_price ?? null,
      str(input.lead_type),
      str(input.intent),
      notes,
      timezone,
      timezoneSource,
      autoFollowupAction,
      externalId,
      str(input.sms_consent_status),
      initialAiStatus,
      input.ownerId,
      input.orgId,
    );
    leadId = Number(insert.meta.last_row_id);
    created = true;
  }

  // Inherit a prior opt-out: if this number already said STOP (sms_contact.opted_out,
  // which survives a lead delete), mark the lead opted-out too - a re-import must
  // not resurrect a number that opted out, regardless of any 'opted_in' the caller
  // asserted. Sends are already blocked by sms_contact at dispatch; this keeps the
  // lead row (badge + needs_reply) honest. Matched on the last 10 digits.
  if (phone) {
    await execute(
      env.D1DB,
      `UPDATE lead SET sms_opt_out = 1, sms_consent_status = 'opted_out', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND COALESCE(sms_opt_out,0) = 0 AND EXISTS (
          SELECT 1 FROM sms_contact sc WHERE sc.org_id = ? AND sc.opted_out = 1
            AND substr(${normalizedPhoneSql("sc.phone_number_e164")}, -10) = substr(${normalizedPhoneSql("?")}, -10)
        )`,
      leadId, input.orgId, phone,
    );
  }

  const lead = await queryFirst<Record<string, unknown>>(env.D1DB, `SELECT * FROM lead WHERE id = ?`, leadId);

  // Instant "New Lead" trigger for any subscribed Zap. Only on first creation,
  // and never from bulk import (which has its own insert loop and would storm
  // subscribers). Best-effort + cheap when the org has no subscriptions.
  if (created) {
    await dispatchZapierEvent(env, input.orgId, "lead.created", { lead: toLeadView(lead) }, waitUntil);
  }

  return { ok: true, leadId, created, lead: lead ?? {} };
}
