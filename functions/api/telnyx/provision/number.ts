/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { requirePaidPlan } from "../../../_shared/billing.ts";
import { telnyxCall, telnyxAssignNumberToCampaign } from "../../../_shared/telnyx.ts";
import { ensureCallingForNumber } from "../../../_shared/calling/provision.ts";

/**
 * POST /api/telnyx/provision/number - buy a Telnyx number, attach it to the
 * platform's SINGLE Master messaging profile, and link it to the SINGLE Master
 * 10DLC campaign. ISV "Platform Umbrella" model - we NEVER create per-client
 * brands/campaigns
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  // Buying a number costs money - require an active paid plan.
  const gate = await requirePaidPlan(env, user.id);
  if (!gate.ok) return gate.error;

  const profileId = env.TELNYX_MESSAGING_PROFILE_ID;
  const campaignId = env.TELNYX_MASTER_CAMPAIGN_ID;
  if (!profileId || !campaignId) {
    return error("Master messaging profile / campaign not configured (set TELNYX_MESSAGING_PROFILE_ID + TELNYX_MASTER_CAMPAIGN_ID)", 503);
  }

  const body = await readJson<{ phone_number?: string }>(request);
  const requested = (body?.phone_number || "").trim();
  if (!requested) return error("phone_number is required", 400);

  // 1. Order the number onto the Master messaging profile.
  const order = await telnyxCall<{ id: string; phone_numbers: Array<{ id?: string; phone_number: string }> }>(
    env, "/v2/number_orders", {
      method: "POST",
      body: {
        phone_numbers: [{ phone_number: requested }],
        messaging_profile_id: profileId,
      },
    },
  );
  if (!order.ok) return error(order.error.message, order.error.status);
  const orderedPhone = order.data.phone_numbers?.[0];
  const assignedNumber = orderedPhone?.phone_number || requested;
  const telnyxPhoneNumberId = orderedPhone?.id;

  // 2. Link the number to the Master 10DLC campaign (best-effort - Telnyx may
  //    need a moment after the order settles; assign-campaign can be retried).
  const assign = await telnyxAssignNumberToCampaign(env, assignedNumber, campaignId);
  const effectiveCampaignId = assign.ok ? assign.data.campaignId : campaignId;

  // 3. Wire the number to the platform's Voice Call Control connection so the
  //    same number can also place / receive calls. Best-effort - failure here
  //    doesn't block SMS, the user can retry from the calling settings page.
  let voiceWired = false;
  if (env.TELNYX_CONNECTION_ID) {
    // /v2/phone_numbers/{id} - "id" can be the E.164 number itself, no need
    // to round-trip through the order id.
    const voiceUpdate = await telnyxCall(env, `/v2/phone_numbers/${encodeURIComponent(assignedNumber)}`, {
      method: "PATCH",
      body: {
        connection_id: env.TELNYX_CONNECTION_ID,
        ...(env.TELNYX_VOICE_PROFILE_ID ? { voice: { usage_payment_method: "pay-per-minute" } } : {}),
      },
    });
    voiceWired = voiceUpdate.ok;
  }

  // Keep the real Telnyx failure reason so the UI can show it (and retry).
  const assignError = assign.ok ? null : assign.error.message;
  await execute(
    env.D1DB,
    `UPDATE "user"
        SET telnyx_phone_number = ?,
            telnyx_messaging_profile_id = ?,
            telnyx_campaign_id = ?,
            telnyx_campaign_number_status = ?,
            telnyx_sms_status = ?,
            telnyx_error_reason = ?
      WHERE id = ?`,
    assignedNumber, profileId, effectiveCampaignId,
    assign.ok ? "assigned" : "purchased",
    assign.ok ? "approved" : "pending",
    assignError,
    user.id,
  );

  // Mirror the SMS assignment into the calling system: a phone_numbers row
  // (so /api/calling/can-call sees a business number) and a calling_configurations
  // row (so the dialer button + the inbound webhook agree the org is configured).
  // Best-effort - the SMS purchase is the user-visible action; calling rows are
  // a side effect, so a failure here shouldn't fail the purchase response.
  try {
    await ensureCallingForNumber(env, {
      userId: user.id,
      phoneNumber: assignedNumber,
      providerSid: telnyxPhoneNumberId ?? null,
    });
  } catch (err) {
    console.warn("[provision] ensureCallingForNumber failed", err);
  }

  return json({
    phone_number: assignedNumber,
    messaging_profile_id: profileId,
    order_id: order.data.id,
    campaign_id: effectiveCampaignId,
    assigned: assign.ok,
    assign_error: assignError,
    voice_wired: voiceWired,
  });
};
