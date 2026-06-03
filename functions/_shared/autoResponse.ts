/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst, execute, nowIso } from "./db.ts";
import { applyPersonalization, buildPersonalizationVars, type LeadRow } from "./personalize.ts";
import { isPhoneSuppressed } from "./suppression.ts";

/**
 * Shared auto-response helpers used by the inbound dispatcher, lead-create
 * hook, qualification flow and cron jobs. Centralizes template rendering,
 * scheduled-message queueing and stop-on-reply cancellation so each call-site
 * uses the same logic.
 */

export interface AutoResponseRow {
  id: number;
  user_id: number;
  org_id: number;
  enabled: number;
  missed_call_enabled: number;
  missed_call_message: string;
  inbound_sms_enabled: number;
  inbound_email_enabled: number;
  inbound_existing_continue: number;
  inbound_existing_reengage: number;
  inbound_reengage_days: number;
  inbound_new_create_lead: number;
  inbound_new_send_reply: number;
  inbound_new_tag: number;
  qualification_enabled: number;
  booking_handoff_enabled: number;
  handoff_user_id: number | null;
  behavior_stop_lead_reply: number;
  behavior_stop_agent_reply: number;
  behavior_one_question_at_a_time: number;
  behavior_wait_for_reply: number;
  behavior_log_every_message: number;
  behavior_auto_status_tag: number;
  escalation_keywords: string | null;
  listing_search_enabled: number;
  escalate_no_listings: number;
}

/**
 * Canonical AI-status predicates. The column is written in several forms
 * depending on the path: the engine/apply-ai store lowercase tokens
 * (`active` / `paused`), while the leads-table inline pill stores display
 * labels (`AI Active` / `AI Paused`). Normalize both so a UI pause is honored
 * by the send gate just like an engine pause.
 */
export function aiStatusIsPaused(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "paused" || s === "ai paused" || s === "ai_paused";
}
export function aiStatusIsActive(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "active" || s === "ai active" || s === "ai_active";
}
/**
 * Explicit "off" only - matches a deliberate "AI Off" the user set on the lead,
 * NOT a NULL/empty column. An un-enrolled lead (NULL) displays as "AI Off" but
 * still follows the account-level inbound default, so it must not be treated as
 * a hard per-lead block here.
 */
export function aiStatusIsOff(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "off" || s === "ai off" || s === "ai_off";
}

/**
 * Level 1 (workspace master `ai_master_enabled`) + Level 3 (per-lead
 * `ai_status='paused'`) AI gate. Level 2 (per-agent toggle) is left to each
 * caller because it differs per agent (`auto_response_settings.enabled` for
 * Inbound, `ai_agent_state.enabled` for Outbound).
 *
 * This governs AI-INITIATED sends ONLY. Mandatory transactional/compliance
 * replies (STOP/HELP/START confirmations) and non-AI scheduled traffic
 * (automations, broadcasts, manual sends) must NOT be routed through this guard.
 *
 * Fail CLOSED: AI is off by default, so a missing `ai_master_enabled` row means
 * disabled - matching what the settings/agents endpoints report to the UI. (A
 * missing row previously read as enabled here, which could send while the UI
 * showed the master switch OFF.)
 */
export async function aiSendAllowedForLead(
  env: Env,
  lead: { org_id: number; ai_status: string | null },
): Promise<boolean> {
  // Level 3 - per-lead override. Paused / off / outbound-only (automation running
  // but inbound auto-reply turned off) all stop the REACTIVE inbound reply for
  // this contact. ('outbound' means the lead is in an automation but the user
  // chose not to auto-reply when they write back.)
  const s3 = String(lead.ai_status || "").trim().toLowerCase();
  if (aiStatusIsPaused(lead.ai_status) || aiStatusIsOff(lead.ai_status) || s3 === "outbound") {
    return false;
  }
  // Level 1 - workspace master switch.
  return isAiMasterEnabled(env, lead.org_id);
}

/**
 * Level 1 master switch read. Fail CLOSED: AI is off by default, so only an
 * explicit '1' enables it. A missing row (e.g. a reseeded DB) reads as off,
 * matching what /api/ai/settings reports to the UI.
 */
export async function isAiMasterEnabled(env: Env, orgId: number): Promise<boolean> {
  const master = await queryFirst<{ value: string }>(
    env.D1DB,
    `SELECT value FROM app_settings WHERE org_id = ? AND key = 'ai_master_enabled'`,
    orgId,
  );
  return master?.value === "1";
}

