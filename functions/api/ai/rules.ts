/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { callerOrgId } from "../../_shared/aiAgents.ts";
import { AI_LIMITS, cleanStrList } from "../../_shared/aiLimits.ts";

/**
 * GET / PATCH /api/ai/rules - the inbound agent's brand + escalation rules,
 * stored on auto_response_settings (one row per user):
 *   - always_say          : phrases the AI should mention when relevant
 *   - never_say           : phrases the AI must never use
 *   - escalation_keywords : if an inbound message matches one of these, the
 *                           lead is escalated to the human agent (matched in
 *                           inboundProcessing.ts - these actually fire now).
 * All three are stored as JSON arrays of strings. Fed into the system prompt by
 * buildAgentSystemPrompt; escalation_keywords also drive a deterministic guard.
 */
interface RulesRow { always_say: string | null; never_say: string | null; escalation_keywords: string | null; escalate_no_listings: number }

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.map((x) => String(x)); } catch { /* legacy CSV */ }
  return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
}
function cleanList(v: unknown): string[] {
  return cleanStrList(v, AI_LIMITS.ruleMaxItems, AI_LIMITS.ruleItem);
}
const serialize = (r: RulesRow | null) => ({
  always_say: parseList(r?.always_say),
  never_say: parseList(r?.never_say),
  escalation_keywords: parseList(r?.escalation_keywords),
  // Default ON: a brand-new settings row (or none yet) escalates when listings/
  // pricing come up and there is no inventory.
  escalate_no_listings: r ? r.escalate_no_listings === 1 : true,
});

async function read(env: Env, userId: number, orgId: number): Promise<RulesRow | null> {
  return queryFirst<RulesRow>(
    env.D1DB,
    `SELECT always_say, never_say, escalation_keywords, escalate_no_listings FROM auto_response_settings WHERE user_id = ? AND org_id = ? LIMIT 1`,
    userId, orgId,
  );
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);
  return json(serialize(await read(env, user.id, orgId)));
};

interface Body { always_say?: string[]; never_say?: string[]; escalation_keywords?: string[]; escalate_no_listings?: boolean }

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<Body>(request)) || {};
  // Ensure the settings row exists (one per user) before updating.
  await execute(
    env.D1DB,
    `INSERT INTO auto_response_settings (user_id, org_id, created_at, updated_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING`,
    user.id, orgId, nowIso(), nowIso(),
  );

  const sets: string[] = [];
  const args: unknown[] = [];
  if ("always_say" in body) { sets.push("always_say = ?"); args.push(JSON.stringify(cleanList(body.always_say))); }
  if ("never_say" in body) { sets.push("never_say = ?"); args.push(JSON.stringify(cleanList(body.never_say))); }
  if ("escalation_keywords" in body) { sets.push("escalation_keywords = ?"); args.push(JSON.stringify(cleanList(body.escalation_keywords))); }
  if ("escalate_no_listings" in body) { sets.push("escalate_no_listings = ?"); args.push(body.escalate_no_listings ? 1 : 0); }
  if (sets.length) {
    await execute(
      env.D1DB,
      `UPDATE auto_response_settings SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND org_id = ?`,
      ...args, user.id, orgId,
    );
  }
  return json(serialize(await read(env, user.id, orgId)));
};
