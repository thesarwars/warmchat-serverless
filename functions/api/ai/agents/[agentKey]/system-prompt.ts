/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { callerOrgId, isAgentKey, buildAgentSystemPrompt } from "../../../../_shared/aiAgents.ts";

/**
 * GET /api/ai/agents/:agentKey/system-prompt -> the fully assembled system
 * prompt this agent runs with (base rules + role + knowledge profile + persona +
 * FAQs + always/never rules + availability). For transparency/debugging - the
 * Test AI panel shows it so the user can see exactly what the model is told.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const agentKey = String(params.agentKey);
  if (!isAgentKey(agentKey)) return error("Unknown agent", 404);
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const prompt = await buildAgentSystemPrompt(env, orgId, user.id, agentKey);
  return json({ prompt });
};
