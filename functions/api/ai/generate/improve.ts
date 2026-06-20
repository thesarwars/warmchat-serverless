/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { generateWithOpenAI } from "../../../_shared/openai.ts";
import { humanizeDashes } from "../../../_shared/humanizeText.ts";
import { sanitizePlaceholders } from "../../../_shared/placeholders.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { checkUsageLimit, getOrgPlan, incrementUsage } from "../../../_shared/usageCounter.ts";
import { notifyQuotaExceeded } from "../../../_shared/quotaNotify.ts";

type Mode = "rewrite_full" | "rewrite_selection";

interface ImproveBody {
  message?: string;
  text?: string;
  tone?: string;
  persona?: string;
  channel?: string;
  lead_data?: unknown[];
  mode?: Mode;
  selection?: string;
  // When true (Inbox email AI Assist), generate BOTH an email subject and body
  // and return them separately so the composer can fill the subject field.
  want_subject?: boolean;
  // Recent thread messages (oldest -> newest) so the rewrite/draft fits the
  // actual conversation instead of guessing in a vacuum.
  history?: { direction?: string; text?: string }[];
}

const HISTORY_MAX = 10; // most recent messages to feed the model
const HISTORY_MSG_CHARS = 500; // truncate each message so a long thread can't blow the prompt

function buildHistoryBlock(history: { direction?: string; text?: string }[]): string {
  const lines = history
    .filter((m) => (m?.text || "").trim())
    .slice(-HISTORY_MAX)
    .map((m) => {
      const who = m.direction === "outbound" ? "Agent" : "Lead";
      const text = (m.text || "").trim().slice(0, HISTORY_MSG_CHARS).replace(/\s+/g, " ");
      return `${who}: ${text}`;
    });
  if (!lines.length) return "";
  return `Recent conversation (oldest first; "Lead" = the recipient, "Agent" = you - continue this naturally, don't repeat yourself):\n${lines.join("\n")}\n\n`;
}

// AI Assist credit cost per channel (charged against the org's monthly AI quota
// in usageCounter). SMS = 1, email = 2.
const creditCost = (channel: string): number => (channel === "email" ? 2 : 1);

const SMS_MAX_CHARS = 320; // 2 segments, see functions/_shared/smsSegments.ts

const SYSTEM_PROMPT = `You are a world-class real estate CRM copywriter for WarmChats. Rewrite the agent's draft into ONE polished outbound message a top-producing real estate agent would actually send.

OUTPUT - CRITICAL:
- Return ONLY the rewritten message body. Nothing else.
- No preamble. No labels like "Best improved version:" or "Here's your rewrite:". No multiple variants. No explanation. No quotes around the message.
- The very first character of your response is the first character of the message. The last character is the last character of the message.

PERSONALIZATION:
- Honor the Persona, Tone, Channel, and Lead Data in the user prompt.
- When Lead Data has a concrete value (first name, area/city, property type, price range, timeline, source), weave it in naturally instead of using a placeholder. Example: lead_data area="Pasadena" -> write "homes in Pasadena", not "{area}".
- MISSING DATA (critical): if Lead Data has NO concrete value for a detail (area/city, price, timeline, property type, source, etc.), do NOT mention that detail and do NOT emit a placeholder for it. Write a complete, natural sentence that stands on its own without it. NEVER leave a dangling phrase like "still looking in" or "homes in" with nothing after it. Example with no area -> "Hi {firstname}, are you still looking for a home?" (GOOD), NOT "Hi {firstname}, still looking in {area}?" (BAD - broken when area is empty).
- The ONLY placeholders you may emit are {firstname} and {agent_name} - both are always filled. Preserve a placeholder already in the raw draft, but NEVER add a placeholder for a detail you don't have a value for.

CHANNEL RULES:
- SMS: short, conversational, no signature. HARD LIMIT - ${SMS_MAX_CHARS} characters maximum (2 segments). Count before returning. If you're over, rewrite tighter until it fits. Aim for ≤160 chars (1 segment) when possible. Never pad with emoji or filler to hit a length.
- Email: include a subject line ONLY if the raw draft had one. Tight body.
- WhatsApp: conversational, light emoji optional, keep ≤${SMS_MAX_CHARS} chars.
- LinkedIn: professional, no emoji.

STRUCTURE - GREETING & SIGNATURE (MANDATORY):
- ALWAYS open with a short greeting plus the lead's FIRST NAME followed by a comma and a space, then continue ("Hi John, just wanted to see if..."). Vary the greeting naturally (Hi / Hey / Good morning / Good afternoon). If Lead Data has no first name, use {firstname}.
- Email ONLY: end with a sign-off on its own lines, separated from the body by ONE BLANK LINE, exactly in this shape:

Best,
<agent's real name>

Use the agent's REAL name from the "Agent name:" line of the prompt - NEVER output a placeholder like {AgentName} or {agent_name} when the real name is given. SMS: no signature.

VOICE & SUBSTANCE:
- Match the requested Tone (Friendly, Professional, Warm, Consultative, Confident, Persuasive, Direct, Empathetic, Urgent, Luxury).
- Speak in the voice of the Persona (Listing Specialist, Buyer Specialist, Neighborhood Expert, Luxury Home Specialist, etc.).
- Sound like a trusted local advisor - never robotic, salesy, or pushy.
- Never invent facts, prices, square footage, comps, guarantees, or fake urgency. If it isn't in lead_data or the raw draft, don't claim it.
- Soft CTA only if the original implied one. A question beats a command.
- No markdown asterisks, bold, headers, or bullet lists.
- PUNCTUATION (important): NEVER use an em-dash (—) or en-dash (–), and don't use " - " as a dash. Use a comma, a period, or two short sentences instead. Em-dashes read as AI-written; agents want copy that looks human.
- Stay on real estate outreach.

GRAMMAR & SENSE - FINAL CHECK before you return:
- Re-read the message. It MUST be a grammatically complete, natural sentence a real agent would actually send out loud. No dangling prepositions ("looking in?"), no blank spots, no awkward fragments.
- If a sentence only makes sense with a detail you don't have, REWRITE it so it reads perfectly without that detail.
- It should sound like a person wrote it, not a template.`;

