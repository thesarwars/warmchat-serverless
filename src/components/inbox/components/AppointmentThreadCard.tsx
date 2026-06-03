import { Calendar } from "lucide-react";
import type { InboxAppointmentRecord } from "@/helpers/backend";
import AppointmentChannelStatus from "./AppointmentChannelStatus";
import { formatAppointmentCardLine } from "../utils/formatters";

export default function AppointmentThreadCard({
  appointment,
  onReschedule,
  onCancel,
}: {
  appointment: InboxAppointmentRecord;
  onReschedule: (a: InboxAppointmentRecord) => void;
  onCancel: (a: InboxAppointmentRecord) => void;
}) {
  const cancelled = appointment.status === "cancelled";
  const showConfirmedBadge =
    !cancelled &&
    (appointment.status === "scheduled" || Boolean(appointment.confirmed_at));

  return (
    <div className="flex w-full justify-center">
      <div
        className={`w-full max-w-full rounded-xl border bg-white px-3 py-2 shadow-xs ${
          cancelled ? "border-gray-200 opacity-70" : "border-gray-200"
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`rounded-lg p-1.5 ${cancelled ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-600"}`}
          >
            <Calendar size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
             <span
  className={`text-sm font-semibold ${
    cancelled ? "text-gray-600" : "text-emerald-700"
  }`}
>
  Appointment{" "}
  {appointment?.status
    ?.replace(/_/g, " ")
    ?.replace(/\b\w/g, (char) => char.toUpperCase())}
</span>
              {showConfirmedBadge ? (
                <span className="rounded-full capitalize bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Confirmed
                </span>
              ) : null}
              <span className="text-xs text-gray-500">{formatAppointmentCardLine(appointment)}</span>
              {appointment.meeting_type ? (
                <span className="text-xs text-gray-400 capitalize">
                  · {String(appointment.meeting_type).replace(/_/g, " ")}
                </span>
              ) : null}
            </div>
            {appointment.external_meeting_url ? (
              <p className="break-all text-xs text-gray-600">
                {/* This field doubles as a meeting URL (Google Meet) or a
                    plain street address (in-person). Only linkify real URLs;
                    a typed address like "123 Main St" must render as text. */}
                {/^https?:\/\//i.test(
                  String(appointment.external_meeting_url),
                ) ? (
                  <a
                    href={String(appointment.external_meeting_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 underline hover:text-sky-700"
                  >
                    {String(appointment.external_meeting_url)}
                  </a>
                ) : (
                  String(appointment.external_meeting_url)
                )}
              </p>
            ) : null}
            {appointment.notes ? (
              <p className="whitespace-pre-wrap text-xs text-gray-500">
                {String(appointment.notes)}
              </p>
            ) : null}
            <AppointmentChannelStatus appointment={appointment} />
            {!cancelled ? (
  <div className="mt-1 flex justify-end gap-2 text-xs">
    {["proposed", "confirmed", "rescheduled"].includes(
      appointment?.status
    ) && (
      <button
        type="button"
        className="font-medium text-sky-600 hover:text-sky-700"
        onClick={() => onReschedule(appointment)}
      >
        Reschedule
      </button>
    )}

    {["proposed", "confirmed", "rescheduled"].includes(
      appointment?.status
    ) && (
      <span className="text-gray-300" aria-hidden>
        |
      </span>
    )}

    <button
      type="button"
      className="font-medium text-sky-600 hover:text-sky-700"
      onClick={() => onCancel(appointment)}
    >
      Cancel
    </button>
  </div>
) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
