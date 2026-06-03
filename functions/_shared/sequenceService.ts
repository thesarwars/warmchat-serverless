/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { execute, queryAll, nowIso } from "./db.ts";

/**
 * Drip-sequence builders.
 *
 * `buildFollowupSteps(followups, channel)` shape-checks UI input.
 * `createSequence(...)` writes a sequences row + sequence_steps rows.
 * `enrollLeads(...)` writes sequence_instances + initial step_executions.
 *
 * The cron Worker (workers/cron/jobs/sequenceDispatch.ts) polls
 * step_executions and actually dispatches them via telnyx/elasticEmail.
 */

export interface FollowupInput {
  delay_days?: number | null;
  delay_seconds?: number | null;
  subject?: string | null;
  message?: string;
  send_at?: string | null;
  timezone?: string | null;
  attachments?: unknown[];
}

export interface NormalizedStep {
  subject: string | null;
  message_template: string;
  delay_amount: number;
  delay_unit: "minutes" | "hours" | "days";
  send_at: string | null;
  timezone: string | null;
  attachments: unknown[];
  channel: "email" | "sms";
}

export function buildFollowupSteps(items: FollowupInput[], channel: "email" | "sms"): NormalizedStep[] {
  const out: NormalizedStep[] = [];
  for (const it of items || []) {
    const message = (it.message || "").trim();
    if (!message) continue;
    let delayAmount = 0;
    let delayUnit: NormalizedStep["delay_unit"] = "days";
    if (typeof it.delay_seconds === "number" && it.delay_seconds > 0) {
      // <60 minutes worth of seconds -> minutes; else hours.
      if (it.delay_seconds < 3600) { delayAmount = Math.round(it.delay_seconds / 60); delayUnit = "minutes"; }
      else { delayAmount = Math.round(it.delay_seconds / 3600); delayUnit = "hours"; }
    } else if (typeof it.delay_days === "number" && it.delay_days > 0) {
      delayAmount = it.delay_days; delayUnit = "days";
    }
    out.push({
      subject: it.subject ?? null,
      message_template: message,
      delay_amount: delayAmount,
      delay_unit: delayUnit,
      send_at: it.send_at ?? null,
      timezone: it.timezone ?? null,
      attachments: it.attachments || [],
      channel,
    });
  }
  return out;
}

function uuid(): string {
  return crypto.randomUUID();
}

/** Split an array into fixed-size chunks (D1 caps bound params per query). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const ENROLL_BATCH = 50;
const IN_CHUNK = 90;

export async function createSequence(
  env: Env, userId: number, orgId: number, title: string, steps: NormalizedStep[],
): Promise<string> {
  const seqId = uuid();
  await execute(
    env.D1DB,
    `INSERT INTO sequences (id, title, user_id, org_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    seqId, title, userId, orgId, nowIso(),
  );
  let stepNumber = 1;
  for (const s of steps) {
    await execute(
      env.D1DB,
      `INSERT INTO sequence_steps
         (id, sequence_id, step_number, subject, message_template, delay_amount, delay_unit, send_at, timezone, attachments, channel)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uuid(), seqId, stepNumber, s.subject, s.message_template,
      s.delay_amount, s.delay_unit, s.send_at, s.timezone,
      JSON.stringify(s.attachments || []), s.channel,
    );
    stepNumber += 1;
  }
  return seqId;
}

function addDelay(now: Date, amount: number, unit: NormalizedStep["delay_unit"]): Date {
  const ms = unit === "minutes" ? amount * 60_000
           : unit === "hours"   ? amount * 3_600_000
           :                      amount * 86_400_000;
  return new Date(now.getTime() + ms);
}

/** Is the lead already in an active instance of this sequence? */
export async function hasActiveInstance(
  env: Env, sequenceId: string, leadId: number,
): Promise<boolean> {
  const rows = await queryAll<{ id: string }>(
    env.D1DB,
    `SELECT id FROM sequence_instances
      WHERE sequence_id = ? AND lead_id = ? AND status = 'active' LIMIT 1`,
    sequenceId, String(leadId),
  );
  return rows.length > 0;
}

/**
 * Cancel a lead's active sequence instances (and their still-scheduled step
 * executions). Restrict to one sequence with `sequenceId`, otherwise cancel
 * across all of the lead's sequences in the org. Returns instances cancelled.
 */
