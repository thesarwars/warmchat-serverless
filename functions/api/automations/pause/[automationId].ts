/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/** POST /api/automations/pause/:automationId - pause a running automation. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.automationId);
  if (!Number.isInteger(id)) return error("Invalid automation id", 400);

  const c = await queryFirst<{ org_id: string; status: string }>(
    env.D1DB, `SELECT org_id, status FROM automation WHERE id = ?`, id,
  );
  if (!c) return error("Automation not found", 404);
  const orgId = Number(c.org_id);
  if (!Number.isInteger(orgId) || !(await isOrgMember(env, user.id, orgId))) {
    return error("Forbidden", 403);
  }

  if (c.status === "Paused") return json({ success: true, status: "Already Paused" });
  await execute(env.D1DB, `UPDATE automation SET status = 'Paused' WHERE id = ?`, id);
  return json({ success: true, status: "Paused" });
};
