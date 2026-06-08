/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

interface TaskRow {
  id: number; title: string; description: string | null; why: string | null; recommendation: string | null;
  score: string | null; score_label: string | null;
  type: string | null;
  priority: string; due_at: string | null; status: string; source: string;
  lead_id: number | null; deal_id: number | null; user_id: number;
  lead_name: string | null; owner_name: string | null; created_at: string; updated_at: string;
}

/**
 * GET /api/tasks/org/:orgId?status=open&owner=<id>&limit=&offset= -> tasks for
 * the org, newest/soonest first. Joins the lead name for display.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const m = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM membership WHERE user_id = ? AND org_id = ? LIMIT 1`, user.id, orgId);
  if (!m) return error("Forbidden", 403);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  // NB: Number(null) === 0 and Number.isInteger(0) === true, so guard on the raw
  // param being present - otherwise an absent ?owner silently filters user_id=0.
  const ownerParam = url.searchParams.get("owner");
  const owner = ownerParam != null && ownerParam !== "" ? Number(ownerParam) : NaN;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);

  const where: string[] = ["t.org_id = ?"];
  const args: unknown[] = [orgId];
  if (status) { where.push("t.status = ?"); args.push(status); }
  if (Number.isInteger(owner)) { where.push("t.user_id = ?"); args.push(owner); }

  const rows = await queryAll<TaskRow>(
    env.D1DB,
    `SELECT t.id, t.title, t.description, t.why, t.recommendation, t.score, t.score_label, t.type, t.priority, t.due_at, t.status, t.source,
            t.lead_id, t.deal_id, t.user_id, t.created_at, t.updated_at,
            l.name AS lead_name, u.name AS owner_name
       FROM task t
       LEFT JOIN lead l ON l.id = t.lead_id
       LEFT JOIN "user" u ON u.id = t.user_id
      WHERE ${where.join(" AND ")}
      ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, datetime(t.due_at) ASC, t.id DESC
      LIMIT ?`,
    ...args, limit,
  );
  return json({ tasks: rows });
};
