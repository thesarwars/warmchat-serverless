/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireApiKey } from "../../../_shared/apiAuth.ts";

interface ApptRow {
  id: number;
  lead_id: number;
  appointment_type: string;
  starts_at: string;
  meeting_type: string;
  status: string;
  notes: string | null;
  created_at: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
}

/**
 * GET /api/integrations/v1/appointments - recent appointments, newest first.
 * Polling fallback for the "Appointment Booked" trigger.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await requireApiKey(env, request, "leads:read");
  if (!auth) return error("Invalid or missing API key", 401);

  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit")) || 50, 100);
  const rows = await queryAll<ApptRow>(
    env.D1DB,
    `SELECT a.id, a.lead_id, a.appointment_type, a.starts_at, a.meeting_type, a.status, a.notes, a.created_at,
            l.name AS lead_name, l.email AS lead_email, l.phone AS lead_phone
       FROM lead_appointment a
       JOIN lead l ON l.id = a.lead_id
      WHERE a.org_id = ?
      ORDER BY a.id DESC LIMIT ?`,
    auth.orgId,
    limit,
  );
  return json(rows);
};
