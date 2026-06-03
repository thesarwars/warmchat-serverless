/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { execute, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { telnyxAssignNumberToCampaign } from "../../../_shared/telnyx.ts";

/**
 * POST /api/telnyx/provision/assign-campaign - link the user's number to the
 * platform's SINGLE Master 10DLC campaign (from TELNYX_MASTER_CAMPAIGN_ID).
 * Umbrella model - never a per-client campaign.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const campaignId = env.TELNYX_MASTER_CAMPAIGN_ID;
  if (!campaignId) return error("Master campaign not configured (set TELNYX_MASTER_CAMPAIGN_ID)", 503);

  const u = await queryFirst<{ telnyx_phone_number: string | null }>(
    env.D1DB, `SELECT telnyx_phone_number FROM "user" WHERE id = ?`, user.id,
  );
  if (!u?.telnyx_phone_number) return error("No Telnyx number provisioned", 400);

  const res = await telnyxAssignNumberToCampaign(env, u.telnyx_phone_number, campaignId);
  if (!res.ok) {
    // Persist the reason so the dashboard / onboarding can show it after reload
    // and offer a retry.
    await execute(
      env.D1DB,
      `UPDATE "user" SET telnyx_error_reason = ? WHERE id = ?`,
      res.error.message, user.id,
    );
    return error(res.error.message, res.error.status);
  }
  const effectiveCampaignId = res.data.campaignId;
  await execute(
    env.D1DB,
    `UPDATE "user"
        SET telnyx_campaign_id = ?, telnyx_campaign_number_status = 'assigned',
            telnyx_sms_status = 'approved', telnyx_error_reason = NULL
      WHERE id = ?`,
    effectiveCampaignId, user.id,
  );
  return json({ success: true, campaign_id: effectiveCampaignId });
};
