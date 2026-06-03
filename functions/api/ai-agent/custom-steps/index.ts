/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryAll, queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

interface Row {
  id: number; user_id: number; org_id: number; position: number;
  title: string; description: string;
  template_id: number | null; message: string;
  delay_label: string; delay_minutes: number; enabled: number;
  created_at: string; updated_at: string;
}

const ser = (r: Row) => ({
  id: r.id,
  position: r.position,
  title: r.title,
  description: r.description,
  template_id: r.template_id,
  message: r.message,
  delay_label: r.delay_label,
  delay_minutes: r.delay_minutes,
  enabled: Boolean(r.enabled),
});

async function getOrgId(env: Env, userId: number): Promise<number | null> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId);
  return row?.org_id ?? null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const rows = await queryAll<Row>(
    env.D1DB,
    `SELECT * FROM ai_custom_step WHERE user_id = ? ORDER BY position, id`,
    user.id,
  );
  return json({ steps: rows.map(ser) });
};

interface CreateBody {
  title?: string; description?: string;
  template_id?: number | null; message?: string;
  delay_label?: string; delay_minutes?: number;
  enabled?: boolean; position?: number;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await getOrgId(env, user.id);
  if (!orgId) return error("User not part of organization", 403);

  const body = (await readJson<CreateBody>(request)) || {};
  const title = (body.title || "").trim();
  if (!title) return error("title is required", 400);

  const last = await queryFirst<{ p: number }>(
    env.D1DB,
    `SELECT COALESCE(MAX(position), -1) AS p FROM ai_custom_step WHERE user_id = ?`,
    user.id,
  );
  const position = Number.isFinite(body.position) ? Number(body.position) : (last?.p ?? -1) + 1;

  const ins = await execute(
    env.D1DB,
    `INSERT INTO ai_custom_step
       (user_id, org_id, position, title, description, template_id, message,
        delay_label, delay_minutes, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id, orgId, position, title,
    body.description ?? "",
    body.template_id == null ? null : Number(body.template_id),
    body.message ?? "",
    body.delay_label ?? "Same day",
    Number.isFinite(body.delay_minutes) ? Number(body.delay_minutes) : 0,
    body.enabled === false ? 0 : 1,
    nowIso(), nowIso(),
  );
  const row = await queryFirst<Row>(
    env.D1DB, `SELECT * FROM ai_custom_step WHERE id = ?`,
    Number(ins.meta.last_row_id),
  );
  return json(ser(row!), 201);
};
