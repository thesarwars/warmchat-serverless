/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { callerOrgId, isAgentKey } from "../../../../_shared/aiAgents.ts";

interface LogRow {
  id: number; event: string; lead_label: string | null;
  detail: string | null; status: string; created_at: string;
}

/**
 * GET /api/ai/agents/:agentKey/logs?limit=&offset= -> newest-first activity.
 * Same source powers the right-rail Live activity stream (smaller limit).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const agentKey = String(params.agentKey);
  if (!isAgentKey(agentKey)) return error("Unknown agent", 404);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const rows = await queryAll<LogRow>(
    env.D1DB,
    `SELECT id, event, lead_label, detail, status, created_at
       FROM ai_activity_log
      WHERE org_id = ? AND agent_key = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ? OFFSET ?`,
    orgId, agentKey, limit, offset,
  );
  return json({ logs: rows });
};
