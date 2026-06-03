/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { resolveOrgId } from "../../../_shared/callingAccess.ts";

/**
 * GET /api/calling/stats - the Calls page stat cards. Org-scoped, all values
 * from SQL aggregates (no in-Worker loops, to respect Workers CPU limits).
 *
 * Cards: total today (+vs yesterday), missed today (+unrecovered),
 * voicemails pending (+high priority), avg duration this week (+vs last week),
 * booked-from-calls over the range (+conversion %).
 *
 * Optional ?startDate&endDate scope the booked/conversion card (default 30d).
 */
const MISSED = "('NO_ANSWER', 'BUSY', 'FAILED', 'CANCELED')";

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await resolveOrgId(env, user.id);
  if (!orgId) return error("Not part of an organization", 403);

  const url = new URL(request.url);
  const now = new Date();
  const dayMs = 86_400_000;
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const yesterdayStart = new Date(Date.parse(todayStart) - dayMs).toISOString();
  const weekStart = new Date(Date.parse(todayStart) - 7 * dayMs).toISOString();
  const lastWeekStart = new Date(Date.parse(todayStart) - 14 * dayMs).toISOString();
  const rangeStart = url.searchParams.get("startDate") || new Date(Date.now() - 30 * dayMs).toISOString();
  const rangeEnd = url.searchParams.get("endDate") || now.toISOString();

  // Total calls today vs yesterday.
  const today = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(*) AS n FROM calls WHERE org_id = ? AND created_at >= ?`, orgId, todayStart);
  const yesterday = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(*) AS n FROM calls WHERE org_id = ? AND created_at >= ? AND created_at < ?`,
    orgId, yesterdayStart, todayStart);

  // Missed today + unrecovered (no later COMPLETED outbound to same lead AND no appointment booked from the call).
  const missed = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM calls WHERE org_id = ? AND created_at >= ? AND status IN ${MISSED}`,
    orgId, todayStart);
  const unrecovered = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM calls c
      WHERE c.org_id = ? AND c.created_at >= ? AND c.status IN ${MISSED}
        AND NOT EXISTS (
          SELECT 1 FROM calls c2
           WHERE c2.lead_id = c.lead_id AND c2.direction = 'OUTBOUND'
             AND c2.status = 'COMPLETED' AND c2.created_at > c.created_at)
        AND NOT EXISTS (SELECT 1 FROM lead_appointment la WHERE la.call_id = c.id)`,
    orgId, todayStart);

  // Voicemails pending (unheard) + high priority (negative sentiment).
  const voicemails = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM calls WHERE org_id = ? AND is_voicemail = 1 AND voicemail_heard = 0`, orgId);
  const voicemailsHigh = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM calls c
       JOIN call_ai_insights i ON i.call_id = c.id
      WHERE c.org_id = ? AND c.is_voicemail = 1 AND c.voicemail_heard = 0 AND i.sentiment = 'negative'`,
    orgId);

  // Avg completed-call duration this week vs last week (seconds).
  const avgThis = await queryFirst<{ a: number | null }>(
    env.D1DB,
    `SELECT AVG(duration) AS a FROM calls WHERE org_id = ? AND status = 'COMPLETED' AND created_at >= ?`,
    orgId, weekStart);
  const avgLast = await queryFirst<{ a: number | null }>(
    env.D1DB,
    `SELECT AVG(duration) AS a FROM calls WHERE org_id = ? AND status = 'COMPLETED' AND created_at >= ? AND created_at < ?`,
    orgId, lastWeekStart, weekStart);

  // Booked-from-calls + conversion over the range.
  const booked = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(DISTINCT la.call_id) AS n FROM lead_appointment la
      WHERE la.org_id = ? AND la.call_id IS NOT NULL AND la.created_at >= ? AND la.created_at <= ?`,
    orgId, rangeStart, rangeEnd);
  const rangeCalls = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM calls WHERE org_id = ? AND created_at >= ? AND created_at <= ?`,
    orgId, rangeStart, rangeEnd);

  const callsToday = today?.n ?? 0;
  const callsYesterday = yesterday?.n ?? 0;
  const avgThisSec = Math.round(avgThis?.a ?? 0);
  const avgLastSec = Math.round(avgLast?.a ?? 0);
  const bookedN = booked?.n ?? 0;
  const rangeCallsN = rangeCalls?.n ?? 0;

  return json({
    range: { startDate: rangeStart, endDate: rangeEnd },
    totalCalls: { today: callsToday, deltaPct: pctDelta(callsToday, callsYesterday) },
    missed: { today: missed?.n ?? 0, unrecovered: unrecovered?.n ?? 0 },
    voicemails: { pending: voicemails?.n ?? 0, highPriority: voicemailsHigh?.n ?? 0 },
    avgDuration: { seconds: avgThisSec, deltaPct: pctDelta(avgThisSec, avgLastSec) },
    booked: {
      count: bookedN,
      conversionPct: rangeCallsN > 0 ? Math.round((bookedN / rangeCallsN) * 1000) / 10 : 0,
    },
  });
};
