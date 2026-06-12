/// <reference types="@cloudflare/workers-types" />

/**
 * Cron-side mirror of functions/_shared/smsCompliance.ts:appendComplianceFooter.
 *
 * Same contract: context-aware STOP footer. Duplicated here because the Pages
 * bundle and the cron Worker can't share imports (same reason quietHours and
 * emailCompliance are duplicated). If you change one, change the other.
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
  /** See functions/_shared/smsCompliance.ts for the full contract. */
  recipientOptedIn?: boolean;
}

export function appendComplianceFooter(body: string, opts: ComplianceFooterOpts): string {
  const trimmed = (body || "").trimEnd();
  if (!trimmed) return trimmed;
  const kind = opts.kind;
  if (kind === "transactional" || kind === "followup_in_thread") return trimmed;

  const wantStop = kind === "first_auto" || kind === "sequence_first" || kind === "campaign";

  // Owner's rule (2026-06): STOP footer ONLY for leads not yet opted in;
  // consented leads never see it. The "(Automated msg from <agent>)"
  // disclosure prefix was removed entirely at the same time.
  let out = trimmed;
  if (wantStop && opts.recipientOptedIn !== true && !STOP_HINT_RE.test(out)) {
    out = `${out.trimEnd()}\n\n${STOP_FOOTER}`;
  }
  return out;
}
