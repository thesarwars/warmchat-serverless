/// <reference types="@cloudflare/workers-types" />

export const MEETING_TYPES = new Set(["in_person", "phone", "google_meet"]);

export const APPOINTMENT_BOOKED_STATUS = "Appointment Booked";
export const APPT_PROPOSED = "proposed";
export const APPT_CONFIRMED = "confirmed";
export const APPT_RESCHEDULE_PROPOSED = "reschedule_proposed";
export const APPT_RESCHEDULED = "rescheduled";
export const APPT_CANCELLED = "cancelled";

export const ACTIVE_APPT_STATUSES = new Set([
  APPT_PROPOSED, APPT_CONFIRMED, APPT_RESCHEDULE_PROPOSED, APPT_RESCHEDULED,
]);
export const RESCHEDULABLE_APPT_STATUSES = new Set([
  APPT_PROPOSED, APPT_CONFIRMED, APPT_RESCHEDULED,
]);

export interface AppointmentRow {
  id: number; lead_id: number; org_id: number;
  appointment_type: string; starts_at: string;
  meeting_type: string; notes: string | null; status: string;
  external_meeting_url: string | null;
  sms_confirmation_sent_at: string | null;
  email_confirmation_sent_at: string | null;
  confirmed_at: string | null;
  created_by_user_id: number | null;
  created_at: string; updated_at: string;
}

export function appointmentActions(status: string) {
  return {
    confirm_with_client: status === APPT_PROPOSED,
    reschedule: RESCHEDULABLE_APPT_STATUSES.has(status),
    approve_reschedule: status === APPT_RESCHEDULE_PROPOSED,
    cancel: ACTIVE_APPT_STATUSES.has(status),
  };
}

export function serializeAppointment(a: AppointmentRow) {
  return {
    id: a.id,
    lead_id: a.lead_id,
    org_id: a.org_id,
    appointment_type: a.appointment_type,
    starts_at: a.starts_at,
    meeting_type: a.meeting_type,
    notes: a.notes,
    status: a.status,
    external_meeting_url: a.external_meeting_url,
    sms_confirmation_sent_at: a.sms_confirmation_sent_at,
    email_confirmation_sent_at: a.email_confirmation_sent_at,
    confirmed_at: a.confirmed_at,
    created_by_user_id: a.created_by_user_id,
    created_at: a.created_at,
    updated_at: a.updated_at,
  };
}

export function appointmentToUnifiedDict(a: AppointmentRow) {
  return {
    id: `appointment-${a.id}`,
    message_id: null,
    thread_id: null,
    conversation_id: null,
    channel: "appointment",
    direction: "system",
    body: null,
    subject: null,
    attachments: [],
    timestamp: a.starts_at,
    display_time: a.starts_at,
    appointment: { ...serializeAppointment(a), actions: appointmentActions(a.status) },
  };
}

/** Validate + normalize an ISO-8601 starts_at; returns ISO string or null. */
export function parseStartsAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}
