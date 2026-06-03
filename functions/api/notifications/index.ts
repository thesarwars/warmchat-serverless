/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

interface Row {
  id: number; kind: string; channel: string | null; contact_id: number | null;
  conversation_id: number | null; appointment_id: number | null;
  severity: string; title: string; body: string | null; data: string | null;
  is_read: number; read_at: string | null; created_at: string | null;
}

const toDict = (r: Row) => ({
  id: r.id, kind: r.kind, channel: r.channel, contact_id: r.contact_id,
  conversation_id: r.conversation_id, appointment_id: r.appointment_id,
  severity: r.severity || "info",
  title: r.title, body: r.body,
  data: (() => {
    if (!r.data) return null;
    try { return JSON.parse(r.data); } catch { return null; }
  })(),
  is_read: Boolean(r.is_read), read_at: r.read_at, created_at: r.created_at,
});

/**
 * GET /api/notifications - current user's notifications.
 * `?unread_only`, `?limit` (1-100, default 25), `?cursor` (id < cursor).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const url = new URL(request.url);
  const unreadOnly = ["1", "true", "yes"].includes((url.searchParams.get("unread_only") || "").toLowerCase());
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 25, 100));
  const cursor = Number(url.searchParams.get("cursor")) || 0;

  const rows = await queryAll<Row>(
    env.D1DB,
    `SELECT id, kind, channel, contact_id, conversation_id, appointment_id,
            severity, title, body, data, is_read, read_at, created_at
       FROM notification
      WHERE user_id = ?
        ${unreadOnly ? "AND is_read = 0" : ""}
        ${cursor ? "AND id < ?" : ""}
      ORDER BY id DESC LIMIT ?`,
    ...(cursor ? [user.id, cursor, limit] : [user.id, limit]),
  );

  const nextCursor = rows.length === limit ? String(rows[rows.length - 1]!.id) : null;
  return json({ items: rows.map(toDict), next_cursor: nextCursor });
};
