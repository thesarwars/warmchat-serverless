/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { callerOrgId } from "../../_shared/aiAgents.ts";
import { AI_LIMITS, clampText } from "../../_shared/aiLimits.ts";

// Editable columns of agent_profile (everything except keys/timestamps).
const FIELDS = [
  "agent_name", "brokerage_name", "phone", "email", "website", "license_number",
  "service_areas", "years_experience", "languages", "specialties",
  "buyer_commission", "seller_commission", "min_commission_rules",
  "current_listings", "past_sales", "avg_price_point",
  "preferred_lender", "preferred_title_escrow", "calendar_link", "tone_preference",
  "persona_json",
] as const;

// Per-field max length (everything that feeds the prompt is bounded). Longer
// free-text fields get profileLong; persona_json gets its own cap; the rest are
// short single-line fields.
const FIELD_MAX: Record<string, number> = {
  min_commission_rules: AI_LIMITS.profileLong, current_listings: AI_LIMITS.profileLong,
  past_sales: AI_LIMITS.profileLong, service_areas: AI_LIMITS.profileLong,
  languages: AI_LIMITS.profileShort, specialties: AI_LIMITS.profileLong,
  persona_json: AI_LIMITS.personaJson,
};

type ProfileBody = Partial<Record<(typeof FIELDS)[number], unknown>>;

function selectProfile(env: Env, orgId: number, userId: number) {
  return queryFirst<Record<string, unknown>>(
    env.D1DB,
    `SELECT ${FIELDS.join(", ")} FROM agent_profile WHERE org_id = ? AND user_id = ? LIMIT 1`,
    orgId, userId,
  );
}

/** GET /api/ai/agent-profile -> the agent's knowledge profile (empty shape if unset). */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const row = await selectProfile(env, orgId, user.id);
  if (row) return json(row);
  const empty: Record<string, unknown> = {};
  for (const f of FIELDS) empty[f] = null;
  return json(empty);
};

/** PATCH /api/ai/agent-profile -> upsert. JSON-array fields are stored verbatim as TEXT. */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<ProfileBody>(request)) || {};

  const normalize = (key: string, v: unknown): unknown => {
    if (v === undefined || v === null) return null;
    if (key === "years_experience") {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), 99) : null;
    }
    const max = FIELD_MAX[key] ?? AI_LIMITS.profileShort;
    // service_areas / languages / specialties (arrays) + persona_json (object)
    // arrive structured -> store as JSON text (clamped so it can't bloat).
    if (typeof v === "object") {
      const jsonStr = JSON.stringify(v);
      return jsonStr.length > max ? jsonStr.slice(0, max) : jsonStr;
    }
    return clampText(v, max);
  };

  const cur = await selectProfile(env, orgId, user.id);
  const values = FIELDS.map((f) =>
    f in body ? normalize(f, body[f]) : (cur ? cur[f] ?? null : null),
  );

  const cols = FIELDS.join(", ");
  const placeholders = FIELDS.map(() => "?").join(", ");
  const updates = FIELDS.map((f) => `${f} = excluded.${f}`).join(", ");

  await execute(
    env.D1DB,
    `INSERT INTO agent_profile (org_id, user_id, ${cols})
     VALUES (?, ?, ${placeholders})
     ON CONFLICT (org_id, user_id) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP`,
    orgId, user.id, ...values,
  );

  return json(await selectProfile(env, orgId, user.id));
};
