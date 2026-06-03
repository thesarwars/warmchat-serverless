/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { execute } from "../../../../_shared/db.ts";
import { requireApiKey } from "../../../../_shared/apiAuth.ts";

/**
 * DELETE /api/integrations/v1/hooks/:id - Zapier REST Hook unsubscribe. Scoped
 * to the key's org so a key can only remove its own org's subscriptions.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const auth = await requireApiKey(env, request, "leads:read");
  if (!auth) return error("Invalid or missing API key", 401);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid hook id", 400);

  await execute(
    env.D1DB,
    `DELETE FROM integration_subscription WHERE id = ? AND org_id = ?`,
    id,
    auth.orgId,
  );
  return json({ ok: true });
};
