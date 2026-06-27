/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../../../_shared/db.ts";
import { requireUser } from "../../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../../_shared/orgAccess.ts";
import {
  MEETING_TYPES, APPT_PROPOSED, APPOINTMENT_BOOKED_STATUS,
  parseStartsAt, serializeAppointment, appointmentToUnifiedDict, type AppointmentRow,
} from "../../../../../_shared/appointments.ts";
import { sendAppointmentConfirmations } from "../../../../../_shared/appointmentConfirmations.ts";
import { autoCompleteLeadTasks } from "../../../../../_shared/tasks.ts";

interface Body {
  appointment_type?: string;
  meeting_type?: string;
  starts_at?: string;
  notes?: string | null;
  external_meeting_url?: string | null;
  send_sms_confirmation?: boolean;
  send_email_confirmation?: boolean;
  /** When booked off the Calls page, links the appointment to the call. */
  call_id?: string | null;
}

/** POST /api/inbox/contacts/:leadId/appointments - create a proposed appointment. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const leadId = Number(params.leadId);
  if (!Number.isInteger(leadId)) return error("Invalid lead id", 400);

  const lead = await queryFirst<{ id: number; org_id: number | null }>(
    env.D1DB, `SELECT id, org_id FROM lead WHERE id = ?`, leadId);
  if (!lead) return error("Lead not found", 404);
  if (!lead.org_id || !(await isOrgMember(env, user.id, lead.org_id))) return error("Forbidden", 403);

  const body = (await readJson<Body>(request)) || {};
  const apptType = (body.appointment_type || "").trim();
  if (!apptType) return error("appointment_type is required", 400);
  const meetingType = (body.meeting_type || "").trim().toLowerCase();
  if (!MEETING_TYPES.has(meetingType)) {
    return error(`meeting_type must be one of: ${[...MEETING_TYPES].sort().join(", ")}`, 400);
  }
  const startsAt = parseStartsAt(body.starts_at);
  if (!startsAt) return error("starts_at must be a valid ISO-8601 datetime", 400);
  if (new Date(startsAt).getTime() <= Date.now()) {
    return error("starts_at must be in the future", 400);
  }
  const notes = body.notes ? String(body.notes).trim() || null : null;
  const ext = body.external_meeting_url ? String(body.external_meeting_url).trim().slice(0, 512) || null : null;

  // Optional link back to the call this was booked from (Calls page "Schedule").
  // Only honor it if the call belongs to the same org.
  let callId: string | null = null;
  if (body.call_id) {
    const call = await queryFirst<{ id: string }>(
      env.D1DB, `SELECT id FROM calls WHERE id = ? AND org_id = ?`, String(body.call_id), lead.org_id);
    if (call) callId = call.id;
  }

  const ins = await execute(
    env.D1DB,
    `INSERT INTO lead_appointment
       (lead_id, org_id, appointment_type, starts_at, meeting_type, notes, status,
        external_meeting_url, created_by_user_id, call_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    lead.id, lead.org_id, apptType.slice(0, 120), startsAt, meetingType, notes,
    APPT_PROPOSED, ext, user.id, callId, nowIso(), nowIso(),
  );

  // Mirror lead status / appointment_booked.
  await execute(
    env.D1DB,
    `UPDATE lead SET status = ?, appointment_booked = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    APPOINTMENT_BOOKED_STATUS, lead.id,
  );

  const apptId = Number(ins.meta.last_row_id);

  // Appointment booked -> complete any open "book appointment / schedule showing"
  // task for this lead.
  await autoCompleteLeadTasks(env, {
    leadId: lead.id, orgId: lead.org_id, types: ["showing"], reason: "appointment booked",
  });

  const confirmations = await sendAppointmentConfirmations(env, {
    appointmentId: apptId,
    leadId: lead.id,
    actorUserId: user.id,
    sendSms: Boolean(body.send_sms_confirmation),
    sendEmail: Boolean(body.send_email_confirmation),
  });

  // Re-read after sending so the response carries the new
  // sms_confirmation_sent_at / email_confirmation_sent_at timestamps.
  const appt = await queryFirst<AppointmentRow>(
    env.D1DB, `SELECT * FROM lead_appointment WHERE id = ?`, apptId);
  if (!appt) return error("Failed to load appointment", 500);

  return json({
    appointment: serializeAppointment(appt),
    message: appointmentToUnifiedDict(appt),
    contact: { id: lead.id },
    confirmations,
  }, 201);
};
