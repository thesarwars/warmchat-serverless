/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, queryAll, execute } from "./db.ts";
import { buildLeadAssistantSystemPrompt } from "./openai.ts";
import { dealPipelineText } from "./deals.ts";
import { countOfferableListings } from "./listings.ts";
import { getBookingEnabled } from "./availability.ts";
import { responseTimeToMs } from "./personaUi.ts";

/** Stable agent identifiers used by the UI, routes, and DB rows. */
export const AGENT_KEYS = ["assistant", "inbound", "outbound"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export function isAgentKey(v: string): v is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(v);
}

/**
 * Resolve the AI reply delay (ms) from the agent's "Response timing" persona
 * (agent_profile.persona_json.timing). When natural-delay is set, inbound replies
 * are queued into scheduled_message that many ms out so the cron sends them after
 * a human-like pause instead of replying instantly. Shared by the tool-calling
 * orchestrator AND the qualification fallback so every inbound AI reply honors it.
 * Default (no explicit setting) is a 30-second natural delay; "Immediate" = 0.
 */
export async function resolveReplyDelayMs(env: Env, orgId: number, userId: number): Promise<number> {
  try {
    const row = await queryFirst<{ persona_json: string | null }>(
      env.D1DB, `SELECT persona_json FROM agent_profile WHERE org_id = ? AND user_id = ? LIMIT 1`, orgId, userId,
    );
    const parsed = row?.persona_json
      ? (JSON.parse(row.persona_json) as { timing?: string; ui?: { responseTime?: string } })
      : null;
    // AI Settings "Response Time" (persona.ui.responseTime) takes precedence when
    // the user has set it. Present-key-ONLY: an absent key returns null here so we
    // fall through to the legacy `timing` field and the 30s default - existing
    // agents (no ui key) keep today's behavior exactly.
    const uiMs = responseTimeToMs(parsed?.ui?.responseTime);
    if (uiMs !== null) return uiMs;
    const timing = String(parsed?.timing || "").toLowerCase();
    if (timing.includes("immediate")) return 0;
    if (timing.includes("random")) return 30_000 + Math.floor(Math.random() * 90_000);
    return 30_000; // "natural delay (30 seconds)" and the default
  } catch { return 30_000; }
}

/**
 * Canonical workflow cards per agent (Inbound w1-w5, Outbound o1-o5), matching
 * the design. Inbound cards mirror onto auto_response_settings flags via
 * `engineField` so toggling a card actually drives the engine; outbound cards
 * persist on ai_workflow only (the per-automation builders own their state).
 * These are lazily materialized per (org,user) on first read - the project's
 * "starts empty, lazy-default" convention - so real signups get them too.
 */
export interface WorkflowDef {
  key: string;
  name: string;
  trigger_type: string;
  trigger_source: string;
  action: string;
  outcome: string;
  position: number;
  defaultEnabled: boolean;
  /** auto_response_settings column an inbound card mirrors (and reads its initial state from). */
  engineField?: string;
}

