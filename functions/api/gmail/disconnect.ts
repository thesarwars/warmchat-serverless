/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * POST /api/gmail/disconnect - mark the user's Gmail OAuth connection
 * inactive. Revoking the Google token itself happens in Phase 4 (needs the
 * refresh token + Google revoke endpoint call).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  await execute(
    env.D1DB,
    `UPDATE email_connections SET status = 'disconnected', updated_at = ?
      WHERE user_id = ? AND provider = 'gmail'`,
    nowIso(), user.id,
  );
  await execute(
    env.D1DB,
    `UPDATE oauth_tokens SET revoked_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE connection_id IN (SELECT id FROM email_connections WHERE user_id = ? AND provider = 'gmail')`,
    nowIso(), user.id,
  );
  return json({ disconnected: true });
};
