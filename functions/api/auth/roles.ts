/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/** GET /api/auth/roles -> [{ id, name }, ...] available roles. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const rows = await queryAll<{ id: number; name: string }>(env.D1DB, `SELECT id, name FROM role ORDER BY id ASC`);
  return json({ roles: rows });
};
