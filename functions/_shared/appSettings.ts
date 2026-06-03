/// <reference types="@cloudflare/workers-types" />
import { queryFirst, execute } from "./db.ts";

/**
 * Tiny key/value helper backed by the `app_settings` D1 table. Used for
 * runtime-toggleable flags that we don't want to redeploy for - currently
 * just `mock_sends_enabled`, but the table is generic. Pass `orgId` to scope
 * to a single tenant, or null/omit for the system-wide row.
 *
 * Both Pages Functions (Env) and the cron Worker (CronEnv) call in here, so
 * the env type only needs to expose D1DB plus the optional MOCK_SEND_APIS
 * fallback we read when the DB row hasn't been set yet.
 */
type EnvLike = { D1DB: D1Database; MOCK_SEND_APIS?: string };

export async function getAppSetting(
  env: EnvLike,
  key: string,
  orgId: number | null = null,
): Promise<string | null> {
  const row = await queryFirst<{ value: string }>(
    env.D1DB,
    orgId == null
      ? `SELECT value FROM app_settings WHERE org_id IS NULL AND key = ?`
      : `SELECT value FROM app_settings WHERE org_id = ? AND key = ?`,
    ...(orgId == null ? [key] : [orgId, key]),
  );
  return row?.value ?? null;
}

export async function setAppSetting(
  env: EnvLike,
  key: string,
  value: string,
  orgId: number | null = null,
): Promise<void> {
  // D1 doesn't enforce the UNIQUE(org_id, key) match when one side is NULL
  // (SQLite NULL semantics), so the system-wide and per-org branches are
  // separate INSERT/UPDATE pairs. Two queries either way - simpler than
  // INSERT ... ON CONFLICT with NULL keys.
  if (orgId == null) {
    const existing = await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM app_settings WHERE org_id IS NULL AND key = ?`,
      key,
    );
    if (existing) {
      await execute(
        env.D1DB,
        `UPDATE app_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        value,
        existing.id,
      );
    } else {
      await execute(
        env.D1DB,
        `INSERT INTO app_settings (org_id, key, value) VALUES (NULL, ?, ?)`,
        key,
        value,
      );
    }
    return;
  }
  const existing = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM app_settings WHERE org_id = ? AND key = ?`,
    orgId,
    key,
  );
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE app_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      value,
      existing.id,
    );
  } else {
    await execute(
      env.D1DB,
      `INSERT INTO app_settings (org_id, key, value) VALUES (?, ?, ?)`,
      orgId,
      key,
      value,
    );
  }
}

function parseBool(v: string | null | undefined): boolean {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Is the mock send layer currently active for `orgId`?
 *
 * Precedence: the per-org `mock_sends_enabled` row wins if present; else the
 * system-wide row; else the `MOCK_SEND_APIS` env var. The env-var fallback
 * keeps existing `.dev.vars` / `wrangler.toml` overrides working when nobody
 * has touched the DB row yet.
 */
export async function isMockSendsEnabled(
  env: EnvLike,
  orgId: number | null = null,
): Promise<boolean> {
  if (orgId != null) {
    const perOrg = await getAppSetting(env, "mock_sends_enabled", orgId);
    if (perOrg != null) return parseBool(perOrg);
  }
  const global = await getAppSetting(env, "mock_sends_enabled", null);
  if (global != null) return parseBool(global);
  return parseBool(env.MOCK_SEND_APIS);
}
