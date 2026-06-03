/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import {
  buildEmailCard,
  buildSmsCard,
  getOrCreatePreferences,
  getOrgIdForUser,
  isTeamMode,
  serializePreferences,
} from "../../_shared/connectedAccountsHelpers.ts";

/**
 * GET /api/connected-accounts -> unified email/SMS connection payload.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const orgId = await getOrgIdForUser(env, user.id);
  const [email, sms, prefs, team] = await Promise.all([
    buildEmailCard(env, user.id),
    buildSmsCard(env, user.id),
    getOrCreatePreferences(env, user.id),
    isTeamMode(env, orgId),
  ]);

  return json({
    email,
    sms,
    defaults: serializePreferences(prefs),
    team_mode: team,
    org_id: orgId,
  });
};
