/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { getOrgWithPlan, MAX_AUTOMATION_LEADS } from "../../_shared/automationHelpers.ts";

interface DraftBody {
  name?: string;
  channels?: string[];
  message?: string;
  email_subject?: string;
  attachments?: unknown[];
  sources?: string[];
  leads?: unknown[];
  email_sender_type?: string;
  followups?: unknown[];
  timezone?: string;
}

/**
 * POST /api/automations/draft - save a partially-filled automation as a Draft.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<DraftBody>(request)) || {};
  if (!body.name) return error("name is required for a draft", 400);
  if ((body.leads?.length ?? 0) > MAX_AUTOMATION_LEADS) {
    return error(`An automation can have at most ${MAX_AUTOMATION_LEADS} leads.`, 400);
  }

  const org = await getOrgWithPlan(env, user.id);
  if (!org) return error("User is not part of any organization", 403);

  const senderType = (body.email_sender_type || "personal").toLowerCase();
  const ins = await execute(
    env.D1DB,
    `INSERT INTO automation
       (name, channels, message, email_subject, attachments, sources, leads,
        org_id, owner_id, email_sender_type, followup_steps, timezone,
        status, created_at, is_archived, delivered_count, opened_count, converted_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, 0, 0, 0, 0)`,
    body.name,
    JSON.stringify(body.channels || []),
    body.message || "",
    body.email_subject || body.name,
    JSON.stringify(body.attachments || []),
    JSON.stringify(body.sources || []),
    JSON.stringify(body.leads || []),
    String(org.id),
    String(user.id),
    senderType,
    JSON.stringify(body.followups || []),
    body.timezone || org.timezone || null,
    nowIso(),
  );
  return json({ success: true, id: Number(ins.meta.last_row_id), status: "Draft" }, 201);
};
