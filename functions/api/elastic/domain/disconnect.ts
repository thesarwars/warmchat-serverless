/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { removeDomain } from "../../../_shared/elasticEmail.ts";

/**
 * POST /api/elastic/domain/disconnect - fully unwind the user's business-email
 * setup. Single entry point for ALL disconnect paths (BusinessEmailSetup's
 * Disconnect button, Option 2's discard X, Option 3's discard X) so they all
 * clean up the same state:
 *   - email_domain row
 *   - inbox_connection row(s) on this domain
 *   - OTP verification row(s) on this domain
 *   - DNS-TXT takeover token row(s) on this domain (Option 3)
 *   - the domain on Elastic's account (frees the slot for re-add later)
 *   - onboarding_progress.email_connected flag (if no other connections left)
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ domain?: string }>(request);
  const domain = (body?.domain || "").trim().toLowerCase();
  if (!domain) return error("domain is required", 400);

  await execute(env.D1DB, `DELETE FROM email_domain WHERE domain = ?`, domain);
  await execute(
    env.D1DB,
    `DELETE FROM inbox_connection
       WHERE user_id = ? AND provider = 'elastic'
         AND (email_address LIKE '%@' || ? OR elastic_from_email LIKE '%@' || ?)`,
    user.id, domain, domain,
  );
  await execute(
    env.D1DB,
    `DELETE FROM business_email_verification
       WHERE user_id = ? AND email LIKE '%@' || ?`,
    user.id, domain,
  );
  // Clean up any takeover token (Option 3) - both pending and consumed, since
  // disconnect should fully unwind regardless of which path the user took.
  await execute(
    env.D1DB,
    `DELETE FROM domain_ownership_verification
       WHERE user_id = ? AND domain = ?`,
    user.id, domain,
  );

  // Remove the domain from the ElasticEmail account so it doesn't keep
  // occupying a slot on the shared account. Best-effort - failure doesn't
  // block the local disconnect (the user can re-add later regardless).
  await removeDomain(env, domain).catch(() => null);

  // Reset the onboarding flag so the funnel correctly shows "email not
  // connected" - otherwise Step 2 keeps the green "Email Connected" pill.
  // Only clear if the user has no other email connection left (e.g. Gmail).
  await execute(
    env.D1DB,
    `UPDATE onboarding_progress
        SET email_connected = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM inbox_connection WHERE user_id = ?
        )`,
    user.id, user.id,
  );

  return json({ success: true });
};
