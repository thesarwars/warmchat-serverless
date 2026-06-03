/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { requireOrgRole } from "../../../_shared/roleRequired.ts";
import {
  getOrgWithPlan, checkAutomationLimits, checkChannelsLimit,
  safeJson, type AutomationRow, type AutomationLead,
} from "../../../_shared/automationHelpers.ts";

/**
 * POST /api/automations/duplicate-best/:orgId - copy the org's highest-reply
 * automation as Paused. Owner/Manager only.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgIdParam = Number(params.orgId);
  if (!Number.isInteger(orgIdParam)) return error("Invalid org id", 400);
  if (!(await requireOrgRole(env, user.id, orgIdParam, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  const automations = await queryAll<AutomationRow>(
    env.D1DB, `SELECT * FROM automation WHERE org_id = ?`, String(orgIdParam),
  );
  if (automations.length === 0) return error("No automations found", 404);

  const org = await getOrgWithPlan(env, user.id);
  if (!org) return error("User is not part of any organization", 403);
  if (org.id !== orgIdParam) return error("Forbidden", 403);

  // Pick by per-lead replies stored on the leads JSON.
  const repliesCount = (c: AutomationRow): number => {
    const leads = safeJson<AutomationLead[]>(c.leads, []);
    return leads.reduce((sum, l) => sum + Number(l.replies || 0), 0);
  };
  const best = automations.reduce((a, b) => (repliesCount(b) > repliesCount(a) ? b : a));

  const [okC, msgC] = await checkAutomationLimits(env, org, org.limits);
  if (!okC) return error(msgC, 400);

  const channels = safeJson<string[]>(best.channels, []);
  const [okCh, msgCh] = checkChannelsLimit(org.limits, channels);
  if (!okCh) return error(msgCh, 400);

  const newName = `${best.name} (Best Copy)`;
  const ins = await execute(
    env.D1DB,
    `INSERT INTO automation
       (name, channels, message, email_subject, attachments, sources, leads,
        org_id, owner_id, email_sender_type, status, created_at,
        is_archived, delivered_count, opened_count, converted_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paused', ?, 0, 0, 0, 0)`,
    newName,
    best.channels || "[]",
    best.message || "",
    best.email_subject,
    best.attachments || "[]",
    best.sources || "[]",
    best.leads || "[]",
    best.org_id,
    best.owner_id,
    best.email_sender_type || "personal",
    nowIso(),
  );
  return json({ success: true, id: Number(ins.meta.last_row_id), name: newName }, 201);
};
