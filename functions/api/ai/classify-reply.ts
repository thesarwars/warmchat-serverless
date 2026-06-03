/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { queryFirst } from "../../_shared/db.ts";
import { classifyReplyText } from "../../_shared/intentClassifier.ts";
import { incrementUsage } from "../../_shared/usageCounter.ts";

/**
 * POST /api/ai/classify-reply
 *
 * Body: { leadId?: number, text: string }
 * Returns the structured classification result (see ClassifyResult). The
 * qualification state machine calls the same classifier directly; this
 * endpoint exposes it for the UI/diagnostics so an agent can preview what the
 * model would say about a reply without triggering a send.
 *
 * Auth: requires a signed-in user; if leadId is given, the lead must belong
 * to the user's org.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ leadId?: number; text?: string }>(request);
  const text = (body?.text || "").trim();
  if (!text) return error("text is required", 400);

  let leadType: string | null = null;
  if (body?.leadId) {
    const lead = await queryFirst<{ org_id: number; lead_type: string | null }>(
      env.D1DB,
      `SELECT org_id, lead_type FROM lead WHERE id = ?`,
      body.leadId,
    );
    if (!lead) return error("Lead not found", 404);
    const membership = await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM membership WHERE user_id = ? AND org_id = ? LIMIT 1`,
      user.id, lead.org_id,
    );
    if (!membership) return error("Forbidden", 403);
    leadType = lead.lead_type;
  }

  const result = await classifyReplyText(env, text, leadType);

  // Count this toward the org's monthly AI usage. classifyReplyText only hits
  // OpenAI when the cheap keyword pass is inconclusive AND the reply is
  // non-trivial (see intentClassifier.classifyReplyText), so we mirror that
  // gate here to avoid counting requests that never reached the model. orgId is
  // resolved the same way the other /ai endpoints resolve it.
  if (env.OPENAI_API_KEY && text.length > 5) {
    const m = await queryFirst<{ org_id: number }>(
      env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
    );
    if (m) {
      try { await incrementUsage(env, m.org_id, "ai", 1); } catch { /* non-fatal */ }
    }
  }

  return json(result);
};
