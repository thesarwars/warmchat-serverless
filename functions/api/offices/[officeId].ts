/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireOrgRole } from "../../_shared/roleRequired.ts";

/**
 * DELETE /api/offices/:officeId - remove an office. Owner/Manager only, and
 * only within the caller's own org.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const officeId = Number(params.officeId);
  if (!officeId) return error("Invalid office id", 400);

  const office = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM office WHERE id = ?`, officeId,
  );
  if (!office) return error("Office not found", 404);
  if (!(await requireOrgRole(env, user.id, office.org_id, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  await execute(env.D1DB, `DELETE FROM office WHERE id = ?`, officeId);
  return json({ success: true });
};
