/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../_shared/http.ts";
import { queryFirst, execute } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { callerOrgId, isAgentKey } from "../../../../_shared/aiAgents.ts";
import { AI_LIMITS, clampText } from "../../../../_shared/aiLimits.ts";

const DEFAULT_NAMES: Record<string, string> = {
  assistant: "AI Agent", inbound: "Inbound", outbound: "Outbound",
};

interface StateRow {
  agent_key: string; enabled: number; display_name: string | null;
  tone: string | null; system_prompt: string | null;
}

const ser = (key: string, r: StateRow | null) => ({
  key,
  // Inbound + Outbound are ON by default (the global master switch stays OFF, so
  // nothing sends until the workspace turns AI on - this just spares users from
  // flipping the per-agent switches). Only the Assistant defaults OFF. New orgs
  // get explicit ai_agent_state rows seeded in register.ts; this covers no-row.
  enabled: r ? Boolean(r.enabled) : key !== "assistant",
  display_name: r?.display_name || DEFAULT_NAMES[key],
  tone: r?.tone ?? null,
  system_prompt: r?.system_prompt ?? null,
});

/** GET /api/ai/agents/:agentKey -> single agent state (Persona tab). */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const agentKey = String(params.agentKey);
  if (!isAgentKey(agentKey)) return error("Unknown agent", 404);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const row = await queryFirst<StateRow>(
    env.D1DB,
    `SELECT agent_key, enabled, display_name, tone, system_prompt
       FROM ai_agent_state WHERE org_id = ? AND user_id = ? AND agent_key = ? LIMIT 1`,
    orgId, user.id, agentKey,
  );
  return json(ser(agentKey, row));
};

interface PutBody {
  enabled?: boolean; display_name?: string | null;
  tone?: string | null; system_prompt?: string | null;
}

/** PATCH /api/ai/agents/:agentKey -> upsert agent state (enable/persona/prompt/tone). */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const agentKey = String(params.agentKey);
  if (!isAgentKey(agentKey)) return error("Unknown agent", 404);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<PutBody>(request)) || {};

  // Read current row so partial updates don't clobber unspecified fields.
  const cur = await queryFirst<StateRow>(
    env.D1DB,
    `SELECT agent_key, enabled, display_name, tone, system_prompt
       FROM ai_agent_state WHERE org_id = ? AND user_id = ? AND agent_key = ? LIMIT 1`,
    orgId, user.id, agentKey,
  );
  const next = {
    enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : (cur ? cur.enabled : 0),
    display_name: body.display_name !== undefined ? clampText(body.display_name, AI_LIMITS.agentDisplayName) : (cur?.display_name ?? null),
    tone: body.tone !== undefined ? clampText(body.tone, AI_LIMITS.agentTone) : (cur?.tone ?? null),
    system_prompt: body.system_prompt !== undefined ? clampText(body.system_prompt, AI_LIMITS.agentSystemPrompt) : (cur?.system_prompt ?? null),
  };

  await execute(
    env.D1DB,
    `INSERT INTO ai_agent_state (org_id, user_id, agent_key, enabled, display_name, tone, system_prompt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id, user_id, agent_key) DO UPDATE SET
       enabled = excluded.enabled,
       display_name = excluded.display_name,
       tone = excluded.tone,
       system_prompt = excluded.system_prompt,
       updated_at = CURRENT_TIMESTAMP`,
    orgId, user.id, agentKey, next.enabled, next.display_name, next.tone, next.system_prompt,
  );

  // Inbound's enable mirrors auto_response_settings.enabled so the
  // follow-up engine respects the toggle. UPSERT (not bare UPDATE) because the
  // row may not exist yet - otherwise the toggle silently no-ops and nothing
  // ever fires.
  if (agentKey === "inbound" && body.enabled !== undefined) {
    await execute(
      env.D1DB,
      `INSERT INTO auto_response_settings (user_id, org_id, enabled)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`,
      user.id, orgId, next.enabled,
    );
  }

  return json(ser(agentKey, { agent_key: agentKey, ...next } as StateRow));
};
