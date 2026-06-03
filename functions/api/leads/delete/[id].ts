/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

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
