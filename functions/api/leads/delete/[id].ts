/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { normalizedPhoneSql } from "../../../_shared/smsCompliance.ts";

/**
 * DELETE /api/leads/delete/:id - remove a lead + cleanup tag mappings and
 * orphan tags.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid lead id", 400);

  const lead = await queryFirst<{ org_id: number | null }>(
    env.D1DB, `SELECT org_id FROM lead WHERE id = ?`, id);
  if (!lead) return error("Lead not found", 404);
  if (lead.org_id && !(await isOrgMember(env, user.id, lead.org_id))) {
    return error("Forbidden", 403);
  }

  // Purge the lead's conversation HISTORY (so a re-import of the same number
  // starts clean) but keep sms_contact (the opt-out record) - a STOP must never be
  // forgotten. Runs before the lead delete (joins lead by phone).
  const convSubq = `SELECT c.id FROM sms_conversation c
      JOIN sms_contact sc ON sc.id = c.contact_id
      JOIN lead l ON l.org_id = c.org_id AND l.phone IS NOT NULL
        AND ${normalizedPhoneSql("sc.phone_number_e164")} = ${normalizedPhoneSql("l.phone")}
     WHERE l.id = ?`;
  await execute(env.D1DB, `DELETE FROM sms_message WHERE conversation_id IN (${convSubq})`, id);
  await execute(env.D1DB, `DELETE FROM sms_conversation WHERE id IN (${convSubq})`, id);
  await execute(env.D1DB, `DELETE FROM inbox_messages WHERE lead_id = ?`, id);
  await execute(env.D1DB, `DELETE FROM thread_lead_assignments WHERE lead_id = ?`, id);
  await execute(env.D1DB, `DELETE FROM lead_appointment WHERE lead_id = ?`, id);
  await execute(env.D1DB, `DELETE FROM lead_tags WHERE lead_id = ?`, id);
  await execute(env.D1DB, `UPDATE calls SET lead_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE lead_id = ?`, id);
  await execute(env.D1DB, `DELETE FROM lead WHERE id = ?`, id);
  // Drop orphan tags (no remaining lead_tags references).
  await execute(env.D1DB,
    `DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM lead_tags)`);

  return json({ message: "Lead and its orphan tags deleted successfully" });
};
