/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { generateWithOpenAI } from "../../../_shared/openai.ts";
import { queryFirst } from "../../../_shared/db.ts";

/** POST /api/ai/generate/template - generate a templated message with placeholders. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ purpose?: string; tone?: string; channel?: string }>(request);
  const purpose = (body?.purpose || "").trim();
  if (!purpose) return error("purpose is required", 400);
  const system = `Generate a ${body?.channel || "email"} message template using {first_name}, {agent_name}, {area} placeholders. Tone: ${body?.tone || "friendly"}.`;
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  const orgId = m?.org_id ?? null;
  try {
    const out = await generateWithOpenAI(env, system, purpose, { orgId });
    return json({ text: out.text });
  } catch (e) { return error((e as Error).message, 502); }
};
