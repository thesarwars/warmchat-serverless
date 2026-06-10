/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { execute, queryAll, queryFirst, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { tryNormalizeE164 } from "../../../_shared/phone.ts";
import { normalizeTimezone } from "../../../_shared/timezoneAliases.ts";
import { suppressPhone } from "../../../_shared/suppression.ts";
import { capLeadField, type LeadTextField } from "../../../_shared/leadLimits.ts";

/**
 * Parse a per-row SMS-consent cell. Accepts the common shorthands an agent
 * might already use in their CSV exports. Anything unrecognised resolves to
 * `null` so the caller falls back to the global default.
 */
function parseConsentCell(raw: string | null | undefined): "opted_in" | "opted_out" | "unknown" | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (["opted_in", "opt_in", "opt-in", "optin", "yes", "y", "true", "1", "subscribed", "consent"].includes(v)) return "opted_in";
  if (["opted_out", "opt_out", "opt-out", "optout", "no", "n", "false", "0", "stop", "unsubscribed", "unsubscribe"].includes(v)) return "opted_out";
  if (["unknown", "u", "maybe", "?"].includes(v)) return "unknown";
  return null;
}

const LEAD_FIELDS = new Set([
  "name", "first_name", "last_name", "email", "phone", "company",
  "status", "source", "property_address", "area", "price_range",
  "estimated_price", "notes", "lead_type", "intent", "timezone",
  "bedrooms", "bathrooms", "property_type", "seller_price_expectations",
]);

const EMAIL_IN_VALUE = /[^@\s]+@[^@\s]+\.[^@\s]+/;

// The column list for a lead INSERT - shared by the batched-insert path and the
// per-row fallback so they stay in lock-step. 27 bound params, well under the
// per-statement variable cap.
const LEAD_INSERT_SQL =
  `INSERT INTO lead
     (name, first_name, last_name, email, phone, company, status, source,
      property_address, area, price_range, estimated_price, notes,
      lead_type, intent, timezone, timezone_source, sms_consent_status,
      ai_status,
      bedrooms, bathrooms, property_type, seller_price_expectations,
      owner_id, org_id, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
     COALESCE(?, 'active'),
     ?, ?, ?, ?, ?, ?, ?, ?)`;

// Statements per D1 batch round-trip. A batch is one atomic transaction, so on a
// (rare) failure we re-run just that chunk row-by-row to isolate the bad row.
const BATCH_CHUNK = 50;

