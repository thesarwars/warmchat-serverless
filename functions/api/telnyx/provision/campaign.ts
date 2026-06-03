/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { requirePaidPlan } from "../../../_shared/billing.ts";

/**
 * POST /api/telnyx/provision/campaign - ISV "Platform Umbrella" model.
 *
 * We do NOT register a per-client 10DLC campaign. Every agent shares the ONE
 * Master Campaign ("Low-Volume Mixed", $1.50/mo flat) registered manually in
 * the Telnyx console. This endpoint stamps the shared campaign id onto the
 * user; actually linking the agent's NUMBER to it happens in
 * /api/telnyx/provision/assign-campaign.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const gate = await requirePaidPlan(env, user.id);
  if (!gate.ok) return gate.error;

  const campaignId = env.TELNYX_MASTER_CAMPAIGN_ID;
  if (!campaignId) {
    return error(
      "Master campaign not configured. Register ONE platform campaign in Telnyx and set TELNYX_MASTER_CAMPAIGN_ID - we never create per-client campaigns.",
      503,
    );
  }
  await execute(
    env.D1DB,
    `UPDATE "user" SET telnyx_campaign_id = ?, telnyx_error_reason = NULL WHERE id = ?`,
    campaignId, user.id,
  );
  return json({ campaign_id: campaignId, shared: true });
};
