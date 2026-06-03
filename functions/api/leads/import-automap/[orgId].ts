/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { chatWithTools, type ChatToolDef } from "../../../_shared/openai.ts";

/**
 * POST /api/leads/import-automap/:orgId
 *
 * AI-assisted column mapping for the lead import wizard. The frontend sends the
 * file's column headers plus a couple of sample rows; we ask the model (via
 * OpenAI function calling) to map each column onto a known lead field. The
 * model PROPOSES, code DISPOSES: we never trust the raw model output - every
 * proposed field/column pair is validated against the server-side allowlist
 * and the actual columns before it is returned. Each call meters one AI request
 * (passed `orgId` to chatWithTools).
 *
 * Body: { columns: string[], rows: Array<Record<string, string>> }
 * Returns: { mapping: Record<field, column>, mapped: number }
 */

// Server-side allowlist of mappable lead fields (mirrors src/components/leads
// /constants.ts LEAD_FIELDS - kept here so we never trust a field key the
// client or the model invents). Each carries a short hint fed to the model.
const FIELD_DEFS: { key: string; label: string; hint: string }[] = [
  { key: "name", label: "Full Name", hint: "the contact's FULL name (first AND last together in one column, e.g. 'John Smith'). Do NOT use this for a column that holds only a first name or only a last name" },
  { key: "first_name", label: "First Name", hint: "ONLY a first/given name (e.g. 'John'). Use this - not 'name' - whenever the header or values are just a first name" },
  { key: "last_name", label: "Last Name", hint: "ONLY a last/family/surname (e.g. 'Smith'). Use this - not 'name' - whenever the header or values are just a last name" },
  { key: "email", label: "Email", hint: "an email address" },
  { key: "phone", label: "Phone", hint: "a phone / mobile number" },
  { key: "contact", label: "Phone or Email (single column)", hint: "use ONLY when ONE column holds EITHER a phone OR an email interchangeably; otherwise prefer the separate email/phone fields" },
  { key: "notes", label: "Notes", hint: "free-text notes, comments, or a description" },
  { key: "company", label: "Company", hint: "a company or brokerage name" },
  { key: "property_address", label: "Property Address", hint: "a street or property address" },
  { key: "status", label: "Stage", hint: "the pipeline stage / lead status" },
  { key: "source", label: "Source", hint: "the lead source (e.g. Zillow, Referral, Website, Open House)" },
  { key: "tags", label: "Tags", hint: "labels or tags" },
  { key: "timezone", label: "Time Zone", hint: "an IANA or US timezone" },
  { key: "sms_consent", label: "SMS Consent", hint: "a per-row opt-in / opt-out / consent status" },
];

const ALLOWED_FIELDS = new Set(FIELD_DEFS.map((f) => f.key));

// Bound the payload we send to the model so a wide/huge file can't blow the
// token budget: cap columns, rows scanned, samples per column, and per-cell
// length. We collect samples PER COLUMN (not per row) so a sparse column - e.g.
// an "email" the user only filled on row 5 - still shows real example values to
// the model instead of looking empty (the bug: the AI dropped email/source
// because the first 2 rows happened to be blank for those columns).
const MAX_COLUMNS = 80;
const MAX_SCAN_ROWS = 25; // rows we look through to find non-empty samples
const MAX_SAMPLES_PER_COLUMN = 3; // distinct non-empty example values per column
// Per-field character cap - trims every cell before it reaches the model so a
// long notes/address value can't blow the token budget. Big enough to be
// representative (full email/name/address), small enough to stay cheap.
const MAX_CELL_CHARS = 120;

