import { useState } from "react";
import { Phone, PhoneOff } from "lucide-react";

interface Props {
  fromName: string;
  fromNumber: string;
  /** Called after the user answers or declines - closes the toast. */
  onResolved: () => void;
}

/**
 * In-app toast for a TEST incoming call (fired by the Settings "Send test
 * call" button). Mirrors the real IncomingCallModal's Answer / Decline
 * affordances but is fully self-contained - it never touches the Telnyx /
 * WebRTC pipeline, so a test click can't start a real call leg.
 */
export function TestCallToast({ fromName, fromNumber, onResolved }: Props) {
  const [status, setStatus] = useState<"ringing" | "answered" | "declined">("ringing");

  const act = (next: "answered" | "declined") => {
    setStatus(next);
    // Let the user see the result for a beat, then close the toast.
    setTimeout(onResolved, 1500);
  };

  const avatarClass =
    status === "declined"
      ? "bg-red-100 text-red-600"
      : status === "answered"
        ? "bg-emerald-100 text-emerald-600"
        : "animate-pulse bg-emerald-100 text-emerald-600";

  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 sm:max-w-sm">
      <div className="flex items-start gap-3 p-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${avatarClass}`}>
          {status === "declined" ? <PhoneOff className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-gray-500">Incoming call (test)</p>
          <p className="truncate text-sm font-semibold text-gray-900">{fromName}</p>
          <p className="truncate text-xs text-gray-600">{fromNumber}</p>
        </div>
      </div>
      <div className="border-t border-gray-100 p-2">
        {status === "ringing" ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => act("declined")}
              className="flex items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              <PhoneOff className="h-4 w-4" />
              Decline
            </button>
            <button
              type="button"
              onClick={() => act("answered")}
              className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <Phone className="h-4 w-4" />
              Answer
            </button>
          </div>
        ) : (
          <p className={`px-1 py-1 text-sm font-medium ${status === "answered" ? "text-emerald-600" : "text-red-600"}`}>
            {status === "answered"
              ? "Call answered (test). No real call was placed."
              : "Call declined (test)."}
          </p>
        )}
      </div>
    </div>
  );
}
