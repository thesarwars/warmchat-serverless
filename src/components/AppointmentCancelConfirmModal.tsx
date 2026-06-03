import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface AppointmentCancelConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  /** Whether the booking originally sent an SMS confirmation. */
  defaultSendSms?: boolean;
  /** Whether the booking originally sent an Email confirmation. */
  defaultSendEmail?: boolean;
  /** Disables the SMS checkbox (e.g. lead has no phone). */
  smsAvailable?: boolean;
  /** Disables the Email checkbox (e.g. lead has no email). */
  emailAvailable?: boolean;
  /** True while the cancel request is in flight - shows a spinner, blocks input. */
  busy?: boolean;
  onYes: (channels: { sendSms: boolean; sendEmail: boolean }) => void;
  onNo: () => void;
}

const AppointmentCancelConfirmModal: React.FC<AppointmentCancelConfirmModalProps> = ({
  open,
  title = "Cancel appointment?",
  message,
  defaultSendSms = true,
  defaultSendEmail = true,
  smsAvailable = true,
  emailAvailable = true,
  busy = false,
  onYes,
  onNo,
}) => {
  const [sendSms, setSendSms] = useState(defaultSendSms && smsAvailable);
  const [sendEmail, setSendEmail] = useState(defaultSendEmail && emailAvailable);

  // Reset checkbox state to the booking's original channels every time the
  // modal opens so the previous run doesn't bleed into the next.
  // Calling setState during render is React's recommended "derived state"
  // pattern - avoids the extra render cycle that effect-based resets cause.
  const [prevOpen, setPrevOpen] = useState(false);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setSendSms(defaultSendSms && smsAvailable);
      setSendEmail(defaultSendEmail && emailAvailable);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onNo]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40"
      onClick={busy ? undefined : onNo}
      role="presentation"
    >
      <div
        className="w-[90%] max-w-md rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-appointment-title"
      >
        <h2 id="cancel-appointment-title" className="mb-4 text-center text-xl font-bold text-gray-900">
          {title}
        </h2>
        <p className="mb-5 text-center text-gray-600">{message}</p>

        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Send cancellation notice
          </p>
          <label className="flex items-center gap-2 py-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={sendSms}
              disabled={!smsAvailable}
              onChange={(e) => setSendSms(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-300 accent-orange-500 disabled:cursor-not-allowed"
            />
            <span className={smsAvailable ? "" : "text-gray-400"}>
              SMS{smsAvailable ? "" : " (no phone on file)"}
            </span>
          </label>
          <label className="flex items-center gap-2 py-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={sendEmail}
              disabled={!emailAvailable}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-300 accent-orange-500 disabled:cursor-not-allowed"
            />
            <span className={emailAvailable ? "" : "text-gray-400"}>
              Email{emailAvailable ? "" : " (no email on file)"}
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onNo}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-6 py-2 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onYes({ sendSms, sendEmail })}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-warmchats-primary px-6 py-2 font-semibold text-white transition hover:bg-warmchats-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? "Cancelling..." : "Yes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppointmentCancelConfirmModal;
