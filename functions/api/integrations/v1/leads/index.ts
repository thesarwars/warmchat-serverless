/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../_shared/http.ts";
import { queryAll, queryFirst, execute, nowIso } from "../../../../_shared/db.ts";
import { requireApiKey } from "../../../../_shared/apiAuth.ts";
import { createOrUpdateLead } from "../../../../_shared/leadIntake.ts";
import { queueAutomationForLead } from "../../../../_shared/automationEnroll.ts";
import { enrollSpeedToLead } from "../../../../_shared/speedToLead.ts";
import { toLeadView, resolveActorUserId } from "../../../../_shared/integrationApi.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /api/integrations/v1/leads
 *   ?email=&phone=   -> Find Lead (search; powers Zapier find-or-create)
 *   ?since=<id>      -> recent leads with id > since (New Lead polling fallback)
 * Returns a bare array of lead views (what Zapier perform/performList expects).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await requireApiKey(env, request, "leads:read");
  if (!auth) return error("Invalid or missing API key", 401);

  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim() || "";
  const phone = url.searchParams.get("phone")?.trim() || "";
  const limit = Math.min(Number(url.searchParams.get("limit")) || DEFAULT_LIMIT, MAX_LIMIT);

  if (email || phone) {
    const clauses: string[] = [];
    const params: unknown[] = [auth.orgId];
    if (email) {
      clauses.push("LOWER(email) = LOWER(?)");
      params.push(email);
    }
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      const suffix = digits.length >= 10 ? digits.slice(-10) : digits;
      clauses.push(
        "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '.', '') LIKE ?",
      );
      params.push(`%${suffix}`);
    }
    const rows = await queryAll<Record<string, unknown>>(
      env.D1DB,
      `SELECT * FROM lead WHERE org_id = ? AND (${clauses.join(" OR ")}) ORDER BY id DESC LIMIT ?`,
      ...params,
      limit,
    );
    return json(rows.map(toLeadView));
  }

  const since = Number(url.searchParams.get("since")) || 0;
  const rows = await queryAll<Record<string, unknown>>(
    env.D1DB,
    `SELECT * FROM lead WHERE org_id = ? AND id > ? ORDER BY id DESC LIMIT ?`,
    auth.orgId,
    since,
    limit,
  );
  return json(rows.map(toLeadView));
};

interface IntakeBody {
  external_id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  platform?: string;
  status?: string;
  notes?: string;
  lead_type?: string;
  intent?: string;
  estimated_price?: number;
  timezone?: string;
  sms_consent_status?: string;
  automation_id?: number;
  inbound_enabled?: boolean;
}

/**
 * POST /api/integrations/v1/leads - Create or Update Lead (the intake action).
 * Idempotent: upserts by external_id -> email -> phone. Optionally triggers the
 * AI workflow (automation_id drip + inbound_enabled replies). Compliance: SMS
 * consent defaults to 'unknown' and sends stay guarded at send time.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await requireApiKey(env, request, "leads:write");
  if (!auth) return error("Invalid or missing API key", 401);

  const body = (await readJson<IntakeBody>(request)) || {};

  const result = await createOrUpdateLead(
    env,
    {
      orgId: auth.orgId,
      ownerId: await resolveActorUserId(env, auth.orgId, auth.createdByUserId),
      external_id: body.external_id ?? null,
      name: body.name ?? null,
      first_name: body.first_name ?? null,
      last_name: body.last_name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      company: body.company ?? null,
      source: body.source ?? null,
      platform: body.platform ?? null,
      status: body.status ?? null,
      notes: body.notes ?? null,
      lead_type: body.lead_type ?? null,
      intent: body.intent ?? null,
      estimated_price: body.estimated_price ?? null,
      timezone: body.timezone ?? null,
      sms_consent_status: body.sms_consent_status ?? null,
    },
    "upsert",
    context.waitUntil.bind(context),
  );

  if (!result.ok) return error(result.message, result.status);

  // Optional enrollment - "trigger the AI intake workflow". Mirrors apply-ai:
  // inbound on -> ai_status 'active'; automation only -> 'outbound'.
  const automationId = Number(body.automation_id) || 0;
  const inboundEnabled = body.inbound_enabled === true;
  if (automationId || inboundEnabled) {
    if (automationId) {
      const camp = await queryFirst<{ id: number }>(
        env.D1DB,
        `SELECT id FROM automation WHERE id = ? AND org_id = ?`,
        automationId,
        auth.orgId,
      );
      if (!camp) return error("Automation not found in this organization", 404);
    }
    const aiStatus = inboundEnabled ? "active" : automationId ? "outbound" : "off";
    await execute(env.D1DB, `UPDATE lead SET ai_status = ?, updated_at = ? WHERE id = ?`, aiStatus, nowIso(), result.leadId);
    if (automationId) {
      const actor = await resolveActorUserId(env, auth.orgId, auth.createdByUserId);
      await queueAutomationForLead(env, automationId, result.leadId, actor ?? 0);
    } else if (inboundEnabled && result.created) {
      // Speed-to-lead: a new inbound-enabled lead with no explicit automation gets
      // the per-lead-type instant + no-reply nudge sequence (compliance-gated).
      context.waitUntil(enrollSpeedToLead(env, result.leadId).catch(() => {}));
    }
  }

  const lead = await queryFirst<Record<string, unknown>>(env.D1DB, `SELECT * FROM lead WHERE id = ?`, result.leadId);
  return json({ lead: toLeadView(lead), created: result.created }, result.created ? 201 : 200);
};
