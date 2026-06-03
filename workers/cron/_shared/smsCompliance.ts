/// <reference types="@cloudflare/workers-types" />

/**
 * Cron-side mirror of functions/_shared/smsCompliance.ts:appendComplianceFooter.
 *
 * Same contract: context-aware STOP footer + optional AI-disclosure prefix.
 * Duplicated here because the Pages bundle and the cron Worker can't share
 * imports (same reason quietHours and emailCompliance are duplicated). If
 * you change one, change the other.
 */

export type ComplianceFooterKind =
  | "first_auto"
  | "campaign"
  | "sequence_first"
  | "followup_in_thread"
  | "transactional";

const STOP_FOOTER = "Reply STOP to opt out";
const STOP_HINT_RE = /\bstop\b[^.]{0,40}\b(opt[\s-]?out|unsubscribe|cancel|end)\b/i;
const AUTO_HINT_RE = /\b(automated|auto[\s-]?reply|this is an? (auto|automated)|bot)\b/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bodyMentionsAgent(body: string, agentName: string | null | undefined): boolean {
  const trimmed = (agentName || "").trim();
  if (!trimmed) return false;
  try {
    return new RegExp(`\\b${escapeRegex(trimmed)}\\b`, "i").test(body);
  } catch {
    return false;
  }
}

export interface ComplianceFooterOpts {
  kind: ComplianceFooterKind;
  agentName?: string | null;
  /** See functions/_shared/smsCompliance.ts for the full contract. */
  recipientOptedIn?: boolean;
}

export function appendComplianceFooter(body: string, opts: ComplianceFooterOpts): string {
  const trimmed = (body || "").trimEnd();
  if (!trimmed) return trimmed;
  const kind = opts.kind;
  if (kind === "transactional" || kind === "followup_in_thread") return trimmed;

  const wantDisclosure = kind === "first_auto" || kind === "sequence_first";
  const wantStop = kind === "first_auto" || kind === "sequence_first" || kind === "campaign";
  const suppressForOptedIn =
    opts.recipientOptedIn === true && (kind === "first_auto" || kind === "sequence_first");

  let out = trimmed;
  if (wantDisclosure && !suppressForOptedIn && !AUTO_HINT_RE.test(out)) {
    const sender = (opts.agentName || "WarmChats").trim() || "WarmChats";
    if (!bodyMentionsAgent(out, sender)) {
      out = `(Automated msg from ${sender}) ${out}`;
    }
  }
  if (wantStop && !suppressForOptedIn && !STOP_HINT_RE.test(out)) {
    out = `${out.trimEnd()}\n\n${STOP_FOOTER}`;
  }
  return out;
}
