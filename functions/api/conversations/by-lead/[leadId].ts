/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/** GET /api/conversations/by-lead/:leadId - SMS conversation for a lead's phone. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const leadId = Number(params.leadId);
  if (!Number.isInteger(leadId)) return error("Invalid lead id", 400);

  const lead = await queryFirst<{ phone: string | null; org_id: number | null }>(
    env.D1DB, `SELECT phone, org_id FROM lead WHERE id = ?`, leadId);
  if (!lead) return error("Lead not found", 404);
  if (!lead.org_id || !(await isOrgMember(env, user.id, lead.org_id))) {
    return error("Forbidden", 403);
  }
  if (!lead.phone) return json({ conversation: null, messages: [] });

  const conv = await queryFirst<{ id: number; last_message_at: string | null; contact_id: number }>(
    env.D1DB,
    `SELECT c.id, c.last_message_at, c.contact_id FROM sms_conversation c
       JOIN sms_contact sc ON c.contact_id=sc.id
      WHERE c.org_id = ? AND sc.phone_number_e164 = ? LIMIT 1`,
    lead.org_id, lead.phone,
  );
  if (!conv) return json({ conversation: null, messages: [] });

  const messages = await queryAll<{
    id: number; direction: string; body: string; status: string;
    created_at: string; sent_at: string | null; delivered_at: string | null;
  }>(
    env.D1DB,
    `SELECT id, direction, body, status, created_at, sent_at, delivered_at
       FROM sms_message WHERE conversation_id = ? ORDER BY created_at ASC`,
    conv.id,
  );
  return json({ conversation: { id: conv.id, last_message_at: conv.last_message_at }, messages });
};
