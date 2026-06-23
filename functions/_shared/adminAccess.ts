/// <reference types="@cloudflare/workers-types" />
import { queryFirst } from "./db.ts";

/**
 * Platform super-admin check for /admin/* TOOLS endpoints (mock toggle, all-org
 * send logs, mock-inbound, global number-block). The platform owner is pinned by
 * the `SUPER_ADMIN_EMAILS` env allowlist (comma-separated) so a stray DB
 * `is_admin=1` (e.g. from a future invite/signup bug, a restored backup, or a
 * malicious row) can NOT mint a super-admin in production. When the allowlist is
 * unset (local dev), it falls back to the DB `user.is_admin` flag.
 *
 * This is intentionally NOT a per-org role - it gates the PLATFORM tools to
 * specific humans (jv@jovrealestate.com). The per-org business panel (/admin)
 * uses org-role checks (requireCallerOrgRole / isOrgMember) instead.
 */
type EnvLike = { D1DB: D1Database; SUPER_ADMIN_EMAILS?: string };

function allowlist(env: EnvLike): Set<string> {
  return new Set(
    String(env.SUPER_ADMIN_EMAILS || "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Resolve site-admin from an email + the DB flag, applying the allowlist rule:
 * when an allowlist is configured it is AUTHORITATIVE (DB flag ignored); when it
 * is empty we fall back to the DB flag so local dev / unconfigured envs work.
 */
export function resolveSiteAdmin(env: EnvLike, email: string | null | undefined, dbIsAdmin: boolean): boolean {
  const allow = allowlist(env);
  if (allow.size > 0) return allow.has(String(email || "").toLowerCase());
  return dbIsAdmin;
}

export async function isSiteAdmin(env: EnvLike, userId: number): Promise<boolean> {
  const row = await queryFirst<{ email: string; is_admin: number }>(
    env.D1DB,
    `SELECT email, is_admin FROM "user" WHERE id = ?`,
    userId,
  );
  if (!row) return false;
  return resolveSiteAdmin(env, row.email, row.is_admin === 1);
}
