/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { orgRole } from "./orgAccess.ts";

/**
 * Role-based org-access guard.
 *
 * Looks up the caller's membership role in `orgId` and returns the role name if
 * it's in `allowed`, otherwise null. Caller responds 403 on null.
 *
 *   const role = await requireOrgRole(env, user.id, orgId, "Owner", "Manager");
 *   if (!role) return error("Access forbidden: insufficient role", 403);
 *
 * NOTE: Org owners are NOT auto-granted Owner here - they must have an explicit
 * `membership` row.
 */
export async function requireOrgRole(
  env: Env, userId: number, orgId: number, ...allowed: string[]
): Promise<string | null> {
  const role = await orgRole(env, userId, orgId);
  if (!role) return null;
  if (allowed.length === 0) return role;
  return allowed.includes(role) ? role : null;
}

/**
 * For endpoints that act on "the caller's own org" with no org id in the path
 * (e.g. GET /auth/users, GET /orgs/all). Resolves the caller's first membership
 * org + role, then checks it against `allowed`. Returns `{ orgId, role }` on
 * success or null (caller responds 403).
 */
export async function requireCallerOrgRole(
  env: Env, userId: number, ...allowed: string[]
): Promise<{ orgId: number; role: string } | null> {
  const { queryFirst } = await import("./db.ts");
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId,
  );
  if (!m) return null;
  const role = await orgRole(env, userId, m.org_id);
  if (!role) return null;
  if (allowed.length > 0 && !allowed.includes(role)) return null;
  return { orgId: m.org_id, role };
}
