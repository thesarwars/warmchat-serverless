/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/** PATCH / DELETE /api/inbox/scheduled/:id - mutate or cancel a row. */

interface Row {
  id: number; user_id: number; org_id: number; contact_id: number | null;
  channel: string; to_address: string; subject: string | null; body: string | null;
  attachments_json: string | null;
  scheduled_at: string; status: string;
  error_message: string | null; sent_message_id: number | null; sent_at: string | null;
  created_at: string;
}

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

interface PatchBody {
  to_address?: string;
  subject?: string;
  body?: string;
  attachments?: unknown[];
  send_at?: string;
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  const row = await queryFirst<Row>(
    env.D1DB, `SELECT * FROM scheduled_message WHERE id = ? AND user_id = ?`, id, user.id);
  if (!row) return error("Scheduled message not found", 404);
  if (row.status !== "scheduled") {
    return error(`Cannot edit message in status '${row.status}'`, 400);
  }

  const body = (await readJson<PatchBody>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.to_address !== undefined) { sets.push("to_address = ?"); args.push(body.to_address); }
  if (body.subject !== undefined) { sets.push("subject = ?"); args.push(body.subject ?? null); }
  if (body.body !== undefined) { sets.push("body = ?"); args.push(body.body ?? null); }
  if (body.attachments !== undefined) {
    if (!Array.isArray(body.attachments)) return error("attachments must be a list", 400);
    sets.push("attachments_json = ?"); args.push(JSON.stringify(body.attachments));
  }
  if (body.send_at !== undefined) {
    const ms = Date.parse(body.send_at);
    if (Number.isNaN(ms)) return error("send_at must be an ISO 8601 timestamp (UTC)", 400);
    if (ms <= Date.now()) return error("send_at must be in the future", 400);
    sets.push("scheduled_at = ?"); args.push(new Date(ms).toISOString());
  }
  sets.push("updated_at = ?"); args.push(nowIso());

  await execute(env.D1DB, `UPDATE scheduled_message SET ${sets.join(", ")} WHERE id = ?`, ...args, id);
  const updated = await queryFirst<Row>(env.D1DB, `SELECT * FROM scheduled_message WHERE id = ?`, id);
  return json(toDict(updated!));
};

/** Cancel = set status='cancelled' (matches old soft-delete behavior). */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  const row = await queryFirst<{ status: string }>(
    env.D1DB, `SELECT status FROM scheduled_message WHERE id = ? AND user_id = ?`, id, user.id);
  if (!row) return error("Scheduled message not found", 404);
  if (row.status !== "scheduled") {
    return error(`Cannot cancel message in status '${row.status}'`, 400);
  }
  await execute(
    env.D1DB,
    `UPDATE scheduled_message SET status='cancelled', updated_at=? WHERE id=?`,
    nowIso(), id,
  );
  return new Response(null, { status: 204 });
};
