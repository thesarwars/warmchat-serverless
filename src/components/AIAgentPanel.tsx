import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  ChevronRight,
  FileText,
  Lightbulb,
  MessageSquare,
  BarChart2,
  Users,
  Zap,
  Calendar,
  Send,
  Sparkles,
  PlusCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ── Quick action definitions ──────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { key: "summarize",        label: "Summarize this lead",     shortLabel: "Summarize",    subLabel: "Get a quick summary",       Icon: FileText    },
  { key: "next_step",        label: "Recommend next step",     shortLabel: "Next step",    subLabel: "What to do right now",      Icon: Lightbulb   },
  { key: "write_followup",   label: "Write follow-up",         shortLabel: "Follow-up",    subLabel: "Generate a message",        Icon: MessageSquare },
  { key: "analyze_score",    label: "Analyze lead score",      shortLabel: "Score",        subLabel: "AI insights & score",       Icon: BarChart2   },
  { key: "find_similar",     label: "Find similar leads",      shortLabel: "Similar",      subLabel: "Based on this lead",        Icon: Users       },
  { key: "start_automation", label: "Start automation",        shortLabel: "Automate",     subLabel: "Choose a sequence",         Icon: Zap         },
  { key: "book_appointment", label: "Book appointment push",   shortLabel: "Book appt",    subLabel: "Move toward a meeting",     Icon: Calendar    },
] as const;

type ActionKey = (typeof QUICK_ACTIONS)[number]["key"];
type Message = { role: "user" | "assistant"; content: string };

/** Minimal lead shape the panel reads from the selected row. */
interface PanelLead {
  id: number;
  name?: string | null;
  first_name?: string | null;
}

/** The engine-maintained intelligence for the selected lead (/leads/:id/ai-analysis). */
interface AiAnalysis {
  ai_summary: string | null;
  lead_score: number | null;
  next_best_action: string | null;
  temperature: string | null;
  stage: string | null;
}

interface Props {
  isOpen: boolean;
  lead: PanelLead | null;
  onClose: () => void;
  apiBase: string;
  token: string | null;
  selectedLeadIds?: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sameIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AIAgentPanel({
  isOpen,
  lead,
  onClose,
  apiBase,
  token,
  selectedLeadIds = [],
}: Props) {
  const [mode, setMode] = useState<"quickactions" | "chat">("quickactions");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);

