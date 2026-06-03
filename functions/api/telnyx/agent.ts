/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/telnyx/agent - current user's Telnyx 10DLC state.
 *
 * Response shape keeps the existing frontend (Inbox.tsx, ConnectPhoneNumber.tsx,
 * NewCampaign.tsx, Onboarding.tsx) reading `data.user.telnyx_*` and
 * `data.activation.*`.
 * Flattening this response was a regression that broke the inbox SMS gate.
 */

type UserRow = {
  id: number;
  name: string | null;
  email: string | null;
  telnyx_phone_number: string | null;
  telnyx_sms_status: string | null;
  telnyx_messaging_profile_id: string | null;
  telnyx_brand_id: string | null;
  telnyx_campaign_id: string | null;
  telnyx_campaign_number_status: string | null;
  telnyx_error_reason: string | null;
  agent_slug: string | null;
};

type ActivationRow = {
  id: number;
  user_id: number;
  business_type: string | null;
  legal_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  brokerage_name: string | null;
  website: string | null;
  privacy_policy_url: string | null;
  terms_url: string | null;
  ein: string | null;
  ssn_last4: string | null;
  sole_prop_verification_status: string | null;
  sole_prop_verification_id: string | null;
  sole_prop_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function slugify(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function preferredPublicName(user: UserRow, activation: ActivationRow | null): string {
  const candidates = [
    activation?.legal_name?.trim(),
    user.name?.trim(),
    user.email ? user.email.split("@")[0]?.trim() : null,
    `agent-${user.id}`,
  ];
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return `agent-${user.id}`;
}

async function ensureAgentSlug(
  env: Env,
  user: UserRow,
  activation: ActivationRow | null,
): Promise<string | null> {
  if (user.agent_slug) return user.agent_slug;
  const base = slugify(preferredPublicName(user, activation)) || `agent-${user.id}`;
  let candidate = base;
  let suffix = 2;
  // Resolve collisions with other users' slugs.
  while (
    await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM "user" WHERE agent_slug = ? AND id <> ?`,
      candidate,
      user.id,
    )
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  await execute(env.D1DB, `UPDATE "user" SET agent_slug = ? WHERE id = ?`, candidate, user.id);
  return candidate;
}

function frontendBaseUrl(env: Env): string {
  const base = env.FRONTEND_URL || env.PUBLIC_SITE_URL || env.PUBLIC_BASE_URL || "";
  return base.replace(/\/+$/, "");
}

function agentUrl(env: Env, slug: string | null, suffix: string): string | null {
  if (!slug) return null;
  const base = frontendBaseUrl(env);
  if (!base || !/^https?:\/\//.test(base)) return null;
  return `${base}${suffix.replace("{slug}", slug)}`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const auth = await requireUser(env, request);
  if (!auth) return error("Unauthorized", 401);

  const u = await queryFirst<UserRow>(
    env.D1DB,
    `SELECT id, name, email,
            telnyx_phone_number, telnyx_sms_status, telnyx_messaging_profile_id,
            telnyx_brand_id, telnyx_campaign_id, telnyx_campaign_number_status,
            telnyx_error_reason, agent_slug
       FROM "user" WHERE id = ?`,
    auth.id,
  );
  if (!u) return error("User not found", 404);

  const activation = await queryFirst<ActivationRow>(
    env.D1DB,
    `SELECT * FROM telnyx_sms_activation WHERE user_id = ?`,
    auth.id,
  );

  const slug = await ensureAgentSlug(env, u, activation);
  const displayName = preferredPublicName(u, activation).trim();

  return json({
    user: {
      id: u.id,
      telnyx_messaging_profile_id: u.telnyx_messaging_profile_id,
      telnyx_phone_number: u.telnyx_phone_number,
      telnyx_brand_id: u.telnyx_brand_id,
      telnyx_campaign_id: u.telnyx_campaign_id,
      telnyx_sms_status: u.telnyx_sms_status,
      telnyx_error_reason: u.telnyx_error_reason,
      telnyx_campaign_number_status: u.telnyx_campaign_number_status,
      agent_slug: slug,
      agent_page_url: agentUrl(env, slug, "/agents/{slug}"),
      agent_privacy_url: agentUrl(env, slug, "/agents/{slug}/privacy"),
      agent_terms_url: agentUrl(env, slug, "/agents/{slug}/terms"),
      agent_opt_in_url: slug ? agentUrl(env, slug, `/opt-in?slug=${encodeURIComponent(slug)}`) : null,
      agent_display_name: displayName,
    },
    activation: activation ?? null,
  });
};
