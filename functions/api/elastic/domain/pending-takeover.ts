/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { execute, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * GET    /api/elastic/domain/pending-takeover - returns the user's most recent
 *        unconsumed takeover row so the UI can resume after a page refresh.
 * DELETE /api/elastic/domain/pending-takeover - cancels (deletes) the pending
 *        row, letting the user pick a different domain/option from scratch.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const row = await queryFirst<{
    domain: string; sending_prefix: string; token: string; expires_at: string;
    verified_at: string | null; consumed_at: string | null;
  }>(
    env.D1DB,
    `SELECT domain, sending_prefix, token, expires_at, verified_at, consumed_at
       FROM domain_ownership_verification
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 1`,
    user.id,
  );
  if (!row || row.consumed_at) return json({ pending: false });

  return json({
    pending: true,
    domain: row.domain,
    sending_prefix: row.sending_prefix,
    sending_address: `${row.sending_prefix}@${row.domain}`,
    txt_host: "@",
    txt_value: `warmchats-verify=${row.token}`,
    expires_at: row.expires_at,
    verified_at: row.verified_at,
  });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  await execute(
    env.D1DB,
    `DELETE FROM domain_ownership_verification
       WHERE user_id = ? AND consumed_at IS NULL`,
    user.id,
  );
  return json({ success: true });
};
