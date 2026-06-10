/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { incrementUsage } from "./usageCounter.ts";

// Minimal OpenAI Chat Completions client for the /ai/* endpoints.

const DEFAULT_MODEL = "gpt-4o-mini";

export interface GenerateResult { text: string; raw: unknown }

/**
 * Generate a completion: system + user messages, optional JSON response format.
 *
 * Pass `opts.orgId` to count this request toward the org's monthly AI usage -
 * EVERY AI call (even tiny ones: tone tweaks, classifications, drafts) should
 * pass it so the usage meter is accurate.
 */
export async function generateWithOpenAI(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  opts?: { expectJson?: boolean; model?: string; orgId?: number | null },
): Promise<GenerateResult> {
  if (!env.OPENAI_API_KEY) throw new Error("OpenAI not configured");

  const body: Record<string, unknown> = {
    model: opts?.model || DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  if (opts?.expectJson) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content || "";
  // Count every AI request toward monthly usage (including small ones). Never
  // let a metering hiccup fail the actual generation.
  if (opts?.orgId) {
    try { await incrementUsage(env, opts.orgId, "ai", 1); } catch { /* non-fatal */ }
  }
  return { text, raw: json };
}

// ---- Tool-calling client (the agentic brain) -------------------------------
// OpenAI function-calling wrapper used by aiOrchestrator. The caller drives the
// multi-step loop: send messages + tools -> model returns content and/or
// tool_calls -> caller executes each tool, appends a {role:"tool"} result -> repeat
// until the model stops calling tools. Every call is metered like generateWithOpenAI.

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** Wire-format chat message (matches the OpenAI request/response shape directly). */
export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatToolsResult {
  content: string | null;
  tool_calls: ChatToolCall[];
  finish_reason: string;
  raw: unknown;
}

/**
 * One turn of a tool-calling conversation. Pass the running `messages` array
 * (system + user + prior assistant/tool turns) and the tool defs; get back the
 * assistant's text and any tool_calls to execute. Throws if OpenAI is not
 * configured (caller falls back to the template flow).
 */
export async function chatWithTools(
  env: Env,
  messages: ChatMessage[],
  tools: ChatToolDef[],
  opts?: { model?: string; orgId?: number | null; toolChoice?: "auto" | "required" | "none" },
): Promise<ChatToolsResult> {
  if (!env.OPENAI_API_KEY) throw new Error("OpenAI not configured");

  const body: Record<string, unknown> = {
    model: opts?.model || DEFAULT_MODEL,
    messages,
  };
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = opts?.toolChoice || "auto";
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: ChatToolCall[] };
      finish_reason?: string;
    }>;
  };
  const choice = json.choices?.[0];
  const msg = choice?.message;

  // Meter every call (including tool-call rounds) toward monthly usage.
  if (opts?.orgId) {
    try { await incrementUsage(env, opts.orgId, "ai", 1); } catch { /* non-fatal */ }
  }

  return {
    content: msg?.content ?? null,
    tool_calls: msg?.tool_calls ?? [],
    finish_reason: choice?.finish_reason ?? "stop",
    raw: json,
  };
}

/**
 * Shared lead-assistant system prompt.
 */
