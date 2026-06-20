/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import {
  getOrgWithPlan, checkAutomationLimits, checkChannelsLimit, MAX_AUTOMATION_LEADS,
  MAX_AUTOMATION_NAME, MAX_AUTOMATION_MESSAGE, MAX_FOLLOWUPS, leadIdsFromAutomation,
  type AutomationLead,
} from "../../_shared/automationHelpers.ts";
import { bulkEnrollAutomation } from "../../_shared/automationEnroll.ts";

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

  // Actually START the drip. When the workflow is launched "now" (Running) with
  // an explicit lead set, enroll those leads into the outbound queue
  // (scheduled_message) - the SAME path POST /automations/:id/enroll uses. The
  // cron drains that queue and performs the real Telnyx / Email send (or the
  // mock send when MOCK_SEND_APIS is on), recording the materialized sms_message
  // / inbox_messages + reply-tracking thread at send time. This replaces the old
  // Phase-4 stub that inserted phantom "queued"/"sent" rows and bumped
  // delivered_count WITHOUT ever queueing a real send - the root cause of
  // "campaign says sent but nothing arrives and no follow-up fires".
  //
  // A Draft (timing != "now"), or a Send-now that a governing card forced to
  // Paused, enrolls nothing here - it enrolls when launched / resumed.
  const leads = data.leads || [];
  const leadIds = leadIdsFromAutomation(leads);
  let enrolled = 0;
  if (initialStatus === "Running" && leadIds.length > 0) {
    const res = await bulkEnrollAutomation(env, automationId, leadIds, user.id);
    enrolled = res.enrolled;
    // Mirror /enroll: reflect outbound enrollment on the lead's AI status so the
    // lead reads as in an outbound program (and inbound auto-reply gating stays
    // correct), without clobbering a lead with inbound AI active or paused.
    const tsNow = nowIso();
    for (let i = 0; i < leadIds.length; i += 90) {
      const slice = leadIds.slice(i, i + 90);
      await execute(
        env.D1DB,
        `UPDATE lead SET ai_status = 'outbound', updated_at = ?
          WHERE id IN (${slice.map(() => "?").join(",")})
            AND (ai_status IS NULL OR ai_status IN ('off', 'outbound'))`,
        tsNow, ...slice,
      );
    }
  }

  return json({ success: true, id: automationId, enrolled }, 201);
};
