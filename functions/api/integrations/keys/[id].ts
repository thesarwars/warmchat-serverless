/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { orgRole } from "../../../_shared/orgAccess.ts";

const MANAGE_ROLES = new Set(["Owner", "Manager"]);

/**
 * DELETE /api/integrations/keys/:id - revoke a key (sets revoked_at). Revocation
 * is immediate: requireApiKey rejects any key with a non-null revoked_at.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid key id", 400);

  const row = await queryFirst<{ org_id: number; revoked_at: string | null }>(
    env.D1DB,
    `SELECT org_id, revoked_at FROM api_key WHERE id = ?`,
    id,
  );
  if (!row) return error("Not found", 404);

  const role = await orgRole(env, user.id, row.org_id);
  if (!role || !MANAGE_ROLES.has(role)) return error("Forbidden", 403);

  if (!row.revoked_at) {
    await execute(env.D1DB, `UPDATE api_key SET revoked_at = ? WHERE id = ?`, nowIso(), id);
  }
  return json({ ok: true });
};
