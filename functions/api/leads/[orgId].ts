/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isOrgMember } from "../../_shared/orgAccess.ts";
import { normalizeTimezone } from "../../_shared/timezoneAliases.ts";
import {
  cancelPendingFollowups,
  aiStatusIsPaused,
  aiStatusIsOff,
} from "../../_shared/autoResponse.ts";
import { resolveLeadEscalations } from "../../_shared/escalation.ts";
import { hotStatusSql } from "../../_shared/leadStage.ts";
import { capLeadField, LEAD_TEXT_LIMITS, type LeadTextField } from "../../_shared/leadLimits.ts";

// The `[orgId]` param does double duty:
//   GET    /api/leads/:org_id    -> list leads in org (bare array)
//   PATCH  /api/leads/:lead_id   -> update a lead (frontend sends PATCH)
//   PUT    /api/leads/:lead_id   -> update a lead (alternate verb)

interface LeadRow {
  id: number; name: string | null; first_name: string | null; last_name: string | null;
  email: string | null; company: string | null; phone: string | null;
  status: string | null; source: string | null;
  property_address: string | null; area: string | null; price_range: string | null;
  estimated_price: number | null; notes: string | null;
  sms_consent_status: string | null;
  appointment_booked: number; auto_response_route: string | null;
  lead_type: string | null; intent: string | null; ai_status: string | null;
  sms_opt_out: number | null; last_opt_out_at: string | null;
  email_opt_out: number | null; last_email_opt_out_at: string | null;
  email_notifications_enabled: number; sms_notifications_enabled: number;
  owner_id: number | null;
  timezone: string | null; timezone_source: string | null;
  timeline: string | null; pre_approved: number | null;
  motivation: string | null; occupancy_status: string | null;
  financing_status: string | null; interest_level: string | null;
  bedrooms: number | null; bathrooms: number | null;
  property_type: string | null; seller_price_expectations: string | null;
  qualification_step: number | null; qualification_status: string | null;
  last_reply_at: string | null;
  auto_followup_action: string | null;
  created_at: string | null; updated_at: string | null;
}

const serialize = (l: LeadRow) => ({
  id: l.id,
  name: l.name,
  first_name: l.first_name,
  last_name: l.last_name,
  email: l.email,
  company: l.company,
  property_address: l.property_address,
  area: l.area,
  price_range: l.price_range,
  estimated_price: l.estimated_price,
  notes: l.notes,
  sms_consent_status: l.sms_consent_status ?? "unknown",
  tags: [] as string[],
  sms_consent_tag: null,
  sms_opt_in_status: null,
  appointment_booked: Boolean(l.appointment_booked),
  auto_response_route: l.auto_response_route,
  lead_type: l.lead_type ?? "",
  intent: l.intent ?? "",
  ai_status: l.ai_status,
  sms_opt_out: l.sms_opt_out == null ? null : Boolean(l.sms_opt_out),
  last_opt_out_at: l.last_opt_out_at,
  // Why the number is blocked - drives the leads-table indicator tooltip:
  //   keyword / manual_admin / manual_agent / manual_import / null
  // Populated by the post-query enrichment loop below (NULL until merged).
  sms_opt_out_reason: null as string | null,
  email_opt_out: l.email_opt_out == null ? null : Boolean(l.email_opt_out),
  last_email_opt_out_at: l.last_email_opt_out_at,
  email_notifications_enabled: Boolean(l.email_notifications_enabled),
  sms_notifications_enabled: Boolean(l.sms_notifications_enabled),
  status: l.status,
  owner_id: l.owner_id,
  timezone: l.timezone,
  timezone_source: l.timezone_source,
  timeline: l.timeline,
  pre_approved: l.pre_approved == null ? null : Boolean(l.pre_approved),
  motivation: l.motivation,
  occupancy_status: l.occupancy_status,
  financing_status: l.financing_status,
  interest_level: l.interest_level,
  bedrooms: l.bedrooms,
  bathrooms: l.bathrooms,
  property_type: l.property_type,
  seller_price_expectations: l.seller_price_expectations,
  qualification_step: l.qualification_step ?? 0,
  qualification_status: l.qualification_status,
  last_reply_at: l.last_reply_at,
  auto_followup_action: l.auto_followup_action,
  created_at: l.created_at,
  updated_at: l.updated_at,
  source: l.source,
  phone: l.phone,
});

