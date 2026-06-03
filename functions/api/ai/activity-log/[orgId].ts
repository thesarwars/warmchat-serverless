/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/**
 * GET /api/ai/activity-log/:orgId?agent=&event=&limit= -> combined AI activity
 * across all agents (newest first). Powers the AI Agent Overview "Live
 * activity" + the Activity Feed tab.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const url = new URL(request.url);
  const agent = url.searchParams.get("agent");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 100);
  const where = ["org_id = ?"];
  const args: unknown[] = [orgId];
  if (agent) { where.push("agent_key = ?"); args.push(agent); }

  const rows = await queryAll<{
    id: number; agent_key: string; event: string; lead_id: number | null;
    lead_label: string | null; detail: string | null; status: string; created_at: string;
  }>(
    env.D1DB,
    `SELECT id, agent_key, event, lead_id, lead_label, detail, status, created_at
       FROM ai_activity_log WHERE ${where.join(" AND ")}
      ORDER BY datetime(created_at) DESC, id DESC LIMIT ?`,
    ...args, limit,
  );
  return json({ events: rows });
};
