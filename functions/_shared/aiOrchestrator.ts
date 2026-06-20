/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, queryAll, execute, nowIso } from "./db.ts";
import { chatWithTools, type ChatMessage, type ChatToolDef, type ChatToolCall } from "./openai.ts";
import { humanizeDashes } from "./humanizeText.ts";
import { buildAgentSystemPrompt, logAgentActivity, resolveReplyDelayMs } from "./aiAgents.ts";
import {
  loadSettingsForLead, aiSendAllowedForLead, attachTag,
  type LeadFull, type AutoResponseRow,
} from "./autoResponse.ts";
import { sendLeadSms, sendLeadMms } from "./leadSms.ts";
import { sendLeadEmail } from "./leadEmail.ts";
import { getAvailability, findOpenSlots, isSlotBookable } from "./availability.ts";
import { createProposedAppointment } from "./booking.ts";
import { openEscalation } from "./escalation.ts";
import { createTask } from "./tasks.ts";
import { applyAiDealUpdate, ensureDealForLead } from "./deals.ts";
import { searchListings, countOfferableListings, listingMediaUrls, parseImageKeys } from "./listings.ts";
import { refreshLeadIntelligence } from "./leadIntelligence.ts";
import { advanceQualification } from "./qualificationFlow.ts";
import { classifyReplyText } from "./intentClassifier.ts";
import { notify } from "./notify.ts";
import { STAGE_OPTIONS, normalizeStage } from "./leadStage.ts";

/**
 * The inbound AI brain - a real LLM tool-calling agent (NOT a keyword/template
 * state machine). Given a lead's reply, it reasons over the conversation +
 * agent knowledge + the lead profile and drives the CRM via tools: composes
 * replies in the agent's voice, qualifies one question at a time, saves
 * extracted data, books against the agent's real availability (proposed,
 * pending agent confirm), escalates, creates tasks, and moves deals.
 *
 * The LLM proposes; code disposes - every side effect runs through a guarded
 * path (sends via sendLeadSms = STOP/quiet-hours/rate-limit/footer; booking via
 * isSlotBookable + createProposedAppointment). Falls back to the template flow
 * (advanceQualification) when OpenAI is unavailable or the loop errors.
 */

const MAX_STEPS = 6;
// The channel the lead reached us on. The agent answers SMS -> SMS and
// email -> email; the orchestrator is otherwise channel-agnostic.
type Channel = "sms" | "email";
// Safety caps so a runaway model can't blast a giant message or bloat the
// context: one AI reply is capped (SMS is short; email can be a paragraph), and
// each tool result fed back is bounded.
const MAX_OUTBOUND_SMS_CHARS = 1000;
const MAX_OUTBOUND_EMAIL_CHARS = 4000;
const MAX_TOOL_OUTPUT_CHARS = 4000;

// NOTE: the inbound playbook, the "how/when to use each tool" guide, and the
// deal-pipeline taxonomy now live in buildAgentSystemPrompt (aiAgents.ts) so the
// runtime prompt and the "View system prompt" viewer are byte-identical. The
// orchestrator only layers the dynamic, per-lead context on top of that base.

