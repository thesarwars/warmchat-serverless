/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { getProfileSnapshot } from "../profile/me.ts";
import { getBillingSnapshot } from "../billing/status.ts";
import { getNotificationSettings } from "../me/notification-settings.ts";
import { getChannelsSnapshot } from "../me/channels.ts";
import { getPhoneNumberSnapshot } from "../profile/phone-number.ts";

/**
 * GET /api/bootstrap/me - bundles the five lightweight user-scoped reads the
 * dashboard fires on first paint. One auth check, five parallel D1 lookups,
 * one JSON response. Each sub-payload matches its standalone endpoint exactly
 * so callers can use it as a drop-in source.
 *
 * Why this exists: free-tier Workers cap CPU at 10ms per request. Per-handler
 * overhead (JWT verify, response framing) was being paid five times for data
 * that always loads together; folding the cheap reads collapses that floor
 * while leaving the heavy dashboard aggregators on their own request budgets.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const [profile, billing, notification_settings, channels, phone_number] = await Promise.all([
    getProfileSnapshot(env, user),
    getBillingSnapshot(env, user.id),
    getNotificationSettings(env, user.id),
    getChannelsSnapshot(env, user.id),
    getPhoneNumberSnapshot(env, user.id),
  ]);

  return json({
    profile,
    billing,
    notification_settings,
    channels,
    phone_number,
  });
};
