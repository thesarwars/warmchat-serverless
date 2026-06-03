/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { requirePaidPlan } from "../../../_shared/billing.ts";

/**
 * POST /api/telnyx/provision/brand - ISV "Platform Umbrella" model.
 *
 * We do NOT register a per-client 10DLC brand (that incurs the $10/mo fee +
 * 3-month lock per user). Every agent runs under the ONE Master Brand that's
 * registered manually in the Telnyx console. This endpoint just stamps the
 * shared brand id onto the user so the activation UI can advance.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const gate = await requirePaidPlan(env, user.id);
  if (!gate.ok) return gate.error;

  const brandId = env.TELNYX_MASTER_BRAND_ID;
  if (!brandId) {
    return error(
      "Master brand not configured. Register ONE platform brand in Telnyx and set TELNYX_MASTER_BRAND_ID - we never create per-client brands.",
      503,
    );
  }
  await execute(
    env.D1DB,
    `UPDATE "user" SET telnyx_brand_id = ?, telnyx_error_reason = NULL WHERE id = ?`,
    brandId, user.id,
  );
  return json({ brand_id: brandId, shared: true });
};
