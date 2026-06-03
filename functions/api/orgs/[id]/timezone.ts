/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { requireOrgRole } from "../../../_shared/roleRequired.ts";

/** GET /api/orgs/:id/timezone -> { timezone }. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, id))) return error("Forbidden", 403);

  const row = await queryFirst<{ timezone: string }>(
    env.D1DB, `SELECT timezone FROM organization WHERE id = ?`, id);
  if (!row) return error("Not found", 404);
  return json({ timezone: row.timezone });
};

/** PATCH /api/orgs/:id/timezone - set the workspace IANA timezone. */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);
  // PUT timezone is Owner/Manager.
  if (!(await requireOrgRole(env, user.id, id, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  const body = (await readJson<{ timezone?: string }>(request)) || {};
  const tz = (body.timezone || "").trim();
  if (!tz) return error("timezone is required", 400);

  await execute(env.D1DB, `UPDATE organization SET timezone = ? WHERE id = ?`, tz, id);
  return json({ timezone: tz });
};