function multi(url: URL, ...keys: string[]): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    for (const v of url.searchParams.getAll(k)) {
      for (const piece of v.split(",")) {
        const t = piece.trim();
        if (t) out.add(t);
      }
    }
  }
  return [...out];
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const url = new URL(request.url);
  const status = multi(url, "status", "statuses", "stage", "stages");
  const source = multi(url, "source", "sources");
  const area = multi(url, "area", "areas");
  const price = multi(url, "price", "prices");
  const leadType = multi(url, "lead_type", "lead_types");
  const aiStatus = multi(url, "ai_status", "ai_statuses");
  const view = url.searchParams.get("view");
  const dateRange = Number(url.searchParams.get("date_range")) || 0;
  const includeMeta = url.searchParams.get("include_meta") === "1" || url.searchParams.get("include_meta") === "true";
  const searchQuery = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  // No page_size -> return all matching leads (paginate only when explicitly asked).
  // Guard: Math.max(1, 0) used to force pageSize=1, so callers without ?page_size
  // (e.g. fetchOrgLeads for the Tasks/Deals lead pickers) got a single lead.
  const pageSizeRaw = Number(url.searchParams.get("page_size")) || 0;
  const pageSize = pageSizeRaw > 0 ? Math.min(500, pageSizeRaw) : 0;
  const usePagination = pageSize > 0;

  const where: string[] = [`org_id = ?`];
  const args: unknown[] = [orgId];
  const inClause = (col: string, vals: string[]) => {
    where.push(`${col} IN (${vals.map(() => "?").join(",")})`);
    args.push(...vals);
  };
  if (status.length) inClause("status", status);
  if (source.length) inClause("source", source);
  if (area.length) inClause("area", area);
  if (price.length) inClause("price_range", price);
  if (leadType.length) inClause("lead_type", leadType);
  if (aiStatus.length) {
    // NULL/empty ai_status now means "off" (un-enrolled), so only an explicit
    // "off" selection sweeps those rows in.
    const includesOff = aiStatus.some((v) => v.toLowerCase() === "off");
    if (includesOff) {
      const placeholders = aiStatus.map(() => "?").join(",");
      where.push(`(ai_status IN (${placeholders}) OR ai_status IS NULL OR TRIM(ai_status) = '')`);
      args.push(...aiStatus);
    } else {
      inClause("ai_status", aiStatus);
    }
  }
  if (view === "my_leads") { where.push(`owner_id = ?`); args.push(user.id); }
  if (view === "unassigned") where.push(`owner_id IS NULL`);
  if (view === "hot_prospects") where.push(hotStatusSql("status"));

  // Quick filters are multi-select: every supplied `quick` value ANDs another
  // constraint onto the query (so Hot + Buyers = hot AND buyer). "hot" is now a
  // pure function of Stage/Score (score > 45) via hotStatusSql.
  const quicks = multi(url, "quick");
  for (const quick of quicks) {
    if (quick === "hot_leads" || quick === "hot") {
      where.push(hotStatusSql("status"));
    } else if (quick === "needs_reply") {
      where.push(`LOWER(IFNULL(ai_status, '')) IN ('awaiting reply', 'awaiting')`);
    } else if (quick === "buyers") {
      where.push(`LOWER(IFNULL(lead_type, '')) IN ('buyer', 'both')`);
    } else if (quick === "sellers") {
      where.push(`LOWER(IFNULL(lead_type, '')) IN ('seller', 'both')`);
    } else if (quick === "ai_active") {
      // Only leads explicitly turned on - NULL/empty now reads as "AI Off".
      where.push(`LOWER(IFNULL(ai_status, '')) IN ('active', 'ai active')`);
    } else if (quick === "appointment_set") {
      where.push(`(appointment_booked = 1 OR LOWER(IFNULL(ai_status, '')) = 'appointment booked' OR LOWER(IFNULL(status, '')) = 'appointment set')`);
    } else if (quick === "ai_recommended") {
      where.push(`(${hotStatusSql("status")} OR LOWER(IFNULL(ai_status, '')) IN ('awaiting reply', 'awaiting'))`);
    }
  }

  if (dateRange > 0) {
    // Compare ISO timestamps directly to allow index use on `created_at`.
    where.push(`created_at >= ?`);
    args.push(new Date(Date.now() - dateRange * 864e5).toISOString());
  }
  if (searchQuery) {
    // Smart single-box search: spans the contact fields AND the categorical
    // columns the old dropdown filters used to cover (lead type, status/stage,
    // intent, AI status, source, budget) plus notes, so "buyer", "hot",
    // "zillow", "awaiting", "$500k" etc. all narrow the list from one input.
    const like = `%${searchQuery}%`;
    const cols = [
      "name", "first_name", "last_name", "email", "phone", "company",
      "property_address", "area", "lead_type", "intent", "status",
      "ai_status", "source", "price_range", "notes",
    ];
    where.push(`(${cols.map((c) => `${c} LIKE ?`).join(" OR ")})`);
    args.push(...cols.map(() => like));
  }

  const whereClause = where.join(" AND ");
  const orderBy = `ORDER BY created_at DESC, id DESC`;

  let items: ReturnType<typeof serialize>[];
  let filteredTotal: number;

  if (usePagination) {
    const countRow = await queryFirst<{ n: number }>(
      env.D1DB,
      `SELECT COUNT(id) AS n FROM lead WHERE ${whereClause}`,
      ...args,
    );
    filteredTotal = countRow?.n ?? 0;
    const offset = (page - 1) * pageSize;
    const rows = await queryAll<LeadRow>(
      env.D1DB,
      `SELECT * FROM lead WHERE ${whereClause} ${orderBy} LIMIT ? OFFSET ?`,
      ...args, pageSize, offset,
    );
    items = rows.map(serialize);
  } else {
    const rows = await queryAll<LeadRow>(
      env.D1DB,
      `SELECT * FROM lead WHERE ${whereClause} ${orderBy}`,
      ...args,
    );
    items = rows.map(serialize);
    filteredTotal = items.length;
  }

  // Batched enrichment: for any opted-out lead with a phone, look up the
  // opt_out_reason from sms_contact in ONE round trip per page. Drives the
  // leads-table indicator tooltip ("Texted STOP" vs "Admin blocked" vs
  // "Marked at import" vs "Blocked by agent"). Empty array -> no-op.
  const optedOutPhones = items
    .filter((i) => i.sms_opt_out && (i.phone || "").trim())
    .map((i) => (i.phone as string).trim());
  if (optedOutPhones.length) {
    const placeholders = optedOutPhones.map(() => "?").join(",");
    const reasonRows = await queryAll<{ phone_number_e164: string; opt_out_reason: string | null }>(
      env.D1DB,
      `SELECT phone_number_e164, opt_out_reason FROM sms_contact
        WHERE org_id = ? AND phone_number_e164 IN (${placeholders})`,
      orgId, ...optedOutPhones,
    );
    const reasonMap = new Map(reasonRows.map((r) => [r.phone_number_e164, r.opt_out_reason]));
    items = items.map((i) =>
      i.sms_opt_out && i.phone
        ? { ...i, sms_opt_out_reason: reasonMap.get(i.phone) ?? null }
        : i,
    );
  }

  if (!includeMeta) return json(items);

  // ?include_meta=1 -> counts envelope + optional pagination metadata.
  // Use a single aggregated query to compute multiple time-window counts in one pass.
  const counts: Record<string, number> = { returned: items.length, filtered_total: filteredTotal };
  const cutoff7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const cutoff14 = new Date(Date.now() - 14 * 864e5).toISOString();
  const cutoff30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const cutoff60 = new Date(Date.now() - 60 * 864e5).toISOString();
  const cutoff90 = new Date(Date.now() - 90 * 864e5).toISOString();
  const agg = await queryFirst<{
    last_7: number; last_14: number; last_30: number; last_60: number; last_90: number; org_total: number
  }>(
    env.D1DB,
    `SELECT
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last_7,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last_14,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last_30,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last_60,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last_90,
       COUNT(id) AS org_total
     FROM lead WHERE org_id = ?`,
    cutoff7, cutoff14, cutoff30, cutoff60, cutoff90, orgId,
  );
  counts["last_7_days"] = agg?.last_7 ?? 0;
  counts["last_14_days"] = agg?.last_14 ?? 0;
  counts["last_30_days"] = agg?.last_30 ?? 0;
  counts["last_60_days"] = agg?.last_60 ?? 0;
  counts["last_90_days"] = agg?.last_90 ?? 0;
  counts["all"] = agg?.org_total ?? 0;
  counts["org_total"] = agg?.org_total ?? 0;

  const totalPages = usePagination ? Math.max(1, Math.ceil(filteredTotal / pageSize)) : 1;
  return json({
    items,
    count: items.length,
    counts,
    pagination: usePagination ? {
      page,
      page_size: pageSize,
      total: filteredTotal,
      total_pages: totalPages,
    } : null,
    applied_filters: {
      view, status, source, price, area, lead_type: leadType, ai_status: aiStatus,
      quick: quicks,
      date_range: dateRange || null,
      q: searchQuery || null,
    },
  });
};

