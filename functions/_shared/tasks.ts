/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { execute } from "./db.ts";

/** Shared task creation - used by POST /api/tasks AND the AI agent's create_task tool. */
export interface CreateTaskInput {
  orgId: number;
  userId: number;            // owner / assignee
  title: string;
  description?: string | null;
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
       (org_id, user_id, lead_id, deal_id, title, description, type, priority, due_at, status, source, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    input.orgId, input.userId, input.leadId ?? null, input.dealId ?? null,
    input.title, input.description ?? null, input.type ?? null,
    input.priority ?? "normal", input.dueAt ?? null, input.source ?? "manual",
    input.createdByUserId ?? input.userId,
  );
  return Number(ins.meta.last_row_id);
}
