/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * POST /api/elastic/business-email/sync - trigger an inbound IMAP sync.
 *
 * Workers can't open raw TCP sockets to IMAP, so the actual fetch runs in
 * the cron Worker (workers/cron) - or, if you switch your domain to use
 * ElasticEmail's inbound webhook (see /api/elastic/inbound), no polling is
 * needed at all. This endpoint just acks the request so the UI can show a
 * "queued" toast.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = await requireUser(context.env, context.request);
  if (!user) return error("Unauthorized", 401);
  return json({
    queued: true,
    note: "Inbound sync runs in the warmchats-cron Worker; configure the ElasticEmail inbound webhook for instant delivery.",
  });
};
