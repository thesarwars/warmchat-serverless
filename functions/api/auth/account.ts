/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { clearAuthCookies } from "../../_shared/cookies.ts";

/**
 * DELETE /api/auth/account - self-serve account deletion.
 * Cascades through memberships and revokes sessions. Org rows are left in
 * place (transferable / archive-able later) but stripped of owner_id when
 * the deleted user owned them.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  await execute(env.D1DB, `UPDATE auth_session SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?`, user.id);
  await execute(env.D1DB, `UPDATE organization SET owner_id = NULL WHERE owner_id = ?`, user.id);
  await execute(env.D1DB, `DELETE FROM membership WHERE user_id = ?`, user.id);
  await execute(env.D1DB, `DELETE FROM "user" WHERE id = ?`, user.id);

  const resp = json({ deleted: true });
  return clearAuthCookies(resp, request);
};
