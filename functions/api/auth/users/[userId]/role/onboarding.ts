/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../../../_shared/db.ts";
import { requireUser } from "../../../../../_shared/auth.ts";

/**
 * PUT /api/auth/users/:userId/role/onboarding - set the role for a new user
 * during onboarding, before any membership row exists. Caller must be the
 * target user (self-onboarding) or an Owner.
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const caller = await requireUser(env, request);
  if (!caller) return error("Unauthorized", 401);
  const targetUserId = Number(params.userId);
  if (!Number.isInteger(targetUserId)) return error("Invalid user id", 400);

  const body = await readJson<{ role?: string; org_id?: number }>(request);
  const roleName = (body?.role || "").trim();
  if (!roleName) return error("role is required", 400);

  const roleRow = await queryFirst<{ id: number }>(env.D1DB, `SELECT id FROM role WHERE name = ?`, roleName);
  if (!roleRow) return error(`Unknown role: ${roleName}`, 400);

  // Pull or create a membership row.
  const orgId = body?.org_id;
  const existing = await queryFirst<{ id: number; org_id: number }>(
    env.D1DB, `SELECT id, org_id FROM membership WHERE user_id = ? LIMIT 1`, targetUserId,
  );
  if (existing) {
    if (caller.id !== targetUserId) return error("Forbidden", 403);
    await execute(env.D1DB, `UPDATE membership SET role_id = ? WHERE id = ?`, roleRow.id, existing.id);
    return json({ success: true, role: roleName });
  }

  if (!orgId) return error("org_id is required when no membership exists", 400);
  if (caller.id !== targetUserId) return error("Forbidden", 403);

  await execute(
    env.D1DB,
    `INSERT INTO membership (user_id, org_id, role_id) VALUES (?, ?, ?)`,
    targetUserId, orgId, roleRow.id,
  );
  return json({ success: true, role: roleName });
};

void nowIso;