// Output override appended to the system prompt when the caller wants a subject
// (email AI Assist). Turns the "body only" contract into a JSON {subject, body}.
const EMAIL_SUBJECT_OVERRIDE = `

OUTPUT OVERRIDE - EMAIL WITH SUBJECT (this supersedes the "Return ONLY the rewritten message body" rule above):
- Return ONLY a JSON object, nothing else: {"subject": "<email subject>", "body": "<email body>"}.
- subject: a concise, compelling subject line - max 70 characters, no "Re:"/"Fwd:", no surrounding quotes. Weave in a concrete lead value (first name, area) when available; otherwise a placeholder token is fine.
- body: the full email body, following every greeting and "Best, <agent name>" sign-off rule above.
- No markdown, no code fences, no commentary outside the JSON object.`;

function buildUserPrompt(opts: {
  message: string;
  source: string;
  tone: string;
  persona: string;
  channel: string;
  leadData: unknown[];
  mode: Mode;
  agentName: string;
  wantSubject: boolean;
  history: { direction?: string; text?: string }[];
}) {
  const { message, source, tone, persona, channel, leadData, mode, agentName, wantSubject, history } = opts;
  const leadJson = JSON.stringify(leadData ?? [], null, 2);
  const historyBlock = buildHistoryBlock(history);
  const fullContext = mode === "rewrite_selection" ? `Full message context (do NOT rewrite this, only the selection below):\n${message}\n\n` : "";
  const draftLabel = source.trim()
    ? `Draft to rewrite (preserve any {firstname}-style tokens exactly):\n${source}`
    : `There is no existing draft - write a fresh ${channel} message from scratch using the persona, tone, and lead data above.`;
  const closing = wantSubject
    ? `Return ONLY the JSON object {"subject": ..., "body": ...}. No preamble, no labels, no alternates.`
    : `Return ONLY the rewritten message body. No preamble, no labels, no alternates.`;
  return `Persona: ${persona}
Tone: ${tone}
Channel: ${channel}
Mode: ${mode}
Agent name: ${agentName || "(unknown - use {agent_name})"}
Lead Data (weave concrete values in; placeholder only when the field is missing):
${leadJson}

${historyBlock}${fullContext}${draftLabel}

${closing}`;
}

