/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { resolveOrgId } from "../../_shared/callingAccess.ts";
import { notifyQuotaExceeded } from "../../_shared/quotaNotify.ts";

/**
 * GET /api/calling/can-call - quick capability check the dialer button uses
 * to decide whether to enable click-to-call. Returns the same { canCall,
 * reasons[] } shape the calling service emits so CallButton works unchanged.
 *
 * Blockers we check (in order shown to the user):
 *  - Calling is not enabled for the workspace
 *  - The agent has no business number assigned
 *  - The active billing cycle is over plan limit AND auto-charge is off
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await resolveOrgId(env, user.id);
  if (!orgId) return error("Not part of an organization", 403);

  const reasons: string[] = [];

  const cfg = await queryFirst<{ calling_enabled: number; auto_charge_overage: number }>(
    env.D1DB,
    `SELECT calling_enabled, auto_charge_overage FROM calling_configurations WHERE org_id = ?`,
    orgId,
  );
  if (!cfg) {
    reasons.push("Calling is not configured for your workspace yet.");
  } else if (cfg.calling_enabled !== 1) {
    reasons.push("Calling is disabled for your workspace.");
  }

  const assigned = await queryFirst<{ id: string }>(
    env.D1DB,
    `SELECT id FROM phone_numbers WHERE assigned_to_user_id = ? AND status = 'ACTIVE' LIMIT 1`,
    user.id,
  );
  if (!assigned) {
    reasons.push("You don't have a business number assigned. Contact your admin.");
  }

  // Over-limit + auto-charge off -> block. With auto-charge on, calls flow
  // regardless of overage (matches the calling service's policy).
  if (cfg && cfg.auto_charge_overage !== 1) {
    const cycle = await queryFirst<{ id: string; plan_minute_limit: number }>(
      env.D1DB,
      `SELECT id, plan_minute_limit FROM billing_cycles WHERE org_id = ? AND status = 'ACTIVE' LIMIT 1`,
      orgId,
    );
    if (cycle) {
      const used = await queryFirst<{ total: number }>(
        env.D1DB,
        `SELECT COALESCE(SUM(minutes), 0) AS total FROM usage_records WHERE org_id = ? AND billing_cycle_id = ?`,
        orgId, cycle.id,
      );
      if ((used?.total ?? 0) >= cycle.plan_minute_limit) {
        reasons.push("Monthly calling minutes exhausted. Enable auto-charge overage to keep calling.");
        await notifyQuotaExceeded(env, orgId, "voice");
      }
    }
  }

  return json({ canCall: reasons.length === 0, reasons });
};
