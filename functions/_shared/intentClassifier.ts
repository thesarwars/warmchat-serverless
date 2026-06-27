/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { generateWithOpenAI } from "./openai.ts";

/**
 * Intent + field classifier for inbound lead replies. Two-pass design:
 *   1. Cheap keyword matcher per the spec's tag tables. Handles the common
 *      cases (booking words, cold words, buyer/seller signals) at zero cost.
 *   2. If the keyword pass returns 'unknown' AND the reply is non-trivial,
 *      fall back to a structured-JSON OpenAI call to extract budget /
 *      timeline / pre-approval etc.
 *
 * Exposed for both the qualification state machine and the
 * /api/ai/classify-reply endpoint.
 */

export type LeadIntent = "warm" | "cold" | "not_interested" | "booking" | "unknown";

export type LeadTypeSignal =
  | "buyer" | "seller" | "both" | "investor" | "renter" | "agent_referral" | null;

export interface ClassifyResult {
  intent: LeadIntent;
  lead_type_signal: LeadTypeSignal;
  // 0-1 confidence in the classification (drives the AI field-update audit +
  // the manual-override threshold). Keyword hits ~0.7; LLM uses its own estimate.
  confidence?: number;
  extracted: {
    budget?: string;
    timeline?: string;
    pre_approved?: boolean;
    property_address?: string;
    occupancy_status?: "owner-occupied" | "rented" | "vacant" | null;
    motivation?: string;
    financing_status?: string;
    interest_level?: string;
    area?: string;
    bedrooms?: number;
    bathrooms?: number;
    property_type?: string;
    seller_price_expectations?: string;
    // Concrete lead facts that don't fit a named field (e.g. "wants a pool",
    // "5 acres", school district, must-haves) - appended to lead.notes.
    other_details?: string;
  };
}

const BOOKING_WORDS = [
  "call", "appointment", "tour", "showing", "tomorrow", "today",
  "book", "schedule", "meet", "viewing", "visit",
];

// Genuine disinterest -> "not_interested" (acknowledge once, stop, tag Lost).
// Per the spec's intent system, vague/exploring replies ("just browsing", "just
// looking", "not sure") are UNKNOWN (ask a clarifying question + keep nurturing),
// NOT disinterest - so they are intentionally NOT in this list. STOP/unsubscribe
// are handled by the compliance layer upstream, before classification.
const NOT_INTERESTED_WORDS = [
  "not interested", "leave me alone", "don't text", "do not text",
  "stop texting", "no thanks", "not looking to",
];

const BUYER_WORDS = ["buy", "buying", "looking to buy", "purchase", "homes", "house hunting"];
const SELLER_WORDS = ["sell", "selling", "list", "list my home", "my home", "listing"];
const BOTH_WORDS = ["both", "sell then buy", "upgrade", "sell and buy", "buy and sell"];
// Investor signals win over plain buyer/seller; "rental property"/"rental income"
// is investing, NOT a renter (those are checked first to disambiguate).
const INVESTOR_WORDS = [
  "invest", "investor", "investment", "rental property", "rental income",
  "cash flow", "cap rate", "roi", "flip", "fix and flip", "portfolio", "1031",
];
const RENTER_WORDS = ["looking to rent", "want to rent", "for rent", "renting", "lease", "apartment", "rental unit"];
const AGENT_REFERRAL_WORDS = [
  "referred by", "agent referral", "realtor referral", "i'm an agent", "i am an agent",
  "fellow agent", "referring a client", "another agent", "my agent referred",
];

const OCCUPANCY_RX: Record<"owner-occupied" | "rented" | "vacant", RegExp> = {
  "owner-occupied": /(owner\s*occupied|i\s*live\s*(here|there)|currently\s*live)/i,
  "rented": /(rent(ed|ing)?|tenant|lease(d)?)/i,
  "vacant": /(vacant|empty|nobody)/i,
};

function containsAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function extractKeyword(text: string): ClassifyResult {
  const lowered = text.toLowerCase();
  const result: ClassifyResult = {
    intent: "unknown",
    lead_type_signal: null,
    extracted: {},
  };

  // Booking takes priority - never want to treat "tour tomorrow" as disinterest.
  if (containsAny(lowered, BOOKING_WORDS)) {
    result.intent = "booking";
  } else if (containsAny(lowered, NOT_INTERESTED_WORDS)) {
    result.intent = "not_interested";
  }

  // Lead-type signal is independent of intent (e.g. "want to buy, call me tomorrow").
  // Most-specific types first so "rental property" reads as investor and
  // "referred by my agent" as agent_referral rather than buyer/seller.
  if (containsAny(lowered, AGENT_REFERRAL_WORDS)) result.lead_type_signal = "agent_referral";
  else if (containsAny(lowered, INVESTOR_WORDS)) result.lead_type_signal = "investor";
  else if (containsAny(lowered, RENTER_WORDS)) result.lead_type_signal = "renter";
  else if (containsAny(lowered, BOTH_WORDS)) result.lead_type_signal = "both";
  else if (containsAny(lowered, SELLER_WORDS)) result.lead_type_signal = "seller";
  else if (containsAny(lowered, BUYER_WORDS)) result.lead_type_signal = "buyer";
  if (result.lead_type_signal) result.confidence = 0.7;

  // Cheap budget heuristics: "$650k", "650,000", "around 700", "under 500k".
  const budget = lowered.match(/\$?\s*(\d{2,3})\s*(k|,?\d{3})|\$?\s*(\d{2,3}),(\d{3})/);
  if (budget) result.extracted.budget = budget[0].trim();

  // Pre-approval signals.
  if (/\b(pre[-\s]?approved|pre[-\s]?approval)\b/i.test(text)) {
    result.extracted.pre_approved = !/\b(not|no|haven'?t|still)\b/i.test(text);
  }

  // Occupancy signals.
  for (const [status, rx] of Object.entries(OCCUPANCY_RX) as Array<[
    "owner-occupied" | "rented" | "vacant", RegExp,
  ]>) {
    if (rx.test(text)) { result.extracted.occupancy_status = status; break; }
  }

  // Timeline heuristics (very rough).
  const timeline = lowered.match(/\b(next|in|within)\s+(few|a)?\s*(week|weeks|month|months|year|years|day|days)\b/);
  if (timeline) result.extracted.timeline = timeline[0].trim();
  else if (/\b(asap|right away|soon|immediately)\b/i.test(text)) result.extracted.timeline = "soon";
  else if (/\b(just exploring|just browsing|no rush|not in a rush)\b/i.test(text)) result.extracted.timeline = "exploring";

  // Bedrooms / bathrooms ("3 bed", "2br", "2.5 bath", "4 bedroom").
  const beds = lowered.match(/(\d+)\s*(?:bed|bedroom|br)\b/);
  if (beds) result.extracted.bedrooms = Number(beds[1]);
  const baths = lowered.match(/(\d+(?:\.\d)?)\s*(?:bath|bathroom|ba)\b/);
  if (baths) result.extracted.bathrooms = Number(baths[1]);

  // Property type.
  const PROPERTY_TYPES: [RegExp, string][] = [
    [/\b(single[-\s]?family|sfr|house)\b/, "Single family"],
    [/\b(condo|condominium)\b/, "Condo"],
    [/\b(town\s?home|townhouse)\b/, "Townhome"],
    [/\b(multi[-\s]?family|duplex|triplex|fourplex)\b/, "Multi-family"],
    [/\b(land|lot|acreage)\b/, "Land"],
    [/\b(mobile|manufactured)\b/, "Manufactured"],
  ];
  for (const [rx, label] of PROPERTY_TYPES) {
    if (rx.test(lowered)) { result.extracted.property_type = label; break; }
  }

  // Warm fallback: positive engagement words promote unknown -> warm.
  if (result.intent === "unknown" && /\b(yes|sure|interested|let'?s|send|please)\b/i.test(text)) {
    result.intent = "warm";
  }

  return result;
}

const LLM_SYSTEM = `You classify inbound real-estate lead replies. Always respond with JSON only.

Output schema (strict):
{
  "intent": "warm" | "not_interested" | "booking" | "unknown",
  "lead_type_signal": "buyer" | "seller" | "both" | "investor" | "renter" | "agent_referral" | null,
  "confidence": number,  // 0-1, how sure you are of intent + lead_type_signal
  "extracted": {
    "budget": string | null,
    "timeline": string | null,
    "pre_approved": boolean | null,
    "property_address": string | null,
    "occupancy_status": "owner-occupied" | "rented" | "vacant" | null,
    "motivation": string | null,
    "financing_status": string | null,
    "interest_level": string | null,
    "area": string | null,
    "bedrooms": number | null,
    "bathrooms": number | null,
    "property_type": string | null,
    "seller_price_expectations": string | null,
    "other_details": string | null
  }
}

Rules:
- other_details: any CONCRETE lead fact that does not fit a named field above (e.g. "wants a pool", "5 acres", "good school district", "must have a garage", "cash buyer"). A short comma-joined phrase. null if none. Do NOT restate budget/area/timeline here.
- intent "booking" only if the lead is asking to schedule/tour/call.
- intent "not_interested" ONLY when genuinely not interested ("not interested", "stop", "leave me alone", "no thanks").
- intent "unknown" for vague/exploring replies ("just browsing", "just looking", "maybe", "not sure") - we will ask a clarifying question, not drop them.
- intent "warm" for positive engagement.
- lead_type_signal "investor" for rental-property/cash-flow/ROI/flip intent; "renter" for someone wanting to rent/lease; "agent_referral" when the sender is (or was referred by) an agent.
- confidence: 0.9+ only when the reply is explicit; lower it for inferred/ambiguous signals.
- Only fill an extracted field when the reply states it explicitly.
- Never invent values. Use null if unsure.`;

async function callLLM(env: Env, replyText: string, leadType: string | null): Promise<ClassifyResult | null> {
  if (!env.OPENAI_API_KEY) return null;
  const userPrompt = `Lead type so far: ${leadType || "unknown"}.\nLead reply: ${replyText}`;
  try {
    const out = await generateWithOpenAI(env, LLM_SYSTEM, userPrompt, { expectJson: true });
    const parsed = JSON.parse(out.text) as Partial<ClassifyResult> & {
      extracted?: Record<string, unknown>;
    };
    const intent = (parsed.intent === "warm" || parsed.intent === "cold" ||
      parsed.intent === "not_interested" || parsed.intent === "booking" ||
      parsed.intent === "unknown") ? parsed.intent : "unknown";
    const VALID_SIGNALS = ["buyer", "seller", "both", "investor", "renter", "agent_referral"];
    const signal: LeadTypeSignal = VALID_SIGNALS.includes(parsed.lead_type_signal as string)
      ? (parsed.lead_type_signal as LeadTypeSignal) : null;
    const rawConf = (parsed as { confidence?: unknown }).confidence;
    const confidence = typeof rawConf === "number" && rawConf >= 0 && rawConf <= 1
      ? rawConf : (signal || intent !== "unknown" ? 0.75 : undefined);
    const ex = parsed.extracted ?? {};
    const out2: ClassifyResult = {
      intent,
      lead_type_signal: signal,
      ...(confidence !== undefined ? { confidence } : {}),
      extracted: {
        ...(typeof ex.budget === "string" ? { budget: ex.budget } : {}),
        ...(typeof ex.timeline === "string" ? { timeline: ex.timeline } : {}),
        ...(typeof ex.pre_approved === "boolean" ? { pre_approved: ex.pre_approved } : {}),
        ...(typeof ex.property_address === "string" ? { property_address: ex.property_address } : {}),
        ...(ex.occupancy_status === "owner-occupied" || ex.occupancy_status === "rented" || ex.occupancy_status === "vacant"
          ? { occupancy_status: ex.occupancy_status } : {}),
        ...(typeof ex.motivation === "string" ? { motivation: ex.motivation } : {}),
        ...(typeof ex.financing_status === "string" ? { financing_status: ex.financing_status } : {}),
        ...(typeof ex.interest_level === "string" ? { interest_level: ex.interest_level } : {}),
        ...(typeof ex.area === "string" ? { area: ex.area } : {}),
        ...(typeof ex.bedrooms === "number" ? { bedrooms: ex.bedrooms } : {}),
        ...(typeof ex.bathrooms === "number" ? { bathrooms: ex.bathrooms } : {}),
        ...(typeof ex.property_type === "string" ? { property_type: ex.property_type } : {}),
        ...(typeof ex.seller_price_expectations === "string" ? { seller_price_expectations: ex.seller_price_expectations } : {}),
        ...(typeof ex.other_details === "string" && ex.other_details.trim() ? { other_details: ex.other_details.trim() } : {}),
      },
    };
    return out2;
  } catch {
    return null;
  }
}

/** Main entry: keyword pass + optional LLM augmentation. */
export async function classifyReplyText(
  env: Env,
  replyText: string,
  leadType: string | null,
): Promise<ClassifyResult> {
  const text = (replyText || "").trim();
  const base = extractKeyword(text);
  // Only skip the LLM for trivially short messages ("ok", "yes") - they carry no
  // structured fields and the model would hallucinate. For everything else we run
  // the LLM so Budget/Area/Timeline/Pre-Approved/other_details extract on EVERY
  // non-trivial reply, NOT only on intent='unknown' turns (the old gate skipped
  // the field pass whenever a booking/warm keyword was present, which is why
  // those fields rarely filled).
  if (text.length <= 5) return base;
  const llm = await callLLM(env, text, leadType);
  if (!llm) return base;
  // Intent classification is unchanged: the keyword pass stays authoritative when
  // it matched (booking / not_interested / warm); the LLM only decides intent on
  // an otherwise-'unknown' turn. We always UNION the extracted fields.
  const mergedConfidence = llm.confidence ?? base.confidence;
  return {
    intent: base.intent !== "unknown" ? base.intent : llm.intent,
    lead_type_signal: base.lead_type_signal ?? llm.lead_type_signal,
    ...(mergedConfidence !== undefined ? { confidence: mergedConfidence } : {}),
    extracted: { ...base.extracted, ...llm.extracted },
  };
}
