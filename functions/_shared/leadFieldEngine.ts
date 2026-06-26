/// <reference types="@cloudflare/workers-types" />
/**
 * Governed AI lead-field engine. The single choke-point every AI-driven write to
 * the six "smart filter" fields must go through:
 *   status (Stage) | lead_type | ai_status | source | price_range (Budget) | area
 *
 * It (a) normalizes the value to the canonical option set, (b) enforces the
 * manual-override guard (the AI must NOT clobber a value an agent set by hand
 * unless new high-confidence conversation evidence shows the lead's intent
 * changed), (c) stamps per-field provenance on lead.ai_field_provenance, and
 * (d) writes one auditable `lead.field_updated` row per change carrying the
 * old->new transition, confidence and the triggering message quote - so the UI
 * can show "AI updated Lead Type from Unknown to Buyer based on: '...'".
 *
 * Manual edits stamp source='manual' (see updateLead in api/leads/[orgId].ts);
 * AI writes here stamp source='ai'. Deterministic, no LLM call.
 */
import type { Env } from "./env.ts";
import { execute, queryFirst } from "./db.ts";
import { logAgentActivity, type AgentKey } from "./aiAgents.ts";
import { normalizeStage, STAGE_SCORE } from "./leadStage.ts";

/** The lead columns governed by provenance + the override guard. */
export const PROVENANCE_FIELDS = [
  "status", "lead_type", "ai_status", "source", "price_range", "area",
] as const;
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];

export function isProvenanceField(field: string): field is ProvenanceField {
  return (PROVENANCE_FIELDS as readonly string[]).includes(field);
}

// Only override a manual edit when the classifier is at least this confident AND
// flags an explicit intent change (the "Only on clear new intent" policy).
const OVERRIDE_CONFIDENCE = 0.75;
const DEFAULT_CONFIDENCE = 0.6;

// --------------------------------------------------------------------------
// Normalizers - map free-form AI/extracted values onto the canonical options.
// Codes match the read-time maps in src/components/leads/utils/leadDisplay.ts.
// --------------------------------------------------------------------------

/** Lead Type -> lowercase code: buyer|seller|both|investor|renter|agent_referral|unknown. */
export function normalizeLeadType(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (["buyer", "buy", "buying", "purchaser"].includes(s)) return "buyer";
  if (["seller", "sell", "selling", "listing", "lister"].includes(s)) return "seller";
  if (["both", "buyer/seller", "buy and sell", "sell and buy", "buyer and seller"].includes(s)) return "both";
  if (["investor", "investment", "investing"].includes(s)) return "investor";
  if (["renter", "rent", "renting", "tenant", "lease", "leasing"].includes(s)) return "renter";
  if (["agent referral", "agent_referral", "referral agent", "agent", "realtor referral"].includes(s)) return "agent_referral";
  if (s === "unknown") return "unknown";
  return null;
}

/** AI Status -> stored lowercase code understood by getAiStatus(). */
export function normalizeAiStatus(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  const map: Record<string, string> = {
    "off": "off", "ai off": "off", "ai_off": "off",
    "automation only": "outbound", "automation_only": "outbound", "outbound": "outbound",
    "active": "active", "ai active": "active", "ai_active": "active",
    "paused": "paused", "ai paused": "paused", "ai_paused": "paused",
    "awaiting reply": "awaiting reply", "awaiting_reply": "awaiting reply",
    "human takeover": "human takeover", "human_takeover": "human takeover",
    "appointment booked": "appointment booked", "appointment_booked": "appointment booked",
    "ai complete": "ai complete", "ai_complete": "ai complete", "complete": "ai complete", "completed": "ai complete",
  };
  return map[s] ?? null;
}

const SOURCE_OPTIONS = [
  "Zillow", "Realtor.com", "Open House", "Cold Calling", "Website", "Google Ads",
  "Facebook Ads", "Instagram", "Referral", "Imported", "Inbound SMS", "Manual",
  "CRM Import", "Other",
];
/** Source -> one of the canonical options (best-effort); null if unrecognized. */
export function normalizeSource(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const exact = SOURCE_OPTIONS.find((o) => o.toLowerCase() === lower);
  if (exact) return exact;
  if (lower.includes("zillow")) return "Zillow";
  if (lower.includes("realtor")) return "Realtor.com";
  if (lower.includes("open house")) return "Open House";
  if (lower.includes("cold call")) return "Cold Calling";
  if (lower.includes("google")) return "Google Ads";
  if (lower.includes("facebook") || lower === "fb") return "Facebook Ads";
  if (lower.includes("instagram") || lower === "ig") return "Instagram";
  if (lower.includes("referral") || lower.includes("referred")) return "Referral";
  if (lower.includes("website") || lower.includes("web form")) return "Website";
  return null;
}

