import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
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
      : "text-blue-600";
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

export function CallHistoryList({ leadId, phoneNumber }: Props) {
  const { calls, loading } = useLeadCalls({ leadId, phoneNumber });
  if (!leadId && !phoneNumber) return null;
  if (loading && calls.length === 0) {
    return <p className="text-xs text-gray-400">Loading call history...</p>;
  }
  if (calls.length === 0) {
    return <p className="text-xs text-gray-400">No calls yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {calls.map((c) => (
        <CallRow key={c.id} call={c} />
      ))}
    </div>
  );
}
