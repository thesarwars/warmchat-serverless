/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { callerOrgId, AGENT_KEYS } from "../../_shared/aiAgents.ts";

const DEFAULT_NAMES: Record<string, string> = {
  assistant: "AI Agent", inbound: "Inbound AI", outbound: "Outbound AI",
};

// app_settings keys surfaced on the AI Settings page (workspace-scoped).
const SETTING_KEYS = {
  master: "ai_master_enabled",
  defaultTone: "ai_default_tone",
  afterHours: "ai_after_hours",
  escalation: "ai_escalation",
} as const;

async function readSettings(env: Env, orgId: number): Promise<Record<string, string>> {
  const rows = await queryAll<{ key: string; value: string }>(
    env.D1DB, `SELECT key, value FROM app_settings WHERE org_id = ?`, orgId);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function writeSetting(env: Env, orgId: number, key: string, value: string): Promise<void> {
  await execute(
    env.D1DB,
    `INSERT INTO app_settings (org_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT (org_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    orgId, key, value,
  );
}

/** GET /api/ai/settings -> master switch, voice/tone, hours, escalation, spend, per-agent toggles. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const s = await readSettings(env, orgId);
  const org = await queryFirst<{ timezone: string; quiet_hours_start: number; quiet_hours_end: number }>(
    env.D1DB, `SELECT timezone, quiet_hours_start, quiet_hours_end FROM organization WHERE id = ?`, orgId);

  const states = await queryAll<{ agent_key: string; enabled: number; display_name: string | null }>(
    env.D1DB,
    `SELECT agent_key, enabled, display_name FROM ai_agent_state WHERE org_id = ? AND user_id = ?`,
    orgId, user.id,
  );
  const byKey = new Map(states.map((r) => [r.agent_key, r]));

  return json({
    // AI is OFF by default - agents only run once the user turns it on.
    master_enabled: s[SETTING_KEYS.master] === "1",
    default_tone: s[SETTING_KEYS.defaultTone] || "friendly",
    after_hours: s[SETTING_KEYS.afterHours] || "reply_softer",
    escalation: s[SETTING_KEYS.escalation] || "legal_finance",
    working_hours: {
      timezone: org?.timezone ?? "America/New_York",
      start: org?.quiet_hours_start ?? 8,
      end: org?.quiet_hours_end ?? 21,
    },
    agents: AGENT_KEYS.map((key) => {
      const r = byKey.get(key);
      return {
        key,
        name: r?.display_name || DEFAULT_NAMES[key],
        enabled: r ? Boolean(r.enabled) : false,
      };
    }),
  });
};

interface PutBody {
  master_enabled?: boolean;
  default_tone?: string;
  after_hours?: string;
  escalation?: string;
  working_hours?: { start?: number; end?: number };
}

/** PATCH /api/ai/settings -> persist any provided workspace-level AI settings. */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<PutBody>(request)) || {};

  if (body.master_enabled !== undefined) await writeSetting(env, orgId, SETTING_KEYS.master, body.master_enabled ? "1" : "0");
  if (body.default_tone !== undefined) await writeSetting(env, orgId, SETTING_KEYS.defaultTone, String(body.default_tone));
  if (body.after_hours !== undefined) await writeSetting(env, orgId, SETTING_KEYS.afterHours, String(body.after_hours));
  if (body.escalation !== undefined) await writeSetting(env, orgId, SETTING_KEYS.escalation, String(body.escalation));

  if (body.working_hours) {
    const start = Number(body.working_hours.start);
    const end = Number(body.working_hours.end);
    if (Number.isInteger(start) && Number.isInteger(end)) {
      await execute(
        env.D1DB,
        `UPDATE organization SET quiet_hours_start = ?, quiet_hours_end = ? WHERE id = ?`,
        start, end, orgId,
      );
    }
  }

  // Master switch off pauses every agent; on restores per-agent state untouched.
  if (body.master_enabled === false) {
    await execute(
      env.D1DB,
      `UPDATE auto_response_settings SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE org_id = ?`, orgId,
    );
  }

  // Re-read for a consistent response.
  return onRequestGet(context);
};
