/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, execute, nowIso } from "./db.ts";
import { logAgentActivity } from "./aiAgents.ts";
import { stageScore } from "./leadStage.ts";

/**
 * AI-native CRM intelligence (docs/automations-ai-flow/: "Smart Filters Update
 * Automatically", "AI-Powered Dynamic Lead Intelligence", biggest-differentiator).
 *
 * After the reactive flow extracts fields from a reply, this layer derives the
 * three "self-updating CRM" values that the agent never has to set by hand:
 *   - lead_score        (0-100, transparent rubric)
 *   - next_best_action  (the "what should I do next" answer)
 *   - ai_summary        (the one-line lead profile shown on the card)
 *
 * All computations are pure/deterministic (no LLM) so they are free and safe on
 * the free-tier CPU budget and never hallucinate. refreshLeadIntelligence is the
 * single orchestrator: load lead -> compute -> persist only what changed -> log.
 */

interface IntelLead {
  id: number;
  org_id: number;
  owner_id: number | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  lead_type: string | null;
  intent: string | null;
  status: string | null;
  qualification_status: string | null;
  qualification_step: number | null;
  price_range: string | null;
  estimated_price: number | null;
  area: string | null;
  timeline: string | null;
  pre_approved: number | null;
  financing_status: string | null;
  motivation: string | null;
  occupancy_status: string | null;
  property_address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string | null;
  seller_price_expectations: string | null;
  appointment_booked: number | null;
  last_reply_at: string | null;
  lead_score: number | null;
  next_best_action: string | null;
  ai_summary: string | null;
  ai_summary_updated_at: string | null;
}

const INTEL_COLUMNS =
  `id, org_id, owner_id, name, first_name, last_name, lead_type, intent, status,
   qualification_status, qualification_step, price_range, estimated_price, area,
   timeline, pre_approved, financing_status, motivation, occupancy_status,
   property_address, bedrooms, bathrooms, property_type, seller_price_expectations,
   appointment_booked, last_reply_at, lead_score, next_best_action, ai_summary,
   ai_summary_updated_at`;

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function hasBudget(l: IntelLead): boolean {
  return Boolean(l.price_range) || Boolean(l.estimated_price);
}

function knownType(l: IntelLead): boolean {
  return Boolean(l.lead_type) && l.lead_type !== "unknown";
}

/**
 * Lead score (0-100) is now a deterministic function of the lead's Stage
 * (lead.status) - the single canonical Score used across the app (Leads page,
 * Pipeline board, dashboard ring). The multi-factor rubric was retired so the
 * number always matches the stage the agent (or AI) sees. The AI advances the
 * stage as a conversation progresses, which moves the score.
 */
function computeLeadScore(l: IntelLead): number {
  return stageScore(l.status);
}

/**
 * The "biggest differentiator": answer "what should I do next?" with one of the
 * canonical verbs from biggest-differentiator.md. Rule-first, priority order.
 */