const BUDGET_BUCKETS = [
  "Under $300k", "$300k-$500k", "$500k-$750k", "$750k-$1M", "$1M+",
] as const;

/** Parse absolute-dollar figures from free text ("$400k", "400,000", "1.2M", "750k-1m"). */
function parseDollarFigures(text: string): number[] {
  const out: number[] = [];
  const rx = /\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([km])?/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const g1 = m[1];
    if (!g1) continue;
    const digits = g1.replace(/,/g, "");
    if (!digits) continue;
    let n = parseFloat(digits);
    if (!Number.isFinite(n)) continue;
    const suffix = (m[2] || "").toLowerCase();
    if (suffix === "k") n *= 1_000;
    else if (suffix === "m") n *= 1_000_000;
    // Bare small numbers in a budget context are shorthand thousands
    // ("around 400" -> 400k). Numbers with commas/decimals already absolute.
    else if (n > 0 && n < 10_000 && !g1.includes(",")) n *= 1_000;
    if (n > 0) out.push(n);
  }
  return out;
}

/** Budget -> one of the 5 spec buckets, or null if no figure is parseable. */
export function normalizeBudgetBucket(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const exact = BUDGET_BUCKETS.find((b) => b.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  const nums = parseDollarFigures(s);
  const a = nums[0];
  if (a === undefined) return null;
  const b = nums[1];
  // For a stated range take the midpoint; otherwise the single figure.
  const val = b !== undefined ? (a + b) / 2 : a;
  if (!Number.isFinite(val) || val <= 0) return null;
  if (val < 300_000) return "Under $300k";
  if (val < 500_000) return "$300k-$500k";
  if (val < 750_000) return "$500k-$750k";
  if (val < 1_000_000) return "$750k-$1M";
  return "$1M+";
}

const NORMALIZERS: Record<ProvenanceField, (v: unknown) => string | null> = {
  status: (v) => normalizeStage(String(v)) || null,
  lead_type: (v) => normalizeLeadType(v),
  ai_status: (v) => normalizeAiStatus(v),
  source: (v) => normalizeSource(v),
  price_range: (v) => normalizeBudgetBucket(v),
  area: (v) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, 160) : null;
  },
};

export function normalizeProvenanceField(field: ProvenanceField, value: unknown): string | null {
  return NORMALIZERS[field](value);
}

// --------------------------------------------------------------------------
// Provenance map ({ field -> { source, confidence, updated_at } }) on the lead.
// --------------------------------------------------------------------------

export type ProvenanceSource = "ai" | "manual";
export interface FieldProvenance { source: ProvenanceSource; confidence?: number; updated_at?: string }
export type ProvenanceMap = Record<string, FieldProvenance>;

export function parseProvenance(raw: string | null | undefined): ProvenanceMap {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as ProvenanceMap) : {};
  } catch {
    return {};
  }
}

export function isManuallyLocked(prov: ProvenanceMap, field: string): boolean {
  return prov[field]?.source === "manual";
}

/**
 * Merge source='manual' provenance for the fields an agent just edited by hand.
 * Returns the JSON string to persist in lead.ai_field_provenance. Used by the
 * manual PATCH path so the AI knows not to clobber these.
 */
export function stampManualProvenance(
  currentRaw: string | null | undefined, fields: string[], at?: string,
): string {
  const prov = parseProvenance(currentRaw);
  const now = at || new Date().toISOString();
  for (const f of fields) {
    if (isProvenanceField(f)) prov[f] = { source: "manual", updated_at: now };
  }
  return JSON.stringify(prov);
}

// --------------------------------------------------------------------------
// Display helpers for the audit detail string.
// --------------------------------------------------------------------------

const FIELD_LABEL: Record<ProvenanceField, string> = {
  status: "Stage", lead_type: "Lead Type", ai_status: "AI Status",
  source: "Source", price_range: "Budget", area: "Area",
};

