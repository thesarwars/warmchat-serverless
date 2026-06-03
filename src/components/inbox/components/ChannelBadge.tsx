import { Calendar, Mail, MessageSquare } from "lucide-react";

export default function ChannelBadge({
  channel,
  count,
  mms = false,
}: {
  channel: "email" | "sms" | "appointment";
  count?: number;
  // An SMS carrying attachments is really an MMS - label it accordingly.
  mms?: boolean;
}) {
  const Icon =
    channel === "email"
      ? Mail
      : channel === "appointment"
        ? Calendar
        : MessageSquare;
  const label =
    channel === "email" ? "Email" : channel === "sms" && mms ? "MMS" : "SMS";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${
        channel === "email"
          ? "bg-blue-50 text-blue-700"
          : "bg-white text-gray-700 border border-gray-200"
      }`}
    >
      <Icon size={11} />
      {label}
      {count ? <span className="font-semibold">{count}</span> : null}
    </span>
  );
}
