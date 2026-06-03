import React, { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createScheduledMessage,
  type ScheduledChannel,
} from "../../utils/scheduledMessages";

interface SendLaterModalProps {
  open: boolean;
  token: string;
  channel: ScheduledChannel;
  contactId: number | null;
  toAddress: string;
  body: string;
  subject?: string | null;
  attachments?: Array<Record<string, unknown>>;
  onClose: () => void;
  onScheduled?: (id: number, sendAtIso: string) => void;
}

const padZero = (n: number) => n.toString().padStart(2, "0");

const defaultSendAtLocal = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(
    d.getDate(),
  )}T${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
};

const minSendAtLocal = (): string => {
  const d = new Date(Date.now() + 60_000);
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(
    d.getDate(),
  )}T${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
};

const SendLaterModal: React.FC<SendLaterModalProps> = ({
  open,
  token,
  channel,
  contactId,
  toAddress,
  body,
  subject,
  attachments = [],
  onClose,
  onScheduled,
}) => {
  const queryClient = useQueryClient();
  const [sendAt, setSendAt] = useState<string>(defaultSendAtLocal());
  const [minLocal, setMinLocal] = useState<string>(minSendAtLocal());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSendAt(defaultSendAtLocal());
      setMinLocal(minSendAtLocal());
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    if (!sendAt) {
      setError("Pick a date and time.");
      return;
    }
    const when = new Date(sendAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      setError("Choose a time at least one minute from now.");
      return;
    }
    if (!contactId) {
      setError("Select a contact first.");
      return;
    }
    if (!body.trim() && attachments.length === 0) {
      setError("Write a message before scheduling.");
      return;
    }
    if (channel === "email" && !subject?.trim()) {
      setError("Add an email subject.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createScheduledMessage(token, {
        channel,
        to_address: toAddress,
        body,
        subject: channel === "email" ? subject || "" : null,
        contact_id: contactId,
        send_at: when.toISOString(),
        attachments,
      });
      queryClient.invalidateQueries({ queryKey: ["scheduled-messages"] });
      onScheduled?.(result.id, result.scheduled_at);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || "Failed to schedule message");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-85 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Send later</h3>
            <p className="mt-1 text-sm text-gray-600">
              Schedule this {channel === "email" ? "email" : "SMS"} to send
              automatically. Personalization tokens render at send time.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium text-gray-800">
          Send at
          <input
            type="datetime-local"
            value={sendAt}
            min={minLocal}
            onChange={(e) => setSendAt(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-hidden focus:border-orange-300"
          />
        </label>

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-70"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Schedule send
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendLaterModal;
