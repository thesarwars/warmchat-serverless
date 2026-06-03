/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { requireOrgRole } from "../../../_shared/roleRequired.ts";

/**
 * Resolve the category's org and confirm the caller is Owner/Manager there.
 * edit/delete category is Owner/Manager.
 */
async function guardCategory(
  env: Env, userId: number, id: number,
): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  const cat = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM template_categories WHERE id = ?`, id,
  );
  if (!cat) return { ok: false, status: 404, msg: "Category not found" };
  if (!(await requireOrgRole(env, userId, cat.org_id, "Owner", "Manager"))) {
    return { ok: false, status: 403, msg: "Access forbidden: insufficient role" };
  }
  return { ok: true };
}

/** PUT/DELETE /api/ai/template-categories/:id. */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);
  const g = await guardCategory(env, user.id, id);
  if (!g.ok) return error(g.msg, g.status);
  const body = await readJson<{ name?: string; is_active?: boolean }>(request);
  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body?.name === "string") {
    const newName = body.name.trim();
    if (!newName) return error("Name cannot be empty", 400);
    // Check for a name collision with a *different* category in the same org.
    const conflict = await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM template_categories
         WHERE org_id = (SELECT org_id FROM template_categories WHERE id = ?)
           AND name = ? AND id != ? AND is_active = 1`,
      id, newName, id,
    );
    if (conflict) return error(`A category named "${newName}" already exists`, 409);
    fields.push("name = ?");
    values.push(newName);
  }
  if (typeof body?.is_active === "boolean") { fields.push("is_active = ?"); values.push(body.is_active ? 1 : 0); }
  if (!fields.length) return error("No editable fields", 400);
  values.push(id);
  await execute(env.D1DB, `UPDATE template_categories SET ${fields.join(", ")} WHERE id = ?`, ...values);
  const row = await queryFirst(env.D1DB, `SELECT * FROM template_categories WHERE id = ?`, id);
  return json(row);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);
  const g = await guardCategory(env, user.id, id);
  if (!g.ok) return error(g.msg, g.status);
  await execute(env.D1DB, `UPDATE template_categories SET is_active = 0 WHERE id = ?`, id);
  return json({ success: true });
};
