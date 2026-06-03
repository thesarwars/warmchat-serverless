/// <reference types="@cloudflare/workers-types" />
import { queryFirst } from "./db.ts";

/**
 * Site-wide admin flag check. Reads `user.is_admin` directly so /admin/*
 * endpoints don't depend on per-org membership roles - the site admin is a
 * specific human (jv@jovrealestate.com in the seed), not "every Owner of
 * every org".
 */
type EnvLike = { D1DB: D1Database };

export async function isSiteAdmin(env: EnvLike, userId: number): Promise<boolean> {
  const row = await queryFirst<{ is_admin: number }>(
    env.D1DB,
    `SELECT is_admin FROM "user" WHERE id = ?`,
    userId,
  );
  return row?.is_admin === 1;
}
