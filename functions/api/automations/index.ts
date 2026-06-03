/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import {
  getOrgWithPlan, checkAutomationLimits, checkChannelsLimit, MAX_AUTOMATION_LEADS,
  MAX_AUTOMATION_NAME, MAX_AUTOMATION_MESSAGE, MAX_FOLLOWUPS,
  type AutomationLead,
} from "../../_shared/automationHelpers.ts";

interface CreateBody {
  name?: string;
  channels?: string[];
  message?: string;
  email_subject?: string;
  attachments?: unknown[];
  sources?: string[];
  leads?: AutomationLead[];
  email_sender_type?: string;
  followups?: unknown[];
  workflow_key?: string;
  timing?: string; // "now" -> start Running; otherwise create as a Draft to launch later
  opening_send_time?: string | null; // NULL/"" = instant; "HH:MM" = timed opening
}

/**
 * POST /api/automations/ - create an automation and (if Email/SMS channels are set)
 * record outbound messages immediately, minus the SMTP/Telnyx dispatch (those
 * happen elsewhere in Phase 4 - same pattern as inbox/send.ts).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const data = (await readJson<CreateBody>(request)) || {};
  const required: Array<keyof CreateBody> = ["name", "channels", "message", "sources", "leads"];
  for (const k of required) {
    if (data[k] === undefined || data[k] === null) {
      return error("Missing required fields", 400);
    }
  }

  if ((data.leads?.length ?? 0) > MAX_AUTOMATION_LEADS) {
    return error(`An automation can have at most ${MAX_AUTOMATION_LEADS} leads.`, 400);
  }
  if (String(data.name).length > MAX_AUTOMATION_NAME) {
    return error(`The automation name must be ${MAX_AUTOMATION_NAME} characters or fewer.`, 400);
  }
  if (String(data.message).length > MAX_AUTOMATION_MESSAGE) {
    return error(`The message is too long (max ${MAX_AUTOMATION_MESSAGE} characters).`, 400);
  }
  if (Array.isArray(data.followups) && data.followups.length > MAX_FOLLOWUPS) {
    return error(`An automation can have at most ${MAX_FOLLOWUPS} follow-ups.`, 400);
  }

  const org = await getOrgWithPlan(env, user.id);
  if (!org) return error("User is not part of any organization", 403);

  const [okC, msgC] = await checkAutomationLimits(env, org, org.limits);
  if (!okC) return error(msgC, 400);

  const channels = data.channels || [];
  const [okCh, msgCh] = checkChannelsLimit(org.limits, channels);
  if (!okCh) return error(msgCh, 400);

  const senderType = (data.email_sender_type || "personal").toLowerCase();
  const followups = data.followups || [];
  const subject = (data.email_subject || data.name || "").trim() || data.name || "";
  // Opening timing: a valid "HH:MM" makes the opening timed; anything else
  // (null / empty / "instant") keeps it instant (NULL in the column).
  const openingSendTime = /^\d{1,2}:\d{2}$/.test(String(data.opening_send_time || ""))
    ? String(data.opening_send_time)
    : null;

  // Optional link to an Outbound AI workflow card (o1-o5) so toggling that card
  // pauses/resumes this automation. Only accept the known outbound keys.
  const workflowKey = ["o1", "o2", "o3", "o4", "o5"].includes(String(data.workflow_key))
    ? String(data.workflow_key)
    : null;

  // Default to manual: a new workflow is created as a Draft the agent starts
  // later. Only "Send Now" (timing === "now") starts it Running. If a governing
  // card is off, a Send-Now automation starts Paused so it never contradicts it.
  const startNow = String(data.timing || "manual").toLowerCase() === "now";
  let initialStatus = startNow ? "Running" : "Draft";
  if (startNow && workflowKey) {
    const card = await queryFirst<{ enabled: number }>(
      env.D1DB,
      `SELECT enabled FROM ai_workflow WHERE org_id = ? AND user_id = ? AND agent_key = 'outbound' AND workflow_key = ? LIMIT 1`,
      org.id, user.id, workflowKey,
    );
    if (card && !card.enabled) initialStatus = "Paused";
  }

  const ins = await execute(
    env.D1DB,
    `INSERT INTO automation
       (name, channels, message, opening_send_time, email_subject, attachments, sources, leads,
        org_id, owner_id, email_sender_type, followup_steps, status, created_at,
        is_archived, delivered_count, opened_count, converted_count, workflow_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)`,
    data.name,
    JSON.stringify(channels),
    data.message,
    openingSendTime,
    subject,
    JSON.stringify(data.attachments || []),
    JSON.stringify(data.sources || []),
    JSON.stringify(data.leads || []),
    String(org.id),
    String(user.id),
    senderType,
    JSON.stringify(followups),
    initialStatus,
    nowIso(),
    workflowKey,
  );
  const automationId = Number(ins.meta.last_row_id);

  // Best-effort message recording (no actual SMTP/Telnyx call in Phase 4).
  const channelsLower = channels.map((c) => c.toLowerCase());
  const leads = data.leads || [];

  if (channelsLower.includes("email") && leads.length > 0) {
    let inbox = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM inbox WHERE org_id = ? AND channel = 'email' LIMIT 1`, org.id,
    );
    if (!inbox) {
      const i = await execute(
        env.D1DB,
        `INSERT INTO inbox (name, channel, org_id, created_at) VALUES ('Email', 'email', ?, ?)`,
        org.id, nowIso(),
      );
      inbox = { id: Number(i.meta.last_row_id) };
    }
    const t = await execute(
      env.D1DB,
      `INSERT INTO thread (subject, inbox_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      subject || "(no subject)", inbox.id, nowIso(), nowIso(),
    );
    const threadId = Number(t.meta.last_row_id);
    await execute(env.D1DB, `UPDATE automation SET thread_id = ? WHERE id = ?`, threadId, automationId);

    for (const lead of leads) {
      await execute(
        env.D1DB,
        `INSERT INTO inbox_messages
           (thread_id, sender_id, subject, body, direction, channel, to_email, created_at, is_read)
         VALUES (?, ?, ?, ?, 'outbound', 'email', ?, ?, 1)`,
        threadId, user.id, subject || "(no subject)", data.message || "", lead.email || "", nowIso(),
      );
      const leadId = Number(lead.id);
      if (Number.isInteger(leadId)) {
        await execute(
          env.D1DB,
          `INSERT INTO thread_lead_assignments (thread_id, lead_id, assigned_at) VALUES (?, ?, ?)`,
          threadId, leadId, nowIso(),
        );
      }
    }
    await execute(
      env.D1DB,
      `UPDATE automation SET delivered_count = COALESCE(delivered_count, 0) + ? WHERE id = ?`,
      leads.length, automationId,
    );
  }

  if (channelsLower.includes("sms") && leads.length > 0) {
    let smsSent = 0;
    for (const lead of leads) {
      if (!lead.phone) continue;
      let contact = await queryFirst<{ id: number }>(
        env.D1DB, `SELECT id FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ? LIMIT 1`,
        org.id, lead.phone,
      );
      if (!contact) {
        const c = await execute(env.D1DB,
          `INSERT INTO sms_contact (org_id, phone_number_e164) VALUES (?, ?)`, org.id, lead.phone);
        contact = { id: Number(c.meta.last_row_id) };
      }
      let conv = await queryFirst<{ id: number }>(
        env.D1DB, `SELECT id FROM sms_conversation WHERE org_id = ? AND contact_id = ? LIMIT 1`,
        org.id, contact.id,
      );
      if (!conv) {
        const c = await execute(env.D1DB,
          `INSERT INTO sms_conversation (org_id, contact_id, last_message_at) VALUES (?, ?, ?)`,
          org.id, contact.id, nowIso());
        conv = { id: Number(c.meta.last_row_id) };
      }
      await execute(
        env.D1DB,
        `INSERT INTO sms_message
           (org_id, conversation_id, direction, body, status, created_at, is_read)
         VALUES (?, ?, 'outbound', ?, 'queued', ?, 1)`,
        org.id, conv.id, data.message || "", nowIso(),
      );
      await execute(env.D1DB,
        `UPDATE sms_conversation SET last_message_at = ? WHERE id = ?`, nowIso(), conv.id);
      smsSent += 1;
    }
    if (smsSent > 0) {
      await execute(
        env.D1DB,
        `UPDATE automation SET delivered_count = COALESCE(delivered_count, 0) + ? WHERE id = ?`,
        smsSent, automationId,
      );
    }
  }

  return json({ success: true, id: automationId }, 201);
};
