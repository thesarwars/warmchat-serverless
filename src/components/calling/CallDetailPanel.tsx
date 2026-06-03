import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  MessageSquare,
  CalendarDays,
  StickyNote,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { callingApi } from "@/api/calling";
import { useCalling } from "@/context/useCalling";
import type { CallDetails, CallTaskType } from "@/types/calling";
import { formatCallTime, formatDuration, sentimentStyle, taskTypeLabel } from "./callFormat";

interface Props {
  callId: string;
}

function formatBudget(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
      : n >= 1_000
        ? `$${Math.round(n / 1_000)}K`
        : `$${n}`;
  if (min != null && max != null) return `${fmt(min)} - ${fmt(max)}`;
  return fmt((min ?? max) as number);
}

export function CallDetailPanel({ callId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { startWebCall, activeCall } = useCalling();
  const [noteDraft, setNoteDraft] = useState("");

  const { data: call } = useQuery({
    queryKey: ["call", callId],
    queryFn: () => callingApi.getCall(callId),
  });

  const { data: insights } = useQuery({
    queryKey: ["call-insights", callId],
    queryFn: () => callingApi.getCallInsights(callId),
    // The AI block is filled by an async pipeline; poll while it's still pending.
    refetchInterval: (q) =>
      q.state.data?.insight && q.state.data.insight.status !== "PENDING" &&
      q.state.data.insight.status !== "PROCESSING"
        ? false
        : 15_000,
  });

  const toggleTask = useMutation({
    mutationFn: (vars: { taskId: string; done: boolean }) =>
      callingApi.toggleCallTask(callId, vars.taskId, vars.done),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["call-insights", callId] }),
  });

  const addNote = useMutation({
    mutationFn: (body: string) => callingApi.addCallNote(callId, body),
    onSuccess: () => {
      setNoteDraft("");
      queryClient.invalidateQueries({ queryKey: ["call-insights", callId] });
    },
    onError: () => toast.error("Could not save note"),
  });

  if (!call) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#98A2B3]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading call...
      </div>
    );
  }

  const c = call as CallDetails;
  const counterparty = c.direction === "INBOUND" ? c.fromNumber : c.toNumber;
  const displayName = c.lead?.name || counterparty;
  const leadId = c.lead?.id;
  const ai = insights?.insight ?? null;
  const aiPending = !ai || ai.status === "PENDING" || ai.status === "PROCESSING";
  const budget = ai ? formatBudget(ai.budgetMin, ai.budgetMax) : null;

  const callBack = async () => {
    if (!counterparty) return;
    try {
      await startWebCall({ phoneNumber: counterparty, name: c.lead?.name, leadId });
    } catch {
      toast.error("Could not start call");
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF1EC] text-sm font-semibold text-[#FF6B35]">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold text-[#101828]">{displayName}</h2>
            <p className="text-sm text-[#667085]">{counterparty}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
          <span className="rounded-full bg-[#F2F4F7] px-2 py-0.5 font-medium capitalize text-[#344054]">
            {c.direction === "INBOUND" ? "Incoming" : "Outgoing"}
          </span>
          <span>{formatCallTime(c.initiatedAt)}</span>
          {c.duration > 0 && <span>· {formatDuration(c.duration)}</span>}
          {c.agent?.name && <span>· {c.agent.name}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-4 gap-2">
        <ActionButton icon={Phone} label="Call back" primary onClick={callBack} disabled={!!activeCall} />
        <ActionButton icon={MessageSquare} label="Send text" onClick={() => leadId && navigate(`/inbox?lead=${leadId}`)} disabled={!leadId} />
        <ActionButton icon={CalendarDays} label="Schedule" onClick={() => leadId && navigate(`/appointments?lead=${leadId}`)} disabled={!leadId} />
        <ActionButton icon={StickyNote} label="Add note" onClick={() => document.getElementById(`note-${callId}`)?.focus()} />
      </div>

      {/* Recording */}
      <Section title="Recording" badge={c.isVoicemail ? "Voicemail" : ai && !aiPending ? "AI Transcribed" : undefined}>
        {c.hasRecording || (c.isVoicemail && insights) ? (
          <div className="space-y-2">
            <audio
              controls
              className="w-full"
              src={callingApi.recordingUrl(callId, c.isVoicemail ? "voicemail" : "recording")}
            />
            <a
              href={callingApi.recordingUrl(callId, c.isVoicemail ? "voicemail" : "recording")}
              download
              className="inline-flex items-center gap-1 text-xs font-medium text-[#FF6B35] hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </div>
        ) : (
          <p className="text-sm text-[#98A2B3]">-</p>
        )}
      </Section>

      {/* AI summary */}
      <Section title="AI Summary" badge={aiPending ? undefined : "AI"}>
        {aiPending ? (
          <p className="flex items-center gap-2 text-sm text-[#98A2B3]">
            {ai?.status === "FAILED" ? "-" : (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing call...</>)}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-[#344054]">{ai?.summary || "-"}</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {ai?.sentiment && (
                <span className={`rounded-full px-2 py-0.5 font-medium ${sentimentStyle(ai.sentiment)}`}>
                  {ai.sentiment[0].toUpperCase() + ai.sentiment.slice(1)} sentiment
                </span>
              )}
              {ai?.intent && (
                <span className="text-[#667085]">Intent: <span className="font-medium text-[#344054]">{ai.intent}</span></span>
              )}
              {budget && (
                <span className="text-[#667085]">Budget: <span className="font-medium text-[#344054]">{budget}</span></span>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* Next steps */}
      <Section title="Next Steps" badge={insights?.tasks.length ? "AI detected" : undefined}>
        {insights && insights.tasks.length > 0 ? (
          <ul className="space-y-2">
            {insights.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => toggleTask.mutate({ taskId: t.id, done: e.target.checked })}
                  className="h-4 w-4 rounded border-[#D0D5DD] text-[#FF6B35] focus:ring-[#FF6B35]"
                />
                <span className={`flex-1 text-sm ${t.done ? "text-[#98A2B3] line-through" : "text-[#344054]"}`}>
                  {t.label}
                </span>
                <span className="rounded bg-[#F2F4F7] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#667085]">
                  {taskTypeLabel(t.type as CallTaskType)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#98A2B3]">-</p>
        )}
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <div className="space-y-3">
          <div className="flex gap-2">
            <textarea
              id={`note-${callId}`}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a note..."
              rows={2}
              className="min-w-0 flex-1 resize-none rounded-lg border border-[#EBEBF2] px-3 py-2 text-sm focus:border-[#FF6B35] focus:outline-none"
            />
            <button
              onClick={() => noteDraft.trim() && addNote.mutate(noteDraft.trim())}
              disabled={!noteDraft.trim() || addNote.isPending}
              className="shrink-0 self-start rounded-lg bg-[#FF6B35] px-3 py-2 text-sm font-medium text-white hover:bg-[#e65f2f] disabled:bg-[#D0D5DD]"
            >
              Save
            </button>
          </div>
          {insights && insights.notes.length > 0 && (
            <ul className="space-y-2">
              {insights.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-[#F9FAFB] px-3 py-2">
                  <p className="text-sm text-[#344054]">{n.body}</p>
                  <p className="mt-1 text-[11px] text-[#98A2B3]">
                    {n.authorName || "-"} · {formatCallTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
  disabled,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "border-[#FF6B35] bg-[#FF6B35] text-white hover:bg-[#e65f2f]"
          : "border-[#EBEBF2] bg-white text-[#344054] hover:bg-[#F9FAFB]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#EBEBF2] bg-white p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#667085]">{title}</h3>
        {badge && (
          <span className="rounded bg-[#FFF1EC] px-1.5 py-0.5 text-[10px] font-semibold text-[#FF6B35]">{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}
