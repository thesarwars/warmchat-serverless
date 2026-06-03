/// <reference types="@cloudflare/workers-types" />
/**
 * Central limits for everything that feeds the AI system prompt or otherwise
 * consumes resources. Enforced server-side (the real guard) and mirrored in the
 * UI as character counters. Bounding these stops the system prompt from
 * bloating and protects our token / $ budget. Mirrored in src/utils/aiLimits.ts
 * for the client - keep both in sync.
 */
export const AI_LIMITS = {
  // Knowledge base FAQs
  faqQuestion: 200,
  faqAnswer: 500,
  faqMaxEntries: 50,
  // Qualification questions (per lead type - what the AI asks to qualify a lead)
  qualificationQuestion: 200,
  qualificationGuidance: 300,
  qualificationMaxEntries: 50,
  // Brand / escalation rules (always_say / never_say / escalation_keywords)
  ruleItem: 80,
  ruleMaxItems: 25,
  // Custom inbound auto-responders
  responderName: 60,
  responderTrigger: 60,
  responderKeywords: 200,
  responderTone: 40,
  responderMessage: 480,
  responderMaxCount: 30,
  // Agent profile (knowledge profile + persona)
  profileShort: 200,   // names, contact, single-line fields
  profileLong: 600,    // commission rules, listings, past sales, etc.
  personaJson: 3000,
  // Per-agent overrides
  agentDisplayName: 60,
  agentTone: 80,
  agentSystemPrompt: 1500,
} as const;

// Control characters to strip (keep tab \x09, newline \x0A, carriage return \x0D).
// eslint-disable-next-line no-control-regex -- intentionally stripping control chars
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Strip control characters, trim, and cap length. Returns null for empty input
// so callers can store NULL.
export function clampText(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(CONTROL_CHARS, "").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

// A bounded, de-duped list of clean strings (each clamped, count capped).
export function cleanStrList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const s = clampText(x, maxLen);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}
