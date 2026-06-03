/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, execute, nowIso } from "./db.ts";
import {
  loadSettingsForLead,
  renderTemplate,
  attachTag,
  aiSendAllowedForLead,
  type LeadFull,
  type AutoResponseRow,
} from "./autoResponse.ts";
import { sendLeadSms } from "./leadSms.ts";
import { resolveReplyDelayMs } from "./aiAgents.ts";
import { classifyReplyText, type ClassifyResult } from "./intentClassifier.ts";
import { dispatchZapierEvent } from "./zapierDispatch.ts";
import { toLeadView } from "./integrationApi.ts";
import { refreshLeadIntelligence } from "./leadIntelligence.ts";
import { logAgentActivity } from "./aiAgents.ts";
import { openEscalation } from "./escalation.ts";

/**
 * AI Follow-Up qualification state machine.
 *
 * Driven by inbound SMS replies (see functions/api/webhooks/telnyx/inbound.ts).
 * For each reply we:
 *  1. Classify the reply (keyword first, optional LLM fallback).
 *  2. Persist any extracted fields onto the lead row.
 *  3. Detect booking-intent / cold signals and short-circuit accordingly.
 *  4. If the lead-type is `unknown` and the reply signals buy/sell, switch
 *     into the matching flow (BOTH -> seller-first per spec).
 *  5. Otherwise advance qualification_step and dispatch the next question.
 *
 * Sends route through telnyxSendSms directly so we can also persist into the
 * SMS conversation thread. Quiet-hours blocks queue the question into
 * `scheduled_message` for the cron flusher to pick up at the local opening.
 */

interface FlowDef {
  lead_type: "buyer" | "seller" | "open_house" | "general";
  questions: string[];
  transition: string;
}

export const QUALIFICATION_FLOWS: Record<string, FlowDef> = {
  buyer: {
    lead_type: "buyer",
    questions: [
      "Got it. What price range are you hoping to stay around?",
      "Nice, are you looking to buy in the next few months or just exploring for now?",
      "Got it, have you already gotten pre-approved, or still figuring out the financing side?",
    ],
    transition:
      "Based on that, I can show you homes that fit exactly what you're looking for and walk you through next steps. What day/time works best for a quick call?",
  },
  seller: {
    lead_type: "seller",
    questions: [
      "Got it. What's the property address or area?",
      "Is the home currently owner-occupied, rented, or vacant?",
      "What's got you thinking about selling?",
    ],
    transition:
      "I can show you what your home could realistically sell for in today's market. What day/time works best for a quick call?",
  },
  open_house: {
    lead_type: "open_house",
    questions: [
      "Are you looking to buy soon or just exploring right now?",
      "Have you already been pre-approved, or still figuring that part out?",
      "What did you think about the home?",
      "Want me to send a few similar homes?",
    ],
    transition:
      "Based on what you're looking for, it probably makes sense to connect for a few minutes. What day/time works best for a quick call?",
  },
  general: {
    lead_type: "general",
    questions: [
      "Got it - are you mainly looking to buy, sell, or both?",
    ],
    transition:
      "Based on what you're looking for, it probably makes sense to connect for a few minutes. What day/time works best for a quick call?",
  },
};

function flowKey(leadType: string | null): "buyer" | "seller" | "open_house" | "general" {
  if (leadType === "buyer" || leadType === "seller" || leadType === "open_house") return leadType;
  return "general";
}

/**
 * Persist whichever fields the classifier extracted onto the lead row. Skips
 * any field the classifier left null so we never overwrite real data with
 * empty results.
 */
