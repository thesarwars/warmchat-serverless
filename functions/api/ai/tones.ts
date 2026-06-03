/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryAll, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireCallerOrgRole } from "../../_shared/roleRequired.ts";

/** GET / POST /api/ai/tones - list / add a tone (Friendly, Professional, ...). */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (!(await requireUser(env, request))) return error("Unauthorized", 401);
  const rows = await queryAll<{ id: number; label: string; is_active: number }>(
    env.D1DB, `SELECT id, label, is_active FROM tones WHERE is_active = 1 ORDER BY id ASC`);
  return json(rows.map((r) => ({ id: r.id, label: r.label, is_active: Boolean(r.is_active) })));
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  // create tone is Owner/Manager.
  if (!(await requireCallerOrgRole(env, user.id, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }
  const body = (await readJson<{ label?: string }>(request)) || {};
  const label = (body.label || "").trim();
  if (!label) return error("label is required", 400);
  const ins = await execute(env.D1DB, `INSERT INTO tones (label) VALUES (?)`, label);
  return json({ id: Number(ins.meta.last_row_id), label, is_active: true }, 201);
};
