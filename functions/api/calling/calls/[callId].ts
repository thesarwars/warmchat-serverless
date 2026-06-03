/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { canAccessCall } from "../../../_shared/callingAccess.ts";
import { loadCallDetails } from "../../../_shared/calling/format.ts";

/**
 * GET /api/calling/calls/:callId - full details for a single call, with the
 * last 50 call_events. Used by lead-detail / call-history drill-down.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const callId = String(params.callId || "");
  if (!callId) return error("callId is required", 400);
  if (!(await canAccessCall(env, user.id, callId))) return error("Forbidden", 403);

  const details = await loadCallDetails(env, callId);
  if (!details) return error("Call not found", 404);
  return json(details);
};
