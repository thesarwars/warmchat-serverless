/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

interface Row {
  id: number; user_id: number; position: number;
  title: string; description: string;
  template_id: number | null; message: string;
  delay_label: string; delay_minutes: number; enabled: number;
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

interface PutBody {
  title?: string; description?: string;
  template_id?: number | null; message?: string;
  delay_label?: string; delay_minutes?: number;
  enabled?: boolean; position?: number;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  const existing = await queryFirst<Row>(
    env.D1DB,
    `SELECT * FROM ai_custom_step WHERE id = ? AND user_id = ?`,
    id, user.id,
  );
  if (!existing) return error("Not found", 404);

  const body = (await readJson<PutBody>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.title !== undefined) { sets.push("title = ?"); args.push(String(body.title)); }
  if (body.description !== undefined) { sets.push("description = ?"); args.push(String(body.description)); }
  if (body.template_id !== undefined) { sets.push("template_id = ?"); args.push(body.template_id == null ? null : Number(body.template_id)); }
  if (body.message !== undefined) { sets.push("message = ?"); args.push(String(body.message)); }
  if (body.delay_label !== undefined) { sets.push("delay_label = ?"); args.push(String(body.delay_label)); }
  if (body.delay_minutes !== undefined) { sets.push("delay_minutes = ?"); args.push(Number(body.delay_minutes)); }
  if (body.enabled !== undefined) { sets.push("enabled = ?"); args.push(body.enabled ? 1 : 0); }
  if (body.position !== undefined) { sets.push("position = ?"); args.push(Number(body.position)); }

  if (sets.length) {
    args.push(id);
    await execute(env.D1DB, `UPDATE ai_custom_step SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args);
  }
  const row = await queryFirst<Row>(env.D1DB, `SELECT * FROM ai_custom_step WHERE id = ?`, id);
  return json(ser(row!));
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  await execute(
    env.D1DB,
    `DELETE FROM ai_custom_step WHERE id = ? AND user_id = ?`,
    id, user.id,
  );
  return json({ ok: true });
};
