/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst } from "./db.ts";

/**
 * The AI Settings UI (src/components/ai-v3/AISettings.tsx) persists a handful of
 * Inbound/Outbound toggles inside agent_profile.persona_json under a `ui` blob.
 * These were previously SAVED but never enforced. This module is the single
 * source of truth for reading them and mapping them to engine values.
 *
 * Defaults MUST match the UI's displayed defaults (uiBool dflt=true, responseTime
 * "instant", followUpFrequency "standard") AND today's engine behavior: when a
 * key is ABSENT the engine must behave exactly as it did before this wiring, so
 * existing agents (whose persona_json has no `ui` key) see no change.
 */
export interface PersonaUiConfig {
  humanDetect?: boolean;
  responseTime?: "instant" | "30s" | "1m" | "2m";
  followUp?: boolean;
  nurture?: boolean;
  reengage?: boolean;
  followUpFrequency?: "aggressive" | "standard" | "light";
}

/** Parse the persona_json blob and return its `ui` sub-object (or {} on any miss). */
export function parsePersonaUi(personaJson: string | null | undefined): PersonaUiConfig {
  if (!personaJson) return {};
  try {
    const p = JSON.parse(personaJson) as { ui?: PersonaUiConfig };
    return p && typeof p === "object" && p.ui && typeof p.ui === "object" ? p.ui : {};
  } catch {
    return {};
  }
}

/** Boolean toggle that defaults ON (matches the UI's uiBool dflt=true). */
export const uiBoolOn = (v: boolean | undefined): boolean => v !== false;

/**
 * responseTime enum -> reply delay in ms. Returns null when the key is ABSENT so
 * callers fall back to the legacy persona.timing field (do NOT default to 0 here -
 * that would regress every existing agent from the 30s natural delay to instant).
 */
export function responseTimeToMs(v: string | undefined): number | null {
  switch (v) {
    case "instant": return 0;
    case "30s": return 30_000;
    case "1m": return 60_000;
    case "2m": return 120_000;
    default: return null;
  }
}

/**
 * followUpFrequency enum -> delay multiplier applied to follow-up cadence.
 * standard = 1.0 (no change = no regression); aggressive sends sooner, light later.
 */
export function frequencyMultiplier(v: string | undefined): number {
  switch (v) {
    case "aggressive": return 0.5;
    case "light": return 2.0;
    case "standard":
    default: return 1.0;
  }
}

/** Load the agent's persona UI toggles (keyed by org + owner). {} on any miss. */
export async function loadPersonaUi(env: Env, orgId: number, userId: number): Promise<PersonaUiConfig> {
  try {
    const row = await queryFirst<{ persona_json: string | null }>(
      env.D1DB,
      `SELECT persona_json FROM agent_profile WHERE org_id = ? AND user_id = ? LIMIT 1`,
      orgId, userId,
    );
    return parsePersonaUi(row?.persona_json);
  } catch {
    return {};
  }
}
