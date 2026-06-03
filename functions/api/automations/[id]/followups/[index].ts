/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryFirst, execute } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";
import { safeJson } from "../../../../_shared/automationHelpers.ts";

/**
 * DELETE /api/automations/:id/followups/:index - remove one follow-up step.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  const index = Number(params.index);
  if (!Number.isInteger(id) || !Number.isInteger(index)) return error("Invalid id or index", 400);

  const c = await queryFirst<{ org_id: string; followup_steps: string | null }>(
    env.D1DB, `SELECT org_id, followup_steps FROM automation WHERE id = ?`, id,
  );
  if (!c) return error("Automation not found", 404);
  const orgId = Number(c.org_id);
  if (!Number.isInteger(orgId) || !(await isOrgMember(env, user.id, orgId))) {
    return error("Forbidden", 403);
  }

  const steps = safeJson<unknown[]>(c.followup_steps, []);
  if (index < 0 || index >= steps.length) return error("Follow-up index out of range", 400);

  steps.splice(index, 1);
  await execute(
    env.D1DB,
    `UPDATE automation SET followup_steps = ? WHERE id = ?`,
    JSON.stringify(steps), id,
  );
  return json({ success: true, followups: steps });
};
