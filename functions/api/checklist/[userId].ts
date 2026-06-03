/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET  /api/checklist/:userId  - post-onboarding "Getting started" checklist.
 * POST /api/checklist/:userId  - mark a visit-based item or (un)dismiss it.
 *
 * Data-backed items (email/sms/leads/automation/automation_active/templates) are
 * auto-detected from the real tables each load - nothing is stored for them.
 * Visit-based items (Explore AI Agent, Review Dashboard) and the dismissed
 * flag live on onboarding_progress so they survive a refresh and sync across
 * devices.
 */

type CheckBody = {
  // Mark a visit-based item complete.
  visit?: "ai_agent" | "dashboard";
  // Hide / re-show the whole checklist.
  dismissed?: boolean;
};

async function callerOrgId(env: Env, userId: number): Promise<number | null> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB,
    `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`,
    userId,
  );
  return row?.org_id ?? null;
}

async function countFirst(env: Env, sql: string, ...params: unknown[]): Promise<number> {
  const row = await queryFirst<{ n: number }>(env.D1DB, sql, ...params);
  return row?.n ?? 0;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const userId = Number(params.userId);
  if (!Number.isInteger(userId)) return error("Invalid user id", 400);
  if (userId !== user.id) return error("Forbidden", 403);

  const orgId = await callerOrgId(env, userId);

  const progress = await queryFirst<{
    email_connected: number; sms_connected: number; flow_activated: number;
    checklist_dismissed: number; visited_ai_agent: number; visited_dashboard: number;
  }>(
    env.D1DB,
    `SELECT email_connected, sms_connected, flow_activated,
            checklist_dismissed, visited_ai_agent, visited_dashboard
       FROM onboarding_progress WHERE user_id = ?`,
    userId,
  );

  const telnyx = await queryFirst<{ telnyx_phone_number: string | null }>(
    env.D1DB,
    `SELECT telnyx_phone_number FROM "user" WHERE id = ?`,
    userId,
  );

  let leads = 0, automations = 0, activeAutomations = 0, templates = 0;
  if (orgId) {
    leads = await countFirst(env, `SELECT COUNT(id) AS n FROM lead WHERE org_id = ?`, orgId);
    // automation.org_id is stored as TEXT - compare as a string.
    automations = await countFirst(
      env, `SELECT COUNT(id) AS n FROM automation WHERE org_id = ?`, String(orgId));
    activeAutomations = await countFirst(
      env, `SELECT COUNT(id) AS n FROM automation WHERE org_id = ? AND status <> 'Draft'`, String(orgId));
    // Seeded default templates carry created_by = the seeding user's id (a bare
    // number); UI-created templates carry the creator's email. Detecting an '@'
    // tells us the user actually customized/created one.
    templates = await countFirst(
      env, `SELECT COUNT(id) AS n FROM message_templates WHERE org_id = ? AND created_by LIKE '%@%'`, orgId);
  }

  return json({
    dismissed: Boolean(progress?.checklist_dismissed),
    items: {
      email: Boolean(progress?.email_connected),
      sms: Boolean(progress?.sms_connected) || Boolean(telnyx?.telnyx_phone_number),
      leads: leads > 0,
      ai_agent: Boolean(progress?.visited_ai_agent),
      ai_followup: Boolean(progress?.flow_activated),
      automation: automations > 0,
      automation_active: activeAutomations > 0,
      templates: templates > 0,
      dashboard: Boolean(progress?.visited_dashboard),
    },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const userId = Number(params.userId);
  if (!Number.isInteger(userId)) return error("Invalid user id", 400);
  if (userId !== user.id) return error("Forbidden", 403);

  const body = (await readJson<CheckBody>(request)) || {};

  if (body.visit === "ai_agent") {
    await execute(
      env.D1DB,
      `INSERT INTO onboarding_progress (user_id, visited_ai_agent) VALUES (?, 1)
       ON CONFLICT(user_id) DO UPDATE SET visited_ai_agent = 1, updated_at = CURRENT_TIMESTAMP`,
      userId,
    );
  } else if (body.visit === "dashboard") {
    await execute(
      env.D1DB,
      `INSERT INTO onboarding_progress (user_id, visited_dashboard) VALUES (?, 1)
       ON CONFLICT(user_id) DO UPDATE SET visited_dashboard = 1, updated_at = CURRENT_TIMESTAMP`,
      userId,
    );
  }

  if (typeof body.dismissed === "boolean") {
    const flag = body.dismissed ? 1 : 0;
    await execute(
      env.D1DB,
      `INSERT INTO onboarding_progress (user_id, checklist_dismissed) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET checklist_dismissed = ?, updated_at = CURRENT_TIMESTAMP`,
      userId, flag, flag,
    );
  }

  return json({ success: true });
};
