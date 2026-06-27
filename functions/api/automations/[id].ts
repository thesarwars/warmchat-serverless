/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isOrgMember } from "../../_shared/orgAccess.ts";
import { safeJson, type AutomationRow } from "../../_shared/automationHelpers.ts";

/**
 * GET /api/automations/:id - single automation payload (used by AutomationDetails.tsx).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid automation id", 400);

  const c = await queryFirst<AutomationRow>(env.D1DB, `SELECT * FROM automation WHERE id = ?`, id);
  if (!c) return error("Automation not found", 404);
  const orgId = Number(c.org_id);
  if (!Number.isInteger(orgId) || !(await isOrgMember(env, user.id, orgId))) {
    return error("Forbidden", 403);
  }

  return json({
    id: c.id,
    name: c.name || "",
    channels: safeJson<string[]>(c.channels, []),
    message: c.message || "",
    email_subject: c.email_subject || c.name || "",
    email_body: c.email_body || "",
    attachments: safeJson<unknown[]>(c.attachments, []),
    sources: safeJson<string[]>(c.sources, []),
    leads: safeJson<unknown[]>(c.leads, []),
    opening_send_time: c.opening_send_time ?? null,
    followup_steps: safeJson<unknown[]>(c.followup_steps, []),
    created_at: c.created_at,
    status: c.status,
  });
};

/**
 * PUT /api/automations/:id - edit an automation's name, main message, email
 * subject, and follow-up sequence (drip steps). Only the provided fields change.
 * The drip reads `message` + `followup_steps` fresh on each enroll, so edits
 * apply to future enrollments immediately.
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid automation id", 400);

  const existing = await queryFirst<{ org_id: string | number }>(
    env.D1DB, `SELECT org_id FROM automation WHERE id = ?`, id);
  if (!existing) return error("Automation not found", 404);
  const orgId = Number(existing.org_id);
  if (!Number.isInteger(orgId) || !(await isOrgMember(env, user.id, orgId))) {
    return error("Forbidden", 403);
  }

  const body = (await readJson<{
    name?: string;
    message?: string;
    email_subject?: string;
    email_body?: string;
    channels?: string[];
    opening_send_time?: string | null;
    followup_steps?: Array<{ delay_days?: number; message?: string; email_body?: string; subject?: string; send_time?: string; timezone?: string; channel?: string }>;
  }>(request)) || {};

  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.name !== undefined) { sets.push("name = ?"); args.push(String(body.name)); }
  if (body.message !== undefined) { sets.push("message = ?"); args.push(String(body.message)); }
  // Opening timing: a valid HH:MM times the opening; null / "" / "instant" makes
  // it instant again (stored as NULL).
  if (body.opening_send_time !== undefined) {
    sets.push("opening_send_time = ?");
    args.push(/^\d{1,2}:\d{2}$/.test(String(body.opening_send_time || "")) ? String(body.opening_send_time) : null);
  }
  if (body.email_subject !== undefined) { sets.push("email_subject = ?"); args.push(String(body.email_subject)); }
  if (body.email_body !== undefined) { sets.push("email_body = ?"); args.push((body.email_body || "").trim() || null); }
  if (body.channels !== undefined) { sets.push("channels = ?"); args.push(JSON.stringify(body.channels)); }
  if (body.followup_steps !== undefined) {
    const steps = (body.followup_steps || [])
      .filter((s) => (s.message || "").trim())
      .map((s) => ({
        delay_days: Number(s.delay_days) || 0,
        message: String(s.message || "").trim(),
        ...(s.email_body ? { email_body: String(s.email_body) } : {}),
        ...(s.subject ? { subject: String(s.subject) } : {}),
        ...(/^\d{1,2}:\d{2}$/.test(String(s.send_time || "")) ? { send_time: String(s.send_time) } : {}),
        ...(s.timezone ? { timezone: String(s.timezone) } : {}),
        ...(String(s.channel || "").toLowerCase() === "email" || String(s.channel || "").toLowerCase() === "sms"
          ? { channel: String(s.channel).toLowerCase() } : {}),
      }));
    sets.push("followup_steps = ?"); args.push(JSON.stringify(steps));
  }
  if (!sets.length) return json({ ok: true });

  args.push(id);
  await execute(env.D1DB, `UPDATE automation SET ${sets.join(", ")} WHERE id = ?`, ...args);
  return json({ ok: true });
};
