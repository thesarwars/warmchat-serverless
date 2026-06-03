/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { createOrUpdateLead } from "../../_shared/leadIntake.ts";
import { scheduleInstantReply } from "../../_shared/instantReply.ts";

interface Body {
  org_id?: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  status?: string;
  estimated_price?: number;
  lead_type?: string;
  intent?: string;
  notes?: string;
  timezone?: string | null;
  timezone_source?: string | null;
  auto_followup_action?: string | null;
  /**
   * SMS consent the agent declared at create time:
   *   'opted_in' | 'unknown' | 'no_sms' | null
   * Drives the leads-table indicator AND the suppression gate ('no_sms'
   * blocks every send path). Was previously dropped silently because this
   * field was missing from the Body shape.
   */
  sms_consent_status?: string | null;
}

/**
 * POST /api/leads - create a lead in an org the caller belongs to. Shares the
 * create/dedup/timezone logic with the integration intake via createOrUpdateLead
 * (mode "create" keeps the manual-add 409-on-duplicate behavior).
 *
 * NOTE: creating a lead never proactively texts them. The reactive AI Inbound
 * Flow only fires after a lead replies; proactive outreach is an automation.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<Body>(request);
  const orgId = Number(body?.org_id);
  if (!Number.isInteger(orgId)) return error("org_id is required", 400);

  const membership = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM membership WHERE user_id = ? AND org_id = ? LIMIT 1`,
    user.id,
    orgId,
  );
  if (!membership) return error("Forbidden", 403);

  const result = await createOrUpdateLead(
    env,
    {
      orgId,
      ownerId: user.id,
      name: body?.name ?? null,
      first_name: body?.first_name ?? null,
      last_name: body?.last_name ?? null,
      email: body?.email ?? null,
      phone: body?.phone ?? null,
      company: body?.company ?? null,
      source: body?.source ?? null,
      status: body?.status ?? null,
      estimated_price: body?.estimated_price ?? null,
      lead_type: body?.lead_type ?? null,
      intent: body?.intent ?? null,
      notes: body?.notes ?? null,
      timezone: body?.timezone ?? null,
      timezone_source: body?.timezone_source ?? null,
      auto_followup_action: body?.auto_followup_action ?? null,
      sms_consent_status: body?.sms_consent_status ?? null,
    },
    "create",
    context.waitUntil.bind(context),
  );

  if (!result.ok) return error(result.message, result.status);

  // Manual-add gate: when the agent explicitly chose "Send now", fire one instant
  // AI opening (compliance-gated inside the helper). Best-effort - never fail the
  // create over it. "Schedule"/"Don't send" simply don't trigger here.
  if (result.created && String(body?.auto_followup_action || "").toLowerCase() === "send_now") {
    context.waitUntil(scheduleInstantReply(env, result.leadId).catch(() => {}));
  }

  return json({ lead: result.lead }, 201);
};
