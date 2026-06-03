/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { requireOrgRole } from "../../../_shared/roleRequired.ts";

interface GoalsRow {
  goal_pipeline_value: number;
  goal_hot_leads: number;
  goal_appointments: number;
  goal_deals_closed: number;
}

const GOAL_FIELDS = [
  "goal_pipeline_value",
  "goal_hot_leads",
  "goal_appointments",
  "goal_deals_closed",
] as const;

/**
 * GET   /api/orgs/:id/kpi-goals - the dashboard monthly KPI targets.
 * PATCH /api/orgs/:id/kpi-goals - Owner/Manager updates them.
 * A goal of 0 means "not set" and the dashboard hides that card's progress bar.
 * Same pattern as orgs/[id]/deal-defaults.ts (PATCH so the shared frontend
 * `patch` helper can call it - there is no `put` helper).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, id))) return error("Forbidden", 403);

  const row = await queryFirst<GoalsRow>(
    env.D1DB,
    `SELECT goal_pipeline_value, goal_hot_leads, goal_appointments, goal_deals_closed
       FROM organization WHERE id = ?`,
    id,
  );
  if (!row) return error("Not found", 404);
  return json(row);
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);

  const role = await requireOrgRole(env, user.id, id, "Owner", "Manager");
  if (!role) return error("Access forbidden: insufficient role", 403);

  const body = await readJson<Partial<GoalsRow>>(request);
  if (!body) return error("Body is required", 400);

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of GOAL_FIELDS) {
    const v = body[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      fields.push(`${key} = ?`);
      values.push(Math.max(0, v));
    }
  }
  if (fields.length === 0) {
    return error("At least one goal field must be supplied", 400);
  }
  values.push(id);
  await execute(env.D1DB, `UPDATE organization SET ${fields.join(", ")} WHERE id = ?`, ...values);

  const row = await queryFirst<GoalsRow>(
    env.D1DB,
    `SELECT goal_pipeline_value, goal_hot_leads, goal_appointments, goal_deals_closed
       FROM organization WHERE id = ?`,
    id,
  );
  return json(row);
};
