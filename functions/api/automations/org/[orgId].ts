/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { computeAutomationStatsBatch } from "../../../_shared/automationAnalytics.ts";
import {
  automationMatchesChannelTab, deriveAutomationType, safeJson, type AutomationRow,
} from "../../../_shared/automationHelpers.ts";

/**
 * GET /api/automations/org/:orgId - automation list for the Automations page.
 * Computes per-lead reply counts via compute_automation_recipient_stats.
 *
 * Query params: channel (all|sms|email), status (all|running|paused|draft),
 *               type (all|sms|email|sequence),
 *               sort (newest|reply_rate|contacts_sent|messages_sent),
 *               include_archived (1/0).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("User not part of organization", 403);

  const url = new URL(request.url);
  const channelTab = (url.searchParams.get("channel") || "all").toLowerCase();
  const statusFilter = (url.searchParams.get("status") || "all").toLowerCase();
  const typeFilter = (url.searchParams.get("type") || "all").toLowerCase();
  const sortKey = (url.searchParams.get("sort") || "newest").toLowerCase();
  const includeArchived = ["1", "true", "yes"].includes(
    (url.searchParams.get("include_archived") || "0").toLowerCase(),
  );

  const rows = await queryAll<AutomationRow>(
    env.D1DB,
    `SELECT * FROM automation WHERE org_id = ?${includeArchived ? "" : " AND is_archived = 0"}`,
    String(orgId),
  );

  // Filter first, then compute stats for the surviving automations in a single
  // batch (a fixed number of org-wide reads) rather than 4-5 queries each.
  const matched: Array<{ c: AutomationRow; channels: string[]; derivedType: string }> = [];
  for (const c of rows) {
    const channels = safeJson<string[]>(c.channels, []);
    if (!automationMatchesChannelTab(channels, channelTab)) continue;
    if (statusFilter !== "all" && (c.status || "").toLowerCase() !== statusFilter) continue;

    const derivedType = deriveAutomationType(channels);
    if (typeFilter !== "all" && derivedType.toLowerCase() !== typeFilter) continue;

    matched.push({ c, channels, derivedType });
  }

  const statsByAutomation = await computeAutomationStatsBatch(env, matched.map((m) => m.c), orgId);

  const items: Array<Record<string, unknown>> = [];
  for (const { c, channels, derivedType } of matched) {
    const analytics = statsByAutomation.get(Number(c.id));
    if (!analytics) continue;

    items.push({
      id: c.id,
      name: c.name || "",
      channels,
      type: derivedType,
      message: c.message || "",
      opening_send_time: c.opening_send_time ?? null,
      email_subject: c.email_subject || c.name || "",
      attachments: safeJson<unknown[]>(c.attachments, []),
      sources: safeJson<string[]>(c.sources, []),
      leads: analytics.recipients,
      created_at: c.created_at,
      created: c.created_at,
      replies: analytics.replies_total,
      per_lead_reply: analytics.replies_total,
      status: c.status,
      is_archived: Boolean(c.is_archived),
      archived_at: c.archived_at,
      contacts_sent: analytics.contacts_sent,
      messages_sent: analytics.messages_sent,
      pending: analytics.pending ?? 0,
      delivered_count: analytics.delivered,
      opened_count: c.opened_count || 0,
      converted_count: analytics.converted,
      reply_rate: analytics.reply_rate,
      conversion_rate: analytics.conversion_rate,
      timezone: c.timezone,
      followup_sequence_id: c.followup_sequence_id,
      followup_steps: safeJson<unknown[]>(c.followup_steps, []),
    });
  }

  if (sortKey === "reply_rate") {
    items.sort((a, b) => Number(b.reply_rate || 0) - Number(a.reply_rate || 0));
  } else if (sortKey === "contacts_sent") {
    items.sort((a, b) => Number(b.contacts_sent || 0) - Number(a.contacts_sent || 0));
  } else if (sortKey === "messages_sent") {
    items.sort((a, b) => Number(b.messages_sent || 0) - Number(a.messages_sent || 0));
  } else {
    items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }

  return json(items);
};