function titleize(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayValue(field: ProvenanceField, code: string | null): string {
  if (code == null || code === "") return "—";
  if (field === "lead_type" || field === "ai_status") return titleize(code);
  return code; // status/source/budget/area are already display-ready
}

// --------------------------------------------------------------------------
// The guarded batch writer.
// --------------------------------------------------------------------------

export interface LeadFieldProposal {
  field: ProvenanceField;
  value: unknown;
  confidence?: number;   // 0-1; defaults to DEFAULT_CONFIDENCE
  intentChange?: boolean; // classifier saw an explicit intent change for this field
}

export interface ApplyAiFieldsCtx {
  orgId?: number | null;
  userId?: number | null;  // activity-log author; falls back to lead owner
  agentKey?: AgentKey;
  evidence?: string | null; // triggering message quote
  label?: string | null;    // lead display name
}

interface LeadRow {
  id: number; status: string | null; lead_type: string | null; ai_status: string | null;
  source: string | null; price_range: string | null; area: string | null;
  ai_field_provenance: string | null; owner_id: number | null; org_id: number | null;
}

/**
 * Apply a set of AI-proposed field updates to a lead through the override guard
 * + provenance + audit pipeline. Returns the field names actually written.
 * Skips: unchanged values, empty/unparseable values, manually-locked fields
 * (unless intentChange + high confidence), and Stage downgrades.
 */
export async function applyAiLeadFields(
  env: Env, leadId: number, proposals: LeadFieldProposal[], ctx: ApplyAiFieldsCtx = {},
): Promise<string[]> {
  if (!proposals.length) return [];
  const cur = await queryFirst<LeadRow>(
    env.D1DB,
    `SELECT id, status, lead_type, ai_status, source, price_range, area,
            ai_field_provenance, owner_id, org_id
       FROM lead WHERE id = ?`,
    leadId,
  );
  if (!cur) return [];

  const prov = parseProvenance(cur.ai_field_provenance);
  const now = new Date().toISOString();
  const sets: string[] = [];
  const args: unknown[] = [];
  const changes: Array<{ field: ProvenanceField; oldVal: string | null; newVal: string; confidence: number }> = [];

  for (const p of proposals) {
    if (!isProvenanceField(p.field)) continue;
    const newVal = NORMALIZERS[p.field](p.value);
    if (newVal == null || newVal === "") continue;

    const rawOld = cur[p.field];
    const oldNorm = rawOld != null ? NORMALIZERS[p.field](rawOld) : null;
    if (oldNorm != null && oldNorm === newVal) continue; // no real change

    // Never demote a known lead_type to "unknown".
    if (p.field === "lead_type" && newVal === "unknown" && oldNorm && oldNorm !== "unknown") continue;

    const conf = typeof p.confidence === "number" ? p.confidence : DEFAULT_CONFIDENCE;

    // Manual-override guard: a hand-set field is only overwritten on an explicit,
    // high-confidence intent change.
    if (isManuallyLocked(prov, p.field)) {
      if (!(p.intentChange && conf >= OVERRIDE_CONFIDENCE)) continue;
    }

    // Stage never moves backward unless the lead explicitly re-opened (intentChange).
    // 'Lost' is allowed from any stage (a clear negative signal).
    if (p.field === "status" && newVal !== "Lost") {
      const newScore = STAGE_SCORE[newVal] ?? 0;
      const oldScore = oldNorm ? (STAGE_SCORE[oldNorm] ?? 0) : -1;
      if (newScore < oldScore && !p.intentChange) continue;
    }

    sets.push(`${p.field} = ?`);
    args.push(newVal);
    prov[p.field] = { source: "ai", confidence: Math.round(conf * 100) / 100, updated_at: now };
    changes.push({ field: p.field, oldVal: oldNorm ?? (rawOld != null ? String(rawOld) : null), newVal, confidence: conf });
  }

  if (!sets.length) return [];

  sets.push("ai_field_provenance = ?");
  args.push(JSON.stringify(prov));
  args.push(leadId);
  await execute(
    env.D1DB,
    `UPDATE lead SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ...args,
  );

  // One audit row per change (best-effort; never blocks the write).
  const author = ctx.userId ?? cur.owner_id ?? null;
  const orgId = ctx.orgId ?? cur.org_id ?? null;
  if (author != null && orgId != null) {
    for (const c of changes) {
      const oldDisp = displayValue(c.field, c.oldVal);
      const newDisp = displayValue(c.field, c.newVal);
      const ev = ctx.evidence ? ` based on: "${ctx.evidence.replace(/\s+/g, " ").trim().slice(0, 160)}"` : "";
      await logAgentActivity(env, {
        orgId, userId: author, agentKey: ctx.agentKey ?? "inbound",
        event: "lead.field_updated", leadId, leadLabel: ctx.label ?? null,
        field: c.field, oldValue: c.oldVal, newValue: c.newVal,
        confidence: Math.round(c.confidence * 100) / 100, evidence: ctx.evidence ?? null,
        detail: `AI updated ${FIELD_LABEL[c.field]} from ${oldDisp} to ${newDisp}${ev} (confidence ${c.confidence.toFixed(2)})`,
        status: "ok",
      });
    }
  }

  return changes.map((c) => c.field);
}

/**
 * Convenience: set a single AI Status code at a lifecycle event (booking,
 * escalation, completion). Goes through the same guard/provenance/audit path.
 */
export async function setAiStatus(
  env: Env, leadId: number, code: string, ctx: ApplyAiFieldsCtx = {},
): Promise<boolean> {
  const applied = await applyAiLeadFields(
    env, leadId, [{ field: "ai_status", value: code, confidence: 0.99, intentChange: true }], ctx,
  );
  return applied.includes("ai_status");
}
