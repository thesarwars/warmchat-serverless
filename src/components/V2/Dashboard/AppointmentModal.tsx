import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  X,
  Home,
  Phone,
  Users,
  ClipboardList,
  Calendar as CalendarIcon,
  ChevronDown,
  MapPin,
  Video,
} from "lucide-react";

type AppointmentType = "showing" | "call" | "buyer" | "listing";
type LocationType = "in-person" | "phone" | "google-meet";

interface AppointmentPayload {
  appointment_type: AppointmentType;
  starts_at: string;
  meeting_type: string;
  notes: string;
  external_meeting_url: string;
  send_sms_confirmation: boolean;
  send_email_confirmation: boolean;
}

interface EditingAppointment {
  appointment_type?: string;
  starts_at?: string;
  meeting_type?: string;
  notes?: string;
  external_meeting_url?: string;
  sms_confirmation_sent_at?: string | null;
  email_confirmation_sent_at?: string | null;
}

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  onSubmit?: (payload: AppointmentPayload) => void | Promise<void>;
  leadId?: number;
  /** When set, modal edits this appointment (PATCH) instead of creating. */
  editingAppointment?: EditingAppointment | null;
}

const APPOINTMENT_TYPES: {
  key: AppointmentType;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { key: "showing", label: "Showing", icon: Home },
  { key: "call", label: "Call", icon: Phone },
  { key: "buyer", label: "Buyer Consult", icon: Users },
  { key: "listing", label: "Listing Appt.", icon: ClipboardList },
];

const LOCATION_TYPES: {
  key: LocationType;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { key: "in-person", label: "In Person", icon: MapPin },
  { key: "phone", label: "Phone Call", icon: Phone },
  { key: "google-meet", label: "Google Meet", icon: Video },
];

const MEETING_TYPE_API: Record<LocationType, string> = {
  "in-person": "in_person",
  phone: "phone",
  "google-meet": "google_meet",
};