function cleanRewrite(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();
  // Strip code fences and bold/italic markers the model sometimes sneaks in.
  cleaned = cleaned.replace(/```(?:json|text|markdown)?|```/gi, "").trim();
  cleaned = cleaned.replace(/\*{2,}/g, "");
  cleaned = cleaned.replace(/_{2,}/g, "");
  // Strip leading "label:" preambles the model might still emit despite the prompt.
  cleaned = cleaned.replace(
    /^(?:best (?:improved )?version|short version|follow[- ]?up version|luxury(?:\s*\/\s*premium)? version|casual whatsapp version|improved (?:message|version)|rewritten (?:message|version)|here(?:'s| is)(?: your)? (?:the )?(?:rewritten|improved|message)|message)\s*:\s*/i,
    "",
  ).trim();
  // Strip surrounding quotes if the model wrapped the whole thing.
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  // Guarantee no em-dash slips through even if the model ignores the prompt rule.
  cleaned = humanizeDashes(cleaned);
  return cleaned.trim();
}

function trimToLimit(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (lastSentenceEnd > max * 0.6) return slice.slice(0, lastSentenceEnd + 1).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

/** POST /api/ai/generate/improve - real-estate-aware rewrite of an outbound message. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<ImproveBody>(request);
  const message = (body?.message || body?.text || "").trim();

  const selection = (body?.selection || "").trim();
  const mode: Mode = body?.mode === "rewrite_selection" || (!body?.mode && selection)
    ? "rewrite_selection"
    : "rewrite_full";
  if (mode === "rewrite_selection" && !selection) {
    return error("selection is required for mode=rewrite_selection", 400);
  }
  // A draft is only required when rewriting/refining one. With no draft we draft
  // from scratch (used by the "Follow-up suggestion" / "Appointment push" presets).
  if (mode === "rewrite_selection" && !message) {
    return error("message is required", 400);
  }

  const tone = body?.tone || "Friendly";
  const persona = body?.persona || "Real Estate Agent";
  const channel = (body?.channel || "email").toLowerCase();
  const wantSubject = body?.want_subject === true && channel === "email";
  const leadData = Array.isArray(body?.lead_data) ? body!.lead_data! : [];
  const history = Array.isArray(body?.history) ? body!.history! : [];
  const source = mode === "rewrite_selection" ? selection : message;
  const cost = creditCost(channel);

  const agentRow = await queryFirst<{ name: string | null }>(
    env.D1DB, `SELECT name FROM "user" WHERE id = ?`, user.id,
  );
  const agentName = (agentRow?.name || "").trim();

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  // Pre-flight credit check: need `cost` credits (1 SMS / 2 email) available.
  if (membership) {
    const plan = await getOrgPlan(env, membership.org_id);
    if (!(await checkUsageLimit(env, membership.org_id, plan, "ai", cost))) {
      await notifyQuotaExceeded(env, membership.org_id, "ai");
      return error("Not enough AI credits left for your plan this month", 403);
    }
  }

  // Materialize agent + lead name tokens so the agent sees clean copy.
  const lead0 = (leadData[0] ?? null) as Record<string, unknown> | null;
  const leadFirst = String(lead0?.first_name || String(lead0?.name || "").split(/\s+/)[0] || "").trim();
  const materialize = (text: string): string => {
    let t = sanitizePlaceholders(cleanRewrite(text || ""));
    if (agentName) t = t.replace(/\{\{?\s*(agent_?name|agent_?first_?name|agent_?full_?name|sender_?name|sender_?full_?name)\s*\}?\}/gi, agentName);
    if (leadFirst) t = t.replace(/\{\{?\s*(first_?name)\s*\}?\}/gi, leadFirst);
    return t;
  };

  try {
    const systemPrompt = wantSubject ? SYSTEM_PROMPT + EMAIL_SUBJECT_OVERRIDE : SYSTEM_PROMPT;
    const userPrompt = buildUserPrompt({ message, source, tone, persona, channel, leadData, mode, agentName, wantSubject, history });
    const out = await generateWithOpenAI(env, systemPrompt, userPrompt, {
      orgId: membership?.org_id ?? null,
      expectJson: wantSubject,
    });

    let subject = "";
    let rewritten: string;
    if (wantSubject) {
      // Expecting {"subject","body"} - fall back to treating the whole text as
      // the body if the model didn't return valid JSON.
      let parsed: { subject?: unknown; body?: unknown } = {};
      try { parsed = JSON.parse(out.text || "{}"); } catch { parsed = {}; }
      subject = materialize(String(parsed.subject || "")).replace(/\s+/g, " ").trim().slice(0, 150);
      rewritten = materialize(String(parsed.body || (parsed.subject ? "" : out.text) || ""));
    } else {
      rewritten = materialize(out.text || "");
    }
    if (channel === "sms") rewritten = trimToLimit(rewritten, SMS_MAX_CHARS);

    // generateWithOpenAI already metered 1 credit; charge the remainder so the
    // total matches `cost`. Only after a successful generation. Non-fatal.
    if (membership && cost > 1) {
      try { await incrementUsage(env, membership.org_id, "ai", cost - 1); } catch { /* non-fatal */ }
    }

    return json({
      improved_message: rewritten,
      message: rewritten,
      text: rewritten,
      subject,
      suggestions: [],
      intent: "Unknown",
      mode,
      cost,
      chars: rewritten.length,
    });
  } catch (e) { return error((e as Error).message, 502); }
};
