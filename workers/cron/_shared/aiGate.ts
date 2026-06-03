/// <reference types="@cloudflare/workers-types" />
import { queryFirst } from "./db.ts";

/**
 * Send-time AI control gate for the cron dispatcher.
 *
 * The three AI switches (global master + per-agent Inbound/Outbound) are the
 * user's kill-switch. A queued `scheduled_message` row must NOT go out while
 * the switch that governs it is off - even though the lead was deliberately
 * enrolled (enrollment is intentionally un-gated; the SEND is the gated step).
 *
 * Outbound automation drips (rows with an `automation_id`) require the global
 * master AND the Outbound agent on. Inbound AI replies (rows without one - the
 * reactive qualification / orchestrator sends that were deferred for quiet
 * hours or a provider retry) require the global master AND the Inbound agent.
 *
 * Fail CLOSED, matching the rest of the app: a missing master row or agent row
 * reads as OFF (AI is off by default). When a gate is closed the cron HOLDS the
 * row in `status='scheduled'` so it flows the moment the switch is turned back
 * on - it is never cancelled here.
 */
type EnvLike = { D1DB: D1Database };

/** Level 1 - workspace master switch. Only an explicit '1' enables it. */
export async function isAiMasterEnabled(env: EnvLike, orgId: number): Promise<boolean> {
  const row = await queryFirst<{ value: string }>(
    env.D1DB,
    `SELECT value FROM app_settings WHERE org_id = ? AND key = 'ai_master_enabled'`,
    orgId,
  );
  return row?.value === "1";
}

/**
 * Level 2 - per-agent toggle. Outbound reads `ai_agent_state.enabled`
 * ((org, user, 'outbound')); Inbound reads `auto_response_settings.enabled`
 * (per owning user). Both default OFF when no row exists.
 */
export async function isAgentEnabled(
  env: EnvLike,
  orgId: number,
  userId: number,
  agentKey: "inbound" | "outbound",
): Promise<boolean> {
  if (agentKey === "outbound") {
    const row = await queryFirst<{ enabled: number }>(
      env.D1DB,
      `SELECT enabled FROM ai_agent_state
        WHERE org_id = ? AND user_id = ? AND agent_key = 'outbound' LIMIT 1`,
      orgId, userId,
    );
    return Boolean(row?.enabled);
  }
  const row = await queryFirst<{ enabled: number }>(
    env.D1DB,
    `SELECT enabled FROM auto_response_settings WHERE user_id = ? LIMIT 1`,
    userId,
  );
  return Boolean(row?.enabled);
}
