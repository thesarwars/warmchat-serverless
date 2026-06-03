/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { callerOrgId } from "../../_shared/aiAgents.ts";

/**
 * GET / PATCH /api/listings/settings - the "Listing search" toggle, stored on
 * auto_response_settings.listing_search_enabled (one row per user). When OFF the
 * inbound AI never offers or searches listings (the search_listings tool is
 * withheld); see aiOrchestrator.ts.
 */
async function read(env: Env, userId: number): Promise<boolean> {
  const r = await queryFirst<{ listing_search_enabled: number }>(
    env.D1DB, `SELECT listing_search_enabled FROM auto_response_settings WHERE user_id = ?`, userId);
  return r ? r.listing_search_enabled === 1 : true;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  return json({ search_enabled: await read(env, user.id) });
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<{ search_enabled?: boolean }>(request)) || {};
  if (typeof body.search_enabled !== "boolean") return error("search_enabled must be a boolean", 400);

  await execute(
    env.D1DB,
    `INSERT INTO auto_response_settings (user_id, org_id, created_at, updated_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING`,
    user.id, orgId, nowIso(), nowIso(),
  );
  await execute(
    env.D1DB,
    `UPDATE auto_response_settings SET listing_search_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
    body.search_enabled ? 1 : 0, user.id,
  );
  return json({ search_enabled: await read(env, user.id) });
};
