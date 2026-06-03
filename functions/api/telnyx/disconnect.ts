/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { releaseCallingForUser } from "../../_shared/calling/provision.ts";

/**
 * POST /api/telnyx/disconnect - reset local SMS connection state for the
 * signed-in user. We only clear local rows; the remote 10DLC brand/campaign
 * objects in Telnyx are left intact so re-onboarding can reuse them.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  await execute(
    env.D1DB,
    `UPDATE "user"
        SET telnyx_phone_number = NULL,
            telnyx_brand_id = NULL,
            telnyx_campaign_id = NULL,
            telnyx_messaging_profile_id = NULL,
            telnyx_sms_status = 'inactive',
            telnyx_error_reason = NULL,
            telnyx_campaign_number_status = NULL
      WHERE id = ?`,
    user.id,
  );
  await execute(
    env.D1DB,
    `UPDATE onboarding_progress SET sms_connected = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
    user.id,
  );
  // Mirror the disconnect into the calling system: release the user's active
  // phone_numbers row so the dialer and the inbound webhook stop routing it.
  try {
    await releaseCallingForUser(env, user.id);
  } catch (err) {
    console.warn("[disconnect] releaseCallingForUser failed", err);
  }
  return json({ ok: true, message: "SMS connection removed" });
};
