/**
 * Workflow step scheduling - display helpers shared by the Outbound workflow
 * list, the wizard, the edit page, the template gallery, and the lead-import
 * step preview, so every surface describes a step's timing identically.
 *
 * The opening message (day 0) is INSTANT - it sends right after enrollment.
 * Each follow-up fires `dayOffset` days later at its `sendTime` (HH:MM, 24h,
 * account timezone). The day name / date are computed relative to NOW so the
 * agent can see which real day a step lands on if the workflow starts today.
 */

export const DEFAULT_STEP_SEND_TIME = "09:00";

/**
 * Minutes-since-midnight RIGHT NOW in the given IANA timezone (e.g.
 * "America/Los_Angeles"). Falls back to the browser's local time when the tz is
 * empty/invalid. Used to decide whether a same-day send time is still ahead.
 */
export function zoneMinutesNow(timezone: string | null | undefined): number {
  try {
    const tz = (timezone || "").trim();
    if (!tz) throw new Error("no tz");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + m;
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}

/** Parse "HH:MM" -> minutes since midnight, or null if not a valid time. */
export function sendTimeMinutes(raw: string | null | undefined): number | null {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Is "HH:MM" still in the future TODAY in the given timezone? Same-day campaign
 * sends are only allowed when this is true (else the UI errors/disables).
 */
export function isTimeInFutureToday(hhmm: string | null | undefined, timezone: string | null | undefined): boolean {
  const t = sendTimeMinutes(hhmm);
  if (t == null) return false;
  return t > zoneMinutesNow(timezone);
}

/**
 * A sensible default same-day send time: ~1h from now (rounded up to the next
 * 30 min) in the account tz, formatted "HH:MM". Returns null if that would roll
 * past midnight (no same-day slot left).
 */
export function defaultFutureSendTime(timezone: string | null | undefined): string | null {
  let mins = zoneMinutesNow(timezone) + 60;
  mins = Math.ceil(mins / 30) * 30;
  if (mins >= 24 * 60) return null;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Current wall-clock label in a tz, e.g. "3:07 PM". */
export function formatZoneNow(timezone: string | null | undefined): string {
  try {
    const tz = (timezone || "").trim();
    if (!tz) throw new Error("no tz");
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
  } catch {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

/** "09:00" / "9:5" -> "9:00 AM". Returns "" when not parseable. */
export function formatSendTime(raw: string | null | undefined): string {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  let hour = Number(m[1]);
  const minute = m[2];
  if (hour < 0 || hour > 23 || Number(minute) > 59) return "";
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
}

export interface StepSchedule {
  /** "Instant" for the instant opening, otherwise "Day N". */
  dayLabel: string;
  /** "Mon, Jun 9" - the calendar day the step lands on. */
  dateLabel: string;
  /** "9:00 AM"; for the instant opening this is the CURRENT time (when it sends). */
  timeLabel: string;
  /** True for the instant opening (sent immediately on enrollment). */
  instant: boolean;
  /** One-line summary, e.g. "Day 2 - Mon, Jun 9 at 9:00 AM". */
  full: string;
}

/** Current wall-clock time, e.g. "2:34 PM". */
function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Describe a step's schedule.
 *   dayOffset - 0 = opening day, N = follow-up N days out.
 *   sendTime  - "HH:MM" wall clock; defaults to 09:00 for follow-ups. Ignored
 *               when `instant` is set.
 *   instant   - the opening sends immediately; its "time" is the current moment.
 *   now       - the reference "now" (for the instant time). Defaults to current.
 *   base      - the date follow-up offsets are counted from. Defaults to `now`
 *               ("if started today"); pass a workflow's created_at to anchor the
 *               dates to when it was created instead.
 */
export function describeStep(
  dayOffset: number,
  sendTime: string | null | undefined,
  opts: { instant?: boolean; now?: Date; base?: Date } = {},
): StepSchedule {
  const now = opts.now ?? new Date();
  const base = opts.base ?? now;
  const day = Number.isFinite(dayOffset) && dayOffset > 0 ? Math.floor(dayOffset) : 0;

  if (opts.instant) {
    const clock = formatClock(now);
    return {
      dayLabel: "Instant",
      dateLabel: now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      timeLabel: clock,
      instant: true,
      full: `Sends instantly (around ${clock})`,
    };
  }

  const target = new Date(base.getTime() + day * 86_400_000);
  const dateLabel = target.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = formatSendTime(sendTime) || formatSendTime(DEFAULT_STEP_SEND_TIME);
  return {
    dayLabel: `Day ${day}`,
    dateLabel,
    timeLabel,
    instant: false,
    full: `Day ${day} - ${dateLabel} at ${timeLabel}`,
  };
}
