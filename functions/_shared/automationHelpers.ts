/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst } from "./db.ts";
import { PLANS, planLimitsFor, type PlanLimits } from "./plans.ts";

/** Membership + plan lookup. */
export interface OrgPlan {
  id: number;
  name: string;
  plan: string;
  timezone: string | null;
  owner_id: number | null;
  limits: PlanLimits;
}

export async function getOrgWithPlan(env: Env, userId: number): Promise<OrgPlan | null> {
  const row = await queryFirst<{
    id: number; name: string; plan: string | null; timezone: string | null; owner_id: number | null;
  }>(
    env.D1DB,
    `SELECT o.id, o.name, o.plan, o.timezone, o.owner_id
       FROM membership m JOIN organization o ON o.id = m.org_id
      WHERE m.user_id = ? LIMIT 1`,
    userId,
  );
  if (!row) return null;
  const planId = row.plan && PLANS[row.plan] ? row.plan : "free_channel";
  return {
    id: row.id,
    name: row.name,
    plan: planId,
    timezone: row.timezone,
    owner_id: row.owner_id,
    limits: planLimitsFor(planId),
  };
}

/** Returns [ok, message]. */
export function checkChannelsLimit(limits: PlanLimits, channels: string[]): [boolean, string] {
  const max = limits.max_active_channels;
  if (max !== "unlimited" && channels.length > max) {
    return [false, `Your plan allows only ${max} channel(s).`];
  }
  return [true, ""];
}

/** Counts the org's Running automations and compares against the plan cap. */
export async function checkAutomationLimits(
  env: Env, org: { id: number; plan: string }, limits: PlanLimits, additional = 1,
): Promise<[boolean, string]> {
  const max = limits.active_automations;
  if (max === "unlimited") return [true, ""];
  const row = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM automation WHERE org_id = ? AND status = 'Running'`,
    String(org.id),
  );
  const active = row?.n ?? 0;
  if (active + additional > max) {
    return [false, `Your plan '${org.plan}' allows only ${max} active automation(s).`];
  }
  return [true, ""];
}

/**
 * Derive Type column from stored channels list.
 *   SMS-only -> "SMS",  Email-only -> "Email",  Both -> "Sequence"
 */
export function deriveAutomationType(channels: string[] | null | undefined): string {
  if (!channels || channels.length === 0) return "";
  const chs = new Set(channels.map((c) => String(c).trim().toLowerCase()));
  const hasSms = chs.has("sms");
  const hasEmail = chs.has("email");
  if (hasSms && hasEmail) return "Sequence";
  if (hasSms) return "SMS";
  if (hasEmail) return "Email";
  return [...chs].map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ");
}

/** Channel-tab filter ("all" / "sms" / "email"). */
export function automationMatchesChannelTab(channels: string[] | null | undefined, tab: string): boolean {
  if (!tab || tab.toLowerCase() === "all") return true;
  const chs = new Set((channels || []).map((c) => String(c).trim().toLowerCase()));
  return chs.has(tab.toLowerCase());
}

/** Safe JSON.parse with a fallback. */
export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** Stored automation rows reused by every automation endpoint. */
export interface AutomationRow {
  id: number;
  name: string | null;
  channels: string | null;
  message: string | null;
  opening_send_time: string | null;
  email_subject: string | null;
  email_body: string | null;
  attachments: string | null;
  sources: string | null;
  leads: string | null;
  org_id: string;
  owner_id: string;
  status: string;
  is_archived: number;
  archived_at: string | null;
  created_at: string | null;
  timezone: string | null;
  email_sender_type: string | null;
  followup_sequence_id: string | null;
  followup_steps: string | null;
  delivered_count: number;
  opened_count: number;
  converted_count: number;
  thread_id: number | null;
}

export interface AutomationLead {
  id?: number | string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  replies?: number;
  [k: string]: unknown;
}

/**
 * Upper bound on how many leads a single automation can hold. Stored as a JSON
 * column and fanned out one scheduled_message per lead at send time, so an
 * unbounded array would blow the request body / subrequest / CPU limits.
 */
// Up to 20,000 leads per campaign (client requirement). NOTE: enrolling that many
// in one request does ~N/50 D1 batch writes; on the Workers FREE plan the per-
// invocation subrequest ceiling means very large single enrollments should be
// chunked (the client can enroll in batches) - or run on Workers Paid where the
// ceiling is high enough to enroll 20k in one pass.
export const MAX_AUTOMATION_LEADS = 20000;
// Bound the free-text automation fields so a runaway body can't blow CPU/storage.
// The client enforces a 5-SMS-segment cap on messages; these are generous backstops.
export const MAX_AUTOMATION_NAME = 80;
export const MAX_AUTOMATION_MESSAGE = 1600;
export const MAX_FOLLOWUPS = 10;

export function leadIdsFromAutomation(leads: AutomationLead[]): number[] {
  const ids: number[] = [];
  for (const lead of leads || []) {
    const raw = lead.id;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isInteger(n)) ids.push(n);
  }
  return ids;
}
