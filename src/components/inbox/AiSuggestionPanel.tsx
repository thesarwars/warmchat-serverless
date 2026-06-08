import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { callAiImprove } from "../../utils/aiImprove";

const TONES = ["Professional", "Warm", "Direct"] as const;
type Tone = (typeof TONES)[number];

interface AiSuggestionPanelProps {
  open: boolean;
  token: string;
  channel: "sms" | "email";
  message: string;
  leadData?: unknown[];
  persona?: string;
  /** When true, the first generated draft is applied straight to the composer
   *  (used by the Tasks "Send Draft" deep-link) instead of showing options. */
  autoApply?: boolean;
  onClose: () => void;
  onApply: (text: string, focusComposer: boolean) => void;
}

const AiSuggestionPanel: React.FC<AiSuggestionPanelProps> = ({
  open,
  token,
  channel,
  message,
  leadData = [],
  persona = "Real Estate Agent",
  autoApply = false,
  onClose,
  onApply,
}) => {
  const [tone, setTone] = useState<Tone>("Professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const openedRef = useRef(false);

  const generate = useCallback(
    async (t: Tone) => {
      setLoading(true);
      setError(null);
      setOptions([]);
      try {
        const result = await callAiImprove(token, {
          message: message.trim() || "Write a friendly outreach message.",
          mode: "rewrite_full",
          channel,
          tone: t,
          persona,
          lead_data: leadData,
        });
        const all = [
          result.improved_message,
          ...(result.suggestions ?? []),
        ].filter(Boolean);
        if (autoApply) {
          if (all.length) { onApply(all[0] as string, true); return; }
          setError("AI couldn't generate a draft. Use Generate AI to retry.");
          return;
        }
        setOptions(all.slice(0, 3));
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "AI generation failed. Try again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [token, message, channel, persona, leadData, autoApply, onApply],
  );

  useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      void generate(tone);
    }
    if (!open) {
      openedRef.current = false;
      setOptions([]);
      setError(null);
      setTone("Professional");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTone = (t: Tone) => {
    setTone(t);
    void generate(t);
  };

  if (!open) return null;

  return (
    <div className="mb-3 rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold text-orange-900">
            AI Suggestions
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700"
          aria-label="Close AI panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Tone:</span>
        {TONES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={loading}
            onClick={() => handleTone(t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
              tone === t
                ? "bg-orange-500 text-white"
                : "border border-orange-200 bg-white text-orange-700 hover:bg-orange-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-orange-100 bg-white py-5 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Generating suggestions...
        </div>
      )}

      {!loading && error && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-xs text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void generate(tone)}
            className="ml-3 shrink-0 text-xs font-semibold text-red-700 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && options.length > 0 && (
        <div className="mt-4 space-y-3">
          {options.map((opt, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-orange-100 bg-white p-3 shadow-xs"
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {opt}
              </p>
              <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void generate(tone)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-orange-200 hover:text-orange-700"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => onApply(opt, true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onApply(opt, false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-600"
                >
                  Use Reply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AiSuggestionPanel;
