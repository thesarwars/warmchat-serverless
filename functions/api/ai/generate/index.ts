/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { generateWithOpenAI } from "../../../_shared/openai.ts";
import { checkUsageLimit, getOrgPlan } from "../../../_shared/usageCounter.ts";
import { notifyQuotaExceeded } from "../../../_shared/quotaNotify.ts";
import { queryFirst } from "../../../_shared/db.ts";

/** POST /api/ai/generate - single-shot text generation. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ prompt?: string; system?: string }>(request);
  const prompt = (body?.prompt || "").trim();
  if (!prompt) return error("prompt is required", 400);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (m) {
    const plan = await getOrgPlan(env, m.org_id);
    if (!(await checkUsageLimit(env, m.org_id, plan, "ai", 1))) {
      await notifyQuotaExceeded(env, m.org_id, "ai");
      return error("Monthly AI limit reached for your plan", 403);
    }
  }

  try {
    const out = await generateWithOpenAI(env, body?.system || "You are a helpful assistant.", prompt, {
      orgId: m?.org_id ?? null,
    });
    return json({ text: out.text });
  } catch (e) {
    return error((e as Error).message, 502);
  }
};
