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
