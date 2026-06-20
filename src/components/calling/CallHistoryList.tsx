import { useState } from "react";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, X } from "lucide-react";
import { useLeadCalls } from "@/hooks/useLeadCalls";
import type { CallSummary } from "@/types/calling";

const formatDuration = (s: number) => {
  if (!s) return "0:00";
  const mm = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
};

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

function CallRow({ call }: { call: CallSummary }) {
  const isInbound = call.direction === "INBOUND";
  const missed =
    call.status === "NO_ANSWER" ||
    call.status === "BUSY" ||
    call.status === "FAILED";
  const Icon = missed
    ? PhoneMissed
    : isInbound
      ? PhoneIncoming
      : PhoneOutgoing;
  const color = missed
    ? "text-red-600"
    : isInbound
      ? "text-emerald-600"
      : "text-sky-400"; // outbound - light "nimbus" blue
  return (
    <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
      <Icon className={`h-4 w-4 ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium capitalize text-gray-800">
            {call.direction.toLowerCase()}
          </span>
          <span className="text-xs text-gray-500">
            * {call.status.replace(/_/g, " ").toLowerCase()}
          </span>
          {call.answeredVia ? (
            <span className="text-[10px] uppercase tracking-wide rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
              on {call.answeredVia}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-gray-500">
          {formatTime(call.initiatedAt)} * {formatDuration(call.duration || 0)}
        </p>
      </div>
    </div>
  );
}

interface Props {
  leadId?: string | null;
  phoneNumber?: string | null;
}

const CALL_PREVIEW_LIMIT = 10;

export function CallHistoryList({ leadId, phoneNumber }: Props) {
  const { calls, loading } = useLeadCalls({ leadId, phoneNumber });
  const [showAll, setShowAll] = useState(false);
  if (!leadId && !phoneNumber) return null;
  if (loading && calls.length === 0) {
    return <p className="text-xs text-gray-400">Loading call history...</p>;
  }
  if (calls.length === 0) {
    return <p className="text-xs text-gray-400">No calls yet.</p>;
  }
  // Cap the sidebar at the 10 most recent so it never turns into an endless
  // scroll; the full history lives in a modal behind "View All Calls (N)".
  const recent = calls.slice(0, CALL_PREVIEW_LIMIT);
  return (
    <>
      <div className="flex flex-col gap-2">
        {recent.map((c) => (
          <CallRow key={c.id} call={c} />
        ))}
        {calls.length > CALL_PREVIEW_LIMIT && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-orange-600 transition hover:bg-orange-50"
          >
            View All Calls ({calls.length})
          </button>
        )}
      </div>

      {showAll && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowAll(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-bold text-gray-900">Call History ({calls.length})</h3>
              <button
                type="button"
                onClick={() => setShowAll(false)}
                aria-label="Close"
                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto p-4">
              {calls.map((c) => (
                <CallRow key={c.id} call={c} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
