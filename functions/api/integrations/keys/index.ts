/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryAll, queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { orgRole } from "../../../_shared/orgAccess.ts";
import { generateApiKey, hashApiKey } from "../../../_shared/apiKeys.ts";

const MANAGE_ROLES = new Set(["Owner", "Manager"]);

interface KeyRow {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface CreateBody {
  org_id?: number;
  name?: string;
}

/** GET /api/integrations/keys?org_id=N - list this org's API keys (never the hash). */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const orgId = Number(new URL(request.url).searchParams.get("org_id"));
  if (!Number.isInteger(orgId)) return error("org_id is required", 400);

  const role = await orgRole(env, user.id, orgId);
  if (!role || !MANAGE_ROLES.has(role)) return error("Forbidden", 403);

  const keys = await queryAll<KeyRow>(
    env.D1DB,
    `SELECT id, name, key_prefix, scopes, last_used_at, created_at, revoked_at
       FROM api_key
      WHERE org_id = ?
      ORDER BY created_at DESC`,
    orgId,
  );
  return json({ keys });
};

/**
 * POST /api/integrations/keys { org_id, name } - mint a new key. The full key
 * is returned exactly ONCE in `secret`; only its hash + prefix are stored.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<CreateBody>(request);
  const orgId = Number(body?.org_id);
  if (!Number.isInteger(orgId)) return error("org_id is required", 400);

  const role = await orgRole(env, user.id, orgId);
  if (!role || !MANAGE_ROLES.has(role)) return error("Forbidden", 403);

  const name = body?.name?.trim() || "Zapier";
  const { full, prefix } = generateApiKey();
  const keyHash = await hashApiKey(full);

  const insert = await execute(
    env.D1DB,
    `INSERT INTO api_key (org_id, created_by_user_id, name, key_prefix, key_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    orgId,
    user.id,
    name,
    prefix,
    keyHash,
    nowIso(),
  );

  const id = Number(insert.meta.last_row_id);
  const key = await queryFirst<KeyRow>(
    env.D1DB,
    `SELECT id, name, key_prefix, scopes, last_used_at, created_at, revoked_at FROM api_key WHERE id = ?`,
    id,
  );
  return json({ key, secret: full }, 201);
};
