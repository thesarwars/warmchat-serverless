/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst } from "./db.ts";

/**
 * Returns a human-readable block reason or null when sending is OK.
 *
 * Rules:
 *   - Free plan -> block ("Upgrade to activate...").
 *   - User has NO Telnyx fields populated at all -> allow (paid org sends via
 *     the shared/default messaging profile; the brand/campaign aren't required
 *     until the user starts the registration flow themselves).
 *   - User has STARTED Telnyx registration (any of brand/campaign/profile set)
 *     but status != approved -> block with prep-mode message (or rejection
 *     reason if status == rejected).
 *   - Approved but missing phone number / campaign number not assigned -> block.
 */

interface UserComplianceRow {
  id: number;
  telnyx_phone_number: string | null;
  telnyx_brand_id: string | null;
  telnyx_campaign_id: string | null;
  telnyx_messaging_profile_id: string | null;
  telnyx_sms_status: string | null;
  telnyx_error_reason: string | null;
  telnyx_campaign_number_status: string | null;
}

function normalizeStatus(s: string | null): string | null {
  if (!s) return null;
  return s.trim().toLowerCase();
}

function numberAssigned(u: UserComplianceRow): boolean {
  return normalizeStatus(u.telnyx_campaign_number_status) === "assigned";
}

export async function smsBlockReason(env: Env, userId: number): Promise<string | null> {
  const u = await queryFirst<UserComplianceRow>(
    env.D1DB,
    `SELECT id, telnyx_phone_number, telnyx_brand_id, telnyx_campaign_id,
            telnyx_messaging_profile_id, telnyx_sms_status,
            telnyx_error_reason, telnyx_campaign_number_status
       FROM "user" WHERE id = ?`,
    userId,
  );
  if (!u) return "User not found";

  const org = await queryFirst<{ plan: string | null }>(
    env.D1DB,
    `SELECT o.plan FROM organization o
       JOIN membership m ON m.org_id = o.id
       WHERE m.user_id = ? LIMIT 1`,
    userId,
  );
  if (!org || org.plan === "free_channel") {
    return "Upgrade to activate compliant SMS messaging.";
  }

  const status = normalizeStatus(u.telnyx_sms_status);
  const hasTelnyx = Boolean(u.telnyx_campaign_id || u.telnyx_brand_id || u.telnyx_messaging_profile_id);

  if (!hasTelnyx) return null;

  if (status !== "approved") {
    if (status === "rejected") {
      const reason = (u.telnyx_error_reason || "").trim();
      if (reason) return `SMS rejected by Telnyx: ${reason}`;
      return "SMS rejected. Update your 10DLC registration in SMS Activation and resubmit.";
    }
    return "Preparation Mode Active. Build your follow-up engine now - SMS unlocks instantly after approval.";
  }

  if (!u.telnyx_phone_number) return "SMS phone number not assigned";
  if (!numberAssigned(u)) return "SMS phone number is not assigned to an approved Telnyx campaign yet";

  return null;
}

/** Lighter check used at the "is the sender ready right now?" check. */
export async function telnyxSenderReady(env: Env, userId: number): Promise<boolean> {
  return (await smsBlockReason(env, userId)) === null;
}

/**
 * Context-aware compliance prefix/footer for outbound SMS.
 *
 * CTIA does NOT require "Reply STOP to opt out" on EVERY templated message -
 * it requires the opt-out reminder in the FIRST message of a program/thread
 * and on standalone marketing broadcasts. Twilio and other mature platforms
 * scope the footer the same way. This helper is the single decision point.
 *
 * Several state laws (CA AB 701 etc.) also require disclosing that a message
 * is automated, again in the first message of an automated thread/program.
 *
 * `kind` tells the helper which scenario the caller is in:
 *   - "first_auto"          Auto-response instant / qualification opener /
 *                           missed-call SMS. Prepends "(automated msg from
 *                           {agent})" AND appends "Reply STOP to opt out".
 *   - "campaign"            Single marketing blast (each fresh marketing
 *                           touch). Appends STOP footer; no AI disclosure
 *                           (campaign content is agent-authored, not bot
 *                           voice).
 *   - "sequence_first"      Step 1 of a multi-step sequence. AI disclosure +
 *                           STOP footer.
 *   - "followup_in_thread"  Day1/Day3 follow-up, qualification step 2+,
 *                           sequence step 2+. No prefix, no footer - the
 *                           recipient is already in a known program.
 *   - "transactional"       Appointment confirmations, inbox manual replies.
 *                           Returned unchanged.
 *
 * Idempotent for both pieces: if the body already mentions STOP / opt-out, no
 * footer is added; if it already announces it's automated, no prefix is added.
 * That lets user-authored templates carry their own wording without doubling.
 */
export type ComplianceFooterKind =
  | "first_auto"
  | "campaign"
  | "sequence_first"
  | "followup_in_thread"
  | "transactional";

const STOP_FOOTER = "Reply STOP to opt out";
const STOP_HINT_RE = /\bstop\b[^.]{0,40}\b(opt[\s-]?out|unsubscribe|cancel|end)\b/i;

