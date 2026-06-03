/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { callerOrgId } from "../../_shared/aiAgents.ts";

/**
 * GET /api/leads/filter-options -> live counts per smart-filter dimension
 * (Timeline / Temperature / Area / Price Range / Lead Type). Counts come
 * straight from the leads table, so they update as the AI maintains records
 * (docs: "Smart Filters Update Automatically"). The static [orgId].ts route is
 * NOT matched here - a literal path segment wins over the dynamic param.
 */
async function counts(env: Env, orgId: number, col: string): Promise<{ value: string; count: number }[]> {
  const rows = await queryAll<{ value: string | null; n: number }>(
    env.D1DB,
    `SELECT ${col} AS value, COUNT(*) AS n FROM lead
      WHERE org_id = ? AND ${col} IS NOT NULL AND ${col} != ''
      GROUP BY ${col} ORDER BY n DESC LIMIT 30`,
    orgId,
  );
  return rows.map((r) => ({ value: String(r.value), count: Number(r.n) }));
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const [timeline, temperature, area, price, type, status, totalRow] = await Promise.all([
    counts(env, orgId, "timeline"),
    counts(env, orgId, "intent"),
    counts(env, orgId, "area"),
    counts(env, orgId, "price_range"),
    counts(env, orgId, "lead_type"),
    counts(env, orgId, "status"),
    queryAll<{ n: number }>(env.D1DB, `SELECT COUNT(*) AS n FROM lead WHERE org_id = ?`, orgId),
  ]);
  const total = Number(totalRow[0]?.n ?? 0);
  return json({ total, timeline, temperature, area, price_range: price, lead_type: type, status });
};
