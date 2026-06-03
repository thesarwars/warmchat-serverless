/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryFirst, queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { canAccessCall } from "../../../../_shared/callingAccess.ts";

/**
 * GET /api/calling/calls/:callId/insights - the detail panel's AI block:
 * transcript/summary/sentiment/intent/budget + AI-detected next steps (tasks)
 * + manual notes. Returns nulls/empties while the async pipeline is still
 * PENDING (never fabricated).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const callId = String(params.callId || "");
  if (!callId) return error("callId is required", 400);
  if (!(await canAccessCall(env, user.id, callId))) return error("Forbidden", 403);

  const insight = await queryFirst<{
    transcript: string | null; summary: string | null; sentiment: string | null;
    intent: string | null; budget_min: number | null; budget_max: number | null;
    status: string;
  }>(
    env.D1DB,
    `SELECT transcript, summary, sentiment, intent, budget_min, budget_max, status
       FROM call_ai_insights WHERE call_id = ?`,
    callId,
  );

  const tasks = await queryAll<{ id: string; type: string; label: string; done: number }>(
    env.D1DB,
    `SELECT id, type, label, done FROM call_tasks WHERE call_id = ? ORDER BY created_at ASC`,
    callId,
  );

  const notes = await queryAll<{ id: string; body: string; author_id: number; author_name: string | null; created_at: string }>(
    env.D1DB,
    `SELECT n.id, n.body, n.author_id, u.name AS author_name, n.created_at
       FROM call_notes n LEFT JOIN "user" u ON u.id = n.author_id
      WHERE n.call_id = ? ORDER BY n.created_at DESC`,
    callId,
  );

  return json({
    insight: insight
      ? {
          status: insight.status,
          transcript: insight.transcript,
          summary: insight.summary,
          sentiment: insight.sentiment,
          intent: insight.intent,
          budgetMin: insight.budget_min,
          budgetMax: insight.budget_max,
        }
      : null,
    tasks: tasks.map((t) => ({ id: t.id, type: t.type, label: t.label, done: t.done === 1 })),
    notes: notes.map((n) => ({
      id: n.id, body: n.body, authorId: String(n.author_id),
      authorName: n.author_name ?? null, createdAt: n.created_at,
    })),
  });
};
