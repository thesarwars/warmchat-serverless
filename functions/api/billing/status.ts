/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

export interface BillingSnapshot {
  plan: string;
  subscription_status: string;
  plan_started_at: string | null;
  is_active: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  org_id: number;
}

/**
 * Shared snapshot used by GET /api/billing/status and /api/bootstrap/me.
 * Returns null when the user has no org membership so the bootstrap caller can
 * decide whether to omit billing rather than 403 the whole bundle.
 */
export async function getBillingSnapshot(env: Env, userId: number): Promise<BillingSnapshot | null> {
  const row = await queryFirst<{
    plan: string | null; subscription_status: string | null;
    plan_started_at: string | null;
    stripe_customer_id: string | null; stripe_subscription_id: string | null;
    org_id: number;
  }>(
    env.D1DB,
    `SELECT o.plan, o.subscription_status, o.plan_started_at, o.stripe_customer_id,
            o.stripe_subscription_id, o.id AS org_id
       FROM membership m JOIN organization o ON o.id = m.org_id
      WHERE m.user_id = ? LIMIT 1`,
    userId,
  );
  if (!row) return null;
  const plan = row.plan || "free_channel";
  const status = row.subscription_status || (plan === "free_channel" ? "free" : "active");
  const isActive = status === "free" || status === "active" || status === "trialing";
  return {
    plan,
    subscription_status: status,
    plan_started_at: row.plan_started_at,
    is_active: isActive,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    org_id: row.org_id,
  };
}

/**
 * GET /api/billing/status - coarse-grained billing snapshot for the UI.
 * Reads org.plan / subscription_status + stripe ids. Live Stripe sync is Phase 4.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const snapshot = await getBillingSnapshot(env, user.id);
  if (!snapshot) return error("Not part of an organization", 403);
  return json(snapshot);
};
