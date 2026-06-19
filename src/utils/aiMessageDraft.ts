type AiDraftResult = {
  text: string;
  suggestions: string[];
  // Email AI Assist: the generated subject line (when want_subject was requested).
  subject: string;
};

type LeadDataEntry = Record<string, unknown>;

type GenerateDraftOptions = {
  apiBase: string;
  token: string;
  channel: "email" | "sms";
  currentMessage?: string;
  leadData?: LeadDataEntry[];
  prompt?: string;
  tone?: string;
  persona?: string;
};

type AiResponseShape = {
  improved_message?: unknown;
  message?: unknown;
  text?: unknown;
  subject?: unknown;
  suggestions?: unknown;
  error?: string;
  response?: {
    message?: unknown;
    messageText?: unknown;
    suggestions?: unknown;
    reply_suggestions?: unknown;
  };
};

const DEFAULT_TONE = "Friendly";
const DEFAULT_PERSONA = "Sales Representative";

const asText = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
};

const extractSuggestions = (data: AiResponseShape): string[] => {
  const raw =
    data?.suggestions ||
    data?.response?.suggestions ||
    data?.response?.reply_suggestions ||
    [];
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
};

const extractDraftText = (data: AiResponseShape): string => {
  return (
    asText(data?.improved_message) ||
    asText(data?.message) ||
    asText(data?.text) ||
    asText(data?.response?.message) ||
    asText(data?.response?.messageText) ||
    ""
  );
};

const AI_TIMEOUT_MS = 25_000;

const requestAi = async (url: string, token: string, payload: Record<string, unknown>) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === "AbortError") {
      throw new Error("AI request timed out. Please try again.");
    }
    throw new Error("Network error. Please check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || "AI generation failed");
  }

  const text = extractDraftText(data);
  if (!text) {
    throw new Error("AI did not return any message text");
  }

  return {
    text,
    suggestions: extractSuggestions(data),
    subject: asText(data?.subject),
  } satisfies AiDraftResult;
};

export const generateAiLeadMessageDraft = async ({
  apiBase,
  token,
  channel,
  currentMessage,
  leadData = [],
  prompt,
  tone = DEFAULT_TONE,
  persona = DEFAULT_PERSONA,
}: GenerateDraftOptions): Promise<AiDraftResult> => {
  // Email always routes through /ai/generate/improve so the AI also generates a
  // subject line (want_subject) and the org is charged the email rate (2 AI
  // credits). The improve endpoint drafts from scratch when the message is empty
  // ("Generate with AI") or rewrites an existing draft ("Improve with AI").
  if (channel === "email" || currentMessage?.trim()) {
    return requestAi(`${apiBase}/ai/generate/improve`, token, {
      text: currentMessage || "",
      message: currentMessage || "",
      tone,
      persona,
      channel,
      lead_data: leadData,
      want_subject: channel === "email",
    });
  }

  return requestAi(`${apiBase}/ai/generate`, token, {
    prompt:
      prompt ||
      (channel === "sms"
        ? "Create a short, personalized SMS outreach message for a lead."
        : "Create a personalized outreach email message for a lead."),
    tone,
    persona,
    channel,
    lead_data: leadData,
  });
};
