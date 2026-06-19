import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import {
  BOOKING_MESSAGE_VARIATIONS,
  type BookingVariation,
} from "@/api/leads";
import { sendInboxSms } from "../api/sendMessage";
import { QuietHoursError } from "../types";
import { useQuietHoursConfirm } from "./useQuietHoursConfirm";

// Spec fallback when the org has not configured a booking handoff user.
// Source: docs/Ai Flo.md - "If user clicks book setup call send them to my
// Calendly link to book a call".
const CALENDLY_BOOK_URL = "https://calendly.com/velasquezjojo7/30min";

type Props = {
  open: boolean;
  smsApiBase: string;
  token: string;
  leadId: number | null;
  toPhone: string | null;
  handoffUserId?: number | null;
  onClose: () => void;
  onSent?: () => void;
};

export default function BookingMessageModal({
  open,
  smsApiBase,
  token,
  leadId,
  toPhone,
  handoffUserId,
  onClose,
  onSent,
}: Props) {
  // When no handoff user is configured, surface the spec's Calendly fallback so
  // agents still have a way to land a call directly from the booking modal.
  const showCalendlyFallback = useMemo(
    () => handoffUserId === null || handoffUserId === undefined,
    [handoffUserId],
  );
  const { modal: quietHoursModal, confirm: askQuietHours } =
    useQuietHoursConfirm();
  const [variation, setVariation] = useState<BookingVariation>("default");
  const [body, setBody] = useState<string>(
    BOOKING_MESSAGE_VARIATIONS.default.text,
  );
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setVariation("default");
      setBody(BOOKING_MESSAGE_VARIATIONS.default.text);
    }
  }, [open]);

  if (!open) return null;

  const handleVariationChange = (next: BookingVariation) => {
    setVariation(next);
    setBody(BOOKING_MESSAGE_VARIATIONS[next].text);
  };

  const send = async (confirmQuietHours: boolean) => {
    if (!toPhone || leadId == null) {
      toast.error("This contact does not have a phone number.");
      return false;
    }
    const { res, data } = await sendInboxSms({
      smsApiBase,
      token,
      to: toPhone,
      body: body.trim(),
      leadId,
      confirmQuietHours,
    });
    if (!res.ok) {
      const message =
        (data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error || "")
          : "") ||
        (data && typeof data === "object" && "message" in data
          ? String((data as { message?: unknown }).message || "")
          : "") ||
        "Failed to send booking message.";
      toast.error(message);
      return false;
    }
    return true;
  };

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Message cannot be empty.");
      return;
    }
    if (!toPhone || leadId == null) {
      toast.error("This contact does not have a phone number.");
      return;
    }

    setSending(true);
    try {
      let ok = false;
      try {
        ok = await send(false);
      } catch (err) {
        if (err instanceof QuietHoursError) {
          const proceed = await askQuietHours({
            timezone: err.timezone,
            hour: err.hour,
            until: err.until,
          });
          if (!proceed) return;
          ok = await send(true);
        } else {
          throw err;
        }
      }
      if (!ok) return;
      toast.success("Booking message sent");
      onSent?.();
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || "Failed to send booking message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {quietHoursModal}
      <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-message-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-md bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2
              id="booking-message-title"
              className="text-base font-semibold text-gray-900"
            >
              Send Booking Message
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Pick a variation, edit if needed, then send.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="text-gray-400 transition hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label
              htmlFor="booking-variation"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Variation
            </label>
            <select
              id="booking-variation"
              value={variation}
              onChange={(e) =>
                handleVariationChange(e.target.value as BookingVariation)
              }
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-hidden focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            >
              {(Object.keys(BOOKING_MESSAGE_VARIATIONS) as BookingVariation[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {BOOKING_MESSAGE_VARIATIONS[key].label}
                  </option>
                ),
              )}
            </select>
          </div>

          <div>
            <label
              htmlFor="booking-body"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Message
            </label>
            <textarea
              id="booking-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-gray-200 p-3 text-sm outline-hidden focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-white px-5 py-4">
          {showCalendlyFallback ? (
            <a
              href={CALENDLY_BOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mr-auto rounded-md border border-orange-200 px-4 py-2 text-sm font-medium text-orange-700 hover:border-orange-300"
            >
              Book setup call
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !body.trim()}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
