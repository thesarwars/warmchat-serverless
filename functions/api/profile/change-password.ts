/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { verifyPassword, hashPassword } from "../../_shared/password.ts";

/**
 * POST /api/profile/change-password
 * Body: { currentPassword, newPassword }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<{ currentPassword?: string; newPassword?: string }>(request)) || {};
  if (!body.currentPassword || !body.newPassword) {
    return error("currentPassword and newPassword are required", 400);
  }
  if (body.newPassword.length < 8) return error("Password must be at least 8 characters", 400);

  const row = await queryFirst<{ password_hash: string | null }>(
    env.D1DB, `SELECT password_hash FROM "user" WHERE id = ?`, user.id);
  if (!row || !(await verifyPassword(body.currentPassword, row.password_hash))) {
    return error("Current password is incorrect", 400);
  }
  const newHash = await hashPassword(body.newPassword);
  await execute(env.D1DB, `UPDATE "user" SET password_hash = ? WHERE id = ?`, newHash, user.id);
  return json({ message: "Password updated" });
};
