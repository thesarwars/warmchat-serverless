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

export type LeadIntent = "warm" | "cold" | "booking" | "unknown";

export type LeadTypeSignal = "buyer" | "seller" | "both" | null;

export interface ClassifyResult {
  intent: LeadIntent;
  lead_type_signal: LeadTypeSignal;
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
  };
}

const BOOKING_WORDS = [
  "call", "appointment", "tour", "showing", "tomorrow", "today",
  "book", "schedule", "meet", "viewing", "visit",
];

const COLD_WORDS = [
  "just browsing", "just looking", "later", "not interested", "not sure",
  "stop", "unsubscribe", "leave me alone", "don't text",
];

const BUYER_WORDS = ["buy", "buying", "looking to buy", "purchase", "homes", "house hunting"];
const SELLER_WORDS = ["sell", "selling", "list", "list my home", "my home", "listing"];
const BOTH_WORDS = ["both", "sell then buy", "upgrade", "sell and buy", "buy and sell"];

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

  // Booking takes priority - never want to treat "tour tomorrow" as cold.
  if (containsAny(lowered, BOOKING_WORDS)) {
    result.intent = "booking";
  } else if (containsAny(lowered, COLD_WORDS)) {
    result.intent = "cold";
  }

  // Lead-type signal is independent of intent (e.g. "want to buy, call me tomorrow").
  if (containsAny(lowered, BOTH_WORDS)) result.lead_type_signal = "both";
  else if (containsAny(lowered, SELLER_WORDS)) result.lead_type_signal = "seller";
  else if (containsAny(lowered, BUYER_WORDS)) result.lead_type_signal = "buyer";

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
  "intent": "warm" | "cold" | "booking" | "unknown",
  "lead_type_signal": "buyer" | "seller" | "both" | null,
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
    "seller_price_expectations": string | null
  }
}

Rules:
- intent "booking" only if the lead is asking to schedule/tour/call.
- intent "cold" if disengaged ("not interested", "just browsing", "stop").
- intent "warm" for positive engagement; "unknown" only when truly ambiguous.
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
      parsed.intent === "booking" || parsed.intent === "unknown") ? parsed.intent : "unknown";
    const signal: LeadTypeSignal = (parsed.lead_type_signal === "buyer" ||
      parsed.lead_type_signal === "seller" || parsed.lead_type_signal === "both")
      ? parsed.lead_type_signal : null;
    const ex = parsed.extracted ?? {};
    const out2: ClassifyResult = {
      intent,
      lead_type_signal: signal,
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
  // Skip LLM for trivial messages (saves cost; also prevents the model from
  // hallucinating a budget out of "ok").
  if (base.intent !== "unknown" || text.length <= 5) return base;
  const llm = await callLLM(env, text, leadType);
  if (!llm) return base;
  // Merge: prefer LLM intent + signal when keyword pass came back empty;
  // union the extracted fields.
  return {
    intent: llm.intent !== "unknown" ? llm.intent : base.intent,
    lead_type_signal: llm.lead_type_signal ?? base.lead_type_signal,
    extracted: { ...base.extracted, ...llm.extracted },
  };
}
