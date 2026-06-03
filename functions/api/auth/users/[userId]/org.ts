/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../_shared/http.ts";
import { queryFirst, execute } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { requireOrgRole } from "../../../../_shared/roleRequired.ts";

/**
 * PUT /api/auth/users/:userId/org - move a teammate to a different org.
 * Owner-only on the SOURCE org.
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const caller = await requireUser(env, request);
  if (!caller) return error("Unauthorized", 401);
  const targetUserId = Number(params.userId);
  if (!Number.isInteger(targetUserId)) return error("Invalid user id", 400);

  const body = await readJson<{ org_id?: number; new_org_id?: number; role_id?: number }>(request);
  const newOrgId = body?.new_org_id ?? body?.org_id;
  if (!Number.isInteger(newOrgId)) return error("new_org_id is required", 400);

  const targetMembership = await queryFirst<{ org_id: number; role_id: number }>(
    env.D1DB, `SELECT org_id, role_id FROM membership WHERE user_id = ? LIMIT 1`, targetUserId,
  );
  if (!targetMembership) return error("User has no current membership", 404);

  const role = await requireOrgRole(env, caller.id, targetMembership.org_id, "Owner");
  if (!role) return error("Access forbidden: insufficient role", 403);

  await execute(
    env.D1DB,
    `UPDATE membership SET org_id = ?, role_id = COALESCE(?, role_id) WHERE user_id = ?`,
    newOrgId, body?.role_id ?? null, targetUserId,
  );
  return json({ success: true });
};
