/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../_shared/http.ts";
import { queryFirst, execute } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";
import { safeJson } from "../../../../_shared/automationHelpers.ts";

/**
 * PATCH /api/automations/:id/followups/reorder - reorder follow-up steps.
 * Body: { order: number[] } - a permutation of the existing indexes.
 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid automation id", 400);

  const c = await queryFirst<{ org_id: string; followup_steps: string | null }>(
    env.D1DB, `SELECT org_id, followup_steps FROM automation WHERE id = ?`, id,
  );
  if (!c) return error("Automation not found", 404);
  const orgId = Number(c.org_id);
  if (!Number.isInteger(orgId) || !(await isOrgMember(env, user.id, orgId))) {
    return error("Forbidden", 403);
  }

  const body = (await readJson<{ order?: unknown }>(request)) || {};
  const order = body.order;
  const steps = safeJson<unknown[]>(c.followup_steps, []);
  if (!Array.isArray(order) || order.length !== steps.length) {
    return error("order must be a permutation of existing follow-up indexes", 400);
  }
  const sortedOrder = [...order].map((n) => Number(n)).sort((a, b) => a - b);
  for (let i = 0; i < sortedOrder.length; i++) {
    if (sortedOrder[i] !== i) {
      return error("order must be a permutation of existing follow-up indexes", 400);
    }
  }

  const reordered = (order as number[]).map((i) => steps[Number(i)]);
  await execute(
    env.D1DB,
    `UPDATE automation SET followup_steps = ? WHERE id = ?`,
    JSON.stringify(reordered), id,
  );
  return json({ success: true, followups: reordered });
};