async function applyExtractions(env: Env, leadId: number, extracted: ClassifyResult["extracted"]): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (extracted.budget) { sets.push("price_range = ?"); args.push(extracted.budget); }
  if (extracted.timeline) { sets.push("timeline = ?"); args.push(extracted.timeline); }
  if (typeof extracted.pre_approved === "boolean") {
    sets.push("pre_approved = ?"); args.push(extracted.pre_approved ? 1 : 0);
    sets.push("financing_status = ?"); args.push(extracted.pre_approved ? "pre_approved" : "not_pre_approved");
  }
  if (extracted.property_address) { sets.push("property_address = ?"); args.push(extracted.property_address); }
  if (extracted.occupancy_status) { sets.push("occupancy_status = ?"); args.push(extracted.occupancy_status); }
  if (extracted.motivation) { sets.push("motivation = ?"); args.push(extracted.motivation); }
  if (extracted.financing_status) { sets.push("financing_status = ?"); args.push(extracted.financing_status); }
  if (extracted.interest_level) { sets.push("interest_level = ?"); args.push(extracted.interest_level); }
  if (extracted.area) { sets.push("area = ?"); args.push(extracted.area); }
  if (typeof extracted.bedrooms === "number") { sets.push("bedrooms = ?"); args.push(extracted.bedrooms); }
  if (typeof extracted.bathrooms === "number") { sets.push("bathrooms = ?"); args.push(extracted.bathrooms); }
  if (extracted.property_type) { sets.push("property_type = ?"); args.push(extracted.property_type); }
  if (extracted.seller_price_expectations) { sets.push("seller_price_expectations = ?"); args.push(extracted.seller_price_expectations); }
  if (!sets.length) return;
  args.push(leadId);
  await execute(env.D1DB, `UPDATE lead SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args);
}

async function notifyAgent(env: Env, lead: LeadFull, title: string, body: string): Promise<void> {
  if (!lead.owner_id) return;
  await execute(
    env.D1DB,
    `INSERT INTO notification (user_id, org_id, kind, title, body, created_at)
     VALUES (?, ?, 'system', ?, ?, ?)`,
    lead.owner_id, lead.org_id, title, body, nowIso(),
  );
}

/**
 * Dispatch the next qualification question. Renders the {{token}} template, then
 * hands off to the single compliant sender (sendLeadSms): suppression, quiet-hours
 * queue, owner-number/provider fallback, STOP footer, and thread persistence all
 * live there, shared with the tool-calling agent's send_message.
 */
async function dispatchQuestion(
  env: Env,
  lead: LeadFull,
  settings: AutoResponseRow,
  rawTemplate: string,
): Promise<{ sent: boolean; queued: boolean }> {
  const rendered = await renderTemplate(env, rawTemplate, lead);
  // Honor the "Response timing" persona here too (natural delay -> queue for the
  // cron) so the fallback flow doesn't reply instantly while the orchestrator waits.
  const delayMs = await resolveReplyDelayMs(env, lead.org_id, lead.owner_id ?? settings.user_id);
  return sendLeadSms(env, lead, settings, rendered, { delayMs });
}

/** Qualification outcomes that represent a meaningful lead stage change. */
const STATUS_CHANGE_EVENTS = new Set(["booking_ready", "transition", "cold"]);

/** Outcomes where the flow actually processed the reply (extracted + advanced),
 *  so the AI-native intelligence (score / next action / summary) should refresh. */
const PROCESSED_STATUSES = new Set(["booking_ready", "transition", "cold", "question_sent"]);

/**
 * Advance the qualification flow given a new inbound reply, then fire a single
 * "Lead Status Changed" Zapier trigger when the turn produced a meaningful
 * stage change (booking-ready / cold). Wrapping runQualification keeps the
 * dispatch to once per turn regardless of how many DB writes happened inside.
 */
export async function advanceQualification(
  env: Env,
  leadId: number,
  replyText: string,
): Promise<{ status: string; sent?: boolean; queued?: boolean }> {
  const result = await runQualification(env, leadId, replyText);
  // Self-updating CRM: recompute lead_score / next_best_action / ai_summary after
  // any reply the flow processed. Never let this break the reply path.
  if (PROCESSED_STATUSES.has(result.status)) {
    try { await refreshLeadIntelligence(env, leadId); } catch { /* non-fatal */ }
  }
  if (STATUS_CHANGE_EVENTS.has(result.status)) {
    const row = await queryFirst<Record<string, unknown>>(env.D1DB, `SELECT * FROM lead WHERE id = ?`, leadId);
    if (row) {
      await dispatchZapierEvent(env, Number(row.org_id), "lead.status_changed", {
        lead_id: leadId,
        status: result.status,
        lead: toLeadView(row),
      });
    }
  }
  return result;
}

/**
 * Background CRM update for a known lead's reply when we are NOT running the
 * full auto-reply flow (e.g. inbound_existing_continue is off, so the agent
 * handles the conversation but still wants the record kept current). Extracts
 * fields, reflects temperature, and refreshes the AI-native intelligence -
 * without sending anything, so it carries no compliance/quiet-hours concern.
 */
export async function extractInboundData(env: Env, leadId: number, replyText: string): Promise<void> {
  const lead = await queryFirst<{ lead_type: string | null }>(
    env.D1DB, `SELECT lead_type FROM lead WHERE id = ?`, leadId);
  if (!lead) return;
  const classified = await classifyReplyText(env, replyText, lead.lead_type);
  await applyExtractions(env, leadId, classified.extracted);
  if (classified.intent === "booking") {
    await execute(env.D1DB, `UPDATE lead SET status = 'Qualified', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, leadId);
  } else if (classified.intent === "cold") {
    await execute(env.D1DB, `UPDATE lead SET status = 'Lost', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, leadId);
  }
  await refreshLeadIntelligence(env, leadId);
}

/**
 * Advance the qualification flow given a new inbound reply. Caller is
 * responsible for having already cancelled pending follow-ups and recorded
 * the inbound message in conversation history.
 */
async function runQualification(
  env: Env,
  leadId: number,
  replyText: string,
): Promise<{ status: string; sent?: boolean; queued?: boolean }> {
  const ctx = await loadSettingsForLead(env, leadId);
  if (!ctx) return { status: "no_settings" };
  const { settings, lead } = ctx;
  // Level 2 - per-agent toggle.
  if (!settings.qualification_enabled || !settings.enabled) return { status: "disabled" };
  // Level 1 (master) + Level 3 (per-lead pause). This is an AI-initiated send
  // path, so it must respect the same global/per-lead gate as the follow-up
  // engine - the inbound STOP/HELP/START confirmations are handled separately
  // and are intentionally not gated here.
  if (!(await aiSendAllowedForLead(env, lead))) return { status: "disabled" };
  if (!lead.phone) return { status: "no_phone" };

  // First reply: mark engaged + warm.
  const wasFirst = !lead.last_reply_at;
  if (wasFirst) {
    // Advance to Engaged on first reply, but never downgrade a lead already
    // further along the pipeline.
    await execute(
      env.D1DB,
      `UPDATE lead SET last_reply_at = ?,
         status = CASE WHEN LOWER(IFNULL(status,'')) IN ('','new','new lead','contacted','warm','nurture')
                       THEN 'Engaged' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      nowIso(), leadId,
    );
    lead.last_reply_at = nowIso();
    lead.qualification_status = lead.qualification_status || "Engaged";
  } else {
    await execute(
      env.D1DB,
      `UPDATE lead SET last_reply_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      nowIso(), leadId,
    );
  }

  const classified = await classifyReplyText(env, replyText, lead.lead_type);
  await applyExtractions(env, leadId, classified.extracted);

  // Booking intent short-circuit.
  if (classified.intent === "booking") {
    await execute(
      env.D1DB,
      `UPDATE lead SET status = 'Qualified', qualification_status = 'Booking-ready', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      leadId,
    );
    await notifyAgent(env, lead, "Lead is booking-ready", `${lead.name || lead.first_name || "Lead"} signalled booking intent.`);
    await logAgentActivity(env, {
      orgId: lead.org_id, userId: lead.owner_id ?? settings.user_id, agentKey: "inbound",
      event: "lead.booking_ready", leadId, leadLabel: lead.name || lead.first_name || "Lead",
      detail: "Lead signalled booking intent", status: "ok",
    });
    await openEscalation(env, {
      orgId: lead.org_id, leadId, ownerId: lead.owner_id,
      reason: "Booking intent", detail: replyText.slice(0, 200),
    });
    return { status: "booking_ready" };
  }

  // Cold intent short-circuit.
  if (classified.intent === "cold") {
    await execute(
      env.D1DB,
      `UPDATE lead SET status = 'Lost', qualification_status = 'Not Engaged', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      leadId,
    );
    return { status: "cold" };
  }

  // Switch flow if a general/unknown lead signalled buy/sell/both.
  let currentFlow = flowKey(lead.lead_type);
  let currentStep = lead.qualification_step ?? 0;
  if (currentFlow === "general" && classified.lead_type_signal) {
    const signal = classified.lead_type_signal;
    // BOTH -> seller first per spec.
    const targetType: "buyer" | "seller" = signal === "buyer" ? "buyer" : "seller";
    await execute(
      env.D1DB,
      `UPDATE lead SET lead_type = ?, qualification_step = 0, status = 'Engaged', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      targetType, leadId,
    );
    lead.lead_type = targetType;
    currentFlow = targetType;
    currentStep = 0;
  }

  const flow = QUALIFICATION_FLOWS[currentFlow] ?? QUALIFICATION_FLOWS.general!;
  const nextStep = currentStep + 1;

  if (nextStep > flow.questions.length) {
    // All questions answered -> booking transition.
    const result = await dispatchQuestion(env, lead, settings, flow.transition);
    await execute(
      env.D1DB,
      `UPDATE lead SET qualification_status = 'Booking-ready', qualification_step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      nextStep, leadId,
    );
    await notifyAgent(env, lead, "Qualification complete", `${lead.name || lead.first_name || "Lead"} finished qualification. Booking transition sent.`);
    await logAgentActivity(env, {
      orgId: lead.org_id, userId: lead.owner_id ?? settings.user_id, agentKey: "inbound",
      event: "lead.qualified", leadId, leadLabel: lead.name || lead.first_name || "Lead",
      detail: "Qualification complete - booking transition sent", status: "ok",
    });
    await openEscalation(env, {
      orgId: lead.org_id, leadId, ownerId: lead.owner_id,
      reason: "Qualified - ready to book", detail: "Finished qualification flow",
    });
    return { status: "transition", ...result };
  }

  const question = flow.questions[nextStep - 1] ?? flow.transition;
  const result = await dispatchQuestion(env, lead, settings, question);
  await execute(
    env.D1DB,
    `UPDATE lead SET qualification_step = ?, qualification_status = 'Engaged', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    nextStep, leadId,
  );
  await attachTag(env, lead.org_id, leadId, "AI Qualifying");
  await logAgentActivity(env, {
    orgId: lead.org_id, userId: lead.owner_id ?? settings.user_id, agentKey: "inbound",
    event: "reply.sent", leadId, leadLabel: lead.name || lead.first_name || "Lead",
    detail: question, status: result.sent ? "ok" : "warn",
  });
  return { status: "question_sent", ...result };
}
