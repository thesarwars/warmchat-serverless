/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/**
 * GET /api/email/threads/:threadId - full message list for a thread.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const threadId = Number(params.threadId);
  if (!Number.isInteger(threadId)) return error("Invalid threadId", 400);

  const row = await queryFirst<{ org_id: number; subject: string | null; created_at: string | null }>(
    env.D1DB,
    `SELECT i.org_id, t.subject, t.created_at FROM thread t JOIN inbox i ON i.id = t.inbox_id WHERE t.id = ?`,
    threadId,
  );
  if (!row) return error("Thread not found", 404);
  if (!(await isOrgMember(env, user.id, row.org_id))) return error("Forbidden", 403);

  const messages = await queryAll(
    env.D1DB,
    `SELECT id, sender_email, to_email, subject, body, direction, attachments,
            created_at, message_date, is_read
       FROM inbox_messages WHERE thread_id = ? ORDER BY COALESCE(message_date, created_at) ASC`,
    threadId,
  );
  return json({
    thread: { id: threadId, subject: row.subject, created_at: row.created_at },
    messages,
  });
};