  // Selection-change detection
  const prevSelectedRef = useRef<number[]>([]);
  const [selectionChangedBanner, setSelectionChangedBanner] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasFetchedProfile = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fetch agent name once ─────────────────────────────────────────────────
  useEffect(() => {
    if (hasFetchedProfile.current || !token) return;
    hasFetchedProfile.current = true;
    fetch(`${apiBase}/profile/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setAgentName((d?.name || "").split(" ")[0] || ""))
      .catch(() => {});
  }, [apiBase, token]);

  // ── Reset when lead changes (single-lead click) ───────────────────────────
  // "setState during render" (derived-state pattern) is what React recommends
  // instead of useEffect for immediate resets - no extra render cycle.
  // See: react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevLeadId, setPrevLeadId] = useState(lead?.id);
  if (prevLeadId !== lead?.id) {
    setPrevLeadId(lead?.id);
    setMode("quickactions");
    setMessages([]);
    setInputText("");
    setSelectionChangedBanner(false);
  }
  // Refs must not be mutated during render - reset baseline in an effect instead.
  useEffect(() => {
    prevSelectedRef.current = selectedLeadIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  // ── Detect checkbox-selection changes while in chat mode ──────────────────
  useEffect(() => {
    if (!isOpen) {
      prevSelectedRef.current = selectedLeadIds;
      return;
    }
    if (mode === "chat" && !sameIds(selectedLeadIds, prevSelectedRef.current)) {
      setSelectionChangedBanner(true);
    }
    prevSelectedRef.current = selectedLeadIds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadIds]);

  // ── Scroll to latest message ──────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── Focus input when panel opens ──────────────────────────────────────────
  useEffect(() => {
    if (isOpen && mode === "chat") inputRef.current?.focus();
  }, [isOpen, mode]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isMultiLead = selectedLeadIds.length > 1;
  const contextLabel = isMultiLead
    ? `${selectedLeadIds.length} leads`
    : lead?.name || lead?.first_name || null;

  // ── Load the engine's AI snapshot for the selected single lead ────────────
  useEffect(() => {
    setAnalysis(null);
    if (!isOpen || !lead?.id || isMultiLead || !token) return;
    fetch(`${apiBase}/leads/${lead.id}/ai-analysis`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setAnalysis(d as AiAnalysis); })
      .catch(() => {});
  }, [isOpen, lead?.id, isMultiLead, apiBase, token]);

  // ── API call ──────────────────────────────────────────────────────────────
  const callApi = useCallback(
    async (action: ActionKey | null, userMsg: string, currentMessages: Message[]) => {
      if (!token) return;
      setIsLoading(true);
      try {
        const payload: Record<string, unknown> = {
          lead_data: lead || {},
          action,
          messages: currentMessages,
          message: userMsg,
        };
        if (isMultiLead && action) payload.lead_ids = selectedLeadIds;

        const res = await fetch(`${apiBase}/ai/leads/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        const aiMsg = data.response || data.error || "Sorry, something went wrong.";
        setMessages((prev) => [...prev, { role: "assistant", content: aiMsg }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Couldn't reach the AI. Please try again." },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [token, lead, isMultiLead, selectedLeadIds, apiBase]
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const startNewSession = useCallback(() => {
    setMode("quickactions");
    setMessages([]);
    setInputText("");
    setSelectionChangedBanner(false);
    setActionsExpanded(false);
  }, []);

  const handleQuickAction = useCallback(
    (actionKey: ActionKey, label: string) => {
      const userMsg = isMultiLead ? `${label} (${selectedLeadIds.length} leads)` : label;
      const initial: Message[] = [{ role: "user", content: userMsg }];
      setMode("chat");
      setMessages(initial);
      setSelectionChangedBanner(false);
      setActionsExpanded(false);
      callApi(actionKey, userMsg, []);
    },
    [isMultiLead, selectedLeadIds.length, callApi]
  );

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setMode("chat");
    const priorMessages = messages; // snapshot before state update
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInputText("");
    callApi(null, text, priorMessages);
  }, [inputText, isLoading, callApi, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const greeting = agentName ? `Hi ${agentName}!` : "Hi there!";
  const leadDisplayName = lead?.name || lead?.first_name || "this lead";

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && <div className="fixed inset-0 bg-black/40 z-40 sm:hidden" onClick={onClose} />}

      {/* Panel */}
      <div
        className={[
          "fixed right-0 bg-white border-l border-gray-200 flex flex-col",
          "top-0 sm:top-16 h-screen sm:h-[calc(100vh-4rem)]",
          "w-full sm:w-85 z-50 sm:z-30",
          "shadow-[−4px_0_24px_rgba(0,0,0,0.08)]",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-gray-900">AI Agent</span>
                <span
                  className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    mode === "chat"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {mode === "chat" ? "Chat mode" : "Quick actions"}
                </span>
              </div>
              {/* Context breadcrumb */}
              {contextLabel && (
                <p className="text-[10px] text-gray-400 truncate leading-tight mt-0.5">
                  {isMultiLead ? (
                    <span className="text-purple-500 font-medium">{contextLabel}</span>
                  ) : (
                    <span>{contextLabel}</span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* New session button - always visible when in chat mode */}
            {mode === "chat" && (
              <button
                type="button"
                onClick={startNewSession}
                title="New session"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
              >
                <PlusCircle size={13} />
                New
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Mini action strip - visible in chat mode ─────────────────────── */}
        {mode === "chat" && (
          <div className="shrink-0 border-b bg-gray-50/80">
            {/* Toggle bar */}
            <button
              type="button"
              onClick={() => setActionsExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-1.5 text-[11px] text-gray-500 hover:text-gray-700 transition"
            >
              <span className="font-medium">Quick actions</span>
              {actionsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {actionsExpanded && (
              <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
                {QUICK_ACTIONS.map(({ key, shortLabel, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={isLoading || (!lead && !isMultiLead)}
                    onClick={() =>
                      handleQuickAction(
                        key,
                        QUICK_ACTIONS.find((a) => a.key === key)!.label
                      )
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-700 hover:border-orange-300 hover:bg-orange-50/50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Icon size={11} className="shrink-0 text-orange-500" />
                    {shortLabel}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Selection-changed banner (inside chat) */}
          {mode === "chat" && selectionChangedBanner && (
            <div className="mx-3 mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              <RefreshCw size={13} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="flex-1 min-w-0">
                <span className="font-medium">
                  {isMultiLead
                    ? `${selectedLeadIds.length} leads now selected.`
                    : "Lead selection changed."}
                </span>
                {" "}
                <button
                  type="button"
                  onClick={startNewSession}
                  className="underline font-semibold hover:no-underline"
                >
                  Start fresh →
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSelectionChangedBanner(false)}
                className="shrink-0 text-amber-400 hover:text-amber-600"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {mode === "quickactions" ? (
            /* ── Quick actions view ─────────────────────────────────────── */
            <div className="p-4 space-y-4">
              <div className="text-center pt-2 pb-1">
                <p className="text-base font-semibold text-gray-900">{greeting}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isMultiLead
                    ? `${selectedLeadIds.length} leads selected - pick an action to run on all of them.`
                    : lead
                    ? `How can I help with ${leadDisplayName}?`
                    : "Select a lead to get started."}
                </p>
              </div>

              {/* AI snapshot - the engine's auto-maintained summary/score/next action */}
              {lead && !isMultiLead && analysis && (analysis.ai_summary || analysis.lead_score != null || analysis.next_best_action) && (
                <div className="rounded-xl border border-orange-100 bg-orange-50/40 px-3.5 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-700 flex items-center gap-1"><Sparkles size={11} className="text-orange-500" />AI snapshot</span>
                    {analysis.lead_score != null && <span className="text-[11px] font-semibold text-orange-600">Score {analysis.lead_score}</span>}
                  </div>
                  {analysis.ai_summary && <p className="text-xs text-gray-600 leading-relaxed">{analysis.ai_summary}</p>}
                  {analysis.next_best_action && <div className="text-[11px] text-gray-500"><span className="font-medium text-gray-700">Next:</span> {analysis.next_best_action}</div>}
                </div>
              )}

              {lead ? (
                <div className="space-y-2">
                  {/* Multi-lead badge */}
                  {isMultiLead && (
                    <div className="flex items-center gap-2 rounded-xl bg-purple-50 border border-purple-200 px-3.5 py-2.5 text-xs text-purple-700">
                      <Users size={13} className="shrink-0 text-purple-500" />
                      <span>
                        <span className="font-semibold">{selectedLeadIds.length} leads selected</span>
                        {" "}- each action covers all of them.
                      </span>
                    </div>
                  )}

                  {QUICK_ACTIONS.map(({ key, label, subLabel, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleQuickAction(key, label)}
                      className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left transition hover:border-orange-300 hover:bg-orange-50/40 hover:shadow-xs active:scale-[0.99]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                        <Icon size={15} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-900 leading-tight">
                          {label}
                        </span>
                        <span className="block text-[11px] text-gray-400 mt-0.5">
                          {subLabel}
                          {isMultiLead && (
                            <span className="ml-1 text-purple-500 font-medium">
                              * {selectedLeadIds.length} leads
                            </span>
                          )}
                        </span>
                      </span>
                      <ChevronRight size={13} className="text-gray-300 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                /* ── Empty state ──────────────────────────────────────────── */
                <div className="flex flex-col items-center py-10 gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-orange-50 to-purple-50 border border-orange-100">
                    <Sparkles size={24} className="text-orange-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-gray-700">No lead selected</p>
                    <p className="text-xs text-gray-400 max-w-52.5 leading-relaxed">
                      Click the{" "}
                      <span className="inline-flex items-center gap-0.5 font-semibold text-purple-600">
                        <Sparkles size={10} /> AI
                      </span>{" "}
                      button on any lead row, or check multiple leads for batch actions.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Chat view ───────────────────────────────────────────────── */
            <div className="flex flex-col gap-2.5 p-4 pb-2">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <span className="mr-1.5 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500">
                      <Sparkles size={11} className="text-white" />
                    </span>
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word ${
                      msg.role === "user"
                        ? "bg-orange-500 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start items-center gap-1.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500">
                    <Sparkles size={11} className="text-white" />
                  </span>
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input bar ────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t bg-white px-3 py-3">
          {/* Context chip when in chat */}
          {mode === "chat" && contextLabel && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="flex items-center gap-1 text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                {isMultiLead ? <Users size={9} /> : <Sparkles size={9} />}
                {contextLabel}
              </span>
              <button
                type="button"
                onClick={startNewSession}
                className="text-[10px] text-gray-400 hover:text-orange-500 transition underline"
              >
                New session
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-orange-300 focus-within:ring-1 focus-within:ring-orange-200 transition">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-hidden"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white transition hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
