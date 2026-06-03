/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { callerOrgId } from "../../_shared/aiAgents.ts";

/** PATCH / DELETE /api/listings/:id - edit or remove a property listing. */
const TEXT_COLS = ["address", "city", "state", "zip", "property_type", "listing_type", "status", "url", "description"];
const NUM_COLS = ["price", "bedrooms", "bathrooms", "square_feet"];

async function owned(env: Env, id: number, userId: number, orgId: number): Promise<boolean> {
  const row = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM listing WHERE id = ? AND user_id = ? AND org_id = ?`, id, userId, orgId);
  return Boolean(row);
}

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("No organization", 403);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);
  if (!(await owned(env, id, user.id, orgId))) return error("Listing not found", 404);

  const body = (await readJson<Record<string, unknown>>(request)) || {};
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const col of TEXT_COLS) {
    if (col in body) { sets.push(`${col} = ?`); args.push(body[col] === "" || body[col] == null ? null : String(body[col])); }
  }
  for (const col of NUM_COLS) {
    if (col in body) {
      const v = body[col];
      const n = v === null || v === undefined || v === "" ? null : Number(v);
      sets.push(`${col} = ?`); args.push(n === null || Number.isNaN(n) ? null : (col === "square_feet" ? Math.round(n) : n));
    }
  }
  if ("enabled" in body) { sets.push("enabled = ?"); args.push(body.enabled === false || body.enabled === 0 ? 0 : 1); }
  // Selected gallery photos for this listing (array of R2 keys -> JSON).
  if ("image_keys" in body) {
    sets.push("image_keys = ?");
    args.push(Array.isArray(body.image_keys) ? JSON.stringify(body.image_keys.map(String).slice(0, 8)) : null);
  }
  if (!sets.length) return json({ message: "Nothing to update" });

  await execute(env.D1DB, `UPDATE listing SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args, id);
  return json({ success: true, id });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("No organization", 403);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid id", 400);
  if (!(await owned(env, id, user.id, orgId))) return error("Listing not found", 404);

  await execute(env.D1DB, `DELETE FROM listing WHERE id = ?`, id);
  return new Response(null, { status: 204 });
};
