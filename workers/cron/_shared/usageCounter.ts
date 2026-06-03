/// <reference types="@cloudflare/workers-types" />
import { queryFirst, execute } from "./db.ts";
import { planLimitsFor } from "./plans.ts";

/**
 * Per-org monthly send counters.
 *
 * Schema (sql/10.create-misc.sql):
 *   usage(org_id, month, emails_sent, sms_sent, ai_requests)  ← per-channel
 */

// Minimal binding shape these helpers need, so both the Pages Functions `Env`
// and the cron Worker's `CronEnv` can call them without a cast.
export interface UsageEnv {
  D1DB: D1Database;
}

export type UsageChannel = "email" | "sms" | "ai";

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface UsageRow { emails_sent: number; sms_sent: number; ai_requests: number }

async function readUsage(env: UsageEnv, orgId: number, month: string): Promise<UsageRow> {
  const row = await queryFirst<UsageRow>(
    env.D1DB,
    `SELECT emails_sent, sms_sent, ai_requests FROM usage WHERE org_id = ? AND month = ?`,
    orgId, month,
  );
  return row || { emails_sent: 0, sms_sent: 0, ai_requests: 0 };
}

function limitForChannel(plan: string, channel: UsageChannel): number | "unlimited" {
  const lim = planLimitsFor(plan);
  if (channel === "email") return lim.monthly_email_sends;
  if (channel === "sms") return lim.monthly_sms_sends;
  return lim.ai_limit;
}

/** True if `orgId` can send `additional` more on `channel` without exceeding plan. */
export async function checkUsageLimit(
  env: UsageEnv, orgId: number, plan: string, channel: UsageChannel, additional = 1,
): Promise<boolean> {
  const max = limitForChannel(plan, channel);
  if (max === "unlimited") return true;
  const u = await readUsage(env, orgId, monthKey());
  const used = channel === "email" ? u.emails_sent : channel === "sms" ? u.sms_sent : u.ai_requests;
  return used + additional <= max;
}

/** Increment the channel's counter (no limit check). Creates the row on first use. */
export async function incrementUsage(
  env: UsageEnv, orgId: number, channel: UsageChannel, count = 1,
): Promise<void> {
  const month = monthKey();
  const col = channel === "email" ? "emails_sent" : channel === "sms" ? "sms_sent" : "ai_requests";
  await execute(
    env.D1DB,
    `INSERT INTO usage (org_id, month, ${col}) VALUES (?, ?, ?)
     ON CONFLICT(org_id, month) DO UPDATE SET ${col} = ${col} + excluded.${col}`,
    orgId, month, count,
  );
}

/** Resolve an org's billing plan, falling back to free_channel. */
export async function getOrgPlan(env: UsageEnv, orgId: number): Promise<string> {
  const row = await queryFirst<{ plan: string | null }>(
    env.D1DB, `SELECT plan FROM organization WHERE id = ?`, orgId,
  );
  return row?.plan || "free_channel";
}

export interface UsageStat {
  used: number;
  limit: number | "unlimited";
  remaining: number | null;
}

export interface UsageSummary {
  month: string;
  email: UsageStat;
  sms: UsageStat;
  ai: UsageStat;
}

/** Current-month usage for each channel paired with the plan's limit. */
export async function getUsageSummary(
  env: UsageEnv, orgId: number, plan: string,
): Promise<UsageSummary> {
  const month = monthKey();
  const u = await readUsage(env, orgId, month);
  const stat = (used: number, channel: UsageChannel): UsageStat => {
    const limit = limitForChannel(plan, channel);
    return {
      used,
      limit,
      remaining: limit === "unlimited" ? null : Math.max(0, limit - used),
    };
  };
  return {
    month,
    email: stat(u.emails_sent, "email"),
    sms: stat(u.sms_sent, "sms"),
    ai: stat(u.ai_requests, "ai"),
  };
}
