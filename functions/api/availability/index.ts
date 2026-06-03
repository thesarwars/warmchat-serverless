/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { callerOrgId } from "../../_shared/aiAgents.ts";
import { getAvailability } from "../../_shared/availability.ts";
import { normalizeTimezone } from "../../_shared/timezoneAliases.ts";

/**
 * The agent's bookable hours - one canonical row per (org, caller). Edited from
 * the Calendar, Settings v2, and AI Inbound settings; consumed by availability.ts
 * (findOpenSlots / isSlotBookable) so the AI only proposes real open times.
 */

/** GET /api/availability -> the caller's resolved availability config. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);
  return json(await getAvailability(env, orgId, user.id));
};

interface PatchBody {
  timezone?: string | null;
  weekly_hours?: Record<string, [string, string][]> | null;
  exceptions?: string[] | null;
  slot_minutes?: number;
  buffer_minutes?: number;
  min_notice_hours?: number;
  horizon_days?: number;
  enabled?: boolean;
}

function clampInt(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** PATCH /api/availability -> upsert the caller's availability (partial). */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<PatchBody>(request)) || {};
  const cur = await getAvailability(env, orgId, user.id);

  let timezone = cur.timezone;
  if (body.timezone !== undefined) {
    const norm = body.timezone ? normalizeTimezone(String(body.timezone)) : null;
    if (body.timezone && !norm) return error("Invalid timezone", 400);
    timezone = norm || cur.timezone;
  }

  const next = {
    timezone,
    weekly_hours: JSON.stringify(body.weekly_hours !== undefined ? (body.weekly_hours || {}) : cur.weeklyHours),
    exceptions: JSON.stringify(body.exceptions !== undefined ? (body.exceptions || []) : cur.exceptions),
    slot_minutes: clampInt(body.slot_minutes, cur.slotMinutes, 5, 240),
    buffer_minutes: clampInt(body.buffer_minutes, cur.bufferMinutes, 0, 120),
    min_notice_hours: clampInt(body.min_notice_hours, cur.minNoticeHours, 0, 168),
    horizon_days: clampInt(body.horizon_days, cur.horizonDays, 1, 90),
    enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : (cur.enabled ? 1 : 0),
  };

  await execute(
    env.D1DB,
    `INSERT INTO agent_availability
       (org_id, user_id, timezone, weekly_hours, exceptions, slot_minutes, buffer_minutes, min_notice_hours, horizon_days, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id, user_id) DO UPDATE SET
       timezone = excluded.timezone, weekly_hours = excluded.weekly_hours, exceptions = excluded.exceptions,
       slot_minutes = excluded.slot_minutes, buffer_minutes = excluded.buffer_minutes,
       min_notice_hours = excluded.min_notice_hours, horizon_days = excluded.horizon_days,
       enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`,
    orgId, user.id, next.timezone, next.weekly_hours, next.exceptions,
    next.slot_minutes, next.buffer_minutes, next.min_notice_hours, next.horizon_days, next.enabled,
  );

  return onRequestGet(context);
};
