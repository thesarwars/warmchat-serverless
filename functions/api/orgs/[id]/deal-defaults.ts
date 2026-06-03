/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";
import { requireOrgRole } from "../../../_shared/roleRequired.ts";

/**
 * GET  /api/orgs/:id/deal-defaults - return average price + commission %.
 * PUT  /api/orgs/:id/deal-defaults - Owner/Manager updates them.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, id))) return error("Forbidden", 403);

  const row = await queryFirst<{ average_deal_price: number; commission_percent: number }>(
    env.D1DB, `SELECT average_deal_price, commission_percent FROM organization WHERE id = ?`, id,
  );
  if (!row) return error("Not found", 404);
  return json(row);
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);

  const role = await requireOrgRole(env, user.id, id, "Owner", "Manager");
  if (!role) return error("Access forbidden: insufficient role", 403);

  const body = await readJson<{ average_deal_price?: number; commission_percent?: number }>(request);
  if (!body) return error("Body is required", 400);
  if (typeof body.average_deal_price !== "number" && typeof body.commission_percent !== "number") {
    return error("average_deal_price or commission_percent must be supplied", 400);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body.average_deal_price === "number") {
    fields.push("average_deal_price = ?"); values.push(body.average_deal_price);
  }
  if (typeof body.commission_percent === "number") {
    fields.push("commission_percent = ?"); values.push(body.commission_percent);
  }
  values.push(id);
  await execute(env.D1DB, `UPDATE organization SET ${fields.join(", ")} WHERE id = ?`, ...values);
  const row = await queryFirst(
    env.D1DB, `SELECT average_deal_price, commission_percent FROM organization WHERE id = ?`, id,
  );
  return json(row);
};
