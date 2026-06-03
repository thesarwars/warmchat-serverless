/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { hashPassword } from "../../_shared/password.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireOrgRole } from "../../_shared/roleRequired.ts";

/**
 * POST /api/auth/registerOwner_Manager - Owner creating an Owner/Manager
 * teammate directly (skips the email invite).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const caller = await requireUser(env, request);
  if (!caller) return error("Unauthorized", 401);

  const body = await readJson<{
    name?: string; email?: string; password?: string; role?: string; org_id?: number;
  }>(request);
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";
  const roleName = (body?.role || "Manager").trim();
  if (!email || password.length < 8) return error("email and password (min 8 chars) are required", 400);

  const callerMembership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, caller.id,
  );
  const orgId = body?.org_id ?? callerMembership?.org_id;
  if (!orgId) return error("Caller is not part of any organization", 403);

  const role = await requireOrgRole(env, caller.id, orgId, "Owner");
  if (!role) return error("Access forbidden: insufficient role", 403);

  const exists = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM "user" WHERE LOWER(email) = ?`, email,
  );
  if (exists) return error("A user with that email already exists", 409);

  const roleRow = await queryFirst<{ id: number }>(env.D1DB, `SELECT id FROM role WHERE name = ?`, roleName);
  if (!roleRow) return error(`Unknown role: ${roleName}`, 400);

  const hash = await hashPassword(password);
  const ins = await execute(
    env.D1DB,
    `INSERT INTO "user" (name, email, password_hash, is_email_confirmed, email_confirmed, is_invited)
     VALUES (?, ?, ?, 1, 1, 1)`,
    body?.name || null, email, hash,
  );
  const newUserId = Number(ins.meta.last_row_id);

  await execute(
    env.D1DB,
    `INSERT INTO membership (user_id, org_id, role_id) VALUES (?, ?, ?)`,
    newUserId, orgId, roleRow.id,
  );

  return json({ success: true, user_id: newUserId, role: roleName }, 201);
};
