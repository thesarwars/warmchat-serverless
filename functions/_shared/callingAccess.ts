/// <reference types="@cloudflare/workers-types" />
import { queryFirst } from "./db.ts";
import { isOrgMember } from "./orgAccess.ts";
import type { Env } from "./env.ts";

/**
 * Calling resources are scoped to an organization (the old service's
 * "workspace"). A user may touch a call / lead / phone number only when its
 * `org_id` is an org they belong to. These helpers resolve the caller's org and
 * verify per-resource access, reusing `isOrgMember` from orgAccess.ts.
 */

/** The caller's primary org id (first membership, else an org they own), or null. */
export async function resolveOrgId(env: Env, userId: number): Promise<number | null> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB,
    `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`,
    userId,
  );
  if (row) return row.org_id;
  const owned = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM organization WHERE owner_id = ? LIMIT 1`,
    userId,
  );
  return owned ? owned.id : null;
}

/** True when the call exists and the caller belongs to its org. */
export async function canAccessCall(env: Env, userId: number, callId: string): Promise<boolean> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB,
    `SELECT org_id FROM calls WHERE id = ? LIMIT 1`,
    callId,
  );
  return row ? isOrgMember(env, userId, row.org_id) : false;
}

/** True when the lead exists and the caller belongs to its org. */
export async function canAccessLead(env: Env, userId: number, leadId: number): Promise<boolean> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB,
    `SELECT org_id FROM lead WHERE id = ? LIMIT 1`,
    leadId,
  );
  return row ? isOrgMember(env, userId, row.org_id) : false;
}

/** True when the phone number exists and the caller belongs to its org. */
export async function canAccessPhoneNumber(env: Env, userId: number, phoneNumberId: string): Promise<boolean> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB,
    `SELECT org_id FROM phone_numbers WHERE id = ? LIMIT 1`,
    phoneNumberId,
  );
  return row ? isOrgMember(env, userId, row.org_id) : false;
}
