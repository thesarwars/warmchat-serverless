/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireOrgRole } from "../../_shared/roleRequired.ts";
import { buildTeamAccounts, getOrgIdForUser } from "../../_shared/connectedAccountsHelpers.ts";

/**
 * GET /api/connected-accounts/team -> connection summaries for every member of
 * the caller's org. Owner/Manager only.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const url = new URL(request.url);
  const requestedOrgId = url.searchParams.get("org_id");
  const callerOrgId = await getOrgIdForUser(env, user.id);
  if (!callerOrgId) return error("User is not part of any organization", 403);

  const orgId = requestedOrgId ? Number(requestedOrgId) : callerOrgId;
  if (!Number.isFinite(orgId)) return error("Invalid org_id", 400);

  if (!(await requireOrgRole(env, user.id, orgId, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  const members = await buildTeamAccounts(env, orgId);
  return json({ org_id: orgId, members });
};
