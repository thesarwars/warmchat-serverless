/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireApiKey } from "../../../_shared/apiAuth.ts";
import { toLeadView } from "../../../_shared/integrationApi.ts";

/**
 * GET /api/integrations/v1/replies - leads that have replied, newest first.
 * Polling fallback for the "Lead Replied" trigger (the instant REST Hook is the
 * primary path). The composite `id` (lead + reply timestamp) is the Zapier
 * dedupe key so each new reply fires once.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await requireApiKey(env, request, "leads:read");
  if (!auth) return error("Invalid or missing API key", 401);

  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit")) || 50, 100);
  const rows = await queryAll<Record<string, unknown>>(
    env.D1DB,
    `SELECT * FROM lead
       WHERE org_id = ? AND last_reply_at IS NOT NULL
       ORDER BY last_reply_at DESC LIMIT ?`,
    auth.orgId,
    limit,
  );

  return json(
    rows.map((row) => ({
      id: `${row.id}:${row.last_reply_at}`,
      lead_id: row.id,
      replied_at: row.last_reply_at,
      lead: toLeadView(row),
    })),
  );
};
