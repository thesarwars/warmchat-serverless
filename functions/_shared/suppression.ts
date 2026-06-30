/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { execute, queryFirst, nowIso } from "./db.ts";

/**
 * Single source of truth for "is this number blocked from receiving SMS in
 * this org?". Every outbound SMS path MUST call this before sending so a STOP
 * recorded anywhere - inbound webhook, admin manual block, lead-level opt-out
 * - hard-stops the send. The check is org-scoped: a STOP at Agent A's number
 * doesn't block Agent B's separate org.
 *
 * Returns true (suppressed) when ANY of these is true for the (org_id, phone):
 *   - `sms_contact.opted_out = 1` (the canonical inbound STOP record)
 *   - `lead.sms_opt_out = 1` (legacy flag updated by some flows without
 *     also touching sms_contact)
 *   - `lead.sms_consent_status = 'no_sms'` (agent-driven "do not text this
 *     contact" directive, set at import or via the add-lead modal; distinct
 *     from a recipient opt-out but functionally identical: never send)
 *
 * The opt-in invitation message (`/api/sms/opt-in-request`) and STOP/HELP
 * confirmation replies are exempt from this gate (they are sent via
 * telnyxSendSms directly so they need no flag).
 */
export async function isPhoneSuppressed(
  env: Env,
  orgId: number,
  phoneE164: string,
): Promise<boolean> {
  if (!orgId || !phoneE164) return false;
  const row = await queryFirst<{ blocked: number }>(
    env.D1DB,
    `SELECT 1 AS blocked
       FROM sms_contact
      WHERE org_id = ? AND phone_number_e164 = ? AND opted_out = 1
      LIMIT 1`,
    orgId, phoneE164,
  );
  if (row) return true;
  // Lead-level flags: opt-out OR the "no_sms" consent directive both block.
  const leadRow = await queryFirst<{ blocked: number }>(
    env.D1DB,
    `SELECT 1 AS blocked
       FROM lead
      WHERE org_id = ? AND phone = ?
        AND (sms_opt_out = 1 OR sms_consent_status = 'no_sms')
      LIMIT 1`,
    orgId, phoneE164,
  );
  return !!leadRow;
}

/**
 * Same check, but resolves the org from a user_id when callers only know
 * which agent is sending. Useful for direct-send endpoints (inbox composer,
 * messages/send) that authenticate by user.
 */
export async function isPhoneSuppressedForUser(
  env: Env,
  userId: number,
  phoneE164: string,
): Promise<boolean> {
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId,
  );
  if (!m) return false;
  return isPhoneSuppressed(env, m.org_id, phoneE164);
}

/**
 * Mark a number as opted-out / manually blocked. Writes both sms_contact and
 * lead (when a matching lead exists) so every read path agrees. Cancels any
 * pending scheduled SMS to that number. Idempotent.
 */
export async function suppressPhone(
  env: Env,
  orgId: number,
  phoneE164: string,
  opts: {
    /**
     * Which path triggered the suppression. Read back by the Compliance tab
     * + admin Blocked Numbers page to render a "Reason" column:
     *   keyword       - recipient texted STOP / UNSUBSCRIBE / etc.
     *   manual_admin  - site admin used /admin/blocked
     *   manual_agent  - org agent clicked "Block contact" on the lead profile
     *   manual_import - CSV import row was flagged opted-out
     */
    reason: "keyword" | "manual_admin" | "manual_agent" | "manual_import";
    blockedByUserId?: number | null;
  } = { reason: "keyword" },
): Promise<void> {
  const now = nowIso();
  const blockedBy = opts.blockedByUserId ?? null;
  // Upsert sms_contact. The unique index is (org_id, phone_number_e164).
  await execute(
    env.D1DB,
    `INSERT INTO sms_contact (org_id, phone_number_e164, opted_out, opted_out_at, opt_in_status, opt_out_reason, blocked_by_user_id)
     VALUES (?, ?, 1, ?, 'unsubscribed', ?, ?)
     ON CONFLICT(org_id, phone_number_e164) DO UPDATE
        SET opted_out = 1,
            opted_out_at = excluded.opted_out_at,
            opt_in_status = 'unsubscribed',
            opt_out_reason = excluded.opt_out_reason,
            blocked_by_user_id = excluded.blocked_by_user_id`,
    orgId, phoneE164, now, opts.reason, blockedBy,
  );
  // Match the lead on the LAST 10 DIGITS, not an exact string. The STOP arrives
  // as a provider-normalized E.164, but the lead's stored phone may be in any
  // format (a re-import, a hand-typed number); an exact `phone = ?` silently
  // matched 0 rows, leaving lead.sms_opt_out=0 while sms_contact.opted_out=1 -
  // the split that let an opted-out lead still count as "needs reply".
  const optOutSuffix = phoneE164.replace(/\D/g, "").slice(-10);
  await execute(
    env.D1DB,
    `UPDATE lead
        SET sms_opt_out = 1,
            sms_consent_status = 'opted_out',
            last_opt_out_at = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE org_id = ? AND phone IS NOT NULL
        AND substr(replace(replace(replace(replace(replace(replace(phone,'+',''),'-',''),' ',''),'(',''),')',''),'.',''), -10) = ?`,
    now, orgId, optOutSuffix,
  );
  await execute(
    env.D1DB,
    `UPDATE scheduled_message
        SET status = 'cancelled', error_message = 'lead opted out', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'scheduled' AND channel = 'sms' AND to_address = ?`,
    phoneE164,
  );
}

/**
 * Reverse of `suppressPhone` - lifts the block in both tables. Does not
 * resurrect cancelled scheduled messages (those would need to be re-queued
 * by whatever flow originally created them).
 */
export async function unsuppressPhone(
  env: Env,
  orgId: number,
  phoneE164: string,
): Promise<void> {
  await execute(
    env.D1DB,
    `UPDATE sms_contact
        SET opted_out = 0,
            opt_in_status = 'subscribed',
            opt_in_at = COALESCE(opt_in_at, ?),
            opt_out_reason = NULL,
            blocked_by_user_id = NULL
      WHERE org_id = ? AND phone_number_e164 = ?`,
    nowIso(), orgId, phoneE164,
  );
  await execute(
    env.D1DB,
    `UPDATE lead
        SET sms_opt_out = 0,
            sms_consent_status = 'opted_in',
            updated_at = CURRENT_TIMESTAMP
      WHERE org_id = ? AND phone = ?`,
    orgId, phoneE164,
  );
}