export const WORKFLOW_DEFS: Record<"inbound" | "outbound", WorkflowDef[]> = {
  inbound: [
    { key: "w1", name: "New lead -> instant reply", trigger_type: "New lead", trigger_source: "Zillow, FB, Site", action: "AI replies within 60s, asks 3 qualifying questions", outcome: "Routes to inbox or books showing", position: 0, defaultEnabled: true, engineField: "inbound_sms_enabled" },
    { key: "w2", name: "Lead replies -> qualify", trigger_type: "Lead reply", trigger_source: "SMS / Email", action: "Detects intent, scores 1-100, updates pipeline stage", outcome: "Hot -> owner, Warm -> nurture, Cold -> drip", position: 1, defaultEnabled: true, engineField: "qualification_enabled" },
    { key: "w3", name: "Missed call -> auto text", trigger_type: "Missed call", trigger_source: "Business line", action: "Sends apology + offer to text back", outcome: "Conversation opened in inbox", position: 2, defaultEnabled: true, engineField: "missed_call_enabled" },
    { key: "w4", name: "Website form -> create lead + respond", trigger_type: "Form submit", trigger_source: "Website", action: "Creates contact, replies with personalized note", outcome: "New lead - Pre-qualified", position: 3, defaultEnabled: true, engineField: "inbound_new_send_reply" },
    // w5 is the booking master control. Its on/off state is NOT a column on
    // auto_response_settings - it IS agent_availability.enabled (the same flag the
    // Availability editor's master switch drives), so the card and the editor are
    // one toggle. Handled specially in ensureWorkflows / the workflows GET+PATCH;
    // it has no engineField. Defaults ON to match agent_availability.enabled.
    { key: "w5", name: "Booking intent -> push appointment", trigger_type: "Intent detected", trigger_source: "Any channel", action: "Offers calendar slots, confirms, sends invite", outcome: "Appointment booked on your calendar", position: 4, defaultEnabled: true },
  ],
  outbound: [
    { key: "o1", name: "Cold follow-up automation", trigger_type: "No reply", trigger_source: "After 48h", action: "Multi-step SMS sequence, AI-personalized per lead", outcome: "Pause on reply, route hot to inbox", position: 0, defaultEnabled: true },
    { key: "o2", name: "Open house follow-up", trigger_type: "Open house visit", trigger_source: "Sign-in form", action: "Same-day thank-you + listing recap", outcome: "Books showing or adds to nurture", position: 1, defaultEnabled: true },
    { key: "o3", name: "Re-engagement automation", trigger_type: "Cold lead", trigger_source: "Idle 90+ days", action: "Market update + soft check-in", outcome: "Revives cold list over time", position: 2, defaultEnabled: true },
    { key: "o4", name: "Seller nurture", trigger_type: "Tag: Seller", trigger_source: "CRM", action: "Bi-weekly home value + market drip", outcome: "Top-of-mind until ready to list", position: 3, defaultEnabled: false },
    { key: "o5", name: "Buyer nurture", trigger_type: "Tag: Buyer", trigger_source: "CRM", action: "Weekly new listings matched to criteria", outcome: "Showings requested in-line", position: 4, defaultEnabled: true },
  ],
};

/** Inbound auto_response_settings columns the workflow materializer reads to seed initial card state. (w5/booking is sourced from agent_availability.enabled, not here.) */
const INBOUND_SETTINGS_COLUMNS = ["inbound_sms_enabled", "qualification_enabled", "missed_call_enabled", "inbound_new_send_reply"];

/**
 * Lazily create the canonical workflow cards for (org, user, agent) if missing.
 * Inbound cards take their initial `enabled` from the matching
 * auto_response_settings flag so the card reflects the live engine state.
 */
