/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { createTask } from "../../_shared/tasks.ts";

interface Body {
  org_id?: number;
  title?: string;
  description?: string | null;
  why?: string | null;
  recommendation?: string | null;
  score?: string | null;
  score_label?: string | null;
  type?: string | null;
  priority?: string | null;
  due_at?: string | null;
  lead_id?: number | null;
  deal_id?: number | null;
  assigned_to?: number | null;
}

/** POST /api/tasks - create a task in an org the caller belongs to. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<Body>(request)) || {};
  const title = (body.title || "").trim();
  if (!title) return error("title is required", 400);

  // Resolve org: explicit org_id (validated) or the caller's first membership.
  let orgId = Number(body.org_id);
  if (Number.isInteger(orgId)) {
    const m = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM membership WHERE user_id = ? AND org_id = ? LIMIT 1`, user.id, orgId);
    if (!m) return error("Forbidden", 403);
  } else {
    const m = await queryFirst<{ org_id: number }>(
      env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id);
    if (!m) return error("Forbidden", 403);
    orgId = m.org_id;
  }

  const ownerId = Number.isInteger(Number(body.assigned_to)) ? Number(body.assigned_to) : user.id;
  const id = await createTask(env, {
    orgId, userId: ownerId, title,
    description: body.description ?? null, why: body.why ?? null, recommendation: body.recommendation ?? null,
    score: body.score ?? null, scoreLabel: body.score_label ?? null,
    type: body.type ?? null,
    priority: body.priority ?? "normal", dueAt: body.due_at ?? null,
    leadId: body.lead_id ?? null, dealId: body.deal_id ?? null,
    source: "manual", createdByUserId: user.id,
  });
  return json({ id }, 201);
};
