/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { telnyxCall } from "../../_shared/telnyx.ts";

/**
 * POST /api/telnyx/sync-inbound-webhook - ensure the canonical unified webhook
 * URL is set on the platform's ONE Master messaging profile
 * (TELNYX_MESSAGING_PROFILE_ID). API v2 uses a single webhook for inbound +
 * delivery receipts. Umbrella model - no per-client profile. See GUIDE §3.3.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const profileId = env.TELNYX_MESSAGING_PROFILE_ID;
  if (!profileId) return error("Master messaging profile not configured (set TELNYX_MESSAGING_PROFILE_ID)", 503);

  const webhookUrl = `${env.PUBLIC_BASE_URL}/api/webhooks/telnyx/inbound`;
  const upd = await telnyxCall(env, `/v2/messaging_profiles/${profileId}`, {
    method: "PATCH",
    body: { webhook_url: webhookUrl, whitelisted_destinations: ["US"] },
  });
  if (!upd.ok) return error(upd.error.message, upd.error.status);

  // Make sure this user is pointed at the shared profile too.
  await execute(
    env.D1DB,
    `UPDATE "user" SET telnyx_messaging_profile_id = ?, telnyx_error_reason = NULL WHERE id = ?`,
    profileId, user.id,
  );
  return json({ messaging_profile_id: profileId, webhook_url: webhookUrl });
};