/** Load the auto-response settings for the lead's owner (or any org member as fallback). */
export async function loadSettingsForLead(
  env: Env,
  leadId: number,
): Promise<{ settings: AutoResponseRow; lead: LeadFull } | null> {
  const lead = await queryFirst<LeadFull>(
    env.D1DB,
    `SELECT id, org_id, owner_id, first_name, last_name, name, email, phone, area,
            lead_type, intent, ai_status, timezone, qualification_step, qualification_status,
            last_reply_at, sms_consent_status
       FROM lead WHERE id = ?`,
    leadId,
  );
  if (!lead) return null;
  // Prefer the lead owner's settings; if no owner, fall back to any org member's.
  let settings = lead.owner_id
    ? await queryFirst<AutoResponseRow>(
        env.D1DB,
        `SELECT * FROM auto_response_settings WHERE user_id = ?`,
        lead.owner_id,
      )
    : null;
  if (!settings) {
    settings = await queryFirst<AutoResponseRow>(
      env.D1DB,
      `SELECT * FROM auto_response_settings WHERE org_id = ? ORDER BY id LIMIT 1`,
      lead.org_id,
    );
  }
  if (!settings) return null;
  return { settings, lead };
}

export interface LeadFull {
  id: number;
  org_id: number;
  owner_id: number | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  area: string | null;
  lead_type: string | null;
  intent: string | null;
  ai_status: string | null;
  timezone: string | null;
  qualification_step: number | null;
  qualification_status: string | null;
  last_reply_at: string | null;
  /**
   * Lead's SMS consent state - 'opted_in' | 'opted_out' | 'unknown' | null.
   * Used by appendComplianceFooter to decide whether to add the AI
   * disclosure prefix + STOP footer (skipped for opted_in since the consent
   * flow already covered those).
   */
  sms_consent_status: string | null;
}

/** Apply {{first_name}} / {{agent_name}} placeholders against the lead + owner. */
export async function renderTemplate(
  env: Env,
  template: string,
  lead: Pick<LeadFull, "first_name" | "last_name" | "name" | "email" | "phone" | "area" | "owner_id"> & { owner_id?: number | null },
): Promise<string> {
  let senderName = "";
  if (lead.owner_id) {
    const owner = await queryFirst<{ name: string | null }>(
      env.D1DB,
      `SELECT name FROM "user" WHERE id = ?`,
      lead.owner_id,
    );
    senderName = (owner?.name || "").trim();
  }
  const vars = buildPersonalizationVars(lead as LeadRow, senderName);
  return applyPersonalization(template, vars);
}

/** Cancel pending follow-ups for a lead (stop-on-reply / stop-on-agent-send). */
export async function cancelPendingFollowups(env: Env, leadId: number): Promise<void> {
  await execute(
    env.D1DB,
    `UPDATE scheduled_message
        SET status = 'cancelled', updated_at = ?
      WHERE contact_id = ? AND status = 'scheduled'`,
    nowIso(), leadId,
  );
}

export interface QueueOptions {
  leadId: number;
  orgId: number;
  userId: number;
  channel: "sms" | "email";
  toAddress: string;
  body: string;
  subject?: string | null;
  scheduledAt: string;
  /** Links the queued row to an automation (outbound drip). */
  automationId?: number | null;
  /**
   * Marks the queued send as AI-composed so the cron stamps the materialized
   * sms_message/inbox_messages row with sent_by_ai=1 and the inbox shows the
   * "AI Agent" marker. Every current caller is an AI/automation path, so this
   * defaults to false only to keep human-scheduled sends (if any) unmarked.
   */
  sentByAi?: boolean;
}

/**
 * Insert a row into scheduled_message; the cron job (scheduledMessages.ts)
 * flushes it. SMS suppression is checked at queue time AND again at flush
 * time (scheduledMessages cron already has a `row.lead_opt_out` guard) so a
 * STOP recorded between queue and flush still hard-stops the send. Returns 0
 * when the message was suppressed and not queued.
 */
export async function queueScheduledMessage(env: Env, opts: QueueOptions): Promise<number> {
  if (opts.channel === "sms" && await isPhoneSuppressed(env, opts.orgId, opts.toAddress)) {
    return 0;
  }
  const ins = await execute(
    env.D1DB,
    `INSERT INTO scheduled_message
       (user_id, org_id, contact_id, automation_id, channel, to_address, subject, body, scheduled_at, sent_by_ai, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
    opts.userId, opts.orgId, opts.leadId, opts.automationId ?? null, opts.channel,
    opts.toAddress, opts.subject ?? null, opts.body, opts.scheduledAt,
    opts.sentByAi ? 1 : 0,
    nowIso(), nowIso(),
  );
  return Number(ins.meta.last_row_id);
}

/** Find-or-create the named tag and attach it to the lead. */
export async function attachTag(env: Env, orgId: number, leadId: number, tagName: string): Promise<void> {
  let tag = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM tags WHERE org_id = ? AND name = ? LIMIT 1`,
    orgId, tagName,
  );
  if (!tag) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO tags (org_id, name) VALUES (?, ?)`,
      orgId, tagName,
    );
    tag = { id: Number(ins.meta.last_row_id) };
  }
  await execute(
    env.D1DB,
    `INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)`,
    leadId, tag.id,
  );
}