function clampCell(v: unknown): string {
  const s = (v == null ? "" : String(v)).trim();
  return s.length > MAX_CELL_CHARS ? `${s.slice(0, MAX_CELL_CHARS)}...` : s;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const orgId = Number(params.orgId);
  if (!Number.isFinite(orgId)) return error("Invalid org", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  if (!env.OPENAI_API_KEY) return error("AI is not configured", 503);

  const body = await readJson<{ columns?: unknown; rows?: unknown }>(request);
  const rawColumns = Array.isArray(body?.columns) ? body!.columns : [];
  const columns = rawColumns
    .map((c) => (c == null ? "" : String(c)))
    .filter((c) => c.trim().length > 0)
    .slice(0, MAX_COLUMNS);
  if (columns.length === 0) return error("No columns to map", 400);

  const columnSet = new Set(columns);

  // Collect, for each column, up to N distinct non-empty example values by
  // scanning the first MAX_SCAN_ROWS rows. This is the key fix: by gathering
  // samples per column (instead of sending whole rows), a column that is empty
  // in the first rows but populated later still presents real values, so the
  // model maps it correctly. A column with no values anywhere yields [] and the
  // model must fall back to matching on the header name alone.
  const rawRows = (Array.isArray(body?.rows) ? body!.rows : []).slice(0, MAX_SCAN_ROWS);
  const columnSamples = columns.map((col) => {
    const seen = new Set<string>();
    for (const row of rawRows) {
      if (seen.size >= MAX_SAMPLES_PER_COLUMN) break;
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const cell = clampCell(r[col]);
      if (cell) seen.add(cell);
    }
    return { header: col, examples: Array.from(seen) };
  });

  // The single tool the model must call. Each lead field is an optional
  // property whose value is constrained (via enum) to one of the actual
  // columns - so even the raw model output can only reference real headers.
  const properties: Record<string, unknown> = {};
  for (const f of FIELD_DEFS) {
    properties[f.key] = {
      type: "string",
      enum: columns,
      description: `Column that holds ${f.hint}. Omit if no column matches.`,
    };
  }
  const tool: ChatToolDef = {
    type: "function",
    function: {
      name: "propose_mapping",
      description:
        "Map each lead field to the single best-matching file column. Only include a field when a column clearly matches; omit fields with no good match. Never map two fields to the same column.",
      parameters: { type: "object", properties, additionalProperties: false },
    },
  };

  const fieldLines = FIELD_DEFS.map((f) => `- ${f.key}: ${f.hint}`).join("\n");
  const system = `You map spreadsheet columns to CRM lead fields for a real estate import tool.
You are given, for each file column, its header name and a few example values sampled from the data.
Rules:
- Map EVERY column that clearly corresponds to a lead field. Be thorough - it is a mistake to leave an obvious column (like "source", "email", or "tags") unmapped.
- Use BOTH signals: the header name AND the example values. The header name alone is often enough (a column headed "source" is the source field even if its examples are blank).
- "examples" may be empty when a column is mostly blank in the sampled rows. An empty examples list does NOT mean the column is useless - map it from its header name (e.g. a blank "email" column is still the email field).
- A column of values like "(555) 123-4567" is a phone even if its header is generic; an "a@b.com" value is an email.
- Each file column may be used for at most one field. Pick the single best field for it.
- Prefer separate "email" and "phone" over "contact". Use "contact" only when one column genuinely mixes emails and phones.
- Name columns: map a "First Name" column to first_name and a "Last Name" column to last_name. Only use "name" for a single column that contains the full name (first and last together). Never map a first-name-only or last-name-only column to "name".
- Only leave a field out when NO column matches it by header or values. Do not invent a mapping for a field that has no matching column.
Lead fields:
${fieldLines}`;

  const userMsg = JSON.stringify({ columns: columnSamples });

  let result;
  try {
    result = await chatWithTools(
      env,
      [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      [tool],
      { orgId, toolChoice: "required" },
    );
  } catch (e) {
    return error((e as Error).message || "AI request failed", 502);
  }

  const call = result.tool_calls.find((c) => c.function?.name === "propose_mapping");
  if (!call) return error("AI did not return a mapping", 502);

  let proposed: Record<string, unknown>;
  try {
    proposed = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    return error("AI returned an unreadable mapping", 502);
  }

  // Validate, never trust: keep only allowlisted fields pointing at real
  // columns, and never let two fields claim the same column (first wins).
  const mapping: Record<string, string> = {};
  const usedColumns = new Set<string>();
  for (const [field, value] of Object.entries(proposed)) {
    if (!ALLOWED_FIELDS.has(field)) continue;
    if (typeof value !== "string") continue;
    const col = value.trim();
    if (!columnSet.has(col)) continue;
    if (usedColumns.has(col)) continue;
    mapping[field] = col;
    usedColumns.add(col);
  }

  return json({ mapping, mapped: Object.keys(mapping).length });
};
