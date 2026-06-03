/// <reference types="@cloudflare/workers-types" />
/**
 * Hot-lead escalation ladder advancer.
 *
 * The reactive agent opens a lead_escalation at level 1 (in-app, fired at open).
 * This job advances any still-open escalation whose next_alert_at has passed:
 *   level 1 -> 2: SMS the human agent's cell
 *   level 2 -> 3: in-app + push notification (and the row caps at 3, re-alerting
 *                 every interval until the agent resolves it by replying /
 *                 booking / pausing AI - resolution is handled in the Pages app).
 * "WarmChats should be obsessed with making sure hot leads never get ignored."
 *
 * Agent alerts are internal (to the agent, not the lead), so they intentionally
 * bypass lead quiet-hours/STOP. Mock-aware so dev never sends real messages.
 */
import type { CronEnv } from "../env.ts";
import { isMockSendsEnabled } from "../_shared/appSettings.ts";
import { notify } from "../_shared/notify.ts";

const ESCALATION_INTERVAL_MIN = 15;
const MAX_PER_TICK = 100;

interface Row {
  id: number;
  org_id: number;
  lead_id: number;
  level: number;
  reason: string;
  owner_id: number | null;
  lead_name: string | null;
  from_number: string | null;
  agent_cell: string | null;
}

export async function runEscalationAdvance(env: CronEnv): Promise<void> {
  const now = new Date().toISOString();
  const { results } = await env.D1DB.prepare(
    `SELECT e.id, e.org_id, e.lead_id, e.level, e.reason,
            COALESCE(e.user_id, l.owner_id) AS owner_id,
            l.name AS lead_name,
            u.telnyx_phone_number AS from_number,
            u.agent_phone_number  AS agent_cell
       FROM lead_escalation e
       JOIN lead l ON l.id = e.lead_id
       LEFT JOIN "user" u ON u.id = COALESCE(e.user_id, l.owner_id)
      WHERE e.status = 'open' AND e.level < 3
        AND e.next_alert_at IS NOT NULL AND e.next_alert_at <= ?
      ORDER BY e.next_alert_at ASC
      LIMIT ?`,
  ).bind(now, MAX_PER_TICK).all<Row>();

  const due = results ?? [];
  if (!due.length) { console.log("[cron:escalationAdvance] none due"); return; }
  console.log(`[cron:escalationAdvance] ${due.length} escalation(s) due`);

  const nextAlert = new Date(Date.now() + ESCALATION_INTERVAL_MIN * 60_000).toISOString();
  let advanced = 0;
  for (const row of due) {
    try {
      const newLevel = row.level + 1;
      const label = row.lead_name || "a lead";

      if (newLevel === 2) {
        // SMS the agent's cell (internal alert).
        await alertAgentBySms(env, row, `WarmChats: ${label} needs you - ${row.reason}. Reply in the app.`);
      } else if (newLevel === 3 && row.owner_id) {
        try {
          await notify(env, {
            userId: row.owner_id, orgId: row.org_id, kind: "system", channel: "system",
            contactId: row.lead_id, severity: "warning",
            title: `Hot lead still waiting: ${label}`,
            body: `${row.reason}. Please respond or it will keep alerting.`,
            data: { path: `/inbox?lead=${row.lead_id}`, lead_id: row.lead_id },
          });
        } catch (e) { console.warn("[cron:escalationAdvance] notify failed", e); }
      }

      await env.D1DB.prepare(
        `UPDATE lead_escalation SET level = ?, next_alert_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(newLevel, nextAlert, row.id).run();

      if (row.owner_id) {
        await env.D1DB.prepare(
          `INSERT INTO ai_activity_log (org_id, user_id, agent_key, event, lead_id, lead_label, detail, status)
           VALUES (?, ?, 'inbound', 'escalation.advanced', ?, ?, ?, 'warn')`,
        ).bind(row.org_id, row.owner_id, row.lead_id, label, `Escalated to level ${newLevel}: ${row.reason}`).run();
      }
      advanced++;
    } catch (err) {
      console.error(`[cron:escalationAdvance] escalation=${row.id} errored`, err);
    }
  }
  console.log(`[cron:escalationAdvance] advanced=${advanced}`);
}

async function alertAgentBySms(env: CronEnv, row: Row, text: string): Promise<void> {
  const to = (row.agent_cell || "").trim();
  const from = (row.from_number || "").trim();
  if (!to || !from) return; // no agent cell / sending number -> skip (in-app already fired at open)

  if (await isMockSendsEnabled(env, row.org_id ?? null)) {
    await env.D1DB.prepare(
      `INSERT INTO mock_send_log (channel, provider, from_address, to_address, subject, body, org_id, lead_id, rate_acquired, second_bucket)
       VALUES ('sms', 'telnyx', ?, ?, NULL, ?, ?, ?, 1, 0)`,
    ).bind(from, to, text, row.org_id ?? null, row.lead_id).run();
    return;
  }
  if (!env.TELNYX_API_KEY) return;
  await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, text }),
  }).catch((e) => console.warn("[cron:escalationAdvance] agent SMS failed", e));
}
