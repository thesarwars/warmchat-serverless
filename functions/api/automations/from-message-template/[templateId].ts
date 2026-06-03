/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, queryAll, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import {
  getOrgWithPlan, checkAutomationLimits, checkChannelsLimit,
} from "../../../_shared/automationHelpers.ts";

interface TemplateBody {
  orgId?: number | string;
  ownerId?: number | string;
  leads?: unknown[];
  channels?: string[];
  attachments?: unknown[];
  email_sender_type?: string;
}

interface TemplateRow {
  id: number;
  title: string;
  content: string;
  subject: string | null;
  channel: string | null;
  delay_days: number | null;
  delay_seconds: number | null;
  send_at: string | null;
  timezone: string | null;
  image_url: string | null;
  category_id: number;
  org_id: number;
}

interface CategoryRow { id: number; name: string }

function attachmentFromImage(imageUrl: string | null): unknown[] {
  if (!imageUrl) return [];
  const trimmed = imageUrl.replace(/\/+$/, "");
  const id = trimmed.split("/").pop() || trimmed;
  return [{
    id, storage_key: id, name: "template-image",
    content_type: "image/*", url: imageUrl,
  }];
}

/**
 * POST /api/automations/from-message-template/:templateId - create a Paused
 * automation from a message template + its sibling sequence templates.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const templateId = Number(params.templateId);
  if (!Number.isInteger(templateId)) return error("Invalid template id", 400);

  const data = (await readJson<TemplateBody>(request)) || {};
  const org = await getOrgWithPlan(env, user.id);
  if (!org) return error("User is not part of any organization", 403);

  const [okC, msgC] = await checkAutomationLimits(env, org, org.limits);
  if (!okC) return error(msgC, 400);

  const channels = data.channels || ["Email"];
  const [okCh, msgCh] = checkChannelsLimit(org.limits, channels);
  if (!okCh) return error(msgCh, 400);

  const template = await queryFirst<TemplateRow>(
    env.D1DB,
    `SELECT id, title, content, subject, channel, delay_days, delay_seconds,
            send_at, timezone, image_url, category_id, org_id
       FROM message_templates WHERE id = ? AND is_active = 1`,
    templateId,
  );
  if (!template) return error("Template not found", 404);

  const templateChannel = (template.channel || (template.subject ? "email" : "sms")).toLowerCase();
  const siblings = await queryAll<TemplateRow>(
    env.D1DB,
    `SELECT id, title, content, subject, channel, delay_days, delay_seconds,
            send_at, timezone, image_url, category_id, org_id
       FROM message_templates
      WHERE category_id = ? AND org_id = ? AND channel = ? AND is_active = 1
      ORDER BY (delay_seconds IS NULL), delay_seconds ASC,
               (delay_days IS NULL), delay_days ASC,
               id ASC`,
    template.category_id, template.org_id, templateChannel,
  );
  const sequence = siblings.length > 0 ? siblings : [template];
  const first = sequence[0]!;
  const followups = sequence.slice(1).map((t) => ({
    delay_days: t.delay_days,
    delay_seconds: t.delay_seconds,
    subject: t.subject,
    message: t.content,
    send_at: t.send_at,
    timezone: t.timezone,
    attachments: attachmentFromImage(t.image_url),
  }));

  const category = await queryFirst<CategoryRow>(
    env.D1DB, `SELECT id, name FROM template_categories WHERE id = ?`, template.category_id,
  );

  let senderType = (data.email_sender_type || "personal").toLowerCase();
  if (org.plan === "free_channel") senderType = "personal";

  const targetOrgId = String(data.orgId ?? org.id);
  const targetOwnerId = String(data.ownerId ?? user.id);
  const attachments = data.attachments && data.attachments.length > 0
    ? data.attachments
    : attachmentFromImage(first.image_url);

  const ins = await execute(
    env.D1DB,
    `INSERT INTO automation
       (name, channels, message, email_subject, attachments, sources, leads,
        org_id, owner_id, email_sender_type, followup_steps, status, created_at,
        is_archived, delivered_count, opened_count, converted_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paused', ?, 0, 0, 0, 0)`,
    category?.name || first.title,
    JSON.stringify(channels),
    first.content,
    first.subject || first.title,
    JSON.stringify(attachments),
    JSON.stringify([category?.name || ""]),
    JSON.stringify(data.leads || []),
    targetOrgId,
    targetOwnerId,
    senderType,
    JSON.stringify(followups),
    nowIso(),
  );
  return json({ success: true, id: Number(ins.meta.last_row_id) }, 201);
};