/** Coerce a numeric cell to a finite number or null - NaN would break the bind. */
function numOrNull(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The file is parsed in the browser and the rows arrive as JSON; this cap keeps
// the request payload (and the insert loop) bounded - it mirrors the total-file
// cap the client parser enforces. The client sends large files in sequential
// ~1500-row chunks (keeping each request's CPU well under the free-tier 10ms
// cap), so a single request normally carries far fewer than this ceiling.
const MAX_IMPORT_ROWS = 10000;

/**
 * Resolve email + phone for a row, honoring the `contact` pseudo-field - a
 * single column that may hold either an email or a phone.
 */
function normalizePhoneCell(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const normalized = tryNormalizeE164(cleaned);
  if (normalized) return normalized;
  // Fallback: strip formatting chars, keep if plausibly a phone number.
  const digits = cleaned.replace(/\D/g, "");
  return digits.length >= 7 ? cleaned : null;
}

// Where the email/phone preference ranks a value: 0 = it came from the column
// the user mapped to THIS field, 1 = the shared `contact` column, 2 = borrowed
// from the OTHER field's column (a mis-mapping we are correcting).
function fieldRank(declared: string, field: "email" | "phone"): number {
  if (declared === field) return 0;
  if (declared === "contact") return 1;
  return 2;
}

/**
 * Resolve email + phone for a row by the actual FORMAT of each supplied value,
 * not just the column it was mapped to. This recovers from a mis-mapping where a
 * single source column mixes phones and emails (e.g. the auto-mapper put a
 * "phone or email" column under Phone): an email sitting in the phone column is
 * routed to email, a phone sitting in the email column is routed to phone, and a
 * value whose format matches its own mapped field always wins over one borrowed
 * from the wrong column. The `contact` pseudo-field (one column that may hold
 * either) feeds the same classifier.
 */
function resolveContact(
  row: Record<string, string>,
  mapping: Record<string, string>,
): { email: string | null; phone: string | null } {
  const candidates = [
    { val: mapping.email ? (row[mapping.email] || "").trim() : "", declared: "email" },
    { val: mapping.phone ? (row[mapping.phone] || "").trim() : "", declared: "phone" },
    { val: mapping.contact ? (row[mapping.contact] || "").trim() : "", declared: "contact" },
  ].filter((c) => c.val);

  const emailCandidates: { val: string; declared: string }[] = [];
  const phoneCandidates: { val: string; norm: string; declared: string }[] = [];
  const leftovers: { val: string; declared: string }[] = [];

  for (const c of candidates) {
    if (EMAIL_IN_VALUE.test(c.val)) {
      emailCandidates.push(c);
      continue;
    }
    const norm = normalizePhoneCell(c.val);
    if (norm) phoneCandidates.push({ ...c, norm });
    else leftovers.push(c);
  }

  emailCandidates.sort((a, b) => fieldRank(a.declared, "email") - fieldRank(b.declared, "email"));
  phoneCandidates.sort((a, b) => fieldRank(a.declared, "phone") - fieldRank(b.declared, "phone"));

  let email = emailCandidates[0]?.val ?? null;
  let phone = phoneCandidates[0]?.norm ?? null;

  // Fall back to a format-less value (e.g. an extension-only phone) from its own
  // mapped column so we stay as lenient as before when nothing matched cleanly.
  if (!email) {
    const own = leftovers.find((c) => c.declared === "email");
    if (own) email = own.val;
  }
  if (!phone) {
    const own = leftovers.find((c) => c.declared === "phone") || leftovers.find((c) => c.declared === "contact");
    if (own) phone = own.val;
  }

  return { email, phone };
}

/**
 * Concatenate one or more mapped note columns (comma-separated header list)
 * with " | ".
 */
function resolveNotes(row: Record<string, string>, mapping: Record<string, string>): string | null {
  const spec = mapping.notes;
  if (!spec) return null;
  const cols = spec.includes(",") ? spec.split(",").map((c) => c.trim()).filter(Boolean) : [spec];
  const parts: string[] = [];
  for (const col of cols) {
    const v = (row[col] || "").trim();
    if (v) parts.push(v);
  }
  return parts.length ? parts.join(" | ") : null;
}

/**
 * POST /api/leads/import/:orgId - apply an import using the rows the browser
 * parsed and the column mapping the user confirmed in the preview step. The
 * file is parsed client-side (CSV/XLSX); this endpoint never re-parses a file -
 * it validates each row and inserts, which keeps it off the free-tier 10ms-CPU
 * footgun that a server-side XLSX parse hits.
 *
 * Body: application/json
 *   rows: array of { csvHeader: cellValue } objects (the parsed file rows)
 *   has_header: boolean - whether the source file had a header row (drives the
 *            row numbers reported in skip_reasons). Defaults true.
 *   mapping: object mapping lead-field -> CSV-header (supports the `contact`
 *            pseudo-field and a comma-separated `notes` column list)
 *   sms_consent_status: optional default for new leads
 *   duplicate_handling: "skip" | "update" (default "skip", on email/phone match)
 *   batch_tags: comma-separated tag names (or array) to attach to all leads
 *   default_stage: optional fallback `status` when a row has none
 *   defer_auto_enrollment: boolean - leads are NEVER auto-enrolled on import;
 *            enrollment is an explicit follow-up via /import/:orgId/apply-ai.
 *            This flag is echoed back so the frontend knows whether to prompt.
 *
 * Response: { total_rows, created, updated, skipped, duplicates, errors,
 *             skip_reasons, imported_lead_ids, defer_auto_enrollment }
 */
type ImportBody = {
  rows?: unknown;
  has_header?: unknown;
  mapping?: unknown;
  sms_consent_status?: unknown;
  duplicate_handling?: unknown;
  batch_tags?: unknown;
  default_stage?: unknown;
  defer_auto_enrollment?: unknown;
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  let body: ImportBody;
  try { body = await request.json(); }
  catch { return error("Request must be application/json", 400); }

  if (!Array.isArray(body.rows)) return error("rows must be an array", 400);
  const rows = body.rows as Record<string, string>[];
  if (!rows.length) return error("File has no data rows", 400);
  if (rows.length > MAX_IMPORT_ROWS) {
    return error(
      `Too many rows (${rows.length}). Maximum is ${MAX_IMPORT_ROWS} per import - ` +
        `split the file into smaller batches and try again.`,
      400,
    );
  }

  const mapping: Record<string, string> =
    body.mapping && typeof body.mapping === "object"
      ? (body.mapping as Record<string, string>)
      : {};

  const smsConsentDefault = String(body.sms_consent_status || "unknown");
  const dupHandling = String(body.duplicate_handling || "skip").toLowerCase();
  const batchTags = (
    Array.isArray(body.batch_tags)
      ? body.batch_tags.map((t) => String(t))
      : String(body.batch_tags || "").split(",")
  ).map((t) => t.trim()).filter(Boolean);
  const defaultStage = String(body.default_stage || "").trim() || null;
  // Leads are never silently enrolled on import - this is echoed back so the UI
  // can offer the explicit apply-ai step. Defaults to deferred (true).
  const deferAutoEnrollment = body.defer_auto_enrollment !== false;
  const hasHeader = body.has_header !== false;

  // Reconstruct the shape the insert loop below expects (it was written against
  // the old server-side parser output).
  const parsed = { rows, meta: { has_header: hasHeader } };

  // Need at least one way to identify a contact.
  if (!mapping.email && !mapping.phone && !mapping.contact) {
    return error("Map at least one contact field: Email or Phone.", 400);
  }

  // Captured here so the hoisted insertParams() closure isn't tripped up by TS
  // losing the `user != null` narrowing across the function boundary.
  const ownerUserId = user.id;
  let created = 0, updated = 0, skipped = 0, duplicates = 0, errors = 0;
  type SkipReason = {
    row_number: number;
    message: string;
    email?: string | null;
    phone?: string | null;
  };
  const skipReasons: SkipReason[] = [];
  const importedLeadIds: number[] = [];
  // Deferred side effects, flushed in batches after the inserts resolve so we
  // never block a row on its own tag/suppression round-trip.
  const tagLinks: Array<[leadId: number, tagId: number]> = [];
  const suppressions: Array<{ phone: string }> = [];
  function queueLeadTagsAndSuppression(leadId: number, phone: string | null, consent: string): void {
    for (const tagId of tagIds) tagLinks.push([leadId, tagId]);
    if (consent === "opted_out" && phone) suppressions.push({ phone });
  }
  // Header occupies line 1 when present, so the first data row is line 2.
  const rowNumberOffset = parsed.meta.has_header === false ? 1 : 2;

  // Pre-resolve any batch tag ids (create on demand).
  const tagIds: number[] = [];
  for (const name of batchTags) {
    const existing = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM tags WHERE name = ? AND org_id = ?`, name, orgId);
    if (existing) { tagIds.push(existing.id); continue; }
    const ins = await execute(env.D1DB, `INSERT INTO tags (name, org_id) VALUES (?, ?)`, name, orgId);
    tagIds.push(Number(ins.meta.last_row_id));
  }

  // Build an in-memory duplicate index (email -> id, phone-suffix -> id) so we
  // can detect duplicates without a DB round-trip per row. Critical for large
  // imports: 1000-row import -> 1 query instead of up to 2000.
  const existingByEmail = new Map<string, number>();
  const existingByPhone = new Map<string, number>();
  const existingLeads = await queryAll<{ id: number; email: string | null; phone: string | null }>(
    env.D1DB,
    `SELECT id, email, phone FROM lead WHERE org_id = ?`,
    orgId,
  );
  for (const l of existingLeads) {
    if (l.email) existingByEmail.set(l.email.toLowerCase(), l.id);
    if (l.phone) {
      const digits = l.phone.replace(/\D/g, "");
      if (digits.length >= 10) existingByPhone.set(digits.slice(-10), l.id);
    }
  }

  // Phase 1: process every row IN MEMORY (no DB round-trips). We build a list of
  // insert plans and update plans, then flush them in batched transactions. This
  // is the whole performance story: a 1500-row import was ~1500 serial D1 writes
  // (~100s); batching collapses it to a handful of round-trips (~1-2s).
  const now = nowIso();
  type InsertPlan = {
    rowNumber: number;
    projected: Record<string, string>;
    importTimezone: string | null;
    resolvedConsent: string;
    initialAiStatus: string | null;
    email: string | null;
    phone: string | null;
  };
  type UpdatePlan = { leadId: number; sql: string; args: unknown[] };
  const inserts: InsertPlan[] = [];
  const updates: UpdatePlan[] = [];
  // In-file dedup against rows we are about to insert (index into `inserts`), so a
  // file containing the same contact twice still collapses to one lead.
  const pendingByEmail = new Map<string, number>();
  const pendingByPhone = new Map<string, number>();

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    if (!row) continue;
    const rowNumber = i + rowNumberOffset;
    // Project row -> lead field map via the user-supplied { leadField: csvHeader }
    // mapping. `contact` and `notes` are resolved separately below.
    const projected: Record<string, string> = {};
    for (const [leadField, csvCol] of Object.entries(mapping)) {
      if (!leadField || !LEAD_FIELDS.has(leadField) || !csvCol) continue;
      if (leadField === "email" || leadField === "phone" || leadField === "notes") continue;
      const v = row[csvCol];
      if (v !== undefined && v !== "") projected[leadField] = v;
    }

    const { email, phone } = resolveContact(row, mapping);
    if (email) projected.email = email;
    if (phone) projected.phone = phone;
    const rowNotes = resolveNotes(row, mapping);
    if (rowNotes) projected.notes = rowNotes;

    // Normalize the timezone cell. Unknown values still allow the row to
    // import (without a timezone) so a single typo doesn't lose a contact -
    // we just log the skip into skip_reasons so the UI can surface it.
    let importTimezone: string | null = null;
    if (projected.timezone) {
      const rawTz = projected.timezone;
      const normalized = normalizeTimezone(rawTz);
      if (normalized) {
        importTimezone = normalized;
      } else {
        skipReasons.push({
          row_number: rowNumber,
          message: `timezone: invalid value '${rawTz}' on row ${rowNumber}`,
          email,
          phone,
        });
      }
      // Drop the raw timezone from projected so the column-loop below doesn't
      // try to write the alias into the UPDATE path.
      delete projected.timezone;
    }

    if (!email && !phone && !projected.name && !projected.first_name && !projected.last_name) {
      skipped++;
      skipReasons.push({
        row_number: rowNumber,
        message: "Missing identifying fields (email/phone/name)",
        email,
        phone,
      });
      continue;
    }

    // Per-row SMS consent overrides the global default when the agent mapped
    // a CSV column to the new "sms_consent" pseudo-field. Unrecognised cells
    // (e.g. blank, "maybe") fall back to the global default.
    const rowConsent = mapping.sms_consent
      ? parseConsentCell(row[mapping.sms_consent])
      : null;
    const resolvedConsent: string = rowConsent ?? smsConsentDefault;
    // Compose name from first/last if missing.
    if (!projected.name) {
      const composed = [projected.first_name, projected.last_name].filter(Boolean).join(" ").trim();
      if (composed) projected.name = composed;
    }

    // Normalize phone to E.164 so dedup catches different formats (e.g.
    // "(555) 123-4567" vs "+15551234567"). Persist the normalized form too
    // so later imports / SMS persistence stay consistent.
    if (projected.phone) {
      const normalized = tryNormalizeE164(projected.phone);
      if (normalized) projected.phone = normalized;
    }

    // Auto-cap each text field to its stored max length, stripping the
    // overflow rather than rejecting the row - a spreadsheet with a too-long
    // name still imports, just truncated to LEAD_TEXT_LIMITS. Mirrors the
    // Add/Edit form's `maxLength` so both entry paths agree.
    const CAPPED_FIELDS: LeadTextField[] = [
      "name", "first_name", "last_name", "email", "phone",
      "company", "area", "property_address", "source", "notes",
    ];
    for (const field of CAPPED_FIELDS) {
      if (projected[field]) projected[field] = capLeadField(field, projected[field]);
    }

    // Deduplicate using in-memory index (no per-row DB query). First against
    // leads already in the DB, then against rows queued earlier in this import.
    const emailKey = projected.email ? projected.email.toLowerCase() : null;
    let phoneKey: string | null = null;
    if (projected.phone) {
      const digits = projected.phone.replace(/\D/g, "");
      phoneKey = digits.length >= 10 ? digits.slice(-10) : digits || null;
    }
    let existingId: number | undefined;
    if (emailKey) existingId = existingByEmail.get(emailKey);
    if (existingId === undefined && phoneKey) existingId = existingByPhone.get(phoneKey);
    const existing = existingId !== undefined ? { id: existingId } : null;

    // In-file duplicate: a prior row in THIS import already plans to insert this
    // same contact. Resolve it in memory instead of racing two inserts.
    let pendingIdx: number | undefined;
    if (!existing) {
      if (emailKey) pendingIdx = pendingByEmail.get(emailKey);
      if (pendingIdx === undefined && phoneKey) pendingIdx = pendingByPhone.get(phoneKey);
    }

    if (existing) {
      duplicates++;
      if (dupHandling === "update") {
        // Apply default_stage as a status fallback on the update path too.
        if (!projected.status && defaultStage) projected.status = defaultStage;
        const sets: string[] = [];
        const args: unknown[] = [];
        for (const [k, v] of Object.entries(projected)) { sets.push(`${k} = ?`); args.push(v); }
        // Per-row consent on an update path overrides the stored value only
        // when explicitly mapped or globally chosen (the global default is
        // "unknown" which we treat as "no change" so re-importing a list
        // doesn't clobber legitimate prior opt-ins).
        if (rowConsent || smsConsentDefault !== "unknown") {
          sets.push(`sms_consent_status = ?`); args.push(resolvedConsent);
        }
        if (importTimezone) {
          sets.push(`timezone = ?`); args.push(importTimezone);
          sets.push(`timezone_source = ?`); args.push("import");
        }
        sets.push(`updated_at = ?`); args.push(now);
        updates.push({ leadId: existing.id, sql: `UPDATE lead SET ${sets.join(", ")} WHERE id = ?`, args });
        updated++;
        importedLeadIds.push(existing.id);
        queueLeadTagsAndSuppression(existing.id, projected.phone ?? null, resolvedConsent);
      } else {
        // "skip" - count toward both `duplicates` (audit) and `skipped` (the
        // counter the import dialog actually surfaces).
        skipped++;
        skipReasons.push({
          row_number: rowNumber,
          message: "Duplicate of existing lead",
          email: projected.email ?? null,
          phone: projected.phone ?? null,
        });
      }
      continue;
    }

    if (pendingIdx !== undefined) {
      // Collapse onto the already-queued insert. Mirror the old behavior, which
      // inserted the first row then UPDATE'd it from the second: merge the later
      // row's fields (last-wins) so both rows' data survives on one lead.
      duplicates++;
      const pendingPlan = inserts[pendingIdx];
      if (dupHandling === "update" && pendingPlan) {
        Object.assign(pendingPlan.projected, projected);
        if (importTimezone) pendingPlan.importTimezone = importTimezone;
        if (rowConsent || smsConsentDefault !== "unknown") pendingPlan.resolvedConsent = resolvedConsent;
        updated++;
      } else {
        skipped++;
        skipReasons.push({
          row_number: rowNumber,
          message: "Duplicate of existing lead",
          email: projected.email ?? null,
          phone: projected.phone ?? null,
        });
      }
      continue;
    }

    // Queue a new insert. "Do not SMS" imports default to ai_status='off' so the
    // lead doesn't surface in AI dashboards as if proactive outreach were planned
    // (apply-ai also skips these); other consent states inherit the DB default.
    const initialAiStatus = resolvedConsent === "no_sms" ? "off" : null;
    const idx = inserts.length;
    inserts.push({ rowNumber, projected, importTimezone, resolvedConsent, initialAiStatus, email, phone });
    // Register so later rows in this same import dedupe against it.
    if (emailKey) pendingByEmail.set(emailKey, idx);
    if (phoneKey) pendingByPhone.set(phoneKey, idx);
  }

  // Build the bind params for one queued insert, in LEAD_INSERT_SQL column order.
  function insertParams(p: InsertPlan): unknown[] {
    const pr = p.projected;
    return [
      pr.name ?? null, pr.first_name ?? null, pr.last_name ?? null,
      pr.email ?? null, pr.phone ?? null, pr.company ?? null,
      // Bulk-imported leads default to source "Imported" when the file has no
      // mapped source column (single manual adds default to "Manual Add").
      pr.status ?? defaultStage ?? "New", pr.source ?? "Imported",
      pr.property_address ?? null, pr.area ?? null, pr.price_range ?? null,
      numOrNull(pr.estimated_price), pr.notes ?? null, pr.lead_type ?? null, pr.intent ?? null,
      p.importTimezone, p.importTimezone ? "import" : null, p.resolvedConsent,
      p.initialAiStatus,
      numOrNull(pr.bedrooms), numOrNull(pr.bathrooms),
      pr.property_type ?? null, pr.seller_price_expectations ?? null,
      ownerUserId, orgId, now, now,
    ];
  }

  // Phase 2: flush queued inserts in batched transactions. On a (rare) batch
  // failure we fall back to per-row inserts for that chunk so one bad row can't
  // sink its 49 neighbors - preserving the old per-row error isolation.
  const stmt = env.D1DB.prepare(LEAD_INSERT_SQL);
  for (let start = 0; start < inserts.length; start += BATCH_CHUNK) {
    const chunk = inserts.slice(start, start + BATCH_CHUNK);
    let results: D1Result[] | null = null;
    try {
      results = await env.D1DB.batch(chunk.map((p) => stmt.bind(...insertParams(p))));
    } catch {
      // Batch failed atomically - results stays null and we isolate row-by-row below.
    }
    for (let j = 0; j < chunk.length; j++) {
      const plan = chunk[j];
      if (!plan) continue;
      const batchResult = results ? results[j] : null;
      let leadId: number;
      if (batchResult) {
        leadId = Number(batchResult.meta.last_row_id);
      } else {
        try {
          const ins = await execute(env.D1DB, LEAD_INSERT_SQL, ...insertParams(plan));
          leadId = Number(ins.meta.last_row_id);
        } catch (e) {
          errors++;
          skipReasons.push({
            row_number: plan.rowNumber,
            message: `Insert failed: ${(e as Error).message}`,
            email: plan.email,
            phone: plan.phone,
          });
          continue;
        }
      }
      created++;
      importedLeadIds.push(leadId);
      queueLeadTagsAndSuppression(leadId, plan.projected.phone ?? null, plan.resolvedConsent);
    }
  }

  // Phase 3: flush the queued UPDATE statements (duplicate-handling = update).
  for (let start = 0; start < updates.length; start += BATCH_CHUNK) {
    const chunk = updates.slice(start, start + BATCH_CHUNK);
    try {
      await env.D1DB.batch(chunk.map((u) => env.D1DB.prepare(u.sql).bind(...u.args, u.leadId)));
    } catch {
      // Isolate: re-run the chunk row-by-row so one bad UPDATE doesn't roll back the rest.
      for (const u of chunk) {
        try { await execute(env.D1DB, u.sql, ...u.args, u.leadId); }
        catch { errors++; }
      }
    }
  }

  // Phase 4: flush queued tag links in batches, then the (rare) suppressions.
  for (let start = 0; start < tagLinks.length; start += BATCH_CHUNK) {
    const chunk = tagLinks.slice(start, start + BATCH_CHUNK);
    try {
      await env.D1DB.batch(chunk.map(([leadId, tagId]) =>
        env.D1DB.prepare(`INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)`).bind(leadId, tagId)));
    } catch { /* tag links are non-critical - the lead still imported */ }
  }
  for (const { phone } of suppressions) {
    // CSV row marked opted-out -> canonical suppression helper hard-blocks the
    // (org, phone) pair on every send path. Reason 'manual_import' shows in the
    // Compliance view that the block came from a spreadsheet, not a STOP text.
    try {
      await suppressPhone(env, orgId, phone, { reason: "manual_import", blockedByUserId: user.id });
    } catch { /* non-fatal - row already imported */ }
  }

  return json({
    total_rows: parsed.rows.length,
    created, updated, skipped, duplicates, errors,
    skip_reasons: skipReasons.slice(0, 100),
    imported_lead_ids: importedLeadIds,
    // Always deferred today: enrollment is the explicit apply-ai step, never implicit.
    defer_auto_enrollment: deferAutoEnrollment,
  });
};
