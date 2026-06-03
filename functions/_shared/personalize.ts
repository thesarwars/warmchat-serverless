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

/** Replace {token} and {{token}} occurrences with values from `vars`. */
export function applyPersonalization(text: string, vars: LeadVars): string {
  if (!text) return text;
  return text.replace(/\{\{?\s*([a-zA-Z0-9_ ]+?)\s*\}?\}/g, (whole, raw: string) => {
    const key = raw.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
    return key in vars ? (vars[key] ?? whole) : whole;
  });
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
