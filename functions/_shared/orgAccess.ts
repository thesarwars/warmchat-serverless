/// <reference types="@cloudflare/workers-types" />
import { queryFirst } from "./db.ts";
import type { Env } from "./env.ts";

/**
 * True when `userId` belongs to `orgId` (membership) or owns the org
 * (membership OR owner).
 */
export async function isOrgMember(env: Env, userId: number, orgId: number): Promise<boolean> {
  const row = await queryFirst<{ ok: number }>(
    env.D1DB,
    `SELECT 1 AS ok FROM membership WHERE user_id = ? AND org_id = ?
     UNION
     SELECT 1 AS ok FROM organization WHERE id = ? AND owner_id = ?
     LIMIT 1`,
    userId,
    orgId,
    orgId,
    userId,
  );
  return row !== null;
}

/** The caller's role name in an org (Owner/Manager/Representative/Guest), or null. */
export async function orgRole(env: Env, userId: number, orgId: number): Promise<string | null> {
  const row = await queryFirst<{ role_name: string | null }>(
    env.D1DB,
    `SELECT r.name AS role_name
       FROM membership m LEFT JOIN role r ON r.id = m.role_id
      WHERE m.user_id = ? AND m.org_id = ? LIMIT 1`,
    userId,
    orgId,
  );
  if (row) return row.role_name;
  // Owners may not have an explicit membership row.
  const owns = await queryFirst<{ ok: number }>(
    env.D1DB,
    `SELECT 1 AS ok FROM organization WHERE id = ? AND owner_id = ?`,
    orgId,
    userId,
  );
  return owns ? "Owner" : null;
}
