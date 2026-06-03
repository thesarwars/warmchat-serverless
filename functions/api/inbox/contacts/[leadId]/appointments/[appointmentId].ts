/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../../../_shared/db.ts";
import { requireUser } from "../../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../../_shared/orgAccess.ts";
import {
  MEETING_TYPES, APPT_RESCHEDULE_PROPOSED, RESCHEDULABLE_APPT_STATUSES,
  parseStartsAt, serializeAppointment, appointmentToUnifiedDict, type AppointmentRow,
} from "../../../../../_shared/appointments.ts";
import { sendAppointmentConfirmations } from "../../../../../_shared/appointmentConfirmations.ts";

interface Body {
  appointment_type?: string;
  meeting_type?: string;
  starts_at?: string;
  notes?: string | null;
  external_meeting_url?: string | null;
  send_sms_confirmation?: boolean;
  send_email_confirmation?: boolean;
}

/**
 * PATCH /api/inbox/contacts/:leadId/appointments/:appointmentId - propose a
 * reschedule (only when current status is proposed/confirmed/rescheduled).
 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const leadId = Number(params.leadId);
  const apptId = Number(params.appointmentId);
  if (!Number.isInteger(leadId) || !Number.isInteger(apptId)) return error("Invalid id", 400);

  const appt = await queryFirst<AppointmentRow>(
    env.D1DB, `SELECT * FROM lead_appointment WHERE id = ? AND lead_id = ?`, apptId, leadId);
  if (!appt) return error("Appointment not found", 404);
  if (!(await isOrgMember(env, user.id, appt.org_id))) return error("Forbidden", 403);
  if (!RESCHEDULABLE_APPT_STATUSES.has(appt.status)) {
    return error("Only proposed and confirmed appointments can be rescheduled", 400);
  }

  const body = (await readJson<Body>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.appointment_type !== undefined) {
    const v = (body.appointment_type || "").trim();
    if (!v) return error("appointment_type cannot be empty", 400);
    sets.push("appointment_type = ?"); args.push(v.slice(0, 120));
  }
  if (body.meeting_type !== undefined) {
    const v = (body.meeting_type || "").trim().toLowerCase();
    if (!MEETING_TYPES.has(v)) return error(`meeting_type must be one of: ${[...MEETING_TYPES].sort().join(", ")}`, 400);
    sets.push("meeting_type = ?"); args.push(v);
  }
  if (body.notes !== undefined) {
    const v = body.notes ? String(body.notes).trim() || null : null;
    sets.push("notes = ?"); args.push(v);
  }
  if (body.external_meeting_url !== undefined) {
    const v = body.external_meeting_url ? String(body.external_meeting_url).trim().slice(0, 512) || null : null;
    sets.push("external_meeting_url = ?"); args.push(v);
  }
  if (body.starts_at !== undefined) {
    const v = parseStartsAt(body.starts_at);
    if (!v) return error("starts_at must be a valid ISO-8601 datetime", 400);
    if (new Date(v).getTime() <= Date.now()) return error("starts_at must be in the future", 400);
    sets.push("starts_at = ?"); args.push(v);
  }

  sets.push("status = ?", "updated_at = ?");
  args.push(APPT_RESCHEDULE_PROPOSED, nowIso());

  await execute(env.D1DB, `UPDATE lead_appointment SET ${sets.join(", ")} WHERE id = ?`, ...args, apptId);

  const confirmations = await sendAppointmentConfirmations(env, {
    appointmentId: apptId,
    leadId,
    actorUserId: user.id,
    sendSms: Boolean(body.send_sms_confirmation),
    sendEmail: Boolean(body.send_email_confirmation),
    kind: "rescheduled",
  });

  const updated = await queryFirst<AppointmentRow>(env.D1DB, `SELECT * FROM lead_appointment WHERE id = ?`, apptId);
  return json({
    appointment: serializeAppointment(updated!),
    message: appointmentToUnifiedDict(updated!),
    confirmations,
  });
};
