/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * POST /api/orgs/ - create a new organization. The caller becomes the Owner
 * and gets a fresh Owner-role membership row.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<{ name?: string; timezone?: string }>(request)) || {};
  const name = (body.name || "").trim();
  if (!name) return error("name is required", 400);

  const orgIns = await execute(
    env.D1DB,
    `INSERT INTO organization (name, owner_id, timezone) VALUES (?, ?, ?)`,
    name, user.id, body.timezone || "America/New_York",
  );
  const orgId = Number(orgIns.meta.last_row_id);

  await execute(env.D1DB, `INSERT OR IGNORE INTO role (name) VALUES ('Owner')`);
  const owner = await queryFirst<{ id: number }>(env.D1DB, `SELECT id FROM role WHERE name = 'Owner'`);
  await execute(
    env.D1DB,
    `INSERT INTO membership (user_id, org_id, role_id) VALUES (?, ?, ?)`,
    user.id, orgId, owner!.id,
  );
  return json({ id: orgId, name, owner_id: user.id }, 201);
};
