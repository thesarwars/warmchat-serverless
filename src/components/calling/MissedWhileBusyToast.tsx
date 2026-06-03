import { useCalling } from "@/context/useCalling";
import { PhoneMissed, X } from "lucide-react";

export function MissedWhileBusyToast() {
  const { missedBanner, dismissMissedBanner } = useCalling();
  if (!missedBanner) return null;
  return (
    <div className="fixed bottom-28 right-4 z-50 flex w-72 items-start gap-3 rounded-xl bg-amber-100 p-3 shadow-lg ring-1 ring-amber-300">
      <PhoneMissed className="mt-0.5 h-5 w-5 text-amber-700" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-900">
          Missed call while busy
        </p>
        <p className="truncate text-xs text-amber-900/80">
          {missedBanner.leadName || missedBanner.fromNumber}
        </p>
        <p className="mt-1 text-[11px] text-amber-900/70">
          Auto-reply text sent.
        </p>
      </div>
      <button
        type="button"
        onClick={dismissMissedBanner}
        className="rounded-md p-1 text-amber-900 hover:bg-amber-200"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
