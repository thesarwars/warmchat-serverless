/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../env.ts";
import { execute, queryFirst, nowIso } from "../db.ts";
import { resolveOrgId } from "../callingAccess.ts";

/**
 * Unify the SMS-provisioned phone number with the calling system's view of it.
 *
 * Background: provisioning sets `user.telnyx_phone_number` (SMS column) and
 * attaches the Voice Call Control connection on Telnyx, but the calling system
 * queries the separate `phone_numbers` table + `calling_configurations` row.
 * Without those, /api/calling/can-call returns "Calling is not configured" /
 * "No business number assigned" and the inbound webhook can't find an agent
 * to route to. Every path that sets/clears user.telnyx_phone_number must call
 * the helper below so SMS and calling stay in lockstep.
 */

interface EnsureOptions {
  userId: number;
  phoneNumber: string;
  /** Telnyx phone-number id from the order response, when available. */
  providerSid?: string | null;
  /** Override capabilities; defaults to voice+sms. */
  capabilities?: { voice?: boolean; sms?: boolean };
}

/**
 * Make `phone_numbers` + `calling_configurations` reflect a number assignment.
 * Idempotent: re-running with the same number/user is a no-op. Re-running with
 * a DIFFERENT number for the same user releases the old assignment first
 * (assigned_to_user_id is UNIQUE in the schema).
 */
export async function ensureCallingForNumber(
  env: Env,
  opts: EnsureOptions,
): Promise<{ phoneNumberId: string; orgId: number } | null> {
  const orgId = await resolveOrgId(env, opts.userId);
  if (!orgId) return null;

  // 1. Org-level config row (calling_enabled=1 by default; recording off until
  //    explicitly enabled, voicemail off until proven). UNIQUE on org_id.
  await execute(
    env.D1DB,
    `INSERT OR IGNORE INTO calling_configurations (id, org_id) VALUES (?, ?)`,
    crypto.randomUUID(), orgId,
  );

  // 2. If this user already had a DIFFERENT ACTIVE number assigned, release it
  //    so the UNIQUE(assigned_to_user_id) constraint accepts the new one.
  const existingForUser = await queryFirst<{ id: string; phone_number: string }>(
    env.D1DB,
    `SELECT id, phone_number FROM phone_numbers
      WHERE assigned_to_user_id = ? AND status = 'ACTIVE' LIMIT 1`,
    opts.userId,
  );
  if (existingForUser && existingForUser.phone_number !== opts.phoneNumber) {
    await execute(
      env.D1DB,
      `UPDATE phone_numbers
          SET status = 'RELEASED', assigned_to_user_id = NULL, released_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      nowIso(), existingForUser.id,
    );
  } else if (existingForUser) {
    // Same number, already assigned - nothing to do.
    return { phoneNumberId: existingForUser.id, orgId };
  }

  const capabilities = JSON.stringify({
    voice: opts.capabilities?.voice ?? true,
    sms: opts.capabilities?.sms ?? true,
  });
  // Reuse the phone number's own E.164 as the provider_sid fallback when the
  // caller doesn't have a real Telnyx phone-number id (e.g. manual entry from
  // /api/profile/phone-number). It's still unique per number.
  const providerSid = opts.providerSid && opts.providerSid.length > 0
    ? opts.providerSid
    : opts.phoneNumber;

  // 3. Upsert by phone_number. If a row exists (e.g. previously assigned to
  //    a different user or RELEASED), reclaim it for this user.
  const existing = await queryFirst<{ id: string }>(
    env.D1DB, `SELECT id FROM phone_numbers WHERE phone_number = ? LIMIT 1`,
    opts.phoneNumber,
  );
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE phone_numbers
          SET assigned_to_user_id = ?, org_id = ?, status = 'ACTIVE',
              released_at = NULL, capabilities = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      opts.userId, orgId, capabilities, existing.id,
    );
    return { phoneNumberId: existing.id, orgId };
  }

  const id = crypto.randomUUID();
  await execute(
    env.D1DB,
    `INSERT INTO phone_numbers
        (id, phone_number, provider, provider_sid, status, capabilities,
         assigned_to_user_id, org_id)
     VALUES (?, ?, 'telnyx', ?, 'ACTIVE', ?, ?, ?)`,
    id, opts.phoneNumber, providerSid, capabilities, opts.userId, orgId,
  );
  return { phoneNumberId: id, orgId };
}

/**
 * Mirror disconnect.ts clearing user.telnyx_phone_number: mark the user's
 * ACTIVE phone_numbers row as RELEASED so the calling stack stops routing to
 * a number they no longer own.
 */
export async function releaseCallingForUser(env: Env, userId: number): Promise<void> {
  await execute(
    env.D1DB,
    `UPDATE phone_numbers
        SET status = 'RELEASED', assigned_to_user_id = NULL, released_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE assigned_to_user_id = ? AND status = 'ACTIVE'`,
    nowIso(), userId,
  );
}