const TOOLS: ChatToolDef[] = [
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Send an SMS to the lead. This is the ONLY way to say something to them. Keep it to one short message with at most one question.",
      parameters: { type: "object", properties: { text: { type: "string", description: "The message to text the lead, in the agent's voice." } }, required: ["text"] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead",
      description: "Save facts learned about the lead to the CRM. Only include fields the lead actually stated.",
      parameters: {
        type: "object",
        properties: {
          lead_type: { type: "string", enum: ["buyer", "seller", "both", "investor", "renter", "unknown"] },
          stage: {
            type: "string",
            enum: [...STAGE_OPTIONS],
            description: "pipeline stage - advance it as the conversation progresses (Contacted after first reply, Engaged when actively talking, Qualified once budget/timeline/intent are confirmed, Appointment Set when a meeting is booked). Drives the lead's Score.",
          },
          area: { type: "string" },
          price_range: { type: "string" },
          timeline: { type: "string" },
          pre_approved: { type: "boolean" },
          financing_status: { type: "string" },
          bedrooms: { type: "number" },
          bathrooms: { type: "number" },
          property_type: { type: "string" },
          property_address: { type: "string" },
          occupancy_status: { type: "string", enum: ["owner-occupied", "rented", "vacant"] },
          motivation: { type: "string" },
          seller_price_expectations: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_appointment_slots",
      description: "Get the agent's real open booking slots. Call before proposing a time. Returns slots inside the agent's hours that are not already booked.",
      parameters: {
        type: "object",
        properties: {
          preferred_day: { type: "string", description: "Optional: a weekday like 'monday' or a date 'YYYY-MM-DD'." },
          part_of_day: { type: "string", enum: ["morning", "afternoon", "evening"] },
          count: { type: "number", description: "How many slots to return (default 4)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Hold an appointment at a specific time (pending the agent's confirmation). Use an exact starts_at from find_appointment_slots. Returns an error + alternatives if the time is taken or out of hours.",
      parameters: {
        type: "object",
        properties: {
          starts_at: { type: "string", description: "ISO-8601 datetime (UTC), from find_appointment_slots." },
          meeting_type: { type: "string", enum: ["in_person", "phone", "google_meet"] },
          appointment_type: { type: "string", description: "e.g. Buyer Consult, Showing, Listing Appt, Call." },
          notes: { type: "string" },
        },
        required: ["starts_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_agent",
      description: "Flag the human agent to step in (hot lead / call request / commission / financing / legal / ready to transact / anything you cannot handle).",
      parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a follow-up task for the agent when a human is needed. Always include a short `why` (why it matters / the opportunity) and a `recommendation` (the concrete next action) - these are shown to the agent on the AI Recommended cards.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          why: { type: "string", description: "One sentence: why this matters / the conversion opportunity." },
          recommendation: { type: "string", description: "One sentence: the recommended next action for the agent." },
          score: { type: "string", description: "Conversion likelihood as a short string, e.g. \"92%\"." },
          score_label: { type: "string", description: "Short caption for the score, e.g. \"Likely to convert\" or \"Needs response\"." },
          due_at: { type: "string", description: "Optional ISO-8601 due time." },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          type: { type: "string", description: "call | email | showing | followup | cma | task" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_deal",
      description: "Create or move the lead's deal in the pipeline when the conversation shows real progress. Pass deal_type + a stage key from that pipeline + a short reason quoting the lead (see DEAL STAGE RULES in the system prompt). Major milestones (signed/contract/escrow/closed/lease) are saved as a suggestion the agent confirms - still call this when the lead states them.",
      parameters: {
        type: "object",
        properties: {
          deal_type: { type: "string", enum: ["buyer", "seller", "renter"], description: "Which pipeline this deal belongs to." },
          stage: { type: "string", description: "A stage KEY from the deal_type's pipeline (e.g. consult, search, contract, closed)." },
          reason: { type: "string", description: "Short quote/paraphrase of what the lead said that justifies this stage." },
          value: { type: "number" },
          probability: { type: "number", description: "0-100" },
          status: { type: "string", enum: ["open", "won", "lost", "archived"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_agent_knowledge",
      description: "Look up the agent's facts (service areas, commission, listings, calendar, specialties) to answer accurately. Returns JSON.",
      parameters: { type: "object", properties: { topic: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "End the turn without sending anything (lead disengaged, or already handed off).",
      parameters: { type: "object", properties: { reason: { type: "string" } } },
    },
  },
];

// Added to the tool set ONLY when the agent has offerable listings AND listing
// search is enabled (auto_response_settings.listing_search_enabled). Lets the AI
// match a buyer's criteria to real inventory instead of inventing homes.
const SEARCH_LISTINGS_TOOL: ChatToolDef = {
  type: "function",
  function: {
    name: "search_listings",
    description: "Search the agent's real property inventory for homes matching the buyer's criteria. Use before naming any specific property - never invent listings. Returns matching listings as JSON.",
    parameters: {
      type: "object",
      properties: {
        area: { type: "string", description: "City, ZIP, or area the buyer wants." },
        min_price: { type: "number" },
        max_price: { type: "number" },
        min_bedrooms: { type: "number" },
        min_bathrooms: { type: "number" },
        property_type: { type: "string", description: "single_family | condo | townhouse | multi_family | land | other" },
        listing_type: { type: "string", enum: ["sale", "rent"] },
      },
    },
  },
};

// Added only when the agent has listings WITH photos. Lets the AI text a
// listing's photo(s) over MMS when a lead asks to see pictures.
const SEND_MMS_TOOL: ChatToolDef = {
  type: "function",
  function: {
    name: "send_mms",
    description: "Text the lead photo(s) of a listing over MMS (use when they ask to see pictures). Pick the listing by area/address; only listings that have photos can be sent.",
    parameters: {
      type: "object",
      properties: {
        listing_query: { type: "string", description: "Area, ZIP, or address to pick which listing's photos to send." },
        caption: { type: "string", description: "A short caption to send with the photo(s), in the agent's voice." },
      },
    },
  },
};

interface LeadProfileRow {
  name: string | null; first_name: string | null; lead_type: string | null; intent: string | null;
  status: string | null; area: string | null; price_range: string | null; estimated_price: number | null;
  timeline: string | null; pre_approved: number | null; financing_status: string | null;
  bedrooms: number | null; bathrooms: number | null; property_type: string | null;
  property_address: string | null; occupancy_status: string | null; motivation: string | null;
  seller_price_expectations: string | null; qualification_status: string | null;
}

function profileBlock(p: LeadProfileRow): string {
  const f: string[] = [];
  const add = (k: string, v: unknown) => { if (v !== null && v !== undefined && v !== "") f.push(`${k}: ${v}`); };
  add("name", p.name || p.first_name);
  add("type", p.lead_type);
  add("temperature", p.intent);
  add("stage", p.status);
  add("area", p.area);
  add("budget", p.price_range || (p.estimated_price ? `~$${p.estimated_price}` : null));
  add("timeline", p.timeline);
  add("pre_approved", p.pre_approved === 1 ? "yes" : p.pre_approved === 0 ? "no" : null);
  add("financing", p.financing_status);
  add("beds", p.bedrooms);
  add("baths", p.bathrooms);
  add("property_type", p.property_type);
  add("property_address", p.property_address);
  add("occupancy", p.occupancy_status);
  add("motivation", p.motivation);
  add("seller_price_expectations", p.seller_price_expectations);
  add("qualification", p.qualification_status);
  return f.length ? f.join("\n") : "(empty - this is a fresh lead)";
}

const LEAD_UPDATE_FIELDS: Record<string, (v: unknown) => unknown> = {
  lead_type: (v) => String(v),
  // The AI sets `stage`; it writes to the lead.status column (normalized).
  status: (v) => normalizeStage(String(v)),
  intent: (v) => String(v),
  area: (v) => String(v),
  price_range: (v) => String(v),
  timeline: (v) => String(v),
  pre_approved: (v) => (v ? 1 : 0),
  financing_status: (v) => String(v),
  bedrooms: (v) => Number(v),
  bathrooms: (v) => Number(v),
  property_type: (v) => String(v),
  property_address: (v) => String(v),
  occupancy_status: (v) => String(v),
  motivation: (v) => String(v),
  seller_price_expectations: (v) => String(v),
};

async function applyLeadUpdates(env: Env, leadId: number, fields: Record<string, unknown>): Promise<{ message: string; applied: string[] }> {
  const sets: string[] = [];
  const args: unknown[] = [];
  const applied: string[] = [];
  for (const [k, fn] of Object.entries(LEAD_UPDATE_FIELDS)) {
    if (k in fields && fields[k] !== null && fields[k] !== undefined && fields[k] !== "") {
      sets.push(`${k} = ?`); args.push(fn(fields[k])); applied.push(k);
    }
  }
  if (!sets.length) return { message: "No fields to update.", applied };
  args.push(leadId);
  await execute(env.D1DB, `UPDATE lead SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args);
  return { message: `Saved: ${applied.join(", ")}.`, applied };
}

// How many past SMS to give the agent as context. SMS are short, so 100 is
// cheap on gpt-4o-mini (most threads never reach it; this just caps the worst
// case). Raise/lower here if token cost ever becomes a concern.
const HISTORY_LIMIT = 50;

/** Recent SMS thread for the lead's phone, oldest-first, as chat messages. */
async function loadHistory(env: Env, orgId: number, phone: string): Promise<ChatMessage[]> {
  const rows = await queryAll<{ direction: string; body: string | null }>(
    env.D1DB,
    `SELECT m.direction, m.body
       FROM sms_message m
       JOIN sms_conversation c ON c.id = m.conversation_id
       JOIN sms_contact ct ON ct.id = c.contact_id
      WHERE ct.org_id = ? AND ct.phone_number_e164 = ?
      ORDER BY m.id DESC LIMIT ?`,
    orgId, phone, HISTORY_LIMIT,
  );
  return rows.reverse().map((r) => ({
    role: r.direction === "inbound" ? "user" : "assistant",
    content: r.body || "",
  } as ChatMessage));
}

/** Recent email thread for the lead, oldest-first. Bodies are clamped because
 *  email is far longer than SMS - we never feed a 100k email to the model. */
async function loadEmailHistory(env: Env, leadId: number): Promise<ChatMessage[]> {
  const rows = await queryAll<{ direction: string; body: string | null }>(
    env.D1DB,
    `SELECT m.direction, m.body
       FROM inbox_messages m
       JOIN thread t ON t.id = m.thread_id
       JOIN thread_lead_assignments tla ON tla.thread_id = t.id
       JOIN inbox i ON i.id = t.inbox_id
      WHERE tla.lead_id = ? AND i.channel = 'email'
      ORDER BY m.id DESC LIMIT ?`,
    leadId, HISTORY_LIMIT,
  );
  return rows.reverse().map((r) => ({
    role: r.direction === "inbound" ? "user" : "assistant",
    content: (r.body || "").slice(0, 2000),
  } as ChatMessage));
}

/** "Re: <subject>" for a threaded email reply (prefix once, default if empty). */
function buildReplySubject(raw?: string | null): string {
  const s = (raw || "").trim();
  if (!s) return "Re: your message";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

async function notifyAgent(env: Env, lead: LeadFull, title: string, body: string): Promise<void> {
  if (!lead.owner_id) return;
  try {
    await execute(
      env.D1DB,
      `INSERT INTO notification (user_id, org_id, kind, title, body, created_at) VALUES (?, ?, 'system', ?, ?, ?)`,
      lead.owner_id, lead.org_id, title, body, nowIso(),
    );
  } catch { /* non-fatal */ }
}

interface LoopState { sent: boolean; booked: boolean; escalated: boolean; deliveredText?: string }

async function executeTool(
  env: Env, orgId: number, userId: number, lead: LeadFull, settings: AutoResponseRow,
  state: LoopState, channel: Channel, replySubject: string, replyDelayMs: number, name: string, args: Record<string, unknown>,
): Promise<string> {
  const label = lead.name || lead.first_name || "Lead";
  switch (name) {
    case "send_message": {
      const cap = channel === "email" ? MAX_OUTBOUND_EMAIL_CHARS : MAX_OUTBOUND_SMS_CHARS;
      // Strip the em-dash "AI tell" out of every live reply (commas, not dashes).
      const text = humanizeDashes(String(args.text || "").trim()).slice(0, cap);
      if (!text) return "Nothing to send.";
      const r = channel === "email"
        ? await sendLeadEmail(env, lead, settings, text, replySubject, { delayMs: replyDelayMs })
        : await sendLeadSms(env, lead, settings, text, { delayMs: replyDelayMs });
      state.sent = true;
      if (r.sent) state.deliveredText = text;
      await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "reply.sent", leadId: lead.id, leadLabel: label, detail: text, status: r.sent ? "ok" : "warn" });
      if (r.sent) return "Sent.";
      if (r.queued) return replyDelayMs > 0
        ? "Queued with a natural delay - the cron will send it shortly."
        : "Queued (quiet hours) - will send when the window opens.";
      return `Could not send (${("reason" in r && r.reason) || "lead is opted out"}).`;
    }
    case "update_lead": {
      // The tool exposes `stage`; persist it onto the lead.status column.
      if ("stage" in args && args.stage != null && args.stage !== "") {
        args.status = args.stage;
      }
      // Read the current stage first so we can tell a real pipeline move (status
      // changed) apart from an ordinary field edit. A move is logged as a
      // distinct `lead.stage_changed` event so the autopilot "moved N leads
      // between stages" counter reflects genuine stage transitions, not edits.
      const wantsStatus = "status" in args && args.status != null && args.status !== "";
      const prevStatus = wantsStatus
        ? (await queryFirst<{ status: string | null }>(env.D1DB, `SELECT status FROM lead WHERE id = ?`, lead.id))?.status ?? null
        : null;
      const { message: msg, applied } = await applyLeadUpdates(env, lead.id, args);
      // Compare both sides NORMALIZED (the stored value may be a legacy/imported
      // label that maps onto the same canonical stage) so only a genuine pipeline
      // move is logged + counted - not a casing/legacy difference.
      const newStatus = wantsStatus ? normalizeStage(String(args.status)) : null;
      const prevNorm = prevStatus != null ? normalizeStage(prevStatus) : null;
      const movedStage = newStatus != null && newStatus !== prevNorm;
      const editedFields = applied.some((k) => k !== "status");
      if (movedStage) {
        await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "lead.stage_changed", leadId: lead.id, leadLabel: label, detail: `${prevNorm ?? "-"} -> ${newStatus}`, status: "ok" });
        // Deal birth: a lead reaching Qualified (or beyond) is a real
        // transaction - start its deal at the pipeline's first stage if the AI
        // hasn't created one via upsert_deal (no-op when one exists).
        if (["Qualified", "Appointment Set", "Active Client", "Under Contract", "Closed"].includes(newStatus as string)) {
          const bornId = await ensureDealForLead(env, orgId, lead.id, (args.lead_type ? String(args.lead_type) : null) || lead.lead_type).catch(() => null);
          if (bornId) {
            await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "deal.created", leadId: lead.id, leadLabel: label, detail: `Deal created (lead reached ${newStatus})`, status: "ok" });
          }
        }
      }
      // Log a record update when non-stage fields changed, or when nothing
      // meaningful moved (so the action still shows in the activity feed).
      if (editedFields || !movedStage) {
        await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "lead.updated", leadId: lead.id, leadLabel: label, detail: msg, status: "ok" });
      }
      return msg;
    }
    case "find_appointment_slots": {
      const slotOpts: { preferredDay?: string; partOfDay?: string; count?: number } = { count: args.count ? Number(args.count) : 4 };
      if (args.preferred_day) slotOpts.preferredDay = String(args.preferred_day);
      if (args.part_of_day) slotOpts.partOfDay = String(args.part_of_day);
      const slots = await findOpenSlots(env, orgId, lead.owner_id ?? userId, slotOpts);
      if (!slots.length) return "No open slots in the agent's availability for that request. Try a different day, or escalate to the agent.";
      return JSON.stringify(slots);
    }
    case "book_appointment": {
      const startsAt = String(args.starts_at || "");
      // Guard against double-booking: if the lead already has a live (non-cancelled)
      // upcoming appointment, a reply like "okay"/"sure" is them CONFIRMING it - not
      // asking for another. Don't create a duplicate; tell the AI to acknowledge it.
      const existingAppt = await queryFirst<{ id: number; starts_at: string }>(
        env.D1DB,
        `SELECT id, starts_at FROM lead_appointment
          WHERE lead_id = ? AND COALESCE(status,'') != 'cancelled'
            AND datetime(starts_at) >= datetime('now')
          ORDER BY datetime(starts_at) ASC LIMIT 1`,
        lead.id,
      );
      if (existingAppt) {
        return `This lead already has an appointment proposed for ${existingAppt.starts_at}. Do NOT book another - just acknowledge it (e.g. "Great, you're set - the agent will confirm shortly") and answer any questions. Only book again if the lead explicitly asks to change the time (then use reschedule, not a new booking).`;
      }
      const check = await isSlotBookable(env, orgId, lead.owner_id ?? userId, startsAt);
      if (!check.ok) {
        const alts = await findOpenSlots(env, orgId, lead.owner_id ?? userId, { count: 4 });
        return `Cannot book: ${check.reason}. Offer one of these open slots instead: ${JSON.stringify(alts)}`;
      }
      const apptId = await createProposedAppointment(env, {
        orgId, leadId: lead.id, ownerId: lead.owner_id ?? userId,
        startsAtIso: startsAt, meetingType: args.meeting_type ? String(args.meeting_type) : "phone",
        appointmentType: args.appointment_type ? String(args.appointment_type) : "Consultation",
        notes: args.notes ? String(args.notes) : null,
      });
      state.booked = true;
      // Advance the stage so the Score + pipeline reflect the booking. Capture
      // the previous stage first so a genuine move is counted once.
      const prevApptStatus = (await queryFirst<{ status: string | null }>(env.D1DB, `SELECT status FROM lead WHERE id = ?`, lead.id))?.status ?? null;
      await execute(env.D1DB, `UPDATE lead SET status = 'Appointment Set', appointment_booked = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, lead.id);
      // Deal birth: a booked consultation is the start of a real transaction -
      // make sure the lead has a deal at its pipeline's first stage.
      const bornDealId = await ensureDealForLead(env, orgId, lead.id, lead.lead_type).catch(() => null);
      if (bornDealId) {
        await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "deal.created", leadId: lead.id, leadLabel: label, detail: "Deal created on appointment booking", status: "ok" });
      }
      await openEscalation(env, { orgId, leadId: lead.id, ownerId: lead.owner_id, reason: "Appointment proposed - confirm", detail: startsAt });
      await notifyAgent(env, lead, "AI proposed an appointment", `${label}: confirm the proposed time.`);
      await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "appointment.proposed", leadId: lead.id, leadLabel: label, detail: startsAt, status: "ok" });
      const prevApptNorm = prevApptStatus != null ? normalizeStage(prevApptStatus) : null;
      if (prevApptNorm !== "Appointment Set") {
        await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "lead.stage_changed", leadId: lead.id, leadLabel: label, detail: `${prevApptNorm ?? "-"} -> Appointment Set`, status: "ok" });
      }
      // Surface the proposed appointment as a "confirm" task in the action center
      // (deduped per lead) so the agent has a clear to-do, not just a notification.
      const apptMeeting = args.meeting_type ? String(args.meeting_type) : "phone";
      const apptTaskType = apptMeeting === "in_person" ? "showing" : "call";
      const apptDup = await queryFirst<{ id: number }>(
        env.D1DB,
        `SELECT id FROM task WHERE lead_id = ? AND type = ? AND status = 'open' LIMIT 1`,
        lead.id, apptTaskType,
      );
      if (!apptDup) {
        await createTask(env, {
          orgId, userId: lead.owner_id ?? userId, leadId: lead.id,
          title: `Confirm appointment with ${label}`, type: apptTaskType,
          why: `AI proposed an appointment for ${startsAt}`,
          recommendation: "Review and confirm the proposed time, or reschedule.",
          scoreLabel: "Booking-ready", priority: "high", source: "ai",
        }).catch(() => {});
        await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "task.created", leadId: lead.id, leadLabel: label, detail: `Confirm appointment with ${label}`, status: "ok" });
      }
      return `Held appointment #${apptId} for ${startsAt} (pending the agent's confirmation). Tell the lead it is tentatively set and the agent will confirm.`;
    }
    case "escalate_to_agent": {
      const reason = String(args.reason || "Lead needs the agent");
      await openEscalation(env, { orgId, leadId: lead.id, ownerId: lead.owner_id, reason, detail: reason });
      // Tag hot_seller when escalating a seller (spec: seller booking trigger -> hot_seller + notify).
      if (lead.lead_type === "seller") await attachTag(env, orgId, lead.id, "hot_seller").catch(() => {});
      await notifyAgent(env, lead, "AI escalated a lead", `${label}: ${reason}`);
      // Surface every escalation as an actionable TASK so the agent sees it in the
      // Tasks action center (an escalation alone only notifies). Infer the task
      // type/title from the reason; dedupe against an existing open task of the
      // same type for this lead so repeated asks don't stack duplicates.
      const lower = reason.toLowerCase();
      const isCall = /\b(call|phone|call ?back|speak|talk)\b/.test(lower);
      const isShowing = /\b(show|showing|tour|visit|see the)\b/.test(lower);
      const taskType = isCall ? "call" : isShowing ? "showing" : "followup";
      const taskTitle = isCall
        ? `Call back ${label}`
        : isShowing ? `Schedule a showing for ${label}` : `Follow up with ${label}`;
      const dup = await queryFirst<{ id: number }>(
        env.D1DB,
        `SELECT id FROM task WHERE lead_id = ? AND type = ? AND status = 'open' LIMIT 1`,
        lead.id, taskType,
      );
      if (!dup) {
        await createTask(env, {
          orgId, userId: lead.owner_id ?? userId, leadId: lead.id,
          title: taskTitle, type: taskType, why: reason,
          recommendation: isCall
            ? "Call the lead - they asked to speak with the agent."
            : "Reach out to the lead to move this forward.",
          scoreLabel: "Needs response", priority: "high", source: "ai",
        }).catch(() => {});
        await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "task.created", leadId: lead.id, leadLabel: label, detail: taskTitle, status: "ok" });
      }
      state.escalated = true;
      await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "lead.escalated", leadId: lead.id, leadLabel: label, detail: reason, status: "warn" });
      return "Escalated to the agent and created a follow-up task.";
    }
    case "create_task": {
      await createTask(env, {
        orgId, userId: lead.owner_id ?? userId, leadId: lead.id,
        title: String(args.title || "Follow up"), type: args.type ? String(args.type) : "followup",
        why: args.why ? String(args.why) : null,
        recommendation: args.recommendation ? String(args.recommendation) : null,
        score: args.score ? String(args.score) : null,
        scoreLabel: args.score_label ? String(args.score_label) : null,
        priority: args.priority ? String(args.priority) : "normal",
        dueAt: args.due_at ? String(args.due_at) : null, source: "ai",
      });
      await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "task.created", leadId: lead.id, leadLabel: label, detail: String(args.title || ""), status: "ok" });
      return "Task created.";
    }
    case "upsert_deal": {
      const res = await applyAiDealUpdate(env, orgId, lead.id, {
        dealType: args.deal_type !== undefined ? String(args.deal_type) : undefined,
        stage: args.stage !== undefined ? String(args.stage) : undefined,
        reason: args.reason !== undefined ? String(args.reason) : undefined,
        value: args.value !== undefined ? Number(args.value) : undefined,
        probability: args.probability !== undefined ? Number(args.probability) : undefined,
        status: args.status !== undefined ? String(args.status) : undefined,
      });
      if (res.kind === "invalid") return res.message;
      if (res.kind === "suggested") {
        // Major milestone: not applied - surface it as a confirm task (deduped
        // per deal) alongside the card's "AI suggests" button.
        const dup = await queryFirst<{ id: number }>(
          env.D1DB, `SELECT id FROM task WHERE deal_id = ? AND status = 'open' AND title LIKE 'Confirm deal stage%' LIMIT 1`, res.dealId,
        );
        if (!dup) {
          await createTask(env, {
            orgId, userId: lead.owner_id ?? userId, leadId: lead.id, dealId: res.dealId,
            title: `Confirm deal stage: ${label} -> ${res.stageDisplay}`, type: "task",
            why: res.reason || `The conversation indicates this deal reached "${res.stageDisplay}".`,
            recommendation: `Accept the suggestion on the deal card (or drag the deal) if "${res.stageDisplay}" is right.`,
            scoreLabel: "Stage suggestion", priority: "high", source: "ai",
          }).catch(() => {});
          await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "task.created", leadId: lead.id, leadLabel: label, detail: `Confirm deal stage -> ${res.stageDisplay}`, status: "ok" });
        }
        await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "deal.stage_suggested", leadId: lead.id, leadLabel: label, detail: `${res.stageDisplay}${res.reason ? ` - ${res.reason}` : ""}`, status: "ok" });
        return `"${res.stageDisplay}" is a major milestone, so it was recorded as a suggestion for the agent to confirm (not applied yet). Do not tell the lead about pipeline stages - just continue the conversation naturally.`;
      }
      await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "deal.updated", leadId: lead.id, leadLabel: label, detail: JSON.stringify(args), status: "ok" });
      return "Deal updated.";
    }
    case "get_agent_knowledge": {
      const prof = await queryFirst<Record<string, unknown>>(
        env.D1DB,
        `SELECT agent_name, brokerage_name, phone, email, website, service_areas, buyer_commission,
                seller_commission, current_listings, past_sales, avg_price_point, specialties,
                calendar_link, preferred_lender FROM agent_profile WHERE org_id = ? AND user_id = ? LIMIT 1`,
        orgId, lead.owner_id ?? userId,
      );
      return prof ? JSON.stringify(prof) : "No agent knowledge profile is filled in yet.";
    }
    case "search_listings": {
      if (settings.listing_search_enabled !== 1) return "Listing search is turned off. Tell the lead the agent will send some options.";
      const ownerId = lead.owner_id ?? userId;
      const crit: Parameters<typeof searchListings>[3] = {};
      if (args.area) crit.area = String(args.area);
      if (args.min_price !== undefined) crit.minPrice = Number(args.min_price);
      if (args.max_price !== undefined) crit.maxPrice = Number(args.max_price);
      if (args.min_bedrooms !== undefined) crit.minBedrooms = Number(args.min_bedrooms);
      if (args.min_bathrooms !== undefined) crit.minBathrooms = Number(args.min_bathrooms);
      if (args.property_type) crit.propertyType = String(args.property_type);
      if (args.listing_type) crit.listingType = String(args.listing_type);
      const matches = await searchListings(env, orgId, ownerId, crit);
      await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "listings.searched", leadId: lead.id, leadLabel: label, detail: `${matches.length} match(es)`, status: "ok" });
      if (!matches.length) return "No matching listings in the agent's inventory. Do not invent any - offer to widen the criteria or have the agent send options.";
      // Compact shape to keep the tool result small.
      const slim = matches.map((m) => ({
        address: [m.address, m.city, m.state, m.zip].filter(Boolean).join(", "),
        price: m.price, bedrooms: m.bedrooms, bathrooms: m.bathrooms,
        square_feet: m.square_feet, property_type: m.property_type,
        listing_type: m.listing_type, status: m.status, url: m.url,
        has_photos: parseImageKeys(m.image_keys).length > 0,
      }));
      return JSON.stringify(slim);
    }
    case "send_mms": {
      if (settings.listing_search_enabled !== 1) return "Listing photos are turned off.";
      const ownerId = lead.owner_id ?? userId;
      const crit: Parameters<typeof searchListings>[3] = { limit: 5 };
      if (args.listing_query) crit.area = String(args.listing_query);
      const matches = await searchListings(env, orgId, ownerId, crit);
      const withPhotos = matches.find((m) => parseImageKeys(m.image_keys).length > 0);
      if (!withPhotos) return "No matching listing has photos. Do not invent any - offer to have the agent send some, or pick another listing.";
      const urls = listingMediaUrls(env, parseImageKeys(withPhotos.image_keys), 3);
      const addr = [withPhotos.address, withPhotos.city].filter(Boolean).join(", ") || "this listing";
      const caption = String(args.caption || "").trim() || `Here's ${addr}${withPhotos.price ? ` - $${withPhotos.price.toLocaleString("en-US")}` : ""}.`;
      const r = await sendLeadMms(env, lead, settings, caption, urls);
      state.sent = state.sent || r.sent;
      await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "mms.sent", leadId: lead.id, leadLabel: label, detail: `${addr} (${urls.length} photo)`, status: r.sent ? "ok" : "warn" });
      return r.sent ? `Sent ${urls.length} photo(s) of ${addr}.` : `Could not send the photo (${r.reason}). Offer a text description or to follow up.`;
    }
    case "finish":
      return "Done.";
    default:
      return `Unknown tool: ${name}`;
  }
}

