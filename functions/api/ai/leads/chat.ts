/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { generateWithOpenAI, buildLeadAssistantSystemPrompt } from "../../../_shared/openai.ts";
import { queryFirst } from "../../../_shared/db.ts";

/** POST /api/ai/leads/chat - natural-language lead query. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ question?: string }>(request);
  const q = (body?.question || "").trim();
  if (!q) return error("question is required", 400);
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  const orgId = m?.org_id ?? null;
  try {
    const out = await generateWithOpenAI(env, buildLeadAssistantSystemPrompt(), q, { orgId });
    return json({ text: out.text });
  } catch (e) { return error((e as Error).message, 502); }
};
