/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isOrgMember } from "../../_shared/orgAccess.ts";
import { requireOrgRole } from "../../_shared/roleRequired.ts";

/** GET /api/orgs/:id -> the organization row. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, id))) return error("Forbidden", 403);

  const row = await queryFirst(
    env.D1DB,
    `SELECT id, name, owner_id, plan, subscription_status,
            stripe_customer_id, stripe_subscription_id,
            provider_messaging_service_sid, sms_compliance_status,
            average_deal_price, commission_percent, timezone
       FROM organization WHERE id = ?`,
    id,
  );
  if (!row) return error("Not found", 404);
  return json(row);
};

/** PUT /api/orgs/:id - Owner/Manager edits org settings. */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid org id", 400);

  // "Only Owners can update".
  const role = await requireOrgRole(env, user.id, id, "Owner");
  if (!role) return error("Access forbidden: insufficient role", 403);

  const body = await readJson<{
    name?: string; timezone?: string;
    average_deal_price?: number; commission_percent?: number;
  }>(request);
  if (!body) return error("Body is required", 400);

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const k of ["name", "timezone"] as const) {
    if (body[k] !== undefined) { fields.push(`${k} = ?`); values.push(body[k]); }
  }
  for (const k of ["average_deal_price", "commission_percent"] as const) {
    if (typeof body[k] === "number") { fields.push(`${k} = ?`); values.push(body[k]); }
  }
  if (fields.length === 0) return error("No editable fields supplied", 400);

  values.push(id);
  await execute(env.D1DB, `UPDATE organization SET ${fields.join(", ")} WHERE id = ?`, ...values);
  const row = await queryFirst(env.D1DB, `SELECT * FROM organization WHERE id = ?`, id);
  return json(row);
};
