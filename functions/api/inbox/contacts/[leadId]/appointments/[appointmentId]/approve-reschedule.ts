/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../../_shared/env.ts";
import { json, error } from "../../../../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../../../../_shared/db.ts";
import { requireUser } from "../../../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../../../_shared/orgAccess.ts";
import {
  APPT_RESCHEDULE_PROPOSED, APPT_RESCHEDULED,
  serializeAppointment, appointmentToUnifiedDict, type AppointmentRow,
} from "../../../../../../_shared/appointments.ts";

/** POST /api/inbox/contacts/:leadId/appointments/:appointmentId/approve-reschedule */
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
  if (appt.status !== APPT_RESCHEDULE_PROPOSED) {
    return error("Only a proposed reschedule can be approved", 400);
  }

  await execute(
    env.D1DB,
    `UPDATE lead_appointment SET status = ?, updated_at = ? WHERE id = ?`,
    APPT_RESCHEDULED, nowIso(), apptId,
  );
  const updated = await queryFirst<AppointmentRow>(env.D1DB, `SELECT * FROM lead_appointment WHERE id = ?`, apptId);
  return json({ appointment: serializeAppointment(updated!), message: appointmentToUnifiedDict(updated!) });
};
