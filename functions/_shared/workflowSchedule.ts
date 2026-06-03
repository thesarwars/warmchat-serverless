/// <reference types="@cloudflare/workers-types" />
/**
 * Workflow step scheduling - turn a step's "send after N days at HH:MM (account
 * timezone)" into the concrete UTC instant the cron should dispatch it.
 *
 * The opening message (day 0) is always INSTANT (sent right after enrollment);
 * only the follow-up steps carry a time-of-day. Times are interpreted in the
 * org's account timezone (organization.timezone - the single source of truth),
 * so "9:00 AM on day 2" means 9:00 AM local, converted to a UTC ISO string.
 *
 * The lead-level quiet-hours guard still runs at send time, so a send_time that
 * happens to fall inside the quiet window is simply deferred to the next open
 * hour - it is never sent at the wrong local time.
 */

/** A follow-up step's send time, "HH:MM" 24h. Default when missing/invalid. */
export const DEFAULT_STEP_SEND_TIME = "09:00";

/** Parse "HH:MM" (or "H:MM") into {hour, minute}; null when not parseable. */
export function parseSendTime(raw: string | null | undefined): { hour: number; minute: number } | null {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** The wall-clock {year,month,day,hour,minute} of `date` in `timezone`. */
function localParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/**
 * The UTC instant at which the local wall time (year-month-day hour:minute) in
 * `timezone` occurs. Uses the same iterative offset-correction the quiet-hours
 * guard uses, which is DST-safe (a couple of passes converge on the right
 * offset even across a transition).
 */
function wallTimeToUtc(
  year: number, month: number, day: number, hour: number, minute: number, timezone: string,
): Date {
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 3; i++) {
    const local = localParts(candidate, timezone);
    const diffMin = (hour * 60 + minute) - (local.hour * 60 + local.minute);
    if (diffMin === 0) break;
    candidate = new Date(candidate.getTime() + diffMin * 60_000);
  }
  return candidate;
}

/**
 * Compute the UTC ISO scheduled_at for a follow-up step.
 *   baseMs    - the enrollment moment (ms epoch).
 *   delayDays - days after enrollment the step fires (>= 0).
 *   sendTime  - "HH:MM" local in `timezone`; defaults to 09:00 when missing.
 *   timezone  - the account timezone. When empty, we fall back to a naive
 *               offset from baseMs (preserving the old behavior so an org
 *               without a timezone still queues something sane).
 */
export function stepScheduledAt(
  baseMs: number, delayDays: number, sendTime: string | null | undefined, timezone: string | null | undefined,
): string {
  const days = Number.isFinite(delayDays) && delayDays > 0 ? Math.floor(delayDays) : 0;
  const tz = (timezone || "").trim();
  const t = parseSendTime(sendTime) ?? parseSendTime(DEFAULT_STEP_SEND_TIME)!;

  if (!tz) {
    // No account timezone: keep the message on day N but pin it to the chosen
    // wall time in UTC (best effort - quiet hours can't run without a tz anyway).
    const base = new Date(baseMs);
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days, t.hour, t.minute, 0));
    return d.toISOString();
  }

  // The calendar day in the account timezone, N days from enrollment.
  const baseLocal = localParts(new Date(baseMs), tz);
  const target = new Date(Date.UTC(baseLocal.year, baseLocal.month - 1, baseLocal.day + days, 12, 0, 0));
  return wallTimeToUtc(
    target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), t.hour, t.minute, tz,
  ).toISOString();
}
