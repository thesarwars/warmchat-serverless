/// <reference types="@cloudflare/workers-types" />
import { queryFirst } from "./db.ts";

// Narrow env shape so both Pages Functions (Env) and the cron Worker
// (CronEnv) can pass their bindings in - we only need D1DB.
type EnvLike = { D1DB: D1Database };

/**
 * Quiet-hours guard. Loads the org's configurable window (defaults 8am-9pm)
 * and returns whether the current moment is inside the recipient's local
 * quiet window. Prefers the lead's timezone, falls back to the org's. When
 * neither is set, returns null (no guard at all).
 *
 * Return shape:
 *  - null when no timezone is available on lead or org.
 *  - { blocked: false, ... } when we're inside the allowed window.
 *  - { blocked: true, hour, timezone, until } when sending should be blocked.
 *    `until` is the ISO timestamp of the next moment the window opens, so the
 *    UI can phrase the prompt and cron jobs know when to retry.
 */

export type QuietHoursResult = {
  blocked: boolean;
  hour: number;
  timezone: string;
  until: string;
};

interface OrgRow {
  timezone: string | null;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
}

/**
 * The org-level quiet-hours configuration, resolved once. Splitting this out
 * lets callers that evaluate many leads (e.g. automation send) fetch the org row
 * ONCE via `loadOrgQuietConfig` and then call the DB-free `evaluateQuietHours`
 * per lead, instead of re-reading `organization` for every lead.
 */
export interface OrgQuietConfig {
  /** Org default timezone; "" when unset (lead tz can still apply). */
  timezone: string;
  startHour: number;
  endHour: number;
}

function hourInZone(now: Date, timezone: string): number {
  // Intl gives us the current wall-clock hour in the target zone. Use
  // hourCycle: h23 so midnight reads as 0, not 24.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour");
  return hourPart ? Number(hourPart.value) : 0;
}

function localCalendarParts(
  now: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

/**
 * Compute the next moment (UTC ISO) when the local hour `startHour` happens
 * in `timezone`. Used to tell the UI/cron when retry will succeed.
 */
function nextOpening(now: Date, timezone: string, startHour: number): string {
  const local = localCalendarParts(now, timezone);
  // If today's start hour is still in the future locally, target today.
  // Otherwise target tomorrow's start hour.
  const targetIsToday = local.hour < startHour;
  let year = local.year;
  let month = local.month;
  let day = local.day;
  if (!targetIsToday) {
    // Increment by a day in UTC and let Date normalize.
    const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1, 12, 0, 0));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }

  // Build a UTC instant near the target local hour, then iteratively adjust
  // by the offset until the resulting local hour matches startHour. Two
  // passes are sufficient for DST/offset edge cases.
  let candidate = new Date(Date.UTC(year, month - 1, day, startHour, 0, 0));
  for (let i = 0; i < 3; i++) {
    const h = hourInZone(candidate, timezone);
    const diff = startHour - h;
    if (diff === 0) break;
    candidate = new Date(candidate.getTime() + diff * 3600_000);
  }
  return candidate.toISOString();
}

/** One DB read for the org's quiet-hours window. Defaults: 8am-9pm. */
export async function loadOrgQuietConfig(env: EnvLike, orgId: number): Promise<OrgQuietConfig> {
  const org = await queryFirst<OrgRow>(
    env.D1DB,
    `SELECT timezone, quiet_hours_start, quiet_hours_end FROM organization WHERE id = ?`,
    orgId,
  );
  return {
    timezone: (org?.timezone || "").trim(),
    startHour: Number.isFinite(org?.quiet_hours_start) ? Number(org!.quiet_hours_start) : 8,
    endHour: Number.isFinite(org?.quiet_hours_end) ? Number(org!.quiet_hours_end) : 21,
  };
}

/**
 * Pure (no DB) quiet-hours evaluation. Prefers the lead's timezone, falls back
 * to the org's. Returns null when neither is set. Safe to call in a tight loop.
 */
export function evaluateQuietHours(
  config: OrgQuietConfig,
  leadTimezone: string | null | undefined,
): QuietHoursResult | null {
  const timezone = (leadTimezone || config.timezone || "").trim();
  if (!timezone) return null;

  const now = new Date();
  const hour = hourInZone(now, timezone);
  // Window is [startHour, endHour). Anything outside that is blocked.
  const blocked = hour < config.startHour || hour >= config.endHour;

  return {
    blocked,
    hour,
    timezone,
    until: nextOpening(now, timezone, config.startHour),
  };
}

/**
 * Convenience wrapper preserved for single-shot callers: load the org config
 * and evaluate in one call. Loop callers should use `loadOrgQuietConfig` +
 * `evaluateQuietHours` instead to avoid an org read per iteration.
 */
export async function checkQuietHours(
  env: EnvLike,
  orgId: number,
  leadTimezone: string | null | undefined,
): Promise<QuietHoursResult | null> {
  const config = await loadOrgQuietConfig(env, orgId);
  return evaluateQuietHours(config, leadTimezone);
}
