/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/** GET / POST /api/ai/template-categories - categories in caller's org. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id=? LIMIT 1`, user.id);
  if (!m) return error("Forbidden", 403);
  const rows = await queryAll<{ id: number; name: string; is_active: number; org_id: number }>(
    env.D1DB,
    `SELECT id, name, is_active, org_id FROM template_categories WHERE org_id = ? AND is_active = 1 ORDER BY id ASC`,
    m.org_id,
  );
  return json({ categories: rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) })) });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id=? LIMIT 1`, user.id);
  if (!m) return error("Forbidden", 403);
  const body = (await readJson<{ name?: string }>(request)) || {};
  const name = (body.name || "").trim();
  if (!name) return error("name is required", 400);
  const ins = await execute(env.D1DB, `INSERT INTO template_categories (name, org_id) VALUES (?, ?)`, name, m.org_id);
  return json({ id: Number(ins.meta.last_row_id), name, org_id: m.org_id, is_active: true }, 201);
};
