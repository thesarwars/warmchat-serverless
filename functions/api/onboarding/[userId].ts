/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/onboarding/:userId - current onboarding progress for a user.
 * Returns the row (or a sensible default with step=5 -> "done") so the post-
 * login routing in Login.tsx can decide between /onboarding and /dashboard.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const userId = Number(params.userId);
  if (!Number.isInteger(userId)) return error("Invalid user id", 400);
  // Self or same-org Owner/Manager can read; for simplicity self-only here.
  if (userId !== user.id) return error("Forbidden", 403);

  const row = await queryFirst<{
    step: number | null; goal: string | null;
    email_connected: number; sms_connected: number;
    selected_preset: number | null; flow_activated: number;
    payment_cleared: number; created_at: string | null; updated_at: string | null;
    brokerage: string | null; market: string | null; biz_role: string | null;
    goal_appts: number | null; goal_deals: number | null;
  }>(
    env.D1DB,
    `SELECT step, goal, email_connected, sms_connected, selected_preset,
            flow_activated, payment_cleared, created_at, updated_at,
            brokerage, market, biz_role, goal_appts, goal_deals
       FROM onboarding_progress WHERE user_id = ?`,
    userId,
  );

  // Was the user invited (vs self-serve)?
  const inv = await queryFirst<{ is_invited: number; business_address: string | null }>(
    env.D1DB, `SELECT is_invited, business_address FROM "user" WHERE id = ?`, userId);

  if (!row) {
    // No row -> treat as completed so Login routes straight to /dashboard.
    return json({
      step: 5, goal: null, email_connected: false, sms_connected: false,
      selected_preset: null, flow_activated: false, payment_cleared: false,
      is_invited: Boolean(inv?.is_invited),
    });
  }

  return json({
    step: row.step ?? 1,
    goal: row.goal,
    email_connected: Boolean(row.email_connected),
    sms_connected: Boolean(row.sms_connected),
    selected_preset: row.selected_preset,
    flow_activated: Boolean(row.flow_activated),
    payment_cleared: Boolean(row.payment_cleared),
    is_invited: Boolean(inv?.is_invited),
    business_address: inv?.business_address ?? null,
    brokerage: row.brokerage,
    market: row.market,
    role: row.biz_role,
    goal_appts: row.goal_appts,
    goal_deals: row.goal_deals,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
};
