/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryAll, queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireOrgRole } from "../../_shared/roleRequired.ts";

/**
 * GET /api/teams?org_id=N - list teams in an org (with member counts + leader).
 * Any org member can list; full mutation is Owner/Manager only.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const url = new URL(request.url);
  const orgIdParam = url.searchParams.get("org_id");
  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  const orgId = orgIdParam ? Number(orgIdParam) : membership?.org_id;
  if (!orgId) return error("org_id required", 400);
  // Caller must be in that org
  if (!(await requireOrgRole(env, user.id, orgId))) {
    return error("Access forbidden", 403);
  }

  const teams = await queryAll<{
    id: number; name: string; description: string | null;
    leader_id: number | null; leader_name: string | null; leader_email: string | null;
    member_count: number;
  }>(
    env.D1DB,
    `SELECT t.id, t.name, t.description, t.leader_id,
            u.name AS leader_name, u.email AS leader_email,
            (SELECT COUNT(*) FROM team_member tm WHERE tm.team_id = t.id) AS member_count
       FROM team t
       LEFT JOIN "user" u ON u.id = t.leader_id
      WHERE t.org_id = ?
      ORDER BY t.id ASC`,
    orgId,
  );
  return json({ teams });
};

/**
 * POST /api/teams { name, description?, leader_id?, org_id? } - create a team.
 * Owner/Manager only.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{
    name?: string; description?: string; leader_id?: number; org_id?: number;
  }>(request);
  const name = (body?.name || "").trim();
  if (!name) return error("name is required", 400);

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  const orgId = body?.org_id ?? membership?.org_id;
  if (!orgId) return error("User is not part of any organization", 403);

  const role = await requireOrgRole(env, user.id, orgId, "Owner", "Manager");
  if (!role) return error("Access forbidden: insufficient role", 403);

  const description = (body?.description || "").trim() || null;
  const leaderId = body?.leader_id ?? null;

  const result = await execute(
    env.D1DB,
    `INSERT INTO team (org_id, name, description, leader_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    orgId, name, description, leaderId, nowIso(),
  );

  const id = result.meta?.last_row_id ?? null;
  return json({ success: true, id, name, description, leader_id: leaderId });
};
