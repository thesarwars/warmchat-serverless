/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll, queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/conversations - SMS conversations for the caller's org.
 * Returns: { items: [{id, contact:{...}, last_message_at, last_body, unread_count}] }
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id=? LIMIT 1`, user.id);
  if (!m) return error("Forbidden", 403);

  const rows = await queryAll<{
    id: number; contact_id: number; last_message_at: string | null;
    name: string | null; phone_number_e164: string; opt_in_status: string;
    last_body: string | null; unread_count: number;
  }>(
    env.D1DB,
    `SELECT c.id, c.contact_id, c.last_message_at,
            sc.name, sc.phone_number_e164, sc.opt_in_status,
            (SELECT body FROM sms_message m WHERE m.conversation_id=c.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_body,
            (SELECT COUNT(*) FROM sms_message m
              WHERE m.conversation_id=c.id AND m.direction='inbound' AND m.is_read=0) AS unread_count
       FROM sms_conversation c JOIN sms_contact sc ON c.contact_id=sc.id
      WHERE c.org_id = ?
      ORDER BY c.last_message_at DESC, c.id DESC`,
    m.org_id,
  );

  return json({
    items: rows.map((r) => ({
      id: r.id,
      contact: {
        id: r.contact_id, name: r.name,
        phone_number_e164: r.phone_number_e164,
        opt_in_status: r.opt_in_status,
      },
      last_message_at: r.last_message_at,
      last_body: r.last_body,
      unread_count: r.unread_count,
    })),
  });
};
