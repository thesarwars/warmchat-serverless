/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { execute, queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requirePaidPlan } from "../../_shared/billing.ts";
import { telnyxAssignNumberToCampaign } from "../../_shared/telnyx.ts";

/**
 * POST /api/telnyx/activate-texting - finalize SMS activation under the ISV
 * "Platform Umbrella": stamp the shared Master messaging-profile + brand +
 * campaign onto the user, and (if they already have a number) link that number
 * to the Master campaign. No per-client brand/campaign is ever created.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const gate = await requirePaidPlan(env, user.id);
  if (!gate.ok) return gate.error;

  const profileId = env.TELNYX_MESSAGING_PROFILE_ID;
  const campaignId = env.TELNYX_MASTER_CAMPAIGN_ID;
  if (!profileId || !campaignId) {
    return error("Master messaging profile / campaign not configured (set TELNYX_MESSAGING_PROFILE_ID + TELNYX_MASTER_CAMPAIGN_ID)", 503);
  }

  const u = await queryFirst<{ telnyx_phone_number: string | null }>(
    env.D1DB, `SELECT telnyx_phone_number FROM "user" WHERE id = ?`, user.id,
  );
  if (!u) return error("User not found", 404);

  let assigned = false;
  let effectiveCampaignId = campaignId;
  if (u.telnyx_phone_number) {
    const r = await telnyxAssignNumberToCampaign(env, u.telnyx_phone_number, campaignId);
    assigned = r.ok;
    if (r.ok) effectiveCampaignId = r.data.campaignId;
  }

  await execute(
    env.D1DB,
    `UPDATE "user"
        SET telnyx_messaging_profile_id = ?,
            telnyx_brand_id = COALESCE(?, telnyx_brand_id),
            telnyx_campaign_id = ?,
            telnyx_campaign_number_status = ?,
            telnyx_sms_status = ?,
            telnyx_error_reason = NULL
      WHERE id = ?`,
    profileId, env.TELNYX_MASTER_BRAND_ID || null, effectiveCampaignId,
    u.telnyx_phone_number ? (assigned ? "assigned" : "purchased") : null,
    u.telnyx_phone_number && assigned ? "approved" : "pending",
    user.id,
  );
  return json({
    messaging_profile_id: profileId,
    brand_id: env.TELNYX_MASTER_BRAND_ID || null,
    campaign_id: effectiveCampaignId,
    phone_number: u.telnyx_phone_number,
    assigned,
  });
};
