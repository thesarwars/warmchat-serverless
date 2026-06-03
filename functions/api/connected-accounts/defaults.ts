/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import {
  getOrCreatePreferences,
  getOrgIdForUser,
  isTeamMode,
  serializePreferences,
  updatePreferences,
  type ChannelDefaults,
} from "../../_shared/connectedAccountsHelpers.ts";

/**
 * GET /api/connected-accounts/defaults -> caller's default send-channel preferences.
 * PATCH same path to update.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const pref = await getOrCreatePreferences(env, user.id);
  const orgId = await getOrgIdForUser(env, user.id);
  return json({ ...serializePreferences(pref), team_mode: await isTeamMode(env, orgId) });
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = (await readJson<Partial<ChannelDefaults>>(request)) ?? {};
  const { pref, error: err } = await updatePreferences(env, user.id, body);
  if (err) return error(err, 400);
  const orgId = await getOrgIdForUser(env, user.id);
  return json({ ...serializePreferences(pref), team_mode: await isTeamMode(env, orgId) });
};
