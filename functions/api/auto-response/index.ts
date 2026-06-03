/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET / PUT /api/auto-response - per-user auto-response settings. Creates a
 * default row on first read if none exists.
 */

interface Row {
  id: number; user_id: number; org_id: number;
  enabled: number;
  stop_on_reply: number; stop_on_appointment: number;
  missed_call_enabled: number; missed_call_message: string;
  missed_call_template_id: number | null;
  inbound_sms_enabled: number;
  inbound_existing_continue: number; inbound_existing_reengage: number; inbound_reengage_days: number;
  inbound_new_create_lead: number; inbound_new_send_reply: number; inbound_new_tag: number;
  qualification_enabled: number;
  booking_handoff_enabled: number; handoff_user_id: number | null;
  behavior_stop_lead_reply: number; behavior_stop_agent_reply: number;
  behavior_one_question_at_a_time: number; behavior_wait_for_reply: number;
  behavior_log_every_message: number; behavior_auto_status_tag: number;
  created_at: string; updated_at: string;
}

function serialize(r: Row) {
  return {
    enabled: Boolean(r.enabled),
    stop_on_reply: Boolean(r.stop_on_reply),
    stop_on_appointment: Boolean(r.stop_on_appointment),
    missed_call_enabled: Boolean(r.missed_call_enabled),
    missed_call_message: r.missed_call_message,
    missed_call_template_id: r.missed_call_template_id,
    inbound_sms_enabled: Boolean(r.inbound_sms_enabled),
    inbound_existing_continue: Boolean(r.inbound_existing_continue),
    inbound_existing_reengage: Boolean(r.inbound_existing_reengage),
    inbound_reengage_days: r.inbound_reengage_days,
    inbound_new_create_lead: Boolean(r.inbound_new_create_lead),
    inbound_new_send_reply: Boolean(r.inbound_new_send_reply),
    inbound_new_tag: Boolean(r.inbound_new_tag),
    qualification_enabled: Boolean(r.qualification_enabled),
    booking_handoff_enabled: Boolean(r.booking_handoff_enabled),
    handoff_user_id: r.handoff_user_id,
    behavior_stop_lead_reply: Boolean(r.behavior_stop_lead_reply),
    behavior_stop_agent_reply: Boolean(r.behavior_stop_agent_reply),
    behavior_one_question_at_a_time: Boolean(r.behavior_one_question_at_a_time),
    behavior_wait_for_reply: Boolean(r.behavior_wait_for_reply),
    behavior_log_every_message: Boolean(r.behavior_log_every_message),
    behavior_auto_status_tag: Boolean(r.behavior_auto_status_tag),
  };
}

async function findOrCreate(env: Env, userId: number, orgId: number): Promise<Row> {
  const existing = await queryFirst<Row>(env.D1DB, `SELECT * FROM auto_response_settings WHERE user_id = ?`, userId);
  if (existing) return existing;
  await execute(
    env.D1DB,
    `INSERT INTO auto_response_settings
       (user_id, org_id, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    userId, orgId, nowIso(), nowIso(),
  );
  const row = await queryFirst<Row>(env.D1DB, `SELECT * FROM auto_response_settings WHERE user_id = ?`, userId);
  return row!;
}

async function getOrgId(env: Env, userId: number): Promise<number | null> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId);
  return row?.org_id ?? null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await getOrgId(env, user.id);
  if (!orgId) return error("User not part of organization", 403);
  const row = await findOrCreate(env, user.id, orgId);
  return json(serialize(row));
};

const BOOL_FIELDS = [
  "enabled",
  "stop_on_reply", "stop_on_appointment", "missed_call_enabled",
  "inbound_sms_enabled",
  "inbound_existing_continue", "inbound_existing_reengage",
  "inbound_new_create_lead", "inbound_new_send_reply", "inbound_new_tag",
  "qualification_enabled", "booking_handoff_enabled",
  "behavior_stop_lead_reply", "behavior_stop_agent_reply",
  "behavior_one_question_at_a_time", "behavior_wait_for_reply",
  "behavior_log_every_message", "behavior_auto_status_tag",
] as const;
const STR_FIELDS = [
  "missed_call_message",
] as const;
const INT_FIELDS = [
  "missed_call_template_id", "handoff_user_id",
  "inbound_reengage_days",
] as const;

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await getOrgId(env, user.id);
  if (!orgId) return error("User not part of organization", 403);
  await findOrCreate(env, user.id, orgId);

  const body = (await readJson<Record<string, unknown>>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const f of BOOL_FIELDS) {
    if (f in body) { sets.push(`${f} = ?`); args.push(body[f] ? 1 : 0); }
  }
  for (const f of STR_FIELDS) {
    if (f in body) { sets.push(`${f} = ?`); args.push(body[f] ?? null); }
  }
  for (const f of INT_FIELDS) {
    if (f in body) {
      const v = body[f];
      sets.push(`${f} = ?`);
      args.push(v == null || v === "" ? null : Number(v));
    }
  }
  sets.push("updated_at = ?"); args.push(nowIso());

  await execute(env.D1DB, `UPDATE auto_response_settings SET ${sets.join(", ")} WHERE user_id = ?`, ...args, user.id);
  const row = await queryFirst<Row>(env.D1DB, `SELECT * FROM auto_response_settings WHERE user_id = ?`, user.id);
  return json(serialize(row!));
};