export async function ensureWorkflows(env: Env, orgId: number, userId: number, agentKey: string): Promise<void> {
  if (agentKey !== "inbound" && agentKey !== "outbound") return;
  const defs = WORKFLOW_DEFS[agentKey];

  let settings: Record<string, number> | null = null;
  if (agentKey === "inbound") {
    settings = await queryFirst<Record<string, number>>(
      env.D1DB,
      `SELECT ${INBOUND_SETTINGS_COLUMNS.join(", ")} FROM auto_response_settings WHERE user_id = ? AND org_id = ? LIMIT 1`,
      userId, orgId,
    );
  }

  // The booking card (w5) reflects the booking master control (agent_availability.enabled).
  const bookingEnabled = agentKey === "inbound" ? await getBookingEnabled(env, orgId, userId) : true;

  for (const d of defs) {
    const enabled = (agentKey === "inbound" && d.key === "w5")
      ? (bookingEnabled ? 1 : 0)
      : (settings && d.engineField && d.engineField in settings)
        ? (settings[d.engineField] ? 1 : 0)
        : (d.defaultEnabled ? 1 : 0);
    await execute(
      env.D1DB,
      `INSERT OR IGNORE INTO ai_workflow
         (org_id, user_id, agent_key, workflow_key, name, trigger_type, trigger_source, action, outcome, enabled, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orgId, userId, agentKey, d.key, d.name, d.trigger_type, d.trigger_source, d.action, d.outcome, enabled, d.position,
    );
  }
}

/** Resolve the caller's org. Mirrors the inline lookup used across /api routes. */
export async function callerOrgId(env: Env, userId: number): Promise<number | null> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId);
  return row?.org_id ?? null;
}

export interface AgentProfileRow {
  agent_name: string | null;
  brokerage_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  license_number: string | null;
  service_areas: string | null;
  years_experience: number | null;
  languages: string | null;
  specialties: string | null;
  buyer_commission: string | null;
  seller_commission: string | null;
  min_commission_rules: string | null;
  current_listings: string | null;
  past_sales: string | null;
  avg_price_point: string | null;
  preferred_lender: string | null;
  preferred_title_escrow: string | null;
  calendar_link: string | null;
  tone_preference: string | null;
  persona_json: string | null;
}

export async function getAgentProfile(
  env: Env, orgId: number, userId: number,
): Promise<AgentProfileRow | null> {
  return queryFirst<AgentProfileRow>(
    env.D1DB,
    `SELECT agent_name, brokerage_name, phone, email, website, license_number,
            service_areas, years_experience, languages, specialties,
            buyer_commission, seller_commission, min_commission_rules,
            current_listings, past_sales, avg_price_point,
            preferred_lender, preferred_title_escrow, calendar_link, tone_preference, persona_json
       FROM agent_profile WHERE org_id = ? AND user_id = ? LIMIT 1`,
    orgId, userId,
  );
}

function jsonList(raw: string | null): string {
  if (!raw) return "";
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter(Boolean).join(", ");
  } catch { /* fall through */ }
  return raw;
}

/** Render the AI Settings persona JSON (voice/length/emoji/humor/timing/...) as guidance. */
function renderPersona(raw: string | null): string {
  if (!raw) return "";
  let p: Record<string, unknown>;
  try { const j = JSON.parse(raw); if (!j || typeof j !== "object") return ""; p = j as Record<string, unknown>; }
  catch { return ""; }
  const lines: string[] = [];
  const add = (label: string, key: string) => {
    const v = p[key];
    if (v === null || v === undefined || v === "") return;
    lines.push(`- ${label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  };
  add("Voice", "voice"); add("Message length", "length"); add("Emoji usage", "emoji");
  add("Humor", "humor"); add("Response timing", "timing"); add("Qualification style", "qual");
  add("Lead goals", "goals"); add("Follow-up persistence", "persist");
  return lines.join("\n");
}

/** Render the profile as a compact, plain-text fact block for the prompt. */
function profileFacts(p: AgentProfileRow): string {
  const lines: string[] = [];
  const add = (label: string, val: string | number | null) => {
    if (val !== null && val !== undefined && String(val).trim()) lines.push(`- ${label}: ${val}`);
  };
  add("Agent", p.agent_name);
  add("Brokerage", p.brokerage_name);
  add("Phone", p.phone);
  add("Email", p.email);
  add("Website", p.website);
  add("Service areas", jsonList(p.service_areas));
  add("Years of experience", p.years_experience);
  add("Languages", jsonList(p.languages));
  add("Specialties", jsonList(p.specialties));
  add("Buyer commission", p.buyer_commission);
  add("Seller listing commission", p.seller_commission);
  add("Minimum commission rules", p.min_commission_rules);
  add("Current listings", p.current_listings);
  add("Past sales", p.past_sales);
  add("Average price point", p.avg_price_point);
  add("Preferred lender", p.preferred_lender);
  add("Preferred title/escrow", p.preferred_title_escrow);
  add("Booking / calendar link", p.calendar_link);
  add("Tone preference", p.tone_preference);
  return lines.join("\n");
}

// The inbound agent's operating playbook (how it works the conversation). Lives
// here so it is part of buildAgentSystemPrompt - i.e. the prompt the agent runs
// with AND the one shown in the "View system prompt" viewer are identical.
const INBOUND_PLAYBOOK = `INBOUND PLAYBOOK - you are texting a real-estate lead on behalf of the agent (a human). Your goals, in order: (1) get a reply, (2) qualify the lead, (3) book an appointment/call/showing, (4) escalate to the human agent when needed, (5) keep nurturing if they go quiet. Sound like the agent - warm, brief, human.
- Ask only ONE question per message. Never stack questions. Keep texts short.
- Whenever the lead reveals a fact (buyer/seller, budget, area, timeline, financing/pre-approval, beds/baths, property type, address, motivation), save it. Do NOT re-ask things already known.
- Keep the deal pipeline current: whenever the lead's words state transaction progress (actively searching, touring, writing/submitted an offer, prepping/listing the home, offer received, contract, escrow, closed), call upsert_deal with the matching stage IN THAT SAME TURN (see DEAL STAGE RULES). Major milestones become a suggestion the agent confirms - call it anyway.
- Intent: detect buyer / seller / both / open-house / unknown / not-interested. The MOMENT you identify the lead's type, call update_lead to set lead_type in that SAME turn (before/alongside your reply) - never leave it unset once known. Then ask the FIRST unanswered qualification question for that type, in the listed order. For BOTH ask "sell first or buy first?" and start with the seller side. For an OPEN-HOUSE lead, run the buyer flow - gauge their interest first, then financing. For UNKNOWN ask one clarifying question ("Are you mainly looking to buy, sell, or just exploring right now?"). A lead who is just browsing/exploring is UNKNOWN, not lost - clarify and keep nurturing. Only if the lead is genuinely NOT INTERESTED (e.g. "not interested", "stop", "leave me alone"), acknowledge politely once, stop pushing, and call finish - do not keep qualifying.
- Booking: when the lead wants to book/call/tour, or once qualified, find real open times and propose a specific one. After they pick, hold it (pending the agent's confirmation). If a time is taken or out of hours, offer the next open slot.
- ONE appointment at a time: once an appointment is proposed/booked, do NOT book another. A reply like "okay", "sure", or "sounds good" is the lead CONFIRMING the time you already proposed - just acknowledge it (the agent will confirm). Only change the booking if the lead explicitly asks for a different time.
- NEVER invent facts about listings, prices, or the agent - look them up or say the agent will confirm.`;

// How and when to use each tool, spelled out. Included for the inbound agent so
// it (and the viewer) always shows the toolset.
const INBOUND_TOOLS_GUIDE = `AVAILABLE TOOLS - how and when to use each (you propose; the system executes safely):
- send_message: the ONLY way to text the lead. One short message, at most one question. If you do not call it, the lead hears nothing this turn.
- update_lead: the instant the lead reveals a fact (type, budget, area, timeline, financing, beds/baths, property type, address, motivation), save it. Never re-ask something already known.
- get_agent_knowledge: before answering a factual question about the agent (service areas, commission, calendar, specialties, vendors), look it up. Never invent agent facts.
- find_appointment_slots: get the agent's real open times. ALWAYS call this before proposing any time - never invent one.
- book_appointment: hold a specific open slot (pending the agent's confirmation). Use an exact starts_at from find_appointment_slots; on conflict offer an alternative time/day.
- create_task: leave the agent a follow-up reminder (call back, send a CMA, etc.).
- upsert_deal: create or move the lead's deal when the conversation shows REAL progress. Always pass deal_type, the stage key, and a short reason quoting the lead. See DEAL STAGE RULES below.
- search_listings: when listing search is enabled and the agent has inventory, match the buyer's criteria (area/budget/beds/type) to real listings before naming a specific home. Never invent listings.
- send_mms: when the lead asks to see a place (and the matched listing has photos), text them the listing's photo(s) with a short caption. Only listings that actually have photos can be sent.
- escalate_to_agent: hand off to the human for callbacks, exact pricing/commission, financing/legal/contract/negotiation, a ready-to-transact lead, or anything you cannot safely handle.
- finish: end the turn with no message (lead disengaged, or already handed off).`;

// Deals.md "AI Stage Updates": the signal -> stage mapping + the confidence
// rule. Major milestones are converted server-side into a suggestion the agent
// confirms on the deal card, so the AI can report them safely.
const DEAL_STAGE_RULES = `DEAL STAGE RULES - move a deal ONLY when the lead's OWN WORDS state the milestone (always include that quote as the reason). Never mention pipeline stages to the lead.
- buyer: asks for a consultation/wants to talk -> consult · actively searching / wants to see options -> search · asks to tour/see a specific home -> tours · wants to write an offer -> writing · says the offer was submitted -> submitted · says they're under contract -> contract · says they're in escrow -> escrow · says the purchase closed -> closed.
- seller: asks what their home is worth / thinking of selling -> consult · says they signed the listing agreement -> signed · prepping the home for sale -> prepping · home is live/on the market -> active · received an offer -> received · contract signed -> contract · in escrow -> escrow · sale closed -> closed.
- renter: wants help finding a rental -> consult · actively searching -> search · asks to see a unit -> showings · submitted an application -> application · in screening -> screening · application approved -> approved · signed the lease -> lease · moved in -> closed.
- Major milestones (signed, contract, escrow, closed, lease) and status "won" are NOT applied directly - the system records them as a suggestion the agent must confirm. STILL call upsert_deal when the lead states them; just don't tell the lead anything changed.
- If you are NOT sure a milestone happened (vague or second-hand wording), do not move the stage - use create_task to flag it for the agent instead.`;

const AGENT_ROLE_LINE: Record<AgentKey, string> = {
  assistant: "You assist the agent inside the inbox: drafting replies, summarizing leads, suggesting the next step, and polishing tone.",
  inbound: "You handle inbound leads: instant replies, qualifying (one question at a time), and pushing booking when intent is detected.",
  outbound: "You run outbound follow-up: nurturing and re-engagement, personalized per lead, low-pressure.",
};

/**
 * Compose the full system prompt an AI agent uses when texting buyers/sellers.
 * Layers: date + base rules -> this agent's role -> the structured Agent Profile
 * (so the AI never guesses agent-specific facts) -> per-agent prompt/tone
 * override -> the "don't invent" safety rule from the product spec.
 */
export async function buildAgentSystemPrompt(
  env: Env, orgId: number, userId: number, agentKey: AgentKey,
): Promise<string> {
  // Effective timezone for "today's date/time" + scheduling: the agent's booking
  // timezone (agent_availability) if set, else the org/account timezone, else UTC.
  const tzRow = await queryFirst<{ avail_tz: string | null; org_tz: string | null }>(
    env.D1DB,
    `SELECT (SELECT timezone FROM agent_availability WHERE org_id = ? AND user_id = ? LIMIT 1) AS avail_tz,
            (SELECT timezone FROM organization WHERE id = ? LIMIT 1) AS org_tz`,
    orgId, userId, orgId,
  );
  const tz = (tzRow?.avail_tz || "").trim() || (tzRow?.org_tz || "").trim() || "UTC";

  const parts: string[] = [buildLeadAssistantSystemPrompt(new Date(), tz), AGENT_ROLE_LINE[agentKey]];

  const profile = await getAgentProfile(env, orgId, userId);
  if (profile) {
    const facts = profileFacts(profile);
    if (facts) {
      parts.push(
        `AGENT PROFILE - pull from these structured facts instead of guessing:\n${facts}`,
      );
    }
  }

  const state = await queryFirst<{ tone: string | null; system_prompt: string | null }>(
    env.D1DB,
    `SELECT tone, system_prompt FROM ai_agent_state
      WHERE org_id = ? AND user_id = ? AND agent_key = ? LIMIT 1`,
    orgId, userId, agentKey,
  );
  if (state?.tone) parts.push(`Preferred tone: ${state.tone}.`);
  if (state?.system_prompt && state.system_prompt.trim()) {
    parts.push(`Agent's custom instructions:\n${state.system_prompt.trim()}`);
  }

  // Communication style persona (AI Settings tab).
  const persona = renderPersona(profile?.persona_json ?? null);
  if (persona) parts.push(`COMMUNICATION STYLE (match these):\n${persona}`);

  // Knowledge base FAQs - answer from these, do not contradict.
  const kb = await queryAll<{ question: string | null; answer: string | null }>(
    env.D1DB,
    `SELECT question, answer FROM ai_knowledge_entry
      WHERE org_id = ? AND user_id = ? AND enabled = 1 AND answer IS NOT NULL
      ORDER BY position LIMIT 50`,
    orgId, userId,
  );
  const faqs = kb.filter((k) => (k.answer || "").trim())
    .map((k) => `- Q: ${k.question || "(general)"}\n  A: ${k.answer}`).join("\n");
  if (faqs) parts.push(`KNOWLEDGE BASE - answer from these; do not contradict them:\n${faqs}`);

  // Qualification questions (AI Settings -> Qualifications tab). The agent works
  // through the relevant questions to qualify a lead before booking. applies_to
  // scopes each to a lead type ('all' always applies).
  const quals = await queryAll<{ applies_to: string; question: string; guidance: string | null }>(
    env.D1DB,
    `SELECT applies_to, question, guidance FROM ai_qualification
      WHERE org_id = ? AND user_id = ? AND enabled = 1 AND question IS NOT NULL
      ORDER BY applies_to, position LIMIT 50`,
    orgId, userId,
  );
  const qLines = quals.filter((q) => (q.question || "").trim()).map((q) => {
    const scope = (q.applies_to || "all").trim() || "all";
    const note = (q.guidance || "").trim();
    return `- [${scope}] ${q.question}${note ? `  (guidance: ${note})` : ""}`;
  }).join("\n");
  if (qLines) {
    parts.push(
      "QUALIFICATION QUESTIONS - work through these to qualify the lead before booking. " +
      "Ask them in the listed order, beginning with the first one the lead has not answered yet. " +
      "Ask ONE relevant question at a time and wait for the reply before asking the next; never stack questions. " +
      "Only ask a question once the lead has engaged. Use the question whose [lead type] matches this lead's type; " +
      "questions tagged [all] apply to everyone. Skip any whose answer the lead already gave, and save answers to the lead profile:\n" +
      qLines,
    );
  }

  // Custom inbound auto-responders (AI Agent -> Inbound -> Workflows). When an
  // inbound message matches one, the AI replies in that spirit.
  if (agentKey === "inbound") {
    const responders = await queryAll<{ name: string; trigger_label: string | null; keywords: string | null; tone: string | null; message: string }>(
      env.D1DB,
      `SELECT name, trigger_label, keywords, tone, message FROM inbound_responder
        WHERE org_id = ? AND user_id = ? AND enabled = 1 ORDER BY id`,
      orgId, userId,
    );
    if (responders.length) {
      const lines = responders.map((r) => {
        const when = [r.trigger_label, r.keywords ? `keywords: ${r.keywords}` : ""].filter(Boolean).join(" / ") || "the lead's message matches";
        return `- ${r.name} (when ${when}${r.tone ? `, tone: ${r.tone}` : ""}): reply along these lines - "${r.message}"`;
      }).join("\n");
      parts.push(`CUSTOM AUTO-RESPONSES - when an inbound message matches one of these, reply in that spirit (adapt to the lead's exact words, one message):\n${lines}`);
    }
  }

  // Brand + compliance rules from the inbound settings. Fair Housing is ALWAYS
  // enforced (it's a legal requirement, not an optional toggle).
  const rules = await queryFirst<{ always_say: string | null; never_say: string | null; escalation_keywords: string | null; listing_search_enabled: number; escalate_no_listings: number }>(
    env.D1DB,
    `SELECT always_say, never_say, escalation_keywords, listing_search_enabled, escalate_no_listings FROM auto_response_settings WHERE org_id = ? AND user_id = ? LIMIT 1`,
    orgId, userId,
  );
  const rl: string[] = [];
  const always = jsonList(rules?.always_say ?? null);
  const never = jsonList(rules?.never_say ?? null);
  const escalateOn = jsonList(rules?.escalation_keywords ?? null);
  if (always) rl.push(`Always mention when relevant: ${always}.`);
  if (never) rl.push(`Never say: ${never}.`);
  // Surface the configured escalation triggers in the prompt too (they also
  // drive a deterministic keyword guard in inboundProcessing) so the model
  // proactively hands off, not only the after-the-fact matcher.
  if (escalateOn) rl.push(`Escalate to the human agent (use escalate_to_agent) if the lead brings up: ${escalateOn}.`);
  rl.push("Fair Housing: never reference or steer by race, religion, family status, national origin, disability, or neighborhood demographics.");
  parts.push(`BRAND & COMPLIANCE RULES:\n- ${rl.join("\n- ")}`);

  parts.push(
    "MISSING INFO RULE: If a needed agent-specific detail is not in the Agent Profile, do NOT invent it. " +
    "Ask the lead a safe follow-up question or say the agent will confirm shortly.",
  );

  parts.push(
    "SERVICE AREA RULE: You serve ONLY the locations explicitly listed under 'Service areas' in the Agent Profile. " +
    "If a lead asks whether you cover a specific city, neighborhood, ZIP, or area that is NOT listed there, do NOT say yes - " +
    "tell them you'll confirm with the agent and ask which area they're focused on. " +
    "If no service areas are listed (or the value is not an actual place), ask the lead where they're looking instead of assuming a location.",
  );

  parts.push(
    `SCHEDULING & TIME: The agent's calendar, availability, and appointments are in the ${tz} timezone. ` +
    `Interpret and state all times in ${tz}, and make the timezone explicit when proposing or confirming a time.`,
  );

  // Inbound agent: its operating playbook, the full toolset (how/when to use
  // each), and the deal pipeline taxonomy (so upsert_deal uses valid stages).
  // Added here so the viewer shows the same guidance the runtime agent gets.
  if (agentKey === "inbound") {
    // Listings & pricing: count the agent's offerable inventory and tell the AI
    // exactly how to behave. With no inventory + escalate_no_listings (default
    // on), the search/MMS tools are withheld (in the orchestrator) and the AI is
    // told to hand off to a human the moment listings/pricing come up. Lives here
    // so the viewer shows the same guidance the runtime agent gets.
    const offerable = await countOfferableListings(env, orgId, userId);
    const searchOn = rules ? rules.listing_search_enabled === 1 : true;
    const escalateNoListings = rules ? rules.escalate_no_listings === 1 : true;
    const listingLine = !searchOn
      ? "Listing search is OFF - do not offer or search property listings; tell the lead the agent will send options."
      : offerable > 0
        ? `The agent has ${offerable} active listing(s). Use search_listings to match the buyer's area/budget/beds before naming a specific home. Never invent listings.`
        : escalateNoListings
          ? "The agent currently has NO listings loaded, so the listing/pricing search tools are withheld. Do NOT invent listings or quote specific prices/valuations. IMPORTANT: this does NOT mean skip qualification - still detect intent and run the normal qualification flow first (ask the buyer/seller questions one at a time: budget, timeline, financing, etc.), saving answers as you go. A general statement like 'I'm looking to buy/sell' is NOT a request for listings - qualify them and move toward booking. ONLY escalate (escalate_to_agent) when the lead explicitly asks to SEE specific homes/current inventory or wants an exact price/home valuation; then tell them the agent will follow up with options and pricing."
          : "No listings are loaded - do not invent any; if the lead wants options, tell them the agent will send some.";
    parts.push(`LISTINGS & PRICING:\n${listingLine}`);

    // Booking master control (agent_availability.enabled = the w5 workflow card =
    // the Availability editor's master switch). When OFF, the AI must never offer
    // or hold a time; when ON, it books against the agent's real open slots.
    const bookingOn = await getBookingEnabled(env, orgId, userId);
    parts.push(bookingOn
      ? "APPOINTMENT BOOKING: Booking is ON. When the lead wants to meet/call/tour or is qualified, call find_appointment_slots for the agent's real open times and book_appointment to hold one (pending the agent's confirmation). Never invent a time."
      : "APPOINTMENT BOOKING: Booking is OFF - do NOT offer to schedule, propose times, or hold any appointment. If the lead wants to meet, tell them the agent will reach out to set it up, and use escalate_to_agent.");

    parts.push(INBOUND_PLAYBOOK);
    parts.push(INBOUND_TOOLS_GUIDE);
    parts.push(`DEAL PIPELINES (upsert_deal: pass deal_type + a stage key from that type):\n${dealPipelineText()}`);
    parts.push(DEAL_STAGE_RULES);
  }

  return parts.join("\n\n");
}

/** Append-only write to ai_activity_log - feeds the Logs tab + Live activity rail. */
export async function logAgentActivity(
  env: Env,
  opts: {
    orgId: number; userId: number; agentKey: AgentKey; event: string;
    leadId?: number | null; leadLabel?: string | null; detail?: string | null;
    status?: "ok" | "warn" | "error";
    // Structured field-change provenance (event='lead.field_updated'); lets the
    // UI render "AI updated <field> from <old> to <new> based on '<evidence>'".
    field?: string | null; oldValue?: string | null; newValue?: string | null;
    confidence?: number | null; evidence?: string | null;
  },
): Promise<void> {
  try {
    await execute(
      env.D1DB,
      `INSERT INTO ai_activity_log
         (org_id, user_id, agent_key, event, lead_id, lead_label, detail, status,
          field, old_value, new_value, confidence, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      opts.orgId, opts.userId, opts.agentKey, opts.event,
      opts.leadId ?? null, opts.leadLabel ?? null, opts.detail ?? null, opts.status ?? "ok",
      opts.field ?? null, opts.oldValue ?? null, opts.newValue ?? null,
      opts.confidence ?? null, opts.evidence ?? null,
    );
  } catch {
    // Logging must never break the request path.
  }
}
