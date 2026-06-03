/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryAll, queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * Scheduled-message list + create.
 */

interface Row {
  id: number; user_id: number; org_id: number; contact_id: number | null;
  channel: string; to_address: string; subject: string | null; body: string | null;
  attachments_json: string | null;
  scheduled_at: string; status: string;
  error_message: string | null; sent_message_id: number | null; sent_at: string | null;
  created_at: string;
}

const CHANNELS = new Set(["sms", "email"]);
const STATUSES = new Set(["scheduled", "sending", "sent", "failed", "cancelled"]);

function toDict(r: Row) {
  let attachments: unknown[] = [];
  if (r.attachments_json) {
    try { const v = JSON.parse(r.attachments_json); if (Array.isArray(v)) attachments = v; } catch { /* ignore */ }
  }
  return {
    id: r.id, user_id: r.user_id, org_id: r.org_id, contact_id: r.contact_id,
    channel: r.channel, to_address: r.to_address, subject: r.subject, body: r.body,
    attachments, scheduled_at: r.scheduled_at, status: r.status,
    error_message: r.error_message, sent_message_id: r.sent_message_id, sent_at: r.sent_at,
    created_at: r.created_at,
  };
}

async function currentOrgId(env: Env, userId: number): Promise<number | null> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId);
  return row?.org_id ?? null;
}

/** GET /api/inbox/scheduled?status=&limit= */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await currentOrgId(env, user.id);
  if (!orgId) return error("User not part of organization", 403);

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 200, 500));
  if (statusFilter && !STATUSES.has(statusFilter)) return error("Invalid status", 400);

  const rows = await queryAll<Row>(
    env.D1DB,
    `SELECT * FROM scheduled_message
      WHERE org_id = ? AND user_id = ?
        ${statusFilter ? "AND status = ?" : ""}
      ORDER BY scheduled_at ASC LIMIT ?`,
    ...(statusFilter ? [orgId, user.id, statusFilter, limit] : [orgId, user.id, limit]),
  );
  return json({ items: rows.map(toDict) });
};

interface CreateBody {
  channel?: string;
  to_address?: string;
  subject?: string;
  body?: string;
  attachments?: unknown[];
  send_at?: string;
  contact_id?: number;
}

/** POST /api/inbox/scheduled - schedule a future SMS or email. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await currentOrgId(env, user.id);
  if (!orgId) return error("User not part of organization", 403);

  const body = (await readJson<CreateBody>(request)) || {};
  const channel = (body.channel || "").toLowerCase();
  if (!CHANNELS.has(channel)) return error(`channel must be one of ${[...CHANNELS].join(", ")}`, 400);
  const to_address = (body.to_address || "").trim();
  if (!to_address) return error("to_address is required", 400);
  if (channel === "email" && !body.body) return error("body is required for email", 400);
  if (channel === "sms" && !body.body && !(Array.isArray(body.attachments) && body.attachments.length)) {
    return error("body or attachments are required for sms", 400);
  }

  if (!body.send_at) return error("send_at must be an ISO 8601 timestamp (UTC)", 400);
  const sendAtMs = Date.parse(body.send_at);
  if (Number.isNaN(sendAtMs)) return error("send_at must be an ISO 8601 timestamp (UTC)", 400);
  if (sendAtMs <= Date.now()) return error("send_at must be in the future", 400);
  const scheduledAt = new Date(sendAtMs).toISOString();

  if (body.attachments !== undefined && !Array.isArray(body.attachments)) {
    return error("attachments must be a list", 400);
  }
  const attachmentsJson = body.attachments ? JSON.stringify(body.attachments) : null;

  let contactId: number | null = null;
  if (body.contact_id !== undefined && body.contact_id !== null) {
    contactId = Number(body.contact_id);
    if (!Number.isInteger(contactId)) return error("contact_id must be an integer", 400);
    const lead = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM lead WHERE id = ? AND org_id = ?`, contactId, orgId);
    if (!lead) return error(`Contact ${contactId} not found`, 404);
  }

  const ins = await execute(
    env.D1DB,
    `INSERT INTO scheduled_message
       (user_id, org_id, contact_id, channel, to_address, subject, body,
        attachments_json, scheduled_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
    user.id, orgId, contactId, channel, to_address,
    body.subject ?? null, body.body ?? null, attachmentsJson, scheduledAt,
    nowIso(), nowIso(),
  );
  const row = await queryFirst<Row>(
    env.D1DB, `SELECT * FROM scheduled_message WHERE id = ?`, Number(ins.meta.last_row_id));
  return json(toDict(row!), 201);
};
