/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * POST /api/telnyx/provision/messaging-profile - ISV "Platform Umbrella".
 *
 * All agents share the ONE Master messaging profile (TELNYX_MESSAGING_PROFILE_ID)
 * whose single Webhook URL handles inbound + delivery receipts. We don't create
 * a per-client profile; this stamps the shared id onto the user.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const profileId = env.TELNYX_MESSAGING_PROFILE_ID;
  if (!profileId) {
    return error("Master messaging profile not configured (set TELNYX_MESSAGING_PROFILE_ID)", 503);
  }
  await execute(
    env.D1DB, `UPDATE "user" SET telnyx_messaging_profile_id = ? WHERE id = ?`, profileId, user.id,
  );
  return json({ messaging_profile_id: profileId, shared: true });
};
