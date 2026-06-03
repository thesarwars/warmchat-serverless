/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import {
  getOrgWithPlan, checkAutomationLimits, checkChannelsLimit,
  safeJson, type AutomationRow,
} from "../../../_shared/automationHelpers.ts";

/**
 * POST /api/automations/duplicate/:automationId - copy with status='Paused'.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.automationId);
  if (!Number.isInteger(id)) return error("Invalid automation id", 400);

  const c = await queryFirst<AutomationRow>(env.D1DB, `SELECT * FROM automation WHERE id = ?`, id);
  if (!c) return error("Automation not found", 404);

  const org = await getOrgWithPlan(env, user.id);
  if (!org) return error("User is not part of any organization", 403);

  const [okC, msgC] = await checkAutomationLimits(env, org, org.limits);
  if (!okC) return error(msgC, 400);

  const channels = safeJson<string[]>(c.channels, []);
  const [okCh, msgCh] = checkChannelsLimit(org.limits, channels);
  if (!okCh) return error(msgCh, 400);

  const ins = await execute(
    env.D1DB,
    `INSERT INTO automation
       (name, channels, message, email_subject, attachments, sources, leads,
        org_id, owner_id, email_sender_type, status, created_at,
        is_archived, delivered_count, opened_count, converted_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paused', ?, 0, 0, 0, 0)`,
    `${c.name} (Copy)`,
    c.channels || "[]",
    c.message || "",
    c.email_subject,
    c.attachments || "[]",
    c.sources || "[]",
    c.leads || "[]",
    c.org_id,
    c.owner_id,
    c.email_sender_type || "personal",
    nowIso(),
  );
  return json({ success: true, id: Number(ins.meta.last_row_id) }, 201);
};