function computeNextBestAction(l: IntelLead): string {
  const intent = (l.intent || "").toLowerCase();
  const qs = (l.qualification_status || "").toLowerCase();

  if (l.appointment_booked) return "Prepare for appointment";
  if (intent === "hot" || qs === "booking-ready") return "Call now";
  if (intent === "cold") return "Continue nurturing";

  if (l.lead_type === "seller") {
    if (!l.property_address && !l.area) return "Ask for property address";
    if (!l.motivation) return "Ask seller motivation";
  } else {
    // buyer / open_house / general default to buyer-style qualification.
    if (!hasBudget(l)) return "Ask for budget";
    if (!l.timeline) return "Ask for timeline";
    if (l.pre_approved == null) return "Ask about financing";
  }

  // Enough collected and engaged -> push toward an appointment.
  if (qs === "engaged" || qs === "qualified") return "Schedule consultation";

  const ageH = hoursSince(l.last_reply_at);
  if (ageH != null && ageH > 24 * 7) return "Re-engage";
  return "Follow up tomorrow";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Deterministic one-line lead summary built from the structured fields, matching
 * the example in Smart-Filters-Update-Automatically.md ("Buyer interested in
 * Clovis. Budget $550k. Pre-approved. Looking within 60 days."). No LLM, so it
 * never invents facts and costs nothing. Returns null when there is nothing to
 * summarize yet.
 */
function buildLeadSummary(l: IntelLead): string | null {
  const parts: string[] = [];
  const type = knownType(l) ? cap(String(l.lead_type)) : null;
  if (type && l.area) parts.push(`${type} interested in ${l.area}`);
  else if (type) parts.push(`${type} lead`);
  else if (l.area) parts.push(`Interested in ${l.area}`);

  if (l.price_range) parts.push(`Budget ${l.price_range}`);
  else if (l.estimated_price) parts.push(`Budget ~$${Math.round(l.estimated_price).toLocaleString("en-US")}`);

  const beds = l.bedrooms ? `${l.bedrooms}bd` : "";
  const baths = l.bathrooms ? `${l.bathrooms}ba` : "";
  const ptype = l.property_type || "";
  const propline = [beds, baths, ptype].filter(Boolean).join(" ");
  if (propline) parts.push(propline);

  if (l.pre_approved === 1) parts.push("Pre-approved");
  else if (l.financing_status && l.financing_status !== "pre_approved") {
    parts.push(cap(l.financing_status.replace(/_/g, " ")));
  }

  if (l.timeline) parts.push(`Timeline ${l.timeline}`);
  if (l.lead_type === "seller" && l.property_address) parts.push(`Property ${l.property_address}`);
  if (l.occupancy_status) parts.push(cap(l.occupancy_status));
  if (l.seller_price_expectations) parts.push(`Expects ${l.seller_price_expectations}`);
  if (l.motivation) parts.push(`Motivation: ${l.motivation}`);
  if (l.appointment_booked) parts.push("Appointment booked");

  if (!parts.length) return null;
  return parts.join(". ") + ".";
}

/**
 * Resolve a user_id for activity logging: the lead owner, else the org owner.
 * ai_activity_log.user_id is NOT NULL, so we need a real user.
 */
async function loggerUserId(env: Env, lead: IntelLead): Promise<number | null> {
  if (lead.owner_id) return lead.owner_id;
  const org = await queryFirst<{ owner_id: number | null }>(
    env.D1DB, `SELECT owner_id FROM organization WHERE id = ?`, lead.org_id);
  return org?.owner_id ?? null;
}

/**
 * Recompute + persist the AI-native intelligence for a lead, writing only the
 * values that actually changed and logging a single "crm.updated" activity row
 * (powers the AI Agent "What AI Updated Today" + Activity feed). Safe to call
 * on every processed reply. Never throws into the caller.
 */
export async function refreshLeadIntelligence(env: Env, leadId: number): Promise<void> {
  const lead = await queryFirst<IntelLead>(
    env.D1DB, `SELECT ${INTEL_COLUMNS} FROM lead WHERE id = ?`, leadId);
  if (!lead) return;

  const score = computeLeadScore(lead);
  const action = computeNextBestAction(lead);
  const summary = buildLeadSummary(lead);

  const sets: string[] = [];
  const args: unknown[] = [];
  const changed: string[] = [];

  if (score !== (lead.lead_score ?? null)) {
    sets.push("lead_score = ?"); args.push(score);
    changed.push("score");
  }
  if (action !== (lead.next_best_action ?? null)) {
    sets.push("next_best_action = ?"); args.push(action);
    changed.push("next action");
  }
  if (summary && summary !== (lead.ai_summary ?? null)) {
    sets.push("ai_summary = ?"); args.push(summary);
    sets.push("ai_summary_updated_at = ?"); args.push(nowIso());
    changed.push("summary");
  }

  if (!sets.length) return;
  args.push(leadId);
  await execute(env.D1DB, `UPDATE lead SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args);

  const userId = await loggerUserId(env, lead);
  if (userId) {
    await logAgentActivity(env, {
      orgId: lead.org_id,
      userId,
      agentKey: "inbound",
      event: "lead.updated",
      leadId: lead.id,
      leadLabel: lead.name || lead.first_name || "Lead",
      detail: `Updated ${changed.join(", ")} - score ${score}, next: ${action}`,
      status: "ok",
    });
  }
}