function meetingTypeToLocationType(api: string): LocationType {
  const n = String(api || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (n === "in_person") return "in-person";
  if (n === "phone") return "phone";
  if (n === "google_meet") return "google-meet";
  return "in-person";
}

const NOTES_MAX = 250;

const formatPreviewDate = (date: string) => {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const AppointmentModal: React.FC<AppointmentModalProps> = ({
  isOpen,
  onClose,
  contactName = "Contact",
  contactPhone: _contactPhone,
  contactEmail: _contactEmail,
  onSubmit,
  leadId,
  editingAppointment = null,
}) => {
  const [type, setType] = useState<AppointmentType>("showing");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("14:00");
  const [locationType, setLocationType] = useState<LocationType>("in-person");
  const [externalMeetingUrl, setExternalMeetingUrl] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [sendSms, setSendSms] = useState<boolean>(true);
  const [sendEmail, setSendEmail] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const today = new Date().toISOString().split("T")[0];

  // Lock page scroll while the modal is open (no background scrolling).
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) setSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingAppointment) {
      const rawType = String(
        editingAppointment.appointment_type || "showing",
      ).toLowerCase();
      const allowed: AppointmentType[] = [
        "showing",
        "call",
        "buyer",
        "listing",
      ];
      setType(
        (allowed.includes(rawType as AppointmentType)
          ? rawType
          : "showing") as AppointmentType,
      );
      const start = new Date(editingAppointment.starts_at);
      if (!Number.isNaN(start.getTime())) {
        const y = start.getFullYear();
        const mo = String(start.getMonth() + 1).padStart(2, "0");
        const da = String(start.getDate()).padStart(2, "0");
        const hh = String(start.getHours()).padStart(2, "0");
        const mm = String(start.getMinutes()).padStart(2, "0");
        setDate(`${y}-${mo}-${da}`);
        setTime(`${hh}:${mm}`);
      }
      setLocationType(
        meetingTypeToLocationType(editingAppointment.meeting_type),
      );
      setExternalMeetingUrl(
        String(editingAppointment.external_meeting_url || ""),
      );
      setNotes(String(editingAppointment.notes || ""));
      // Default channel checkboxes to the original booking's channels so a
      // reschedule notifies whoever was notified the first time. The user can
      // still uncheck both before saving.
      setSendSms(Boolean(editingAppointment.sms_confirmation_sent_at));
      setSendEmail(Boolean(editingAppointment.email_confirmation_sent_at));
      return;
    }
    setType("showing");
    setDate("");
    setTime("14:00");
    setLocationType("in-person");
    setExternalMeetingUrl("");
    setNotes("");
    setSendSms(true);
    setSendEmail(true);
  }, [isOpen, editingAppointment]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const typeLabel = useMemo(
    () => APPOINTMENT_TYPES.find((t) => t.key === type)?.label || "",
    [type],
  );

  const formattedTime = useMemo(() => {
    if (!time) return "";
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return time;
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = ((h + 11) % 12) + 1;
    return `${hour12.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")} ${suffix}`;
  }, [time]);

  // Mirror the server's buildConfirmationBody so the preview matches what the
  // contact will actually receive. Keep this in sync with
  // functions/_shared/appointmentConfirmations.ts.
  const smsPreview = useMemo(() => {
    const greet = (contactName || "there").split(/\s+/)[0] || "there";
    const apptType = typeLabel || type;
    const meetingLabel =
      locationType === "in-person"
        ? "In person"
        : locationType === "phone"
          ? "Phone"
          : "Google Meet";

    const dateText = formatPreviewDate(date) || "the selected date";
    const timeText = formattedTime || "the selected time";
    const when = `${dateText} ${timeText} UTC`.trim();

    if (editingAppointment) {
      const lines = [
        `Hi ${greet},`,
        "",
        `Your appointment has been rescheduled: ${apptType}`,
        `When: ${when}`,
        `Appointment: ${meetingLabel}`,
      ];
      if (externalMeetingUrl.trim()) lines.push(`Address: ${externalMeetingUrl.trim()}`);
      if (notes.trim()) lines.push("", `Notes: ${notes.trim()}`);
      lines.push("", "Reply to this thread if you need to make a change.");
      return lines.join("\n");
    }

    const lines = [
      `Hi ${greet},`,
      "",
      `Your appointment is confirmed: ${apptType}`,
      `When: ${when}`,
      `Appointment: ${meetingLabel}`,
    ];
    if (externalMeetingUrl.trim()) lines.push(`Address: ${externalMeetingUrl.trim()}`);
    if (notes.trim()) lines.push("", `Notes: ${notes.trim()}`);
    lines.push("", "Reply to this thread if you need to make a change.");
    return lines.join("\n");
  }, [
    contactName,
    typeLabel,
    type,
    date,
    formattedTime,
    locationType,
    externalMeetingUrl,
    notes,
    editingAppointment,
  ]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!leadId) {
      toast.error("No contact selected.");
      return;
    }
    if (!date?.trim() || !time?.trim()) {
      toast.error("Please choose a date and time.");
      return;
    }
    const local = new Date(`${date}T${time}:00`);
    if (Number.isNaN(local.getTime())) {
      toast.error("Invalid date or time.");
      return;
    }
    const payload = {
      appointment_type: type,
      starts_at: local.toISOString(),
      meeting_type: MEETING_TYPE_API[locationType],
      notes: notes.trim(),
      external_meeting_url: externalMeetingUrl.trim(),
      send_sms_confirmation: sendSms,
      send_email_confirmation: sendEmail,
    };
    setSubmitting(true);
    try {
      await onSubmit?.(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6 ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Centered modal panel (was a right-side slide-in drawer). */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-modal-title"
        className={`relative z-10 m-auto flex w-full max-w-155 max-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-200 ease-out ${
          isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2 pointer-events-none"
        }`}
      >
        <header className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2
              id="appointment-modal-title"
              className="text-lg font-semibold text-gray-900"
            >
              {editingAppointment
                ? "Reschedule Appointment"
                : "Book Appointment"}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">for {contactName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Appointment Type
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {APPOINTMENT_TYPES.map(({ key, label, icon: Icon }) => {
                const active = type === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition ${
                      active
                        ? "border-orange-300 bg-orange-50 text-orange-600"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <Icon
                      size={20}
                      className={active ? "text-orange-500" : "text-gray-500"}
                    />
                    <span className="leading-tight text-center">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold text-gray-900 mb-1.5 block">
                Date
              </span>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-sm text-gray-700 focus:border-orange-300 focus:outline-hidden focus:ring-1 focus:ring-orange-200"
                />
                <CalendarIcon
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gray-900 mb-1.5 block">
                Time
              </span>
              <div className="relative">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-sm text-gray-700 focus:border-orange-300 focus:outline-hidden focus:ring-1 focus:ring-orange-200"
                />
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>
            </label>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Location / Meeting Type
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {LOCATION_TYPES.map(({ key, label, icon: Icon }) => {
                const active = locationType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLocationType(key)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition ${
                      active
                        ? "border-orange-300 bg-orange-50 text-orange-600"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <Icon
                      size={14}
                      className={active ? "text-orange-500" : "text-gray-500"}
                    />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <label className="mt-3 block">
              <span className="text-sm font-semibold text-gray-900 mb-1.5 block">
                Address
              </span>

              <input
                type="text"
                value={externalMeetingUrl}
                onChange={(e) => setExternalMeetingUrl(e.target.value)}
                placeholder="123 Main St"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-orange-300 focus:outline-hidden focus:ring-1 focus:ring-orange-200"
              />
            </label>
          </section>

          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-semibold text-gray-900">
                Notes{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </h3>
              <span className="text-xs text-gray-400">
                {notes.length}/{NOTES_MAX}
              </span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => {
                if (e.target.value.length <= NOTES_MAX)
                  setNotes(e.target.value);
              }}
              rows={2}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-orange-300 focus:outline-hidden focus:ring-1 focus:ring-orange-200 resize-none"
            />
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Confirmation
            </h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendSms}
                  onChange={(e) => setSendSms(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-300 accent-orange-500"
                />
                <span className="text-sm text-gray-700">
                  Send SMS confirmation
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-300 accent-orange-500"
                />
                <span className="text-sm text-gray-700">
                  Send Email confirmation
                </span>
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-1.5">
                <span className="text-xs font-semibold text-gray-700">
                  SMS Preview
                </span>
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-600">
                {smsPreview}
              </p>
            </div>
          </section>
        </div>

        <footer className="flex items-center gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!leadId || submitting}
            className="flex-1 rounded-2xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? editingAppointment
                ? "Saving..."
                : "Booking..."
              : editingAppointment
                ? "Save changes"
                : "Book Appointment"}
          </button>
        </footer>
      </aside>
    </div>
  );
};

export default AppointmentModal;