const UPDATABLE = [
  "name", "first_name", "last_name", "email", "phone", "company",
  "status", "source", "property_address", "area", "price_range", "estimated_price",
  "notes", "lead_type", "intent", "ai_status", "owner_id",
  "email_notifications_enabled", "sms_notifications_enabled",
  "appointment_booked", "auto_response_route", "qualification_status",
  "timezone", "timezone_source",
  "timeline", "pre_approved", "motivation", "occupancy_status",
  "financing_status", "interest_level", "qualification_step",
  "auto_followup_action",
  // Editable from the Edit Lead modal so an agent can correct the lead's
  // consent state after they got verbal opt-in or were told to stop. The
  // UI gates "promote to opted_in" behind the TCPA attestation checkbox.
  "sms_consent_status",
  // AI-native CRM fields. Auto-maintained by the reactive flow, but editable so
  // an agent can correct an extracted value or override the AI's score/action.
  "bedrooms", "bathrooms", "property_type", "seller_price_expectations",
  "lead_score", "next_best_action", "ai_summary",
] as const;
type UpdField = (typeof UPDATABLE)[number];

async function updateLead(env: Env, userId: number, leadId: number, body: Record<string, unknown>): Promise<Response> {
  const lead = await queryFirst<{ org_id: number | null; ai_status: string | null }>(
    env.D1DB, `SELECT org_id, ai_status FROM lead WHERE id = ?`, leadId);
  if (!lead) return error("Lead not found", 404);
  if (lead.org_id && !(await isOrgMember(env, userId, lead.org_id))) return error("Forbidden", 403);

  // If the caller is updating the timezone, normalize the input first so we
  // never persist aliases like "PST". An empty string clears the field. When
  // the caller didn't explicitly set timezone_source, mark it 'manual'.
  let tzCleared = false;
  if ("timezone" in body) {
    const raw = body["timezone"];
    if (raw == null || String(raw).trim() === "") {
      body["timezone"] = null;
      tzCleared = true;
    } else {
      const normalized = normalizeTimezone(String(raw));
      if (!normalized) return error("Invalid timezone", 400);
      body["timezone"] = normalized;
    }
    if (!("timezone_source" in body)) {
      body["timezone_source"] = tzCleared ? null : "manual";
    }
  }

  // Auto-cap text fields to their stored max length - the server backstop for
  // the Add/Edit modal's maxLength, so an edit can never exceed the limit even
  // if the client is bypassed.
  for (const k of Object.keys(LEAD_TEXT_LIMITS) as LeadTextField[]) {
    if (k in body && typeof body[k] === "string") {
      body[k] = capLeadField(k, body[k] as string);
    }
  }

  // Numeric columns: coerce a blank string to NULL and a numeric string to a
  // number so a cleared/typed bedrooms/bathrooms never lands as text "" / "3"
  // in an INTEGER/REAL column.
  const NUMERIC_FIELDS = new Set<string>(["bedrooms", "bathrooms"]);
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const k of UPDATABLE) {
    if (k in body) {
      sets.push(`${k} = ?`);
      let v = body[k as UpdField];
      if (NUMERIC_FIELDS.has(k)) {
        const s = v == null ? "" : String(v).trim();
        const n = s === "" ? null : Number(s);
        v = n != null && Number.isFinite(n) ? n : null;
      }
      args.push(typeof v === "boolean" ? (v ? 1 : 0) : v ?? null);
    }
  }
  if (!sets.length) return json({ message: "Nothing to update" });
  await execute(env.D1DB, `UPDATE lead SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args, leadId);

  // The inline AI-Status pill is the per-lead control for the REACTIVE AI
  // Inbound Flow (whether AI replies once this lead writes in). It does NOT
  // proactively send anything - turning it on just allows replies; turning it
  // Paused/Off stops the lead and cancels any pending follow-ups (always safe -
  // cancelling only ever prevents sends).
  if ("ai_status" in body && (aiStatusIsPaused(body["ai_status"]) || aiStatusIsOff(body["ai_status"]))) {
    try { await cancelPendingFollowups(env, leadId); }
    catch { /* must not fail the lead update itself */ }
    // Agent is taking over this lead -> clear any open hot-lead escalation.
    try { await resolveLeadEscalations(env, leadId, "agent_takeover"); }
    catch { /* non-fatal */ }
  }
  // Booking an appointment resolves the "needs the agent" escalation.
  if ("appointment_booked" in body && (body["appointment_booked"] === 1 || body["appointment_booked"] === true)) {
    try { await resolveLeadEscalations(env, leadId, "appointment_booked"); }
    catch { /* non-fatal */ }
  }

  return json({ message: "Lead updated successfully" });
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.orgId); // here it's actually the lead id
  if (!Number.isInteger(id)) return error("Invalid lead id", 400);
  const body = (await readJson<Record<string, unknown>>(request)) || {};
  return updateLead(env, user.id, id, body);
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.orgId);
  if (!Number.isInteger(id)) return error("Invalid lead id", 400);
  const body = (await readJson<Record<string, unknown>>(request)) || {};
  return updateLead(env, user.id, id, body);
};
