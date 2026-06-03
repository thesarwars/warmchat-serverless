/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireApiKey } from "../../../_shared/apiAuth.ts";

/**
 * GET /api/integrations/v1/me - Zapier's auth test. Returns the org behind the
 * API key so Zapier can label the connection and confirm the key is valid.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await requireApiKey(env, request);
  if (!auth) return error("Invalid or missing API key", 401);

  const org = await queryFirst<{ id: number; name: string }>(
    env.D1DB,
    `SELECT id, name FROM organization WHERE id = ?`,
    auth.orgId,
  );
  return json({ org_id: auth.orgId, org_name: org?.name ?? null, scopes: auth.scopes });
};
