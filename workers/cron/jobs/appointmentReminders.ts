/// <reference types="@cloudflare/workers-types" />
import type { CronEnv } from "../env.ts";
import { notify } from "../_shared/notify.ts";

/**
 * Fires a one-shot `appointment_reminder` notification ~1h before each
 * upcoming appointment. Idempotent: once `reminder_sent_at` is stamped, we
 * skip the row on subsequent ticks. Run from the per-minute cron.
 */
export async function runAppointmentReminders(env: CronEnv): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(now + 60 * 60 * 1000).toISOString();        // +1h
  const windowEnd   = new Date(now + 65 * 60 * 1000).toISOString();        // +1h05m

  const rows = await env.D1DB.prepare(
    `SELECT a.id        AS id,
            a.lead_id   AS lead_id,
            a.org_id    AS org_id,
            a.starts_at AS starts_at,
            a.appointment_type AS appointment_type,
            a.created_by_user_id AS user_id,
            l.name      AS lead_name,
            l.first_name AS lead_first_name
       FROM lead_appointment a
       LEFT JOIN lead l ON l.id = a.lead_id
      WHERE a.reminder_sent_at IS NULL
        AND a.status IN ('proposed','scheduled','confirmed')
        AND a.starts_at >= ?
        AND a.starts_at <  ?
      LIMIT 200`,
  ).bind(windowStart, windowEnd).all<{
    id: number; lead_id: number; org_id: number; starts_at: string;
    appointment_type: string; user_id: number | null;
    lead_name: string | null; lead_first_name: string | null;
  }>();

  const due = rows.results ?? [];
  if (due.length === 0) {
    console.log("[cron:appointmentReminders] no appointments in the +1h window - nothing to do");
    return;
  }
  console.log(`[cron:appointmentReminders] ${due.length} appointment(s) due for a reminder`);

  let notified = 0, skippedNoUser = 0, failed = 0;
  for (const r of due) {
    if (!r.user_id) {
      skippedNoUser++;
      continue;
    }
    const leadLabel = (r.lead_name && r.lead_name.trim())
      || (r.lead_first_name && r.lead_first_name.trim())
      || "a lead";
    try {
      await notify(env, {
        userId: r.user_id,
        orgId: r.org_id,
        kind: "appointment_reminder",
        channel: "system",
        contactId: r.lead_id,
        appointmentId: r.id,
        severity: "info",
        title: `Upcoming appointment with ${leadLabel}`,
        body: `Starts in about an hour (${new Date(r.starts_at).toLocaleString()}).`,
        data: {
          path: `/inbox?lead=${r.lead_id}`,
          appointment_id: r.id,
          starts_at: r.starts_at,
        },
      });
      await env.D1DB.prepare(
        `UPDATE lead_appointment SET reminder_sent_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(new Date().toISOString(), r.id).run();
      notified++;
      console.log(`[cron:appointmentReminders] appt=${r.id} lead=${r.lead_id} -> reminder sent`);
    } catch (err) {
      failed++;
      console.warn(`[cron:appointmentReminders] appt=${r.id} notify failed`, err);
    }
  }
  console.log(`[cron:appointmentReminders] summary: notified=${notified} skippedNoUser=${skippedNoUser} failed=${failed}`);
}
