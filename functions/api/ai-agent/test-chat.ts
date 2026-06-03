/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { generateWithOpenAI } from "../../_shared/openai.ts";
import { callerOrgId, buildAgentSystemPrompt } from "../../_shared/aiAgents.ts";

/**
 * POST /api/ai-agent/test-chat - sandbox simulator for the AI Agent
 * settings page. The agent role-plays a real-estate lead replying as the user
 * tunes follow-up rules. Returns a JSON envelope including a confidence score,
 * detected intent tag, and an urgency hint that the UI renders inline.
 */

interface ChatMessage { role: "user" | "assistant" | "system"; content: string }
interface ChatBody {
  message?: string;
  history?: ChatMessage[];
  agent_name?: string;
  context?: {
    qualification_questions?: string[];
    handoff_agent?: string;
  };
}

const SYSTEM_PROMPT = `You are a real-estate AI follow-up agent inside WarmChats.
The user is testing how you would reply to an inbound real-estate lead while
they tune their AI Follow-Up settings.

GUIDELINES
- Stay warm, conversational, and brief. One or two short sentences per reply.
- Ask one qualifying question at a time. Never stack multiple questions.
- Match the lead's energy. Don't be pushy if they say "just browsing".
- Use the qualification question list as inspiration when relevant.

OUTPUT
Return STRICT JSON with this exact shape - no markdown fences, no commentary:
{
  "reply": "the message you would send to the lead",
  "confidence": 0-100,
  "intent_tag": "short label e.g. 'Qualifying', 'Booking', 'Cold'",
  "urgency": "low" | "medium" | "high"
}
`;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<ChatBody>(request)) || {};
  const userMessage = (body.message || "").trim();
  if (!userMessage) return error("message is required", 400);

  const ctxLines: string[] = [];
  ctxLines.push(`Agent name: ${body.agent_name || user.name || "the agent"}`);
  if (body.context?.handoff_agent) ctxLines.push(`Handoff agent: ${body.context.handoff_agent}`);
  if (Array.isArray(body.context?.qualification_questions) && body.context!.qualification_questions!.length) {
    ctxLines.push("Qualification questions in flow:");
    for (const q of body.context!.qualification_questions!) ctxLines.push(`- ${q}`);
  }

  const transcript: string[] = [];
  for (const m of body.history ?? []) {
    if (!m?.content) continue;
    transcript.push(`${m.role === "user" ? "Lead" : "AI"}: ${m.content}`);
  }
  transcript.push(`Lead: ${userMessage}`);

  const prompt = `${ctxLines.join("\n")}\n\nConversation so far:\n${transcript.join("\n")}\n\nReply now.`;

  // Prepend the Inbound agent's profile/persona so the simulated reply reflects
  // the agent's real brokerage/areas/commission facts and configured tone.
  const orgId = await callerOrgId(env, user.id);
  const profilePrefix = orgId ? await buildAgentSystemPrompt(env, orgId, user.id, "inbound") : "";
  const systemPrompt = profilePrefix ? `${profilePrefix}\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;

  try {
    const out = await generateWithOpenAI(env, systemPrompt, prompt, { expectJson: true, orgId });
    let parsed: { reply?: string; confidence?: number; intent_tag?: string; urgency?: string };
    try { parsed = JSON.parse(out.text) as typeof parsed; }
    catch { parsed = { reply: out.text }; }

    const confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence ?? 80))));
    return json({
      reply: String(parsed.reply ?? "").trim() || "Got it - thanks for reaching out!",
      confidence,
      intent_tag: String(parsed.intent_tag ?? "Qualifying"),
      urgency: ["low", "medium", "high"].includes(String(parsed.urgency))
        ? String(parsed.urgency) : "low",
    });
  } catch (e) {
    return error((e as Error).message, 502);
  }
};