async function runAgentLoop(
  env: Env, orgId: number, userId: number, lead: LeadFull, settings: AutoResponseRow,
  channel: Channel, replySubject: string,
): Promise<{ status: string; sent: boolean }> {
  const profileRow = await queryFirst<LeadProfileRow>(
    env.D1DB,
    `SELECT name, first_name, lead_type, intent, status, area, price_range, estimated_price, timeline,
            pre_approved, financing_status, bedrooms, bathrooms, property_type, property_address,
            occupancy_status, motivation, seller_price_expectations, qualification_status
       FROM lead WHERE id = ?`,
    lead.id,
  );

  // Lead tags (set by the agent or at import). The AI reads them to tune its
  // TONE/approach - not to re-ask facts. Imported lists often carry segment
  // labels ("VIP", "Past Client", "Cold", "Investor") that should shape voice.
  const tagRows = await queryAll<{ name: string }>(
    env.D1DB,
    `SELECT t.name FROM lead_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.lead_id = ? ORDER BY t.name`,
    lead.id,
  );
  const leadTags = tagRows.map((r) => r.name).filter(Boolean);

  const base = await buildAgentSystemPrompt(env, orgId, userId, "inbound");
  const cfg = await getAvailability(env, orgId, lead.owner_id ?? userId);
  const availLine = cfg.enabled
    ? `Timezone ${cfg.timezone}; ${cfg.slotMinutes}-min slots. Always call find_appointment_slots for real open times - never invent a time.`
    : "Booking is OFF - do not offer to book; escalate instead.";

  // Listing search: only expose the search/MMS tools when enabled AND there is
  // inventory. The matching prompt guidance (incl. the "no listings -> escalate"
  // rule when escalate_no_listings is on) lives in buildAgentSystemPrompt, so the
  // runtime prompt and the "View system prompt" viewer stay identical.
  const listingsEnabled = settings.listing_search_enabled === 1;
  const listingCount = listingsEnabled ? await countOfferableListings(env, orgId, lead.owner_id ?? userId) : 0;
  const listingsActive = listingsEnabled && listingCount > 0;
  // MMS (texting listing photos) is an SMS-only capability; never offer it on email.
  const tools = listingsActive
    ? [...TOOLS, SEARCH_LISTINGS_TOOL, ...(channel === "sms" ? [SEND_MMS_TOOL] : [])]
    : TOOLS;

  const channelLine = channel === "email"
    ? "You are replying over EMAIL. Write a brief, professional reply - a short paragraph is fine, but stay concise and ask at most one question. Plain text only (no markdown or HTML). The subject is handled for you; do not write one."
    : "You are replying over SMS. Keep each message short (a sentence or two) with at most one question.";

  // base (buildAgentSystemPrompt) already carries the playbook, the tool guide,
  // and the deal pipelines. Here we only add the dynamic, per-lead context.
  const tagsLine = leadTags.length
    ? `\n\nLEAD TAGS (labels set by the agent or at import - use them to tune your TONE and approach, NOT to re-ask facts. Examples: "VIP"/"Past Client" -> warm & familiar; "Hot"/"Urgent" -> prompt, action-oriented; "Cold"/"Nurture" -> gentle, low-pressure; "Investor" -> numbers/ROI-focused): ${leadTags.join(", ")}`
    : "";
  const system = `${base}\n\nCHANNEL: ${channelLine}\n\nLEAD PROFILE (already known - do not re-ask):\n${profileRow ? profileBlock(profileRow) : "(unknown)"}${tagsLine}\n\nAGENT BOOKING AVAILABILITY: ${availLine}\n\nCURRENT TIME (UTC): ${nowIso()}`;

  const history = channel === "email"
    ? await loadEmailHistory(env, lead.id)
    : (lead.phone ? await loadHistory(env, orgId, lead.phone) : []);
  const messages: ChatMessage[] = [{ role: "system", content: system }, ...history];
  const state: LoopState = { sent: false, booked: false, escalated: false };
  // Response-timing pause (persona). Natural delay -> queue the reply for the
  // cron instead of sending instantly.
  const replyDelayMs = await resolveReplyDelayMs(env, orgId, lead.owner_id ?? userId);

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await chatWithTools(env, messages, tools, { orgId });
    if (!res.tool_calls.length) {
      // Final text with no tool call: send it if we have not sent yet.
      if (res.content && res.content.trim() && !state.sent) {
        const cap = channel === "email" ? MAX_OUTBOUND_EMAIL_CHARS : MAX_OUTBOUND_SMS_CHARS;
        const text = res.content.trim().slice(0, cap);
        const r = channel === "email"
          ? await sendLeadEmail(env, lead, settings, text, replySubject, { delayMs: replyDelayMs })
          : await sendLeadSms(env, lead, settings, text, { delayMs: replyDelayMs });
        state.sent = true;
        if (r.sent) state.deliveredText = text;
        await logAgentActivity(env, { orgId, userId, agentKey: "inbound", event: "reply.sent", leadId: lead.id, leadLabel: lead.name || lead.first_name || "Lead", detail: text, status: r.sent ? "ok" : "warn" });
      }
      break;
    }
    messages.push({ role: "assistant", content: res.content, tool_calls: res.tool_calls });
    let finished = false;
    for (const tc of res.tool_calls as ChatToolCall[]) {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(tc.function.arguments || "{}"); } catch { parsed = {}; }
      // A single tool failing must not abort the turn - return the error to the
      // model so it can recover or finish, and bound the result size.
      let out: string;
      try {
        out = await executeTool(env, orgId, userId, lead, settings, state, channel, replySubject, replyDelayMs, tc.function.name, parsed);
      } catch (e) {
        out = `Tool "${tc.function.name}" failed: ${String(e).slice(0, 150)}. Continue without it or finish.`;
      }
      if (out.length > MAX_TOOL_OUTPUT_CHARS) out = out.slice(0, MAX_TOOL_OUTPUT_CHARS);
      messages.push({ role: "tool", tool_call_id: tc.id, content: out });
      if (tc.function.name === "finish") finished = true;
    }
    if (finished) break;
  }

  // Transparency: tell the human agent their AI assistant just messaged a lead
  // on their behalf (bell + in-app toast + web push), so they have passive
  // awareness without watching the AI page. One notification per run, only when
  // a message was actually delivered (a quiet-hours queue notifies nothing -
  // the cron flush will not re-notify). Gated by the user's notify_ai_reply
  // pref inside notify(); best-effort so it never blocks the reply.
  if (state.deliveredText) {
    const leadLabel = lead.name || lead.first_name || "Lead";
    await notify(env, {
      userId: lead.owner_id ?? userId,
      orgId,
      kind: "ai_reply_sent",
      channel: channel === "email" ? "email" : "sms",
      contactId: lead.id,
      severity: "info",
      title: `AI replied to ${leadLabel}`,
      body: state.deliveredText.slice(0, 240),
      data: { path: `/inbox?lead=${lead.id}`, lead_id: lead.id, lead_name: lead.name ?? null, ai: true },
    }).catch((err) => { console.warn("[ai-orchestrator] notify failed", err); });
  }

  return { status: state.booked ? "booked" : state.escalated ? "escalated" : state.sent ? "replied" : "no_action", sent: state.sent };
}

