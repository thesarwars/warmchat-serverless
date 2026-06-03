/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { computeAutomationRecipientStats } from "../../../_shared/automationAnalytics.ts";
import { deriveAutomationType, safeJson, type AutomationRow } from "../../../_shared/automationHelpers.ts";

/**
 * GET /api/automations/:id/details - right-side drawer payload.
 * Returns header / stats / rates / message_preview / replies / recipients / followups.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid automation id", 400);

  const automation = await queryFirst<AutomationRow>(env.D1DB, `SELECT * FROM automation WHERE id = ?`, id);
  if (!automation) return error("Automation not found", 404);

  const orgIdRaw = automation.org_id;
  const orgId = Number(orgIdRaw);
  if (!Number.isInteger(orgId)) return error("Invalid org id on automation", 500);
  if (!(await isOrgMember(env, user.id, orgId))) return error("User not part of organization", 403);

  const stats = await computeAutomationRecipientStats(env, automation, orgId);

  return json({
    id: automation.id,
    header: {
      name: automation.name || "",
      status: automation.status,
      type: deriveAutomationType(safeJson<string[]>(automation.channels, [])),
      channels: safeJson<string[]>(automation.channels, []),
      is_archived: Boolean(automation.is_archived),
      created_at: automation.created_at,
    },
    stats: {
      sent: stats.contacts_sent,
      messages_sent: stats.messages_sent,
      delivered: stats.delivered,
      opened: stats.opened,
      replied: stats.replied_lead_count,
      replies_total: stats.replies_total,
      converted: stats.converted,
    },
    rates: {
      delivered_rate: stats.delivered_rate,
      open_rate: stats.open_rate,
      reply_rate: stats.reply_rate,
      conversion_rate: stats.conversion_rate,
    },
    message_preview: {
      subject: automation.email_subject || automation.name || "",
      body: automation.message || "",
      opening_send_time: automation.opening_send_time ?? null,
      channels: safeJson<string[]>(automation.channels, []),
      attachments: safeJson<unknown[]>(automation.attachments, []),
    },
    replies: stats.replies_section,
    recipients: stats.recipients,
    followups: safeJson<unknown[]>(automation.followup_steps, []),
  });
};