export interface ComplianceFooterOpts {
  kind: ComplianceFooterKind;
  /** Kept for call-site compatibility; the disclosure prefix that used this was removed. */
  agentName?: string | null;
  /**
   * True when the recipient is already opted-in (`sms_consent_status='opted_in'`).
   * The original consent flow covered both the bot disclosure and the
   * STOP instructions, so re-stating them on every program's first message
   * is clutter without compliance value. Default `false` (safe fallback for
   * leads with unknown/cold consent state). Only suppresses on `first_auto`
   * and `sequence_first` - campaign blasts still carry STOP regardless,
   * since each campaign is a fresh marketing touch.
   */
  recipientOptedIn?: boolean;
}

export function appendComplianceFooter(body: string, opts: ComplianceFooterOpts): string {
  const trimmed = (body || "").trimEnd();
  if (!trimmed) return trimmed;
  const kind = opts.kind;
  if (kind === "transactional" || kind === "followup_in_thread") return trimmed;

  const wantStop = kind === "first_auto" || kind === "sequence_first" || kind === "campaign";

  // Owner's rule (2026-06): the STOP footer is ONLY for leads not yet opted
  // in. A consented lead already accepted the program (STOP/HELP language was
  // part of the consent flow), so re-pasting it on any message - including
  // campaign blasts - is noise. The "(Automated msg from <agent>)" disclosure
  // prefix was removed entirely at the same time; sender identity belongs in
  // the template copy itself.
  let out = trimmed;
  if (wantStop && opts.recipientOptedIn !== true && !STOP_HINT_RE.test(out)) {
    out = `${out.trimEnd()}\n\n${STOP_FOOTER}`;
  }
  return out;
}

/**
 * Back-compat wrapper. Older call sites used `appendStopFooter(body)` which
 * unconditionally appended STOP. Anything still on this path is a TODO to
 * migrate; the wrapper preserves behaviour so a missed migration doesn't
 * silently drop the footer.
 */
export function appendStopFooter(body: string): string {
  return appendComplianceFooter(body, { kind: "campaign" });
}

/**
 * Phone-scoped consent: SMS consent attaches to the PHONE NUMBER, not a single
 * CRM lead row. The same person can exist as several `lead` rows (a duplicate
 * import, an outbound-call auto-create, a re-formatted phone after a data
 * migration); if ONE of those rows is opted_in the org genuinely has consent for
 * that number, so the STOP footer must be suppressed even when the row driving
 * this particular send is still 'unknown'. Reading consent off one lead row let a
 * stale duplicate re-introduce "Reply STOP to opt out" for a number that had
 * already opted in elsewhere - producing the same-number-two-messages-one-footer
 * inconsistency. These helpers widen the check to "is ANY opted_in lead present
 * for this phone (matched on the last 10 digits so format drift like
 * +15594705204 vs 5594705204 still matches)".
 *
 * SQL is built (not bound) for the column identifiers - callers pass fixed table
 * aliases, never user input.
 */
export function normalizedPhoneSql(col: string): string {
  return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '.', '')`;
}

/**
 * A correlated EXISTS, for embedding as a `... AS phone_opted_in` column inside a
 * lead-loading SELECT, so the phone-scope check costs ZERO extra round-trips
 * (it runs in-DB inside the one batched SELECT). `orgCol`/`phoneCol` are the
 * OUTER row's org + phone identifiers (e.g. 'lead.org_id', 'lead.phone').
 */
export function phoneOptedInExistsSql(orgCol: string, phoneCol: string): string {
  return `EXISTS(SELECT 1 FROM lead l2 WHERE l2.org_id = ${orgCol} `
    + `AND l2.sms_consent_status = 'opted_in' AND l2.phone IS NOT NULL `
    + `AND ${normalizedPhoneSql("l2.phone")} LIKE '%' || substr(${normalizedPhoneSql(phoneCol)}, -10))`;
}

/**
 * Standalone resolver for the single-send paths that receive a pre-loaded lead
 * (speedToLead / instantReply / leadSms) and don't control the SELECT, and for
 * the missed-call text (telnyx/status.ts) whose old `... WHERE phone=? LIMIT 1`
 * read an arbitrary duplicate row. Returns true when the org has any opted_in
 * lead whose phone matches on the last 10 digits. Cheap (one indexed-ish scan);
 * callers short-circuit on the plain `=== 'opted_in'` check first so it only
 * fires for not-yet-opted-in single sends.
 */
export async function phoneHasOptedInConsent(
  env: Env, orgId: number, phone: string | null | undefined,
): Promise<boolean> {
  const digits = (phone || "").replace(/\D/g, "");
  const suffix = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!suffix) return false;
  const row = await queryFirst<{ ok: number }>(
    env.D1DB,
    `SELECT EXISTS(SELECT 1 FROM lead WHERE org_id = ? AND sms_consent_status = 'opted_in'`
      + ` AND phone IS NOT NULL AND ${normalizedPhoneSql("phone")} LIKE ?) AS ok`,
    orgId, `%${suffix}`,
  );
  return !!row && row.ok === 1;
}
