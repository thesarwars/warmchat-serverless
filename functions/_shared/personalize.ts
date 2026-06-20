/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst } from "./db.ts";

/**
 * Shared personalization for outbound SMS + email. Resolves the lead and
 * senderName into a vars map, then substitutes {token} / {{token}} occurrences
 * in the body/subject. Keeps SMS and email behavior consistent - both channels
 * personalize against the same lead fields and recognize the same tokens.
 */

export type LeadVars = Record<string, string>;

export interface LeadRow {
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  area: string | null;
}

// Connector words that introduce a personalized detail ("looking IN {area}",
// "homes FOR {area}"). When the detail is missing we drop the connector with it
// so the sentence doesn't read "looking in ?" - it reads "looking?".
const CONNECTORS = "in|at|for|near|around|on|of|to|about|with|from|into";

/**
 * Tidy the spacing/punctuation left behind after a missing token (and its
 * connector) is removed: collapse double spaces, pull punctuation back against
 * the previous word, drop a comma orphaned right before end punctuation, etc.
 */
function tidyAfterRemoval(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, " ")            // double spaces -> one
    .replace(/\s+([,.!?;:])/g, "$1")       // " ?" -> "?"   " ," -> ","
    .replace(/([,;:])\s*([.!?])/g, "$2")   // ", ?" -> "?"
    .replace(/([,;:])\1+/g, "$1")          // ",," -> ","
    .replace(/\(\s*\)/g, "")               // empty "()" left by a dropped token
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:]+/, "")               // stray leading punctuation
    .trim();
}

/**
 * Replace {token} and {{token}} with values from `vars`. CRITICAL for natural
 * copy: when a token's value is MISSING (e.g. the lead has no `area`), the token
 * AND a preceding connector word are removed entirely instead of leaving an
 * empty hole - so "still looking in {area}?" becomes "still looking?" rather than
 * the broken "still looking in ?". Unknown tokens are left untouched.
 */
export function applyPersonalization(text: string, vars: LeadVars): string {
  if (!text) return text;
  const tokenRe = new RegExp(
    String.raw`(\s+(?:${CONNECTORS}))?(\s*)\{\{?\s*([a-zA-Z0-9_ ]+?)\s*\}?\}`,
    "gi",
  );
  const replaced = text.replace(tokenRe, (whole, connector: string | undefined, ws: string, raw: string) => {
    const key = raw.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
    if (!(key in vars)) return whole;            // not a known token - leave as written
    const val = (vars[key] ?? "").trim();
    if (val === "") {
      // Missing value: drop the token. If it had a connector ("in {area}"), drop
      // that too; otherwise keep the separating space so words don't fuse.
      return connector ? "" : ws;
    }
    return (connector ?? "") + ws + val;
  });
  return tidyAfterRemoval(replaced);
}

export function buildPersonalizationVars(lead: LeadRow | null, senderName: string): LeadVars {
  const first = lead?.first_name || lead?.name?.split(" ")[0] || "there";
  const last = lead?.last_name || lead?.name?.split(" ").slice(1).join(" ") || "";
  return {
    firstname: first,
    lastname: last,
    fullname: lead?.name || [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "",
    name: lead?.name || lead?.first_name || "there",
    email: lead?.email || "",
    phone: lead?.phone || "",
    area: lead?.area || "",
    sendername: senderName,
    senderfullname: senderName,
    agentname: senderName,
    agentfirstname: senderName.split(" ")[0] || "",
    agentfullname: senderName,
  };
}

/** Look up a lead by id and return personalization vars. */
export async function loadLeadVars(
  env: Env,
  leadId: number | null | undefined,
  senderName: string,
): Promise<LeadVars> {
  let lead: LeadRow | null = null;
  if (leadId && Number.isInteger(leadId)) {
    lead = await queryFirst<LeadRow>(
      env.D1DB,
      `SELECT first_name, last_name, name, email, phone, area FROM lead WHERE id = ?`,
      leadId,
    );
  }
  return buildPersonalizationVars(lead, senderName);
}