export async function cancelLeadSequences(
  env: Env, leadId: number, orgId: number, sequenceId?: string,
): Promise<number> {
  const args: unknown[] = [String(leadId), orgId];
  let where = `lead_id = ? AND org_id = ? AND status = 'active'`;
  if (sequenceId) { where += ` AND sequence_id = ?`; args.push(sequenceId); }

  const instances = await queryAll<{ id: string }>(
    env.D1DB, `SELECT id FROM sequence_instances WHERE ${where}`, ...args,
  );
  for (const inst of instances) {
    await execute(
      env.D1DB,
      `UPDATE step_executions SET status = 'cancelled'
        WHERE instance_id = ? AND status = 'scheduled'`,
      inst.id,
    );
    await execute(
      env.D1DB, `UPDATE sequence_instances SET status = 'cancelled' WHERE id = ?`, inst.id,
    );
  }
  return instances.length;
}

export interface EnrollLeadInput { lead_id: number; lead_contact: string }

export async function enrollLeads(
  env: Env, sequenceId: string, leads: EnrollLeadInput[], userId: number, orgId: number,
  extraData?: Record<string, unknown>,
): Promise<void> {
  const steps = await queryAll<{
    id: string; step_number: number; delay_amount: number; delay_unit: NormalizedStep["delay_unit"];
  }>(
    env.D1DB,
    `SELECT id, step_number, delay_amount, delay_unit FROM sequence_steps
      WHERE sequence_id = ? ORDER BY step_number ASC`,
    sequenceId,
  );
  if (steps.length === 0) return;

  const extra = extraData ? JSON.stringify(extraData) : null;
  const startNow = new Date();
  const leadIds = [...new Set(leads.map((l) => l.lead_id).filter((n) => Number.isInteger(n)))];
  if (!leadIds.length) return;

  // One active automation per lead (switch semantics): before starting this
  // sequence, cancel any OTHER active sequence the leads are in (and those
  // instances' still-scheduled steps) plus any pending auto-response follow-ups,
  // so a lead is never running two automations at once. This was a per-lead
  // query storm (cancelLeadSequences + a scheduled_message UPDATE each); it is
  // now a handful of batched IN-list statements for the whole cohort.
  const now = nowIso();
  for (const part of chunk(leadIds, IN_CHUNK)) {
    const ph = part.map(() => "?").join(",");
    const insts = await queryAll<{ id: string }>(
      env.D1DB,
      `SELECT id FROM sequence_instances
        WHERE lead_id IN (${part.map(() => "?").join(",")}) AND org_id = ? AND status = 'active'`,
      ...part.map((n) => String(n)), orgId,
    );
    if (insts.length) {
      const instIds = insts.map((r) => r.id);
      for (const ipart of chunk(instIds, IN_CHUNK)) {
        const iph = ipart.map(() => "?").join(",");
        await execute(env.D1DB,
          `UPDATE step_executions SET status = 'cancelled' WHERE instance_id IN (${iph}) AND status = 'scheduled'`,
          ...ipart);
        await execute(env.D1DB,
          `UPDATE sequence_instances SET status = 'cancelled' WHERE id IN (${iph})`, ...ipart);
      }
    }
    await execute(env.D1DB,
      `UPDATE scheduled_message SET status = 'cancelled', updated_at = ?
        WHERE contact_id IN (${ph}) AND status = 'scheduled'`,
      now, ...part);
  }

  // Build every instance + step_execution insert, then flush in batched
  // transactions (one round-trip per ~50 statements) instead of one INSERT each.
  const instStmt = env.D1DB.prepare(
    `INSERT INTO sequence_instances
       (id, sequence_id, lead_id, lead_contact, user_id, org_id, status, started_at, extra_data)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`);
  const stepStmt = env.D1DB.prepare(
    `INSERT INTO step_executions
       (id, instance_id, step_id, step_number, scheduled_at, status)
     VALUES (?, ?, ?, ?, ?, 'scheduled')`);
  const binds: D1PreparedStatement[] = [];
  for (const lead of leads) {
    const instId = uuid();
    binds.push(instStmt.bind(instId, sequenceId, String(lead.lead_id), lead.lead_contact, userId, orgId, now, extra));
    let cumulative = new Date(startNow);
    for (const step of steps) {
      cumulative = addDelay(cumulative, step.delay_amount, step.delay_unit);
      binds.push(stepStmt.bind(uuid(), instId, step.id, step.step_number, cumulative.toISOString()));
    }
  }
  for (const part of chunk(binds, ENROLL_BATCH)) {
    try {
      await env.D1DB.batch(part);
    } catch {
      // Isolate: re-run the chunk statement-by-statement so one bad row can't
      // roll back its neighbors (matches the import's per-row fallback).
      for (const s of part) { try { await s.run(); } catch { /* skip */ } }
    }
  }
}
