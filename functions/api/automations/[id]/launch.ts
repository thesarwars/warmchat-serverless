/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { getOrgWithPlan, checkAutomationLimits } from "../../../_shared/automationHelpers.ts";

/**
 * POST /api/automations/:id/launch - flip a Draft (or Paused) automation to Running.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid automation id", 400);

  const automation = await queryFirst<{ org_id: string; status: string }>(
    env.D1DB, `SELECT org_id, status FROM automation WHERE id = ?`, id,
  );
  if (!automation) return error("Automation not found", 404);

  const org = await getOrgWithPlan(env, user.id);
  if (!org) return error("User is not part of any organization", 403);
  if (String(org.id) !== automation.org_id) return error("Forbidden", 403);

  const [ok, msg] = await checkAutomationLimits(env, org, org.limits);
  if (!ok) return error(msg, 400);

  if (automation.status !== "Draft" && automation.status !== "Paused") {
    return error(`Cannot launch a ${automation.status} automation`, 400);
  }

  await execute(env.D1DB, `UPDATE automation SET status = 'Running' WHERE id = ?`, id);
  return json({ success: true, id, status: "Running" });
};
