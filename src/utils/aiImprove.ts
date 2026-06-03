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
}

export interface AiImproveResult {
  improved_message: string;
  suggestions: string[];
  intent?: string;
  mode: AiImproveMode;
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
    suggestions?: unknown;
    intent?: string;
    mode?: AiImproveMode;
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
    suggestions,
    intent: data?.intent,
    mode: (data?.mode as AiImproveMode) || payload.mode,
    chars: Number(data?.chars ?? improved.length),
  };
};
