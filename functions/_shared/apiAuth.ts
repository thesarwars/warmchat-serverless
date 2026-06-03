/// <reference types="@cloudflare/workers-types" />

/**
 * API-key authentication for the external integration surface
 * (/api/integrations/v1/**). Unlike requireUser (session cookie / 1-hour JWT),
 * this resolves the org from a long-lived per-org key with NO browser session,
 * which is what a standing Zap needs.
 */
import { queryFirst, execute } from "./db.ts";
import { hashApiKey, looksLikeApiKey } from "./apiKeys.ts";
import type { Env } from "./env.ts";

export interface ApiKeyAuth {
  orgId: number;
  apiKeyId: number;
  createdByUserId: number | null;
  scopes: string[];
}

interface ApiKeyRow {
  id: number;
  org_id: number;
  created_by_user_id: number | null;
  scopes: string;
}

/** Pull the raw key from `Authorization: Bearer <key>` or `X-API-Key`. */
function readApiKey(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  const direct = request.headers.get("X-API-Key");
  return direct ? direct.trim() : null;
}

/**
 * Resolve the org behind an integration API key. Returns null when the key is
 * missing, malformed, unknown, revoked, or lacks the required scope - callers
 * respond 401/403. Touches `last_used_at` best-effort (failure never blocks).
 */
export async function requireApiKey(
  env: Env,
  request: Request,
  scope?: string,
): Promise<ApiKeyAuth | null> {
  const raw = readApiKey(request);
  if (!raw || !looksLikeApiKey(raw)) return null;

  const keyHash = await hashApiKey(raw);
  const row = await queryFirst<ApiKeyRow>(
    env.D1DB,
    `SELECT id, org_id, created_by_user_id, scopes
       FROM api_key
      WHERE key_hash = ? AND revoked_at IS NULL
      LIMIT 1`,
    keyHash,
  );
  if (!row) return null;

  const scopes = row.scopes.split(",").map((s) => s.trim()).filter(Boolean);
  if (scope && !scopes.includes(scope)) return null;

  // Best-effort usage stamp; never let a write failure reject a valid key.
  try {
    await execute(env.D1DB, `UPDATE api_key SET last_used_at = ? WHERE id = ?`, new Date().toISOString(), row.id);
  } catch {
    /* ignore */
  }

  return {
    orgId: row.org_id,
    apiKeyId: row.id,
    createdByUserId: row.created_by_user_id,
    scopes,
  };
}
