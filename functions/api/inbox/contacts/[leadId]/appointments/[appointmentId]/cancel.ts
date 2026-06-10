/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../../../../_shared/db.ts";
import { requireUser } from "../../../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../../../_shared/orgAccess.ts";
import {
  APPT_CANCELLED, ACTIVE_APPT_STATUSES,
  serializeAppointment, appointmentToUnifiedDict, type AppointmentRow,
} from "../../../../../../_shared/appointments.ts";
import { sendAppointmentConfirmations } from "../../../../../../_shared/appointmentConfirmations.ts";

interface Body {
  send_sms_confirmation?: boolean;
  send_email_confirmation?: boolean;
}

/**
 * After a cancel, if the lead has no remaining active appointments, clear
 * appointment_booked and step "Appointment Set" back to "Qualified" so the
 * pipeline/lead never shows "Appointment Set" with zero live appointments.
 */
async function syncLeadStageAfterCancel(env: Env, leadId: number): Promise<void> {
  const remaining = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM lead_appointment WHERE lead_id = ? AND COALESCE(status,'') != ?`,
    leadId, APPT_CANCELLED,
  );
  if ((remaining?.n ?? 0) === 0) {
    await execute(
      env.D1DB,
      `UPDATE lead SET appointment_booked = 0,
              status = CASE WHEN status = 'Appointment Set' THEN 'Qualified' ELSE status END,
              updated_at = ? WHERE id = ?`,
      nowIso(), leadId,
    );
  }
}

/** POST /api/inbox/contacts/:leadId/appointments/:appointmentId/cancel */
export const onRequestPost: PagesFunction<Env> = async (context) => {
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
  // Already cancelled? Re-sync the lead stage anyway (self-heals a lead stuck on
  // "Appointment Set" from a cancel that predated this logic), then return
  // idempotently instead of erroring.
  if (!ACTIVE_APPT_STATUSES.has(appt.status)) {
    await syncLeadStageAfterCancel(env, leadId);
    return json({
      appointment: serializeAppointment(appt),
      message: appointmentToUnifiedDict(appt),
      already_cancelled: true,
    });
  }

  const body = (await readJson<Body>(request)) || {};

  await execute(
    env.D1DB,
    `UPDATE lead_appointment SET status = ?, updated_at = ? WHERE id = ?`,
    APPT_CANCELLED, nowIso(), apptId,
  );

  await syncLeadStageAfterCancel(env, leadId);

  const confirmations = await sendAppointmentConfirmations(env, {
    appointmentId: apptId,
    leadId,
    actorUserId: user.id,
    sendSms: Boolean(body.send_sms_confirmation),
    sendEmail: Boolean(body.send_email_confirmation),
    kind: "cancelled",
  });

  const updated = await queryFirst<AppointmentRow>(env.D1DB, `SELECT * FROM lead_appointment WHERE id = ?`, apptId);
  return json({
    appointment: serializeAppointment(updated!),
    message: appointmentToUnifiedDict(updated!),
    confirmations,
  });
};
