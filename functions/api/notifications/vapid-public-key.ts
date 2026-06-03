/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";

/**
 * GET /api/notifications/vapid-public-key
 * Returns the public VAPID key so the browser can call PushManager.subscribe().
 * Safe to expose (it's the public half of the keypair).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!context.env.VAPID_PUBLIC_KEY) {
    return error("Web Push is not configured (VAPID_PUBLIC_KEY missing)", 503);
  }
  return json({ public_key: context.env.VAPID_PUBLIC_KEY });
};
