const API_BASE = import.meta.env.VITE_API_BASE;

type AiImproveMode = "rewrite_full" | "rewrite_selection";
type AiChannel = "sms" | "email" | "whatsapp" | "linkedin";

export interface AiImprovePayload {
  message: string;
  selection?: string;
  mode: AiImproveMode;
  channel?: AiChannel;
  tone?: string;
  persona?: string;
  lead_data?: unknown[];
  // Email AI Assist: ask the backend to also generate a subject line.
  want_subject?: boolean;
  // Recent thread messages (oldest -> newest) for conversation-aware drafting.
  history?: { direction: "inbound" | "outbound"; text: string }[];
}

export interface AiImproveResult {
  improved_message: string;
  subject: string;
  suggestions: string[];
  intent?: string;
  mode: AiImproveMode;
  cost: number;
  chars: number;
}

export const callAiImprove = async (
  token: string,
  payload: AiImprovePayload,
): Promise<AiImproveResult> => {
  const res = await fetch(`${API_BASE}/ai/generate/improve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tone: "Friendly",
      persona: "Real Estate Agent",
      lead_data: [],
      ...payload,
    }),
  });

  type AiImproveResponse = {
    error?: string;
    message?: string;
    improved_message?: string;
    subject?: string;
    suggestions?: unknown;
    intent?: string;
    mode?: AiImproveMode;
    cost?: number;
    chars?: number;
  };

  const data: AiImproveResponse = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || "AI generation failed");
  }

  const improved = String(data?.improved_message || data?.message || "").trim();
  if (!improved) {
    throw new Error("AI did not return any message text");
  }

  const suggestionsRaw = data?.suggestions;
  const suggestions = Array.isArray(suggestionsRaw)
    ? suggestionsRaw
        .map((s: unknown) => String(s || "").trim())
        .filter(Boolean)
    : [];

  return {
    improved_message: improved,
    subject: String(data?.subject || "").trim(),
    suggestions,
    intent: data?.intent,
    mode: (data?.mode as AiImproveMode) || payload.mode,
    cost: Number(data?.cost ?? 1),
    chars: Number(data?.chars ?? improved.length),
  };
};

export interface AiCredits {
  used: number;
  limit: number | "unlimited";
  remaining: number | null; // null = unlimited
  cost: { sms: number; email: number };
}

export const fetchAiCredits = async (token: string): Promise<AiCredits> => {
  const res = await fetch(`${API_BASE}/ai/credits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || "Failed to load AI credits");
  return data as AiCredits;
};
