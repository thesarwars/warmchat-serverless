/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { resolveOrgId } from "../../../_shared/callingAccess.ts";
import { listCallSummaries } from "../../../_shared/calling/format.ts";

/**
 * GET /api/calling/calls - workspace-wide call list for the Calls page.
 * Org-scoped (all roles see the whole org), paginated, newest-first.
 *
 * Query params:
 *   direction  incoming | outgoing
 *   type       all | missed | voicemail | follow-up | ai-task
 *   search     matches phone numbers or lead name
 *   limit/offset
 */
const MISSED_STATUSES = "('NO_ANSWER', 'BUSY', 'FAILED', 'CANCELED')";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await resolveOrgId(env, user.id);
  if (!orgId) return error("Not part of an organization", 403);

  const url = new URL(request.url);
  const direction = url.searchParams.get("direction");
  const type = url.searchParams.get("type") ?? "all";
  const search = (url.searchParams.get("search") ?? "").trim();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const conditions: string[] = ["org_id = ?"];
  const params: unknown[] = [orgId];

  if (direction === "incoming") conditions.push("direction = 'INBOUND'");
  else if (direction === "outgoing") conditions.push("direction = 'OUTBOUND'");

  switch (type) {
    case "missed":
      conditions.push(`status IN ${MISSED_STATUSES}`);
      break;
    case "voicemail":
      conditions.push("is_voicemail = 1");
      break;
    case "ai-task":
      conditions.push("EXISTS (SELECT 1 FROM call_tasks t WHERE t.call_id = calls.id AND t.done = 0)");
      break;
    case "follow-up":
      // Missed calls that still need recovery: no appointment booked from them.
      conditions.push(
        `status IN ${MISSED_STATUSES} AND NOT EXISTS (SELECT 1 FROM lead_appointment la WHERE la.call_id = calls.id)`,
      );
      break;
    // "all" -> no extra condition
  }

  if (search) {
    const like = `%${search}%`;
    conditions.push(
      "(from_number LIKE ? OR to_number LIKE ? OR customer_number LIKE ? OR lead_id IN (SELECT id FROM lead WHERE name LIKE ?))",
    );
    params.push(like, like, like, like);
  }

  const { items, total } = await listCallSummaries(
    env,
    { sql: conditions.join(" AND "), params },
    limit,
    offset,
  );
  return json({ calls: items, total, limit, offset });
};
