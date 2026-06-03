/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * GET /api/inbox/scheduled/summary - a single aggregate over the org's pending
 * outbound queue (status='scheduled'), used by the inbox empty / "select a
 * conversation" pane to show how many messages are waiting to send, when the
 * next one fires, and the day-by-day breakdown (today / tomorrow / later) so
 * the agent can see what goes out now vs as future follow-ups.
 *
 * Day boundaries are computed in the ORG's timezone (not UTC), so "today" means
 * the agent's local calendar day. One COUNT query, cheap enough to poll
 * alongside the conversation list.
 *
 * Static `summary` segment wins over the sibling `[id]` route for this path.
 */

/** Local wall-clock Y-M-D for an instant in a timezone. */
function zoneYmd(date: Date, tz: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** ms offset (local - UTC) for `tz` at a given instant. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

/** UTC instant whose wall-clock in `tz` is the given local midnight (DST-safe). */
function localMidnightUtcIso(tz: string, year: number, month: number, day: number): string {
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const off1 = tzOffsetMs(new Date(naiveUtc), tz);
  let cand = naiveUtc - off1;
  const off2 = tzOffsetMs(new Date(cand), tz);
  if (off2 !== off1) cand = naiveUtc - off2;
  return new Date(cand).toISOString();
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const org = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!org?.org_id) return error("User not part of organization", 403);

  const orgRow = await queryFirst<{ timezone: string | null }>(
    env.D1DB, `SELECT timezone FROM organization WHERE id = ?`, org.org_id,
  );
  const tz = (orgRow?.timezone || "America/New_York").trim() || "America/New_York";

  // Day boundaries in the org's local calendar, as UTC ISO instants.
  const now = new Date();
  const { year, month, day } = zoneYmd(now, tz);
  const tomorrowStart = localMidnightUtcIso(tz, year, month, day + 1);
  const dayAfterStart = localMidnightUtcIso(tz, year, month, day + 2);
  const dueSoon = new Date(now.getTime() + 60 * 60_000).toISOString();

  const row = await queryFirst<{
    pending: number; next_at: string | null; due_soon: number;
    sms: number; email: number;
    today: number; today_sms: number; today_email: number;
    tomorrow: number; later: number;
  }>(
    env.D1DB,
    `SELECT COUNT(*)                                                      AS pending,
            MIN(scheduled_at)                                            AS next_at,
            SUM(CASE WHEN scheduled_at <= ? THEN 1 ELSE 0 END)           AS due_soon,
            SUM(CASE WHEN channel = 'sms'   THEN 1 ELSE 0 END)           AS sms,
            SUM(CASE WHEN channel = 'email' THEN 1 ELSE 0 END)           AS email,
            SUM(CASE WHEN scheduled_at <  ? THEN 1 ELSE 0 END)           AS today,
            SUM(CASE WHEN scheduled_at <  ? AND channel = 'sms'   THEN 1 ELSE 0 END) AS today_sms,
            SUM(CASE WHEN scheduled_at <  ? AND channel = 'email' THEN 1 ELSE 0 END) AS today_email,
            SUM(CASE WHEN scheduled_at >= ? AND scheduled_at < ? THEN 1 ELSE 0 END)  AS tomorrow,
            SUM(CASE WHEN scheduled_at >= ? THEN 1 ELSE 0 END)           AS later
       FROM scheduled_message
      WHERE org_id = ? AND status = 'scheduled'`,
    dueSoon,         // due_soon
    tomorrowStart,   // today
    tomorrowStart,   // today_sms
    tomorrowStart,   // today_email
    tomorrowStart,   // tomorrow (lower bound)
    dayAfterStart,   // tomorrow (upper bound)
    dayAfterStart,   // later
    org.org_id,
  );

  return json({
    pending: Number(row?.pending ?? 0),
    next_at: row?.next_at ?? null,
    due_within_hour: Number(row?.due_soon ?? 0),
    sms: Number(row?.sms ?? 0),
    email: Number(row?.email ?? 0),
    // Day-by-day breakdown in the org's local calendar. "today" includes
    // anything overdue/due now; "later" is everything from the day after
    // tomorrow onward.
    today: Number(row?.today ?? 0),
    today_sms: Number(row?.today_sms ?? 0),
    today_email: Number(row?.today_email ?? 0),
    tomorrow: Number(row?.tomorrow ?? 0),
    later: Number(row?.later ?? 0),
    timezone: tz,
  });
};
