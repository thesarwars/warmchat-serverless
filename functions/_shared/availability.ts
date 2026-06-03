/// <reference types="@cloudflare/workers-types" />
import { queryFirst, queryAll, execute } from "./db.ts";

/**
 * Agent availability service - the single source of truth the AI honors when
 * proposing/booking appointments. Reads agent_availability (the human agent's
 * bookable hours) and the existing lead_appointment rows to compute genuinely
 * open slots, and to guard against out-of-hours / double-booked times.
 */

type EnvLike = { D1DB: D1Database };

type Window = [string, string]; // ["09:00","17:00"]
export interface AvailabilityConfig {
  timezone: string;
  weeklyHours: Record<string, Window[]>; // keys: sun..sat
  exceptions: string[];                   // ["YYYY-MM-DD", ...] blocked dates
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
  enabled: boolean;
}

export interface OpenSlot { startsAtIso: string; label: string }

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DEFAULT_WEEKLY: Record<string, Window[]> = {
  mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]],
  thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]], sat: [], sun: [],
};
const ACTIVE_APPT_STATUSES = "('proposed','scheduled','confirmed','reschedule_proposed','rescheduled')";

interface AvailRow {
  timezone: string | null; weekly_hours: string | null; exceptions: string | null;
  slot_minutes: number; buffer_minutes: number; min_notice_hours: number;
  horizon_days: number; enabled: number;
}

/** Load the agent's availability config, falling back to org tz + Mon-Fri 9-17. */
export async function getAvailability(env: EnvLike, orgId: number, userId: number): Promise<AvailabilityConfig> {
  const row = await queryFirst<AvailRow>(
    env.D1DB,
    `SELECT timezone, weekly_hours, exceptions, slot_minutes, buffer_minutes, min_notice_hours, horizon_days, enabled
       FROM agent_availability WHERE org_id = ? AND user_id = ? LIMIT 1`,
    orgId, userId,
  );
  const org = await queryFirst<{ timezone: string | null }>(
    env.D1DB, `SELECT timezone FROM organization WHERE id = ?`, orgId);
  const timezone = (row?.timezone || org?.timezone || "America/New_York").trim();

  let weeklyHours: Record<string, Window[]> = DEFAULT_WEEKLY;
  if (row?.weekly_hours) {
    try { const p = JSON.parse(row.weekly_hours); if (p && typeof p === "object") weeklyHours = p as Record<string, Window[]>; }
    catch { /* keep default */ }
  }
  let exceptions: string[] = [];
  if (row?.exceptions) {
    try { const p = JSON.parse(row.exceptions); if (Array.isArray(p)) exceptions = p.map(String); }
    catch { /* keep empty */ }
  }
  return {
    timezone,
    weeklyHours,
    exceptions,
    slotMinutes: row?.slot_minutes ?? 30,
    bufferMinutes: row?.buffer_minutes ?? 0,
    minNoticeHours: row?.min_notice_hours ?? 2,
    horizonDays: row?.horizon_days ?? 14,
    enabled: row ? Boolean(row.enabled) : true,
  };
}

/**
 * The booking master control: whether the AI may propose/book appointments.
 * This is ONE flag (agent_availability.enabled) surfaced in two places that are
 * deliberately the same toggle - the Availability editor's master switch AND the
 * inbound "Booking intent -> push appointment" workflow card (w5). Defaults ON
 * (no row = enabled), matching the agent_availability.enabled column default, so
 * a fresh workspace can book out of the box once the AI master + Inbound are on.
 */
export async function getBookingEnabled(env: EnvLike, orgId: number, userId: number): Promise<boolean> {
  const row = await queryFirst<{ enabled: number }>(
    env.D1DB,
    `SELECT enabled FROM agent_availability WHERE org_id = ? AND user_id = ? LIMIT 1`,
    orgId, userId,
  );
  return row ? Boolean(row.enabled) : true;
}

/**
 * Flip the booking master control, upserting the availability row while
 * preserving every other setting. Called by BOTH the Availability editor and the
 * w5 workflow card so the two UI toggles drive the one underlying value.
 */
export async function setBookingEnabled(env: EnvLike, orgId: number, userId: number, enabled: boolean): Promise<void> {
  const cur = await getAvailability(env, orgId, userId);
  await execute(
    env.D1DB,
    `INSERT INTO agent_availability
       (org_id, user_id, timezone, weekly_hours, exceptions, slot_minutes, buffer_minutes, min_notice_hours, horizon_days, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id, user_id) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`,
    orgId, userId, cur.timezone, JSON.stringify(cur.weeklyHours), JSON.stringify(cur.exceptions),
    cur.slotMinutes, cur.bufferMinutes, cur.minNoticeHours, cur.horizonDays, enabled ? 1 : 0,
  );
}

interface ZoneParts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }
function zoneParts(date: Date, tz: string): ZoneParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour: Number(get("hour")), minute: Number(get("minute")), weekday: wd[get("weekday")] ?? 0,
  };
}

/** ms offset (local - UTC) for a tz at a given instant. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = zoneParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return asUtc - date.getTime();
}

/** UTC instant whose wall-clock in `tz` is the given local Y-M-D H:M (DST-safe). */
function localToUtc(tz: string, year: number, month: number, day: number, hour: number, minute: number): number {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const off1 = tzOffsetMs(new Date(naiveUtc), tz);
  let cand = naiveUtc - off1;
  const off2 = tzOffsetMs(new Date(cand), tz);
  if (off2 !== off1) cand = naiveUtc - off2;
  return cand;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }
function dateStrOf(p: ZoneParts): string { return `${p.year}-${pad(p.month)}-${pad(p.day)}`; }
/** "HH:MM" -> minutes of day (safe under noUncheckedIndexedAccess). */
function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function slotLabel(ms: number, tz: string): string {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function matchesPreferredDay(pref: string, weekdayKey: string, dateStr: string): boolean {
  const p = pref.trim().toLowerCase();
  if (!p) return true;
  if (p === dateStr) return true;
  if (weekdayKey && p.startsWith(weekdayKey)) return true;       // "monday" -> "mon"
  if (weekdayKey && weekdayKey.startsWith(p.slice(0, 3))) return true;
  return false;
}

function matchesPartOfDay(part: string, ms: number, tz: string): boolean {
  const h = zoneParts(new Date(ms), tz).hour;
  if (part === "morning") return h < 12;
  if (part === "afternoon") return h >= 12 && h < 17;
  if (part === "evening") return h >= 17;
  return true;
}

function parseSqlTs(ts: string): number {
  return Date.parse(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z");
}

async function busyTimes(env: EnvLike, orgId: number, ownerId: number): Promise<number[]> {
  const rows = await queryAll<{ starts_at: string }>(
    env.D1DB,
    `SELECT starts_at FROM lead_appointment
      WHERE org_id = ? AND created_by_user_id = ? AND status IN ${ACTIVE_APPT_STATUSES}`,
    orgId, ownerId,
  );
  return rows.map((r) => parseSqlTs(r.starts_at)).filter((n) => !isNaN(n));
}

/**
 * Compute the next open booking slots for the agent's calendar: inside the
 * weekly hours, at/after now+minNotice, within the horizon, not on a blocked
 * date, and not conflicting (slot+buffer) with an existing appointment.
 */
export async function findOpenSlots(
  env: EnvLike, orgId: number, ownerId: number,
  opts?: { preferredDay?: string; partOfDay?: string; count?: number },
): Promise<OpenSlot[]> {
  const cfg = await getAvailability(env, orgId, ownerId);
  if (!cfg.enabled) return [];
  const count = Math.min(Math.max(opts?.count ?? 4, 1), 10);
  const now = Date.now();
  const earliest = now + cfg.minNoticeHours * 3_600_000;
  const slotMs = cfg.slotMinutes * 60_000;
  const bufferMs = cfg.bufferMinutes * 60_000;
  const busy = await busyTimes(env, orgId, ownerId);

  const slots: OpenSlot[] = [];
  for (let d = 0; d <= cfg.horizonDays && slots.length < count; d++) {
    const dp = zoneParts(new Date(now + d * 86_400_000), cfg.timezone);
    const dateStr = dateStrOf(dp);
    if (cfg.exceptions.includes(dateStr)) continue;
    const weekdayKey: string = WEEKDAYS[dp.weekday] ?? "sun";
    if (opts?.preferredDay && !matchesPreferredDay(opts.preferredDay, weekdayKey, dateStr)) continue;
    const windows = cfg.weeklyHours[weekdayKey] || [];
    for (const win of windows) {
      const startMin = hmToMinutes(win[0]);
      const endMin = hmToMinutes(win[1]);
      let cursor = localToUtc(cfg.timezone, dp.year, dp.month, dp.day, Math.floor(startMin / 60), startMin % 60);
      const windowEnd = localToUtc(cfg.timezone, dp.year, dp.month, dp.day, Math.floor(endMin / 60), endMin % 60);
      while (cursor + slotMs <= windowEnd && slots.length < count) {
        const slotStart = cursor;
        cursor += slotMs;
        if (slotStart < earliest) continue;
        if (opts?.partOfDay && !matchesPartOfDay(opts.partOfDay, slotStart, cfg.timezone)) continue;
        if (busy.some((b) => Math.abs(b - slotStart) < slotMs + bufferMs)) continue;
        slots.push({ startsAtIso: new Date(slotStart).toISOString(), label: slotLabel(slotStart, cfg.timezone) });
      }
    }
  }
  return slots;
}

/**
 * Validate a specific time: enabled, within notice/horizon, on a bookable
 * weekly window, not a blocked date, and not conflicting. This is the
 * double-booking guard the appointment create path lacked.
 */
export async function isSlotBookable(
  env: EnvLike, orgId: number, ownerId: number, startsAtIso: string,
): Promise<{ ok: boolean; reason?: string }> {
  const cfg = await getAvailability(env, orgId, ownerId);
  if (!cfg.enabled) return { ok: false, reason: "Booking availability is turned off" };
  const t = Date.parse(startsAtIso);
  if (isNaN(t)) return { ok: false, reason: "Invalid time" };
  const now = Date.now();
  if (t < now + cfg.minNoticeHours * 3_600_000) return { ok: false, reason: "Too soon - needs more notice" };
  if (t > now + cfg.horizonDays * 86_400_000) return { ok: false, reason: "Too far in the future" };

  const p = zoneParts(new Date(t), cfg.timezone);
  if (cfg.exceptions.includes(dateStrOf(p))) return { ok: false, reason: "That date is blocked" };
  const weekdayKey: string = WEEKDAYS[p.weekday] ?? "sun";
  const windows = cfg.weeklyHours[weekdayKey] || [];
  const minutesOfDay = p.hour * 60 + p.minute;
  const inWindow = windows.some((w) =>
    minutesOfDay >= hmToMinutes(w[0]) && minutesOfDay + cfg.slotMinutes <= hmToMinutes(w[1]));
  if (!inWindow) return { ok: false, reason: "Outside the agent's booking hours" };

  const slotMs = cfg.slotMinutes * 60_000;
  const bufferMs = cfg.bufferMinutes * 60_000;
  const busy = await busyTimes(env, orgId, ownerId);
  if (busy.some((b) => Math.abs(b - t) < slotMs + bufferMs)) return { ok: false, reason: "That time is already booked" };
  return { ok: true };
}
