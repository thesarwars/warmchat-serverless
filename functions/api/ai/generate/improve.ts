/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { generateWithOpenAI } from "../../../_shared/openai.ts";
import { sanitizePlaceholders } from "../../../_shared/placeholders.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { checkUsageLimit, getOrgPlan } from "../../../_shared/usageCounter.ts";
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
}

const SMS_MAX_CHARS = 320; // 2 segments, see functions/_shared/smsSegments.ts

const SYSTEM_PROMPT = `You are a world-class real estate CRM copywriter for WarmChats. Rewrite the agent's draft into ONE polished outbound message a top-producing real estate agent would actually send.

OUTPUT - CRITICAL:
- Return ONLY the rewritten message body. Nothing else.
- No preamble. No labels like "Best improved version:" or "Here's your rewrite:". No multiple variants. No explanation. No quotes around the message.
- The very first character of your response is the first character of the message. The last character is the last character of the message.

PERSONALIZATION:
- Honor the Persona, Tone, Channel, and Lead Data in the user prompt.
- When Lead Data has a concrete value (first name, area/city, property type, price range, timeline, source), weave it in naturally instead of using a placeholder. Example: lead_data area="Pasadena" -> write "homes in Pasadena", not "{area}".
- When a field is missing, fall back to one of these placeholder tokens so the CRM can fill it: {firstname}, {lastname}, {fullname}, {email}, {phone}, {area}, {agent_name}, {agentfirstname}, {agentfullname}, {sendername}, {senderfullname}, {company_name}.
- Preserve every placeholder already in the raw draft exactly as written (same brace style: {firstname} or {{first_name}}).

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
- Stay on real estate outreach.`;

function buildUserPrompt(opts: {
  message: string;
  source: string;
  tone: string;
  persona: string;
  channel: string;
  leadData: unknown[];
  mode: Mode;
  agentName: string;
}) {
  const { message, source, tone, persona, channel, leadData, mode, agentName } = opts;
  const leadJson = JSON.stringify(leadData ?? [], null, 2);
  const fullContext = mode === "rewrite_selection" ? `Full message context (do NOT rewrite this, only the selection below):\n${message}\n\n` : "";
  return `Persona: ${persona}
Tone: ${tone}
Channel: ${channel}
Mode: ${mode}
Agent name: ${agentName || "(unknown - use {agent_name})"}
Lead Data (weave concrete values in; placeholder only when the field is missing):
${leadJson}

${fullContext}Draft to rewrite (preserve any {firstname}-style tokens exactly):
${source}

Return ONLY the rewritten message body. No preamble, no labels, no alternates.`;
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
  if (!message) return error("message is required", 400);

  const selection = (body?.selection || "").trim();
  const mode: Mode = body?.mode === "rewrite_selection" || (!body?.mode && selection)
    ? "rewrite_selection"
    : "rewrite_full";
  if (mode === "rewrite_selection" && !selection) {
    return error("selection is required for mode=rewrite_selection", 400);
  }

  const tone = body?.tone || "Friendly";
  const persona = body?.persona || "Real Estate Agent";
  const channel = (body?.channel || "email").toLowerCase();
  const leadData = Array.isArray(body?.lead_data) ? body!.lead_data! : [];
  const source = mode === "rewrite_selection" ? selection : message;

  const agentRow = await queryFirst<{ name: string | null }>(
    env.D1DB, `SELECT name FROM "user" WHERE id = ?`, user.id,
  );
  const agentName = (agentRow?.name || "").trim();

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (membership) {
    const plan = await getOrgPlan(env, membership.org_id);
    if (!(await checkUsageLimit(env, membership.org_id, plan, "ai", 1))) {
      await notifyQuotaExceeded(env, membership.org_id, "ai");
      return error("Monthly AI limit reached for your plan", 403);
    }
  }

  try {
    const out = await generateWithOpenAI(env, SYSTEM_PROMPT, buildUserPrompt({
      message, source, tone, persona, channel, leadData, mode, agentName,
    }), { orgId: membership?.org_id ?? null });
    let rewritten = sanitizePlaceholders(cleanRewrite(out.text || ""));
    // Materialize name tokens so the agent sees clean copy, never {AgentName}.
    if (agentName) {
      rewritten = rewritten.replace(/\{\{?\s*(agent_?name|agent_?first_?name|agent_?full_?name|sender_?name|sender_?full_?name)\s*\}?\}/gi, agentName);
    }
    const lead0 = (leadData[0] ?? null) as Record<string, unknown> | null;
    const leadFirst = String(lead0?.first_name || String(lead0?.name || "").split(/\s+/)[0] || "").trim();
    if (leadFirst) {
      rewritten = rewritten.replace(/\{\{?\s*(first_?name)\s*\}?\}/gi, leadFirst);
    }
    if (channel === "sms") rewritten = trimToLimit(rewritten, SMS_MAX_CHARS);
    return json({
      improved_message: rewritten,
      message: rewritten,
      text: rewritten,
      suggestions: [],
      intent: "Unknown",
      mode,
      chars: rewritten.length,
    });
  } catch (e) { return error((e as Error).message, 502); }
};
