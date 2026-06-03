/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser, type UserRow } from "../../_shared/auth.ts";
import { getUsageSummary } from "../../_shared/usageCounter.ts";
import { planLimitsFor } from "../../_shared/plans.ts";
import { validateBusinessAddress } from "../../_shared/addressValidator.ts";

/**
 * Build the profile payload shared by /api/profile/me and /api/bootstrap/me.
 * Kept out of the request handler so the bootstrap route can call it directly
 * without re-running auth or paying its CPU cost a second time.
 */
export async function getProfileSnapshot(env: Env, user: UserRow) {
  const extra = await queryFirst<{ business_address: string | null }>(
    env.D1DB, `SELECT business_address FROM "user" WHERE id = ?`, user.id,
  );

  const membership = await queryFirst<{
    org_id: number;
    org_name: string;
    plan: string | null;
    subscription_status: string | null;
    role_name: string | null;
  }>(
    env.D1DB,
    `SELECT o.id   AS org_id,
            o.name AS org_name,
            o.plan AS plan,
            o.subscription_status AS subscription_status,
            r.name AS role_name
       FROM membership m
       JOIN organization o ON o.id = m.org_id
       LEFT JOIN role r ON r.id = m.role_id
      WHERE m.user_id = ?
      LIMIT 1`,
    user.id,
  );

  const plan = membership?.plan || "free_channel";
  const usageSummary = membership
    ? await getUsageSummary(env, membership.org_id, plan)
    : null;

  const orgPayload = membership
    ? {
        id: membership.org_id,
        name: membership.org_name,
        plan: membership.plan,
        subscription_status: membership.subscription_status,
      }
    : null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    is_email_confirmed: Boolean(user.is_email_confirmed),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      business_address: extra?.business_address ?? null,
    },
    org: orgPayload,
    organization: orgPayload,
    plan: { name: plan, limits: planLimitsFor(plan) },
    usage_summary: usageSummary,
    role: membership?.role_name ?? null,
  };
}

/**
 * GET /api/profile/me - alias of /api/auth/profile/me (both paths are
 * exposed). Same payload shape: { id, name, email, is_email_confirmed,
 * org, role }.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  return json(await getProfileSnapshot(env, user));
};

/**
 * PUT /api/profile/me - update editable agent-level profile fields.
 *
 * Currently handles `name` and `business_address` (the latter is required for
 * the CAN-SPAM footer on marketing emails). `company_name` and `about` are
 * accepted for forward-compat with the existing settings UI but ignored until
 * we add their backing columns.
 */
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await readJson<{
    name?: unknown;
    business_address?: unknown;
  }>(request)) || {};

  const sets: string[] = [];
  const args: unknown[] = [];
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed) { sets.push("name = ?"); args.push(trimmed); }
  }
  if (typeof body.business_address === "string") {
    // Empty string clears the address (re-blocks marketing email sends).
    // Non-empty strings must pass the same validator the client uses; we
    // re-run server-side so a tampered client can't sneak placeholder text
    // through and bypass CAN-SPAM.
    const value = body.business_address.trim();
    if (value) {
      const reason = validateBusinessAddress(value);
      if (reason) return error(reason, 400, { code: "INVALID_BUSINESS_ADDRESS" });
    }
    sets.push("business_address = ?");
    args.push(value || null);
  }
  if (sets.length === 0) return error("No supported fields provided", 400);
  args.push(user.id);
  await execute(env.D1DB, `UPDATE "user" SET ${sets.join(", ")} WHERE id = ?`, ...args);

  const updated = await queryFirst<{ name: string | null; email: string; business_address: string | null }>(
    env.D1DB, `SELECT name, email, business_address FROM "user" WHERE id = ?`, user.id,
  );
  return json({
    user: {
      id: user.id,
      name: updated?.name ?? user.name,
      email: updated?.email ?? user.email,
      business_address: updated?.business_address ?? null,
    },
  });
};
