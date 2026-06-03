/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst, queryAll } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isOrgMember } from "../../_shared/orgAccess.ts";

/**
 * GET /api/conversations/:id - one SMS conversation with its messages.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  const conv = await queryFirst<{
    id: number; org_id: number; contact_id: number; last_message_at: string | null;
    name: string | null; phone_number_e164: string; opt_in_status: string;
  }>(
    env.D1DB,
    `SELECT c.id, c.org_id, c.contact_id, c.last_message_at,
            sc.name, sc.phone_number_e164, sc.opt_in_status
       FROM sms_conversation c JOIN sms_contact sc ON c.contact_id=sc.id WHERE c.id = ?`,
    id,
  );
  if (!conv) return error("Conversation not found", 404);
  if (!(await isOrgMember(env, user.id, conv.org_id))) return error("Forbidden", 403);

  const messages = await queryAll<{
    id: number; direction: string; body: string; status: string;
    provider_message_sid: string | null; error_code: string | null;
    created_at: string; sent_at: string | null; delivered_at: string | null; is_read: number;
  }>(
    env.D1DB,
    `SELECT id, direction, body, status, provider_message_sid, error_code,
            created_at, sent_at, delivered_at, is_read
       FROM sms_message WHERE conversation_id = ? ORDER BY created_at ASC`,
    id,
  );

  return json({
    id: conv.id,
    contact: {
      id: conv.contact_id, name: conv.name,
      phone_number_e164: conv.phone_number_e164,
      opt_in_status: conv.opt_in_status,
    },
    last_message_at: conv.last_message_at,
    messages: messages.map((m) => ({ ...m, is_read: Boolean(m.is_read) })),
  });
};
