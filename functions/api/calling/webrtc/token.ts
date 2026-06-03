/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { execute, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { resolveOrgId } from "../../../_shared/callingAccess.ts";
import { createCredential, createOnDemandToken } from "../../../_shared/telnyx/client.ts";

/**
 * POST /api/calling/webrtc/token - bootstrap the browser's @telnyx/webrtc SDK.
 *
 * Flow on first call for a user:
 *   1. Look up `user.telnyx_credential_id`. If missing, create a Telnyx
 *      telephony credential under our shared credential connection
 *      (TELNYX_CREDENTIAL_CONNECTION_ID) - that returns { id, sip_username }.
 *      Persist id + derived SIP URI on the user row.
 *   2. Mint a short-lived (~1h) JWT against that credential - the browser
 *      uses it as `login_token` for TelnyxRTC. The raw SIP credentials never
 *      leave this server.
 *
 * Response: { loginToken, sipUri, expiresAt }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await resolveOrgId(env, user.id);
  if (!orgId) return error("Not part of an organization", 403);

  if (!env.TELNYX_CREDENTIAL_CONNECTION_ID) {
    return error("WebRTC not configured (TELNYX_CREDENTIAL_CONNECTION_ID)", 503);
  }

  const profile = await queryFirst<{ telnyx_credential_id: string | null; telnyx_sip_uri: string | null; email: string }>(
    env.D1DB,
    `SELECT telnyx_credential_id, telnyx_sip_uri, email FROM "user" WHERE id = ?`,
    user.id,
  );
  if (!profile) return error("User not found", 404);

  let credentialId = profile.telnyx_credential_id;
  let sipUri = profile.telnyx_sip_uri;

  if (!credentialId) {
    const created = await createCredential(env, {
      name: `wc-agent-${user.id}-${profile.email}`,
      tag: String(user.id),
    });
    if (!created.ok) return error(`Failed to create SIP credential: ${created.error.message}`, 502);
    credentialId = created.data.id;
    const domain = env.TELNYX_SIP_DOMAIN || "sip.telnyx.com";
    sipUri = `sip:${created.data.sip_username}@${domain}`;
    await execute(
      env.D1DB,
      `UPDATE "user" SET telnyx_credential_id = ?, telnyx_sip_uri = ? WHERE id = ?`,
      credentialId, sipUri, user.id,
    );
  }

  const tokenRes = await createOnDemandToken(env, credentialId);
  if (!tokenRes.ok) return error(`Failed to mint login token: ${tokenRes.error.message}`, 502);

  // Telnyx tokens are typically valid for ~1 hour; we don't get an explicit
  // expiry back from the bare-JWT endpoint, so report a conservative 50 min.
  const expiresAt = new Date(Date.now() + 50 * 60_000).toISOString();
  return json({
    loginToken: tokenRes.data,
    sipUri: sipUri ?? "",
    expiresAt,
  });
};
