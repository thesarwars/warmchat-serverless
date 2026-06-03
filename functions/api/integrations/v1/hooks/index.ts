/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../_shared/http.ts";
import { queryFirst, execute } from "../../../../_shared/db.ts";
import { requireApiKey } from "../../../../_shared/apiAuth.ts";
import { isIntegrationEvent } from "../../../../_shared/integrationApi.ts";

/**
 * POST /api/integrations/v1/hooks { event, target_url } - Zapier REST Hook
 * subscribe. Stores the target so dispatchZapierEvent POSTs the event to it.
 * Returns { id } which Zapier holds and passes back to DELETE on unsubscribe.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await requireApiKey(env, request, "leads:read");
  if (!auth) return error("Invalid or missing API key", 401);

  const body = (await readJson<{ event?: string; target_url?: string }>(request)) || {};
  const event = (body.event || "").trim();
  const targetUrl = (body.target_url || "").trim();
  if (!isIntegrationEvent(event)) return error("Unknown event", 400);
  if (!/^https:\/\//i.test(targetUrl)) return error("target_url must be an https URL", 400);

  // Idempotent: reuse an existing subscription for the same org/event/url.
  const existing = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM integration_subscription WHERE org_id = ? AND event = ? AND target_url = ?`,
    auth.orgId,
    event,
    targetUrl,
  );
  if (existing) return json({ id: existing.id, event, target_url: targetUrl });

  const ins = await execute(
    env.D1DB,
    `INSERT INTO integration_subscription (org_id, api_key_id, event, target_url) VALUES (?, ?, ?, ?)`,
    auth.orgId,
    auth.apiKeyId,
    event,
    targetUrl,
  );
  return json({ id: Number(ins.meta.last_row_id), event, target_url: targetUrl }, 201);
};
