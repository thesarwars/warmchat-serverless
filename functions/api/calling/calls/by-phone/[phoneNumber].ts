/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { resolveOrgId } from "../../../../_shared/callingAccess.ts";
import { listCallSummaries } from "../../../../_shared/calling/format.ts";

/**
 * GET /api/calling/calls/by-phone/:phoneNumber - call history matched by
 * customer phone (E.164). Used by CallHistoryList when the contact has no
 * lead row yet. Scoped to the caller's org.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await resolveOrgId(env, user.id);
  if (!orgId) return error("Not part of an organization", 403);

  const phone = decodeURIComponent(String(params.phoneNumber || ""));
  if (!phone) return error("phoneNumber is required", 400);

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  // Match either direction (we don't know if the customer was caller or callee).
  const { items, total } = await listCallSummaries(
    env,
    {
      sql: `org_id = ? AND (from_number = ? OR to_number = ? OR customer_number = ?)`,
      params: [orgId, phone, phone, phone],
    },
    limit,
    offset,
  );
  return json({ calls: items, total, limit, offset });
};
