/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { resolveOrgId } from "../../../_shared/callingAccess.ts";

/**
 * GET /api/calling/analytics/dashboard - aggregate call stats over a date range
 * (defaults to last 30 days). Powers the admin dashboard tile + the agent's
 * personal stats panel.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await resolveOrgId(env, user.id);
  if (!orgId) return error("Not part of an organization", 403);

  const url = new URL(request.url);
  const start = url.searchParams.get("startDate") || new Date(Date.now() - 30 * 86400_000).toISOString();
  const end = url.searchParams.get("endDate") || new Date().toISOString();

  const totals = await queryFirst<{
    total_calls: number; total_minutes: number;
    answered: number; missed: number; outbound: number; inbound: number;
  }>(
    env.D1DB,
    `SELECT
       COUNT(*) AS total_calls,
       COALESCE(SUM(duration), 0) / 60.0 AS total_minutes,
       SUM(CASE WHEN status = 'COMPLETED'  THEN 1 ELSE 0 END) AS answered,
       SUM(CASE WHEN status IN ('NO_ANSWER', 'BUSY', 'CANCELED', 'FAILED') THEN 1 ELSE 0 END) AS missed,
       SUM(CASE WHEN direction = 'OUTBOUND' THEN 1 ELSE 0 END) AS outbound,
       SUM(CASE WHEN direction = 'INBOUND'  THEN 1 ELSE 0 END) AS inbound
     FROM calls
     WHERE org_id = ? AND created_at >= ? AND created_at <= ?`,
    orgId, start, end,
  );

  const t = totals ?? {
    total_calls: 0, total_minutes: 0,
    answered: 0, missed: 0, outbound: 0, inbound: 0,
  };

  return json({
    range: { startDate: start, endDate: end },
    totals: {
      totalCalls: t.total_calls,
      totalMinutes: Math.round(t.total_minutes * 10) / 10,
      answered: t.answered,
      missed: t.missed,
      outbound: t.outbound,
      inbound: t.inbound,
      answerRate: t.total_calls > 0 ? Math.round((t.answered / t.total_calls) * 1000) / 10 : 0,
    },
  });
};
