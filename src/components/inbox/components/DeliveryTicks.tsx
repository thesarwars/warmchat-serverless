import { Check, Loader2 } from "lucide-react";
import type { ContactMessage } from "../types";

/**
 * WhatsApp-style delivery indicator for outbound messages.
 *   sent       provider accepted
 *   delivered  carrier/recipient mailserver confirmed
 *   read       email tracking pixel fired; SMS has no read receipt
 *   ⟳        queued (in-flight, no provider receipt yet)
 *   x        failed / bounced
 *
 * Reads the `delivery_status` field plus the *_at timestamps. The tooltip
 * spells out the state + most recent timestamp.
 */
export default function DeliveryTicks({ message }: { message: ContactMessage }) {
  if (message.direction !== "outbound") return null;
  const status = (message.delivery_status || "").toLowerCase();

  const fmtTs = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString() : "";

  // Read (email opens) takes precedence over delivered, which takes
  // precedence over sent. Failure states override everything.
  if (status === "failed" || status === "bounced") {
    const label = `${status === "bounced" ? "Bounced" : "Failed"}${
      message.error_message ? ` · ${message.error_message}` : ""
    }`;
    const icon = <span className="font-semibold">x</span>;
    return (
      <span
        className="ml-1 inline-flex items-center gap-0.5 text-red-200"
        title={label}
        aria-label={label}
      >
        {icon}
      </span>
    );
  }
  if (status === "queued") {
    const label = "Queued";
    const icon = <Loader2 size={11} className="animate-spin" />;
    return (
      <span
        className="ml-1 inline-flex items-center gap-0.5"
        title={label}
        aria-label={label}
      >
        {icon}
      </span>
    );
  }

  // Email-only: opened wins.
  if (message.opened_at) {
    const label = `Read · ${fmtTs(message.opened_at)}`;
    return (
      <span
        className="ml-1 inline-flex items-center gap-1 opacity-100 text-white"
        title={label}
        aria-label={label}
      >
        <span className="inline-flex items-center">
          <Check size={11} className="-mr-1.5" />
          <Check size={11} />
        </span>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-700">Read</span>
      </span>
    );
  }
  if (status === "delivered" || message.delivered_at) {
    const label = `Delivered${message.delivered_at ? ` · ${fmtTs(message.delivered_at)}` : ""}`;
    return (
      <span
        className="ml-1 inline-flex items-center gap-1 opacity-100 text-white"
        title={label}
        aria-label={label}
      >
        <span className="inline-flex items-center">
          <Check size={11} className="-mr-1.5" />
          <Check size={11} />
        </span>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-700">Read</span>
      </span>
    );
  }
  if (status === "sent" || message.sent_at) {
    const label = `Sent${message.sent_at ? ` · ${fmtTs(message.sent_at)}` : ""}`;
    return (
      <span
        className="ml-1 inline-flex items-center"
        title={label}
        aria-label={label}
      >
        <Check size={11} />
      </span>
    );
  }
  return null;
}
