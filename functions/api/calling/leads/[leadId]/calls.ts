/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { canAccessLead } from "../../../../_shared/callingAccess.ts";
import { listCallSummaries } from "../../../../_shared/calling/format.ts";

/**
 * GET /api/calling/leads/:leadId/calls - call history for a lead. Used by the
 * lead-detail page and inbox call-log strip. Paginated, newest-first.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const leadId = Number(params.leadId);
  if (!Number.isInteger(leadId)) return error("leadId must be an integer", 400);
  if (!(await canAccessLead(env, user.id, leadId))) return error("Forbidden", 403);

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const { items, total } = await listCallSummaries(
    env,
    { sql: `lead_id = ?`, params: [leadId] },
    limit,
    offset,
  );
  return json({ calls: items, total, limit, offset });
};
