/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { callerOrgId, AGENT_KEYS } from "../../../_shared/aiAgents.ts";

const DEFAULT_NAMES: Record<string, string> = {
  assistant: "AI Agent",
  inbound: "Inbound",
  outbound: "Outbound",
};

interface StateRow { agent_key: string; enabled: number; display_name: string | null }

/**
 * GET /api/ai/agents -> the three agents' on/off state, the workspace master
 * switch, and a light per-agent activity count (today + last 24h + errors)
 * used for the stat strip. Rows are lazily defaulted if missing so a fresh
 * org still renders all three agents.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const states = await queryAll<StateRow>(
    env.D1DB,
    `SELECT agent_key, enabled, display_name FROM ai_agent_state WHERE org_id = ? AND user_id = ?`,
    orgId, user.id,
  );
  const byKey = new Map(states.map((s) => [s.agent_key, s]));

  const startOfDay = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); })();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const agents = await Promise.all(AGENT_KEYS.map(async (key) => {
    const s = byKey.get(key);
    const today = await queryFirst<{ n: number }>(
      env.D1DB,
      `SELECT COUNT(*) AS n FROM ai_activity_log
        WHERE org_id = ? AND agent_key = ? AND datetime(created_at) >= datetime(?)`,
      orgId, key, startOfDay,
    );
    const errors = await queryFirst<{ n: number }>(
      env.D1DB,
      `SELECT COUNT(*) AS n FROM ai_activity_log
        WHERE org_id = ? AND agent_key = ? AND status = 'error' AND datetime(created_at) >= datetime(?)`,
      orgId, key, dayAgo,
    );
    return {
      key,
      name: s?.display_name || DEFAULT_NAMES[key],
      // Inbound + Outbound default ON (the master switch stays OFF, so nothing
      // sends until AI is turned on); only the Assistant defaults OFF. Registered
      // + seeded users get explicit rows; this default covers legacy/no-row orgs.
      enabled: s ? Boolean(s.enabled) : key !== "assistant",
      activity_today: Number(today?.n ?? 0),
      errors_24h: Number(errors?.n ?? 0),
    };
  }));

  const master = await queryFirst<{ value: string }>(
    env.D1DB, `SELECT value FROM app_settings WHERE org_id = ? AND key = 'ai_master_enabled'`, orgId);

  // Per-org monthly AI usage -> real cost estimate (no stub numbers).
  const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const usageRow = await queryFirst<{ ai_requests: number }>(
    env.D1DB, `SELECT ai_requests FROM usage WHERE org_id = ? AND month = ?`, orgId, month);
  const aiRequests = Number(usageRow?.ai_requests ?? 0);
  const AI_UNIT_COST = 0.0015; // gpt-4o-mini ballpark per request

  return json({
    master_enabled: master ? master.value === "1" : false,
    ai_requests_month: aiRequests,
    ai_cost_month: +(aiRequests * AI_UNIT_COST).toFixed(2),
    agents,
  });
};
