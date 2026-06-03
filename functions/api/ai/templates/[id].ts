/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/** PUT / DELETE /api/ai/templates/:id. */

const UPDATABLE = [
  "title", "content", "subject", "channel", "delay_days", "delay_seconds",
  "delay_label", "send_at", "timezone", "image_url", "prompt",
  "tone_id", "preset_id", "category_id", "is_active", "agent",
] as const;

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  const row = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM message_templates WHERE id = ?`, id);
  if (!row) return error("Template not found", 404);
  if (!(await isOrgMember(env, user.id, row.org_id))) return error("Forbidden", 403);

  const body = (await readJson<Record<string, unknown>>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const k of UPDATABLE) {
    if (k in body) {
      sets.push(`${k} = ?`);
      const v = body[k];
      args.push(k === "is_active" ? (v ? 1 : 0) : v ?? null);
    }
  }
  if (!sets.length) return json({ message: "Nothing to update" });
  await execute(env.D1DB, `UPDATE message_templates SET ${sets.join(", ")} WHERE id = ?`, ...args, id);
  const updated = await queryFirst(env.D1DB, `SELECT * FROM message_templates WHERE id = ?`, id);
  return json(updated);
};

// The SPA's api helper sends PATCH for partial updates (e.g. toggling a card's
// is_active) - share the same partial-update logic as PUT.
export const onRequestPatch = onRequestPut;

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  const row = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM message_templates WHERE id = ?`, id);
  if (!row) return error("Template not found", 404);
  if (!(await isOrgMember(env, user.id, row.org_id))) return error("Forbidden", 403);

  await execute(env.D1DB, `DELETE FROM message_templates WHERE id = ?`, id);
  return new Response(null, { status: 204 });
};
