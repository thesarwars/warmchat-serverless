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
import { tryNormalizeE164 } from "./phone.ts";
import { dispatchZapierEvent } from "./zapierDispatch.ts";
import { toLeadView } from "./integrationApi.ts";
import { refreshLeadIntelligence } from "./leadIntelligence.ts";
import { logAgentActivity } from "./aiAgents.ts";
import {
  applyAiLeadFields, setAiStatus, parseProvenance, isManuallyLocked,
  type LeadFieldProposal,
} from "./leadFieldEngine.ts";
import { openEscalation } from "./escalation.ts";
import { ensureDealForLead } from "./deals.ts";

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

// One default booking message (used on booking-intent short-circuit) + a single
// polite acknowledgement for not-interested leads (spec: acknowledge once, stop).
const BOOKING_MESSAGE =
  "Based on what you're looking for, it probably makes sense to connect for a few minutes. I can walk you through your options. What day/time works best for a quick call?";
const NOT_INTERESTED_ACK =
  "Totally understand - I'll stop here. Feel free to reach out whenever the timing's right!";

/**
 * Persist whichever fields the classifier extracted onto the lead row. Skips
 * any field the classifier left null so we never overwrite real data with
 * empty results.
 */
export async function applyExtractions(
  env: Env, leadId: number, extracted: ClassifyResult["extracted"],
  ctx?: { evidence?: string | null; confidence?: number | undefined },
): Promise<void> {
  // Governed "smart filter" fields go through the engine: Budget is bucketed to
  // the 5 canonical ranges, Area is normalized, both stamped with provenance +
  // an audit row (and never clobber a manual edit).
  // Read current contact fields + provenance + notes once - so contact info is
  // filled ONLY when blank (never clobber a known email/phone/source or the SMS
  // thread key) and we don't clobber a manual timeline/pre_approved edit.
  const cur = await queryFirst<{
    ai_field_provenance: string | null; notes: string | null;
    email: string | null; phone: string | null; source: string | null;
  }>(
    env.D1DB, `SELECT ai_field_provenance, notes, email, phone, source FROM lead WHERE id = ?`, leadId,
  );
  const prov = parseProvenance(cur?.ai_field_provenance);

  const governed: LeadFieldProposal[] = [];
  if (extracted.budget) governed.push({ field: "price_range", value: extracted.budget, confidence: ctx?.confidence ?? 0.7 });
  if (extracted.area) governed.push({ field: "area", value: extracted.area, confidence: ctx?.confidence ?? 0.7 });
  // Source attribution ("found you on Zillow") - fill ONLY when the lead has no
  // source yet, so we never overwrite an import/intake source. Normalized to the
  // canonical option set by the governed engine.
  if (extracted.source && !(cur?.source || "").trim()) {
    governed.push({ field: "source", value: extracted.source, confidence: ctx?.confidence ?? 0.7 });
  }
  if (governed.length) {
    await applyAiLeadFields(env, leadId, governed, { agentKey: "inbound", evidence: ctx?.evidence ?? null });
  }

  const sets: string[] = [];
  const args: unknown[] = [];
  // Email: fill only when blank + the captured value is a plausible address.
  if (extracted.email && !(cur?.email || "").trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(extracted.email)) {
    sets.push("email = ?"); args.push(extracted.email.trim().toLowerCase());
  }
  // Phone: fill only when blank (never overwrite the SMS thread key). Validate as
  // a real NANP number - +1 with area + exchange codes both starting 2-9 - so a
  // bare 10-digit run that is actually an MLS/account/confirmation number (those
  // typically start 0/1 or have an invalid exchange) is rejected, not written as
  // a phone. tryNormalizeE164 is non-strict (echoes raw on failure), so this
  // explicit NANP check is what actually guards the write.
  if (extracted.phone && !(cur?.phone || "").trim()) {
    const e164 = tryNormalizeE164(extracted.phone);
    if (e164 && /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(e164)) { sets.push("phone = ?"); args.push(e164); }
  }
  if (extracted.timeline && !isManuallyLocked(prov, "timeline")) { sets.push("timeline = ?"); args.push(extracted.timeline); }
  if (typeof extracted.pre_approved === "boolean" && !isManuallyLocked(prov, "pre_approved")) {
    sets.push("pre_approved = ?"); args.push(extracted.pre_approved ? 1 : 0);
    sets.push("financing_status = ?"); args.push(extracted.pre_approved ? "pre_approved" : "not_pre_approved");
  }
  if (extracted.property_address) { sets.push("property_address = ?"); args.push(extracted.property_address); }
  if (extracted.occupancy_status) { sets.push("occupancy_status = ?"); args.push(extracted.occupancy_status); }
  if (extracted.motivation) { sets.push("motivation = ?"); args.push(extracted.motivation); }
  if (extracted.financing_status) { sets.push("financing_status = ?"); args.push(extracted.financing_status); }
  if (extracted.interest_level) { sets.push("interest_level = ?"); args.push(extracted.interest_level); }
  if (typeof extracted.bedrooms === "number") { sets.push("bedrooms = ?"); args.push(extracted.bedrooms); }
  if (typeof extracted.bathrooms === "number") { sets.push("bathrooms = ?"); args.push(extracted.bathrooms); }
  if (extracted.property_type) { sets.push("property_type = ?"); args.push(extracted.property_type); }
  if (extracted.seller_price_expectations) { sets.push("seller_price_expectations = ?"); args.push(extracted.seller_price_expectations); }

  // Catch-all: concrete details that have no dedicated field (pool, acreage,
  // must-haves...) are APPENDED to Notes, deduped so the same phrase doesn't
  // pile up on every reply.
  const detail = extracted.other_details?.trim();
  if (detail) {
    const existing = (cur?.notes || "").trim();
    if (!existing.toLowerCase().includes(detail.toLowerCase())) {
      sets.push("notes = ?");
      args.push(existing ? `${existing}\n${detail}` : detail);
    }
  }

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
  await applyExtractions(env, leadId, classified.extracted, { evidence: replyText, confidence: classified.confidence });
  if (classified.intent === "booking") {
    await applyAiLeadFields(env, leadId, [{ field: "status", value: "Qualified", confidence: 0.8 }],
      { agentKey: "inbound", evidence: replyText });
  } else if (classified.intent === "cold" || classified.intent === "not_interested") {
    // Clear negative signal: Lost is allowed from any stage (intentChange) and the
    // AI is done with this lead.
    await applyAiLeadFields(env, leadId, [{ field: "status", value: "Lost", confidence: 0.85, intentChange: true }],
      { agentKey: "inbound", evidence: replyText });
    await setAiStatus(env, leadId, "ai complete", { agentKey: "inbound", evidence: replyText });
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
  await applyExtractions(env, leadId, classified.extracted, { evidence: replyText, confidence: classified.confidence });

  // Booking intent short-circuit: skip qualification, SEND the booking message,
  // tag hot_seller (sellers), notify the agent.
  if (classified.intent === "booking") {
    const result = await dispatchQuestion(env, lead, settings, BOOKING_MESSAGE);
    await applyAiLeadFields(env, leadId, [{ field: "status", value: "Qualified", confidence: 0.85 }],
      { agentKey: "inbound", evidence: replyText });
    await execute(
      env.D1DB,
      `UPDATE lead SET qualification_status = 'Booking-ready', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      leadId,
    );
    if (lead.lead_type === "seller") await attachTag(env, lead.org_id, leadId, "hot_seller");
    // Deal birth: a booking-ready lead is a real transaction - start its deal
    // at the pipeline's first stage (no-op when one already exists).
    await ensureDealForLead(env, lead.org_id, leadId, lead.lead_type).catch(() => {});
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
    return { status: "booking_ready", ...result };
  }

  // Not-interested short-circuit: acknowledge once, stop, tag Lost / Not Engaged.
  if (classified.intent === "cold" || classified.intent === "not_interested") {
    const result = await dispatchQuestion(env, lead, settings, NOT_INTERESTED_ACK);
    await applyAiLeadFields(env, leadId, [{ field: "status", value: "Lost", confidence: 0.85, intentChange: true }],
      { agentKey: "inbound", evidence: replyText });
    await execute(
      env.D1DB,
      `UPDATE lead SET qualification_status = 'Not Engaged', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      leadId,
    );
    await setAiStatus(env, leadId, "ai complete", { agentKey: "inbound", evidence: replyText });
    return { status: "not_interested", ...result };
  }

  // Switch flow if a general/unknown lead signalled buy/sell/both.
  let currentFlow = flowKey(lead.lead_type);
  let currentStep = lead.qualification_step ?? 0;
  if (lead.lead_type === "both") {
    // Lead is in the "both" holding state - route on their sell-first/buy-first
    // answer (default seller-first when unclear, per the flow doc).
    const lowered = replyText.toLowerCase();
    const wantsBuy = /\bbuy/.test(lowered);
    const wantsSell = /\bsell/.test(lowered);
    let chosen: "buyer" | "seller";
    if (wantsBuy && !wantsSell) chosen = "buyer";
    else if (wantsSell && !wantsBuy) chosen = "seller";
    else chosen = /sell\s*(first|then)/.test(lowered) || !wantsBuy ? "seller" : "buyer";
    await execute(
      env.D1DB,
      `UPDATE lead SET lead_type = ?, qualification_step = 0, status = 'Engaged', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      chosen, leadId,
    );
    lead.lead_type = chosen;
    currentFlow = chosen;
    currentStep = 0;
  } else if (currentFlow === "general" && classified.lead_type_signal) {
    const signal = classified.lead_type_signal;
    if (signal === "both") {
      // BOTH: hold in a 'both' state + ASK the disambiguation question; don't
      // start a qualification flow until they pick sell-first or buy-first.
      await execute(
        env.D1DB,
        `UPDATE lead SET lead_type = 'both', qualification_step = 0, status = 'Engaged', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        leadId,
      );
      const q = "Got it - are you planning to sell first, or buy first?";
      const result = await dispatchQuestion(env, lead, settings, q);
      await attachTag(env, lead.org_id, leadId, "AI Qualifying");
      await logAgentActivity(env, {
        orgId: lead.org_id, userId: lead.owner_id ?? settings.user_id, agentKey: "inbound",
        event: "reply.sent", leadId, leadLabel: lead.name || lead.first_name || "Lead",
        detail: q, status: result.sent ? "ok" : "warn",
      });
      return { status: "both_clarify", ...result };
    }
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
    if (lead.lead_type === "seller") await attachTag(env, lead.org_id, leadId, "hot_seller");
    await ensureDealForLead(env, lead.org_id, leadId, lead.lead_type).catch(() => {});
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
