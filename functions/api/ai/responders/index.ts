/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { callerOrgId } from "../../../_shared/aiAgents.ts";
import { AI_LIMITS, clampText } from "../../../_shared/aiLimits.ts";

/**
 * GET / POST /api/ai/responders - custom inbound auto-responders for the caller
 * (org + user). Shown as cards in the inbound Workflows tab; injected into the
 * inbound system prompt so the AI applies them when an inbound message matches.
 */
interface Row {
  id: number; name: string; trigger_label: string | null; keywords: string | null;
  tone: string | null; message: string; enabled: number;
  created_at: string | null; updated_at: string | null;
}
const ser = (r: Row) => ({
  id: r.id, name: r.name, trigger: r.trigger_label, keywords: r.keywords,
  tone: r.tone, message: r.message, enabled: Boolean(r.enabled),
  created_at: r.created_at, updated_at: r.updated_at,
});

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const rows = await queryAll<Row>(
    env.D1DB,
    `SELECT id, name, trigger_label, keywords, tone, message, enabled, created_at, updated_at
       FROM inbound_responder WHERE org_id = ? AND user_id = ? ORDER BY id DESC`,
    orgId, user.id,
  );
  return json({ responders: rows.map(ser) });
};

interface CreateBody {
  name?: string; trigger?: string | null; keywords?: string | null;
  tone?: string | null; message?: string; enabled?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<CreateBody>(request)) || {};
  const name = clampText(body.name, AI_LIMITS.responderName);
  const message = clampText(body.message, AI_LIMITS.responderMessage);
  if (!name) return error("name is required", 400);
  if (!message) return error("message is required", 400);

  // Cap how many responders an agent can create (each one bloats the prompt).
  const countRow = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(*) AS n FROM inbound_responder WHERE org_id = ? AND user_id = ?`, orgId, user.id);
  if ((countRow?.n ?? 0) >= AI_LIMITS.responderMaxCount) {
    return error(`You can have at most ${AI_LIMITS.responderMaxCount} auto-responses. Delete some before adding more.`, 400);
  }

  const ins = await execute(
    env.D1DB,
    `INSERT INTO inbound_responder (org_id, user_id, name, trigger_label, keywords, tone, message, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    orgId, user.id, name, clampText(body.trigger, AI_LIMITS.responderTrigger), clampText(body.keywords, AI_LIMITS.responderKeywords),
    clampText(body.tone, AI_LIMITS.responderTone), message, body.enabled === false ? 0 : 1,
  );
  const row = await queryFirst<Row>(env.D1DB, `SELECT id, name, trigger_label, keywords, tone, message, enabled, created_at, updated_at FROM inbound_responder WHERE id = ?`, Number(ins.meta.last_row_id));
  return json(ser(row!), 201);
};
