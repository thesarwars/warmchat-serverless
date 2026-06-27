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

  // Per-team live aggregates over the leads owned by the team's members
  // (team_member.user_id = lead.owner_id), scoped to the org. Correlated
  // subqueries on indexed columns; one team list per org keeps this cheap.
  const rows = await queryAll<{
    id: number; name: string; description: string | null;
    leader_id: number | null; leader_name: string | null; leader_email: string | null;
    member_count: number; active_leads: number; conversations: number;
    appointments: number; pipeline_value: number; won_deals: number;
  }>(
    env.D1DB,
    `SELECT t.id, t.name, t.description, t.leader_id,
            u.name AS leader_name, u.email AS leader_email,
            (SELECT COUNT(*) FROM team_member tm WHERE tm.team_id = t.id) AS member_count,
            (SELECT COUNT(*) FROM lead l
               WHERE l.org_id = t.org_id
                 AND l.owner_id IN (SELECT tm2.user_id FROM team_member tm2 WHERE tm2.team_id = t.id)) AS active_leads,
            (SELECT COUNT(DISTINCT im.lead_id) FROM inbox_messages im
               JOIN lead l2 ON l2.id = im.lead_id
               WHERE l2.org_id = t.org_id
                 AND l2.owner_id IN (SELECT tm3.user_id FROM team_member tm3 WHERE tm3.team_id = t.id)) AS conversations,
            (SELECT COUNT(*) FROM lead_appointment la
               JOIN lead l3 ON l3.id = la.lead_id
               WHERE l3.org_id = t.org_id
                 AND l3.owner_id IN (SELECT tm4.user_id FROM team_member tm4 WHERE tm4.team_id = t.id)
                 AND LOWER(IFNULL(la.status,'')) <> 'cancelled') AS appointments,
            (SELECT COALESCE(SUM(d.value),0) FROM deal d
               JOIN lead l4 ON l4.id = d.lead_id
               WHERE l4.org_id = t.org_id
                 AND l4.owner_id IN (SELECT tm5.user_id FROM team_member tm5 WHERE tm5.team_id = t.id)
                 AND LOWER(IFNULL(d.status,'open')) = 'open') AS pipeline_value,
            (SELECT COUNT(*) FROM deal d2
               JOIN lead l5 ON l5.id = d2.lead_id
               WHERE l5.org_id = t.org_id
                 AND l5.owner_id IN (SELECT tm6.user_id FROM team_member tm6 WHERE tm6.team_id = t.id)
                 AND LOWER(IFNULL(d2.status,'')) = 'won') AS won_deals
       FROM team t
       LEFT JOIN "user" u ON u.id = t.leader_id
      WHERE t.org_id = ?
      ORDER BY t.id ASC`,
    orgId,
  );
  const teams = rows.map((t) => ({
    ...t,
    conversion_rate: t.active_leads > 0 ? `${Math.round((t.won_deals / t.active_leads) * 100)}%` : "0%",
  }));
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
