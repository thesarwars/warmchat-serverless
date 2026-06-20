/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { generateWithOpenAI } from "../../../_shared/openai.ts";
import { humanizeDashes } from "../../../_shared/humanizeText.ts";
import { callerOrgId, buildAgentSystemPrompt, logAgentActivity } from "../../../_shared/aiAgents.ts";

/** POST /api/ai/generate/reply - draft a reply given a thread excerpt. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ conversation?: string; tone?: string; intent?: string }>(request);
  const convo = (body?.conversation || "").trim();
  if (!convo) return error("conversation is required", 400);

  // Layer the agent's structured profile/persona under the task instruction so
  // drafts pull from real facts (brokerage, areas, commission) instead of guessing.
  const orgId = await callerOrgId(env, user.id);
  const base = orgId ? await buildAgentSystemPrompt(env, orgId, user.id, "assistant") : "";
  const system = `${base}

TASK: Write a short, helpful reply draft for the agent to review.
Tone: ${body?.tone || "friendly, professional"}. Intent: ${body?.intent || "respond and propose next step"}.`;

  try {
    const out = await generateWithOpenAI(env, system, convo, { orgId });
    if (orgId) {
      await logAgentActivity(env, {
        orgId, userId: user.id, agentKey: "assistant",
        event: "reply.drafted", detail: "Drafted reply from conversation", status: "ok",
      });
    }
    return json({ text: humanizeDashes(out.text) });
  } catch (e) { return error((e as Error).message, 502); }
};
