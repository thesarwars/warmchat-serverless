/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireOrgRole } from "../../_shared/roleRequired.ts";

type OfficeRow = {
  id: number;
  org_id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  is_primary: number;
};

async function resolveOrgId(env: Env, userId: number, param: string | null): Promise<number | null> {
  if (param) return Number(param);
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId,
  );
  return m?.org_id ?? null;
}

/**
 * GET /api/offices?org_id=N - list offices for an org (any org member).
 * agents_count is 0 for now (office-level agent assignment is not modeled).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const url = new URL(request.url);
  const orgId = await resolveOrgId(env, user.id, url.searchParams.get("org_id"));
  if (!orgId) return error("org_id required", 400);
  if (!(await requireOrgRole(env, user.id, orgId))) return error("Access forbidden", 403);

  const rows = await queryAll<OfficeRow>(
    env.D1DB,
    `SELECT id, org_id, name, address, phone, email, timezone, is_primary
       FROM office WHERE org_id = ? ORDER BY is_primary DESC, id ASC`,
    orgId,
  );
  const offices = rows.map((o) => ({
    id: o.id,
    name: o.name,
    address: o.address,
    phone: o.phone,
    email: o.email,
    timezone: o.timezone,
    is_primary: Boolean(o.is_primary),
    agents_count: 0,
  }));
  return json({ offices });
};

/**
 * POST /api/offices { name, address?, phone?, email?, timezone?, is_primary?, org_id? }
 * Create an office. Owner/Manager only. Setting is_primary clears any other primary.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{
    name?: string; address?: string; phone?: string; email?: string;
    timezone?: string; is_primary?: boolean; org_id?: number;
  }>(request);
  const name = (body?.name || "").trim();
  if (!name) return error("name is required", 400);

  const orgId = await resolveOrgId(env, user.id, body?.org_id != null ? String(body.org_id) : null);
  if (!orgId) return error("User is not part of any organization", 403);
  if (!(await requireOrgRole(env, user.id, orgId, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  const isPrimary = body?.is_primary ? 1 : 0;
  if (isPrimary) {
    await execute(env.D1DB, `UPDATE office SET is_primary = 0 WHERE org_id = ?`, orgId);
  }
  const result = await execute(
    env.D1DB,
    `INSERT INTO office (org_id, name, address, phone, email, timezone, is_primary)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    orgId, name,
    (body?.address || "").trim() || null,
    (body?.phone || "").trim() || null,
    (body?.email || "").trim() || null,
    (body?.timezone || "").trim() || null,
    isPrimary,
  );
  return json({ success: true, id: result.meta?.last_row_id ?? null, name });
};
