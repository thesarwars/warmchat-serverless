/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { normalizedPhoneSql } from "../../../_shared/smsCompliance.ts";

/**
 * D1 rejects a statement with too many bound parameters (the practical cap is
 * 100 per query - a 500-id `WHERE id IN (?,?,...)` returns a 500). Every
 * id-list query below is therefore run in chunks of this size. Keep the caller
 * batching too (see Leads.tsx) so a single request never grows unbounded.
 */
const CHUNK = 90;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * POST /api/leads/delete
 * Body: { ids: number[] }
 *
 * Bulk-deletes leads and their related records. Queries are chunked to stay
 * under D1's bound-parameter limit, so any batch size is handled.
 * The frontend falls back to DELETE /api/leads/delete/:id if this endpoint
 * is unavailable, but that path is O(n) and extremely slow for large batches.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ ids?: unknown }>(request);
  const raw = body?.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return error("ids must be a non-empty array", 400);
  }

  const ids = [...new Set(
    raw.map(Number).filter((n) => Number.isInteger(n) && n > 0),
  )];
  if (ids.length === 0) return error("No valid lead ids provided", 400);

  // Verify all requested leads exist and belong to an org the caller can access.
  const found: { id: number; org_id: number | null }[] = [];
  for (const part of chunk(ids, CHUNK)) {
    const placeholders = part.map(() => "?").join(",");
    const rows = await env.D1DB.prepare(
      `SELECT id, org_id FROM lead WHERE id IN (${placeholders})`,
    ).bind(...part).all<{ id: number; org_id: number | null }>();
    found.push(...(rows.results ?? []));
  }

  const notFound = new Set(ids);
  for (const l of found) notFound.delete(l.id);

  // Check membership once per distinct org rather than once per lead.
  const orgIds = [...new Set(found.map((l) => l.org_id).filter((o): o is number => !!o))];
  for (const orgId of orgIds) {
    if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);
  }

  const deletable = ids.filter((id) => !notFound.has(id));
  if (deletable.length === 0) {
    return json({ message: "No leads found", deleted: 0, deleted_ids: [], failed: [] });
  }

  // Clean up related rows then delete the leads themselves, chunk by chunk.
  // The conversation purge runs BEFORE the lead delete (it joins lead by phone to
  // find the SMS conversations). It removes the message HISTORY so a re-import of
  // the same number starts clean, but DELIBERATELY keeps sms_contact (the opt-out
  // record) so a STOP is never forgotten - re-importing a number that opted out
  // must stay suppressed (compliance).
  for (const part of chunk(deletable, CHUNK)) {
    const dp = part.map(() => "?").join(",");
    // SMS history: delete the messages then the conversations whose contact phone
    // matches a deleted lead's phone (last-10), keeping sms_contact itself.
    const convSubq = `SELECT c.id FROM sms_conversation c
        JOIN sms_contact sc ON sc.id = c.contact_id
        JOIN lead l ON l.org_id = c.org_id AND l.phone IS NOT NULL
          AND ${normalizedPhoneSql("sc.phone_number_e164")} = ${normalizedPhoneSql("l.phone")}
       WHERE l.id IN (${dp})`;
    await execute(env.D1DB, `DELETE FROM sms_message WHERE conversation_id IN (${convSubq})`, ...part);
    await execute(env.D1DB, `DELETE FROM sms_conversation WHERE id IN (${convSubq})`, ...part);
    // Email history keyed directly by lead_id.
    await execute(env.D1DB, `DELETE FROM inbox_messages WHERE lead_id IN (${dp})`, ...part);
    await execute(env.D1DB, `DELETE FROM thread_lead_assignments WHERE lead_id IN (${dp})`, ...part);
    await execute(env.D1DB, `DELETE FROM lead_appointment WHERE lead_id IN (${dp})`, ...part);
    await execute(env.D1DB, `DELETE FROM lead_tags WHERE lead_id IN (${dp})`, ...part);
    await execute(env.D1DB, `UPDATE calls SET lead_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE lead_id IN (${dp})`, ...part);
    await execute(env.D1DB, `DELETE FROM lead WHERE id IN (${dp})`, ...part);
  }
  // Drop tags that no longer reference any lead.
  await execute(env.D1DB, `DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM lead_tags)`);

  return json({
    message: deletable.length === 1
      ? "Lead deleted successfully"
      : `${deletable.length} leads deleted successfully`,
    deleted: deletable.length,
    deleted_ids: deletable,
    failed: [...notFound].map((id) => ({ id, message: "Lead not found" })),
  });
};
