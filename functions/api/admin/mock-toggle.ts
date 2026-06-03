/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isSiteAdmin } from "../../_shared/adminAccess.ts";
import { getAppSetting, setAppSetting } from "../../_shared/appSettings.ts";

/**
 * GET  /api/admin/mock-toggle - returns the current mock-send flag plus where
 *                              it's sourced from ("db" when the system-wide
 *                              app_settings row is set, "env" when we're
 *                              falling back to MOCK_SEND_APIS).
 * POST /api/admin/mock-toggle - body { enabled: boolean } writes the global
 *                              `mock_sends_enabled` row.
 *
 * Owner-only. The flag is system-wide (org_id NULL) so flipping it once
 * affects every tenant; per-org toggles can be added later but the debug
 * page only needs one big switch today.
 */
const KEY = "mock_sends_enabled";

function parseBool(v: string | null | undefined): boolean {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isSiteAdmin(env, user.id))) return error("Admin access required", 403);

  const dbVal = await getAppSetting(env, KEY, null);
  if (dbVal != null) {
    return json({ enabled: parseBool(dbVal), source: "db" });
  }
  return json({ enabled: parseBool(env.MOCK_SEND_APIS), source: "env" });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isSiteAdmin(env, user.id))) return error("Admin access required", 403);

  const body = (await readJson<{ enabled?: unknown }>(request)) || {};
  if (typeof body.enabled !== "boolean") {
    return error("enabled (boolean) is required", 400);
  }
  await setAppSetting(env, KEY, body.enabled ? "1" : "0", null);
  return json({ enabled: body.enabled, source: "db" });
};