/**
 * Entry point: run the inbound agent for one lead reply. Gated by the 3-level AI
 * controls; falls back to the template flow when OpenAI is unavailable or errors.
 */
export async function runInboundAgent(
  env: Env, leadId: number, replyText: string,
  opts: { channel?: Channel; subject?: string | null } = {},
): Promise<{ status: string; sent?: boolean }> {
  const channel: Channel = opts.channel === "email" ? "email" : "sms";
  const ctx = await loadSettingsForLead(env, leadId);
  if (!ctx) return { status: "no_settings" };
  const { settings, lead } = ctx;
  if (!settings.enabled || !settings.qualification_enabled) return { status: "disabled" };
  if (!(await aiSendAllowedForLead(env, lead))) return { status: "disabled" };
  // Channel-specific destination: email needs an address, SMS needs a number.
  if (channel === "email") {
    if (!lead.email) return { status: "no_email" };
  } else if (!lead.phone) {
    return { status: "no_phone" };
  }

  // No LLM configured -> the template flow keeps an SMS lead moving. The
  // template flow is SMS-only, so an email lead just no-ops (no reply sent).
  if (!env.OPENAI_API_KEY) {
    return channel === "sms" ? advanceQualification(env, leadId, replyText) : { status: "no_openai" };
  }

  // On first reply, advance to Engaged - but never downgrade a lead that is
  // already further along (Qualified / Appointment Set / etc).
  if (!lead.last_reply_at) {
    await execute(
      env.D1DB,
      `UPDATE lead SET last_reply_at = ?,
         status = CASE WHEN LOWER(IFNULL(status,'')) IN ('','new','new lead','contacted','warm','nurture')
                       THEN 'Engaged' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      nowIso(), leadId,
    );
  } else {
    await execute(env.D1DB, `UPDATE lead SET last_reply_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, nowIso(), leadId);
  }

  // Deterministic lead_type backstop: the spec requires intent detection to SET
  // lead_type (buyer/seller/both) on the lead. LLMs don't reliably fire the
  // update_lead tool on the same turn they reply, so when the type is still
  // unknown and the reply clearly signals one, persist it here - before the agent
  // loop reads the profile - so the type-scoped qualification questions apply and
  // the CRM reflects intent regardless of the model's tool choices.
  if (!lead.lead_type || lead.lead_type === "unknown") {
    try {
      const c = await classifyReplyText(env, replyText, lead.lead_type);
      if (c.lead_type_signal) {
        await execute(env.D1DB, `UPDATE lead SET lead_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, c.lead_type_signal, leadId);
        lead.lead_type = c.lead_type_signal;
      }
    } catch { /* non-fatal - the agent can still set it via update_lead */ }
  }

  const replySubject = channel === "email" ? buildReplySubject(opts.subject) : "";

  try {
    const result = await runAgentLoop(env, lead.org_id, lead.owner_id ?? settings.user_id, lead, settings, channel, replySubject);
    await refreshLeadIntelligence(env, leadId).catch(() => {});
    return result;
  } catch (e) {
    await logAgentActivity(env, {
      orgId: lead.org_id, userId: lead.owner_id ?? settings.user_id, agentKey: "inbound",
      event: "agent.error", leadId, leadLabel: lead.name || lead.first_name || "Lead",
      detail: String(e).slice(0, 200), status: "error",
    }).catch(() => {});
    // Resilience: fall back (SMS only) so the lead is never left hanging.
    return channel === "sms" ? advanceQualification(env, leadId, replyText) : { status: "agent_error" };
  }
}
