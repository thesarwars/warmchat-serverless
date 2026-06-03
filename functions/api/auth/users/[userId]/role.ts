/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../_shared/http.ts";
import { queryFirst, execute } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { requireOrgRole } from "../../../../_shared/roleRequired.ts";

/**
 * PUT /api/auth/users/:userId/role - change a teammate's role.
 * Owner-only.
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const caller = await requireUser(env, request);
  if (!caller) return error("Unauthorized", 401);
  const targetUserId = Number(params.userId);
  if (!Number.isInteger(targetUserId)) return error("Invalid user id", 400);

  const body = await readJson<{ role?: string; role_id?: number; org_id?: number }>(request);
  const callerMembership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, caller.id,
  );
  const orgId = body?.org_id ?? callerMembership?.org_id;
  if (!orgId) return error("Caller is not part of any organization", 403);

  const role = await requireOrgRole(env, caller.id, orgId, "Owner");
  if (!role) return error("Access forbidden: insufficient role", 403);

  let roleId = body?.role_id;
  if (!roleId && body?.role) {
    const r = await queryFirst<{ id: number }>(env.D1DB, `SELECT id FROM role WHERE name = ?`, body.role);
    if (!r) return error(`Unknown role: ${body.role}`, 400);
    roleId = r.id;
  }
  if (!roleId) return error("role or role_id is required", 400);

  const updated = await execute(
    env.D1DB,
    `UPDATE membership SET role_id = ? WHERE user_id = ? AND org_id = ?`,
    roleId, targetUserId, orgId,
  );
  if ((updated.meta.changes ?? 0) === 0) return error("Membership not found", 404);
  return json({ success: true });
};
