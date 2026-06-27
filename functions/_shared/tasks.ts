/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { execute } from "./db.ts";

/** Shared task creation - used by POST /api/tasks AND the AI agent's create_task tool. */
export interface CreateTaskInput {
  orgId: number;
  userId: number;            // owner / assignee
  title: string;
  description?: string | null;
  /** AI Recommended card: why this task matters / the conversion opportunity. */
  why?: string | null;
  /** AI Recommended card: the recommended next action. */
  recommendation?: string | null;
  /** AI Recommended card: conversion score (e.g. "92%" / "+87%"). */
  score?: string | null;
  /** AI Recommended card: caption for the score (e.g. "Likely to convert"). */
  scoreLabel?: string | null;
  type?: string | null;
  priority?: string | null;  // low | normal | high | urgent
  dueAt?: string | null;
  leadId?: number | null;
  dealId?: number | null;
  source?: "manual" | "ai";
  createdByUserId?: number | null;
}

export async function createTask(env: Env, input: CreateTaskInput): Promise<number> {
  const ins = await execute(
    env.D1DB,
    `INSERT INTO task
       (org_id, user_id, lead_id, deal_id, title, description, why, recommendation, score, score_label, type, priority, due_at, status, source, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    input.orgId, input.userId, input.leadId ?? null, input.dealId ?? null,
    input.title, input.description ?? null, input.why ?? null, input.recommendation ?? null,
    input.score ?? null, input.scoreLabel ?? null,
    input.type ?? null, input.priority ?? "normal", input.dueAt ?? null, input.source ?? "manual",
    input.createdByUserId ?? input.userId,
  );
  return Number(ins.meta.last_row_id);
}

/**
 * Auto-complete a lead's OPEN tasks of the given type(s) when AI/CRM has
 * confidently determined the underlying action happened (lead replied, call
 * completed, appointment booked, follow-up sent...). Mirrors the only task
 * mutation (api/tasks/[id].ts: UPDATE task SET status='done', updated_at=...),
 * bypassing the auth-gated HTTP PATCH since callers are server-side event
 * handlers with no user in scope.
 *
 * Idempotent (the status='open' predicate makes a re-run a no-op) and
 * best-effort: it NEVER throws, so it can't break the webhook/reply/send path.
 * Returns the number of tasks closed. Callers should only invoke this on a
 * deterministic, terminal signal - low-confidence cases must leave tasks open.
 */
export async function autoCompleteLeadTasks(
  env: Env,
  input: { leadId: number | null | undefined; types: string[]; reason: string; orgId?: number | null | undefined },
): Promise<number> {
  try {
    if (!input.leadId || !input.types.length) return 0;
    const placeholders = input.types.map(() => "?").join(", ");
    const args: unknown[] = [input.leadId, ...input.types];
    let orgClause = "";
    if (input.orgId != null) { orgClause = " AND org_id = ?"; args.push(input.orgId); }
    const res = await execute(
      env.D1DB,
      `UPDATE task SET status = 'done', updated_at = CURRENT_TIMESTAMP
        WHERE lead_id = ? AND status = 'open' AND type IN (${placeholders})${orgClause}`,
      ...args,
    );
    const n = Number(res.meta?.changes ?? 0);
    if (n > 0) console.log(`[task] auto-completed ${n} task(s) for lead ${input.leadId} - ${input.reason}`);
    return n;
  } catch {
    return 0;
  }
}