export const LEAD_ASSISTANT_SYSTEM_BASE = `You are an AI Agent built into WarmChats, a real estate CRM.
Your job is to help agents close deals faster by analysing leads and crafting outreach.

TONE RULES - CRITICAL:
- Always respond in natural, conversational language - like a knowledgeable colleague
  briefing the agent before they make a call.
- Never use markdown headers (**Section**), bullet-point lists, or numbered lists.
- Write in short, clear paragraphs. Two to four sentences each is ideal.
- Sound warm, direct, and confident - not like a report generator.
- If there is nothing to say about a particular area (e.g. no appointments), mention
  it naturally in one sentence and move on. Do not pad the response.

HARD RULES:
1. Never go off-topic. Redirect anything unrelated to real estate or lead work.
2. Never speak negatively about WarmChats.
3. Do not invent facts about the lead. Only use the data provided.
4. Refuse harmful or inappropriate requests with a polite redirect.
5. Always interpret dates relative to TODAY'S DATE provided below. When a date is in
   the past, describe it as past (e.g. "last Sunday", "3 days ago"). Never describe a
   past date as upcoming or current.
6. Use ONLY ASCII punctuation - never smart/Unicode punctuation. Type a hyphen -, three
   dots ..., straight quotes ' and ", and x for "times". Never output em dashes, en
   dashes, the ellipsis character, curly/smart quotes, or the multiplication sign.

FAIR HOUSING RULES - LEGALLY CRITICAL (Fair Housing Act, 42 U.S.C. 3601 et seq.):
You write content for real estate communications. Federal law forbids steering,
recommendations, or descriptions that discriminate based on the protected classes:
race, color, religion, national origin, sex (incl. sexual orientation and gender
identity), familial status (parents, pregnant women, children under 18), or
disability. Many states extend this (e.g. source of income, marital status, age).
This applies to:
- Listing copy, neighborhood blurbs, school/community descriptions.
- Suggestions about who is "a good fit" for a property or area.
- Audience filters, lead descriptions, or follow-up scripts.

Specifically, you MUST NOT:
- Recommend or describe a property or neighborhood as better for any protected
  class (e.g. "great for young families", "perfect for singles", "active adult
  community", "Christian neighborhood", "safe area" used as a proxy for race).
- Steer a lead toward or away from any area based on a protected characteristic
  the lead mentioned, implied, or you inferred.
- Filter, score, or recommend leads using a protected characteristic, even
  indirectly via proxies (zip-code-as-race, school-quality-as-race, etc.).
- Use coded language commonly understood as discriminatory ("urban", "exclusive",
  "traditional family", "preferred clientele", etc.).
- Reference religious imagery, holidays, or terminology in marketing copy in
  ways that suggest preference.

If asked to write something that crosses these lines, refuse with a one-sentence
explanation ("I can't write that because it could be read as discriminatory
under fair-housing rules - I can rewrite it focused on the home's features
instead") and offer a feature-focused alternative. When a lead's own message
mentions a protected class, do NOT echo it back into outbound copy.

AI DISCLOSURE - state-law safeguard:
Several states (CA AB 701, MA, etc.) require disclosing that a message is
automated. The platform handles that for templated/auto-driven messages via
its compliance footer helper. You should NOT impersonate a human when asked.
If asked whether you're a person, answer that you're an AI assistant working
on behalf of the named agent.
`;

/**
 * Prefix the lead-assistant prompt with the current UTC date/time.
 */
export function buildLeadAssistantSystemPrompt(now: Date = new Date(), timeZone = "UTC"): string {
  const { text, zone } = formatDateInZone(now, timeZone);
  const dateLine = `TODAY'S DATE AND TIME (${zone}): ${text}`;
  return `${dateLine}\n\n${LEAD_ASSISTANT_SYSTEM_BASE}`;
}

/**
 * Render the date/time in an IANA timezone (e.g. "America/Los_Angeles"), so the
 * AI reasons in the agent's local time, not UTC. Falls back to UTC if the zone
 * is invalid/unset. Returns the formatted text plus the zone label actually used.
 */
function formatDateInZone(now: Date, timeZone: string): { text: string; zone: string } {
  const tz = (timeZone || "").trim() || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    // Always show the STANDARD abbreviation (e.g. PST, not PDT) regardless of
    // daylight saving, so times read consistently everywhere.
    const STD_ABBREV: Record<string, string> = {
      PDT: "PST", MDT: "MST", CDT: "CST", EDT: "EST", AKDT: "AKST", HDT: "HST",
    };
    const rawTzName = get("timeZoneName");
    const tzName = STD_ABBREV[rawTzName] || rawTzName;
    const text = `${get("weekday")}, ${get("month")} ${get("day")}, ${get("year")} at ${get("hour")}:${get("minute")} ${get("dayPeriod")}${tzName ? ` ${tzName}` : ""}`;
    return { text, zone: tz };
  } catch {
    // Invalid IANA zone -> UTC fallback.
    const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const month = now.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    let hours = now.getUTCHours();
    const minutes = String(now.getUTCMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return { text: `${weekday}, ${month} ${now.getUTCDate()}, ${now.getUTCFullYear()} at ${String(hours).padStart(2, "0")}:${minutes} ${ampm} UTC`, zone: "UTC" };
  }
}
