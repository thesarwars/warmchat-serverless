/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

interface Row {
  id: number; kind: string; channel: string | null; contact_id: number | null;
  conversation_id: number | null; title: string; body: string | null;
  is_read: number; read_at: string | null; created_at: string | null;
}

/** POST /api/notifications/:id/read - mark one notification read; returns it. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  const row = await queryFirst<Row>(
    env.D1DB, `SELECT * FROM notification WHERE id = ? AND user_id = ?`, id, user.id);
  if (!row) return error("Not found", 404);

  if (!row.is_read) {
    await execute(env.D1DB, `UPDATE notification SET is_read = 1, read_at = ? WHERE id = ?`, nowIso(), id);
    row.is_read = 1;
    row.read_at = nowIso();
  }
  return json({
    id: row.id, kind: row.kind, channel: row.channel, contact_id: row.contact_id,
    conversation_id: row.conversation_id, title: row.title, body: row.body,
    is_read: Boolean(row.is_read), read_at: row.read_at, created_at: row.created_at,
  });
};
