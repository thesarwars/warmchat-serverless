import { Check, Mail, MessageSquare, Minus } from "lucide-react";
import type { InboxAppointmentRecord } from "@/helpers/backend";
import { formatRelativeTime } from "../utils/formatters";

export default function AppointmentChannelStatus({
  appointment,
}: {
  appointment: InboxAppointmentRecord;
}) {
  const smsAt = appointment.sms_confirmation_sent_at;
  const emailAt = appointment.email_confirmation_sent_at;
  // Hide the row entirely for appointments where neither channel was ever
  // used - keeps the card uncluttered for silent bookings.
  if (!smsAt && !emailAt) return null;

  const chip = (
    sent: boolean,
    Icon: typeof MessageSquare,
    label: string,
    timestamp?: string | null,
  ) => (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        sent
          ? "bg-white text-gray-700 border border-gray-200"
          : "bg-gray-100 text-gray-500"
      }`}
      title={
        sent && timestamp
          ? `${label} sent ${new Date(timestamp).toLocaleString()}`
          : `${label} not sent`
      }
    >
      <Icon size={12} />
      {label}
      <span className="text-[10px] opacity-80">
        {sent ? (
          <>
            <Check size={10} className="inline -mt-0.5" />{" "}
            {timestamp ? formatRelativeTime(timestamp) : "sent"}
          </>
        ) : (
          <>
            <Minus size={10} className="inline -mt-0.5" /> not sent
          </>
        )}
      </span>
    </span>
  );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chip(Boolean(smsAt), MessageSquare, "SMS", smsAt)}
      {chip(Boolean(emailAt), Mail, "Email", emailAt)}
    </div>
  );
}
