/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../_shared/http.ts";
import { queryAll, queryFirst, execute, nowIso } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";
import {
  MEETING_TYPES, APPT_PROPOSED, APPOINTMENT_BOOKED_STATUS, parseStartsAt,
} from "../../../../_shared/appointments.ts";
import { sendAppointmentConfirmations } from "../../../../_shared/appointmentConfirmations.ts";

/**
 * GET /api/dashboard/org/:orgId/appointments - all non-cancelled appointments for
 * the org, joined with the lead name. Used by the Calendar page. Optional
 * `from` / `to` ISO query params bound the window (defaults: -30d .. +120d).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 864e5).toISOString();
  const to = url.searchParams.get("to") || new Date(Date.now() + 120 * 864e5).toISOString();

  const rows = await queryAll<{
    id: number; lead_id: number | null; appointment_type: string | null;
    starts_at: string | null; ends_at: string | null; meeting_type: string | null;
    status: string | null; notes: string | null; external_meeting_url: string | null;
    first_name: string | null; last_name: string | null; lead_name: string | null;
    email: string | null; phone: string | null;
  }>(
    env.D1DB,
    `SELECT a.id, a.lead_id, a.appointment_type, a.starts_at, a.ends_at, a.meeting_type, a.status,
            a.notes, a.external_meeting_url,
            l.first_name, l.last_name, l.name AS lead_name, l.email, l.phone
       FROM lead_appointment a
       LEFT JOIN lead l ON l.id = a.lead_id
      WHERE a.org_id = ? AND COALESCE(a.status,'') != 'cancelled'
        AND datetime(a.starts_at) >= datetime(?)
        AND datetime(a.starts_at) <= datetime(?)
      ORDER BY datetime(a.starts_at) ASC`,
    orgId, from, to,
  );

  const items = rows.map((a) => {
    // Standalone (no-lead) appointments have no contact name - leave it null so
    // the calendar shows a blank subtitle rather than a fake "Lead".
    const name = a.lead_id
      ? (a.lead_name ||
        [a.first_name, a.last_name].filter(Boolean).join(" ").trim() ||
        a.email ||
        "Lead")
      : null;
    return {
      id: a.id,
      lead_id: a.lead_id,
      title: a.appointment_type || "Appointment",
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      meeting_type: a.meeting_type,
      status: a.status,
      notes: a.notes,
      external_meeting_url: a.external_meeting_url,
      with_name: name,
      email: a.email,
      phone: a.phone,
    };
  });

  return json({ count: items.length, items });
};

interface PostBody {
  lead_id?: number | null;
  appointment_type?: string;
  meeting_type?: string;
  starts_at?: string;
  ends_at?: string | null;
  notes?: string | null;
  external_meeting_url?: string | null;
  send_sms_confirmation?: boolean;
  send_email_confirmation?: boolean;
}

/**
 * POST /api/dashboard/org/:orgId/appointments - create an appointment from the
 * Calendar. `lead_id` is optional: when present the appointment is attached to
 * that lead (and mirrors the lead's status, like the inbox flow); when omitted
 * it is a standalone org meeting. Confirmations (SMS/email) are sent only when a
 * lead is attached AND the caller opts in (send_sms_confirmation /
 * send_email_confirmation) - they go through the shared compliant send path
 * (consent / opt-out / quiet hours enforced there).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const body = (await readJson<PostBody>(request)) || {};

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
  const endsAt = parseStartsAt(body.ends_at);
  if (body.ends_at && !endsAt) return error("ends_at must be a valid ISO-8601 datetime", 400);
  if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return error("ends_at must be after starts_at", 400);
  }
  const notes = body.notes ? String(body.notes).trim() || null : null;
  const ext = body.external_meeting_url
    ? String(body.external_meeting_url).trim().slice(0, 512) || null
    : null;

  // Optional lead link - must belong to this org.
  let leadId: number | null = null;
  if (body.lead_id != null) {
    const lead = await queryFirst<{ id: number; org_id: number | null }>(
      env.D1DB, `SELECT id, org_id FROM lead WHERE id = ?`, Number(body.lead_id));
    if (!lead || lead.org_id !== orgId) return error("Lead not found in this org", 404);
    leadId = lead.id;
  }

  const ins = await execute(
    env.D1DB,
    `INSERT INTO lead_appointment
       (lead_id, org_id, appointment_type, starts_at, ends_at, meeting_type, notes, status,
        external_meeting_url, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    leadId, orgId, apptType.slice(0, 120), startsAt, endsAt, meetingType, notes,
    APPT_PROPOSED, ext, user.id, nowIso(), nowIso(),
  );

  const apptId = Number(ins.meta.last_row_id);

  // Mirror lead status / appointment_booked when attached to a lead.
  if (leadId != null) {
    await execute(
      env.D1DB,
      `UPDATE lead SET status = ?, appointment_booked = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      APPOINTMENT_BOOKED_STATUS, leadId,
    );
  }

  // Optional confirmations - only when attached to a lead and the caller opted
  // in. Routed through the shared compliant path (consent / opt-out / quiet hours).
  let confirmations: unknown = null;
  if (leadId != null && (body.send_sms_confirmation || body.send_email_confirmation)) {
    confirmations = await sendAppointmentConfirmations(env, {
      appointmentId: apptId,
      leadId,
      actorUserId: user.id,
      sendSms: Boolean(body.send_sms_confirmation),
      sendEmail: Boolean(body.send_email_confirmation),
    });
  }

  return json({ id: apptId, confirmations }, 201);
};
