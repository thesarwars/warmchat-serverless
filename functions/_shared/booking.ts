/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { execute } from "./db.ts";

const MEETING_TYPES = new Set(["in_person", "phone", "google_meet"]);

/**
 * Create an AI-proposed appointment. Lands as 'proposed' (pending the human
 * agent's confirmation - the client's "AI proposes + books, agent confirms"
 * rule) and flags the lead. Caller is responsible for the availability/conflict
 * check (isSlotBookable) before calling this.
 */
export async function createProposedAppointment(env: Env, input: {
  orgId: number; leadId: number; ownerId: number | null;
  startsAtIso: string; meetingType?: string | null;
  appointmentType?: string | null; notes?: string | null;
}): Promise<number> {
  const mt = input.meetingType && MEETING_TYPES.has(input.meetingType) ? input.meetingType : "phone";
  const ins = await execute(
    env.D1DB,
    `INSERT INTO lead_appointment
       (lead_id, org_id, appointment_type, starts_at, meeting_type, notes, status, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)`,
    input.leadId, input.orgId, input.appointmentType || "Consultation",
    input.startsAtIso, mt, input.notes ?? null, input.ownerId ?? null,
  );
  await execute(
    env.D1DB,
    `UPDATE lead SET appointment_booked = 1, status = 'Appointment Booked', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    input.leadId,
  );
  return Number(ins.meta.last_row_id);
}
