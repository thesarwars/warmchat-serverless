/// <reference types="@cloudflare/workers-types" />

/**
 * Shared helpers for the external integration surface (/api/integrations/v1/**).
 * Keeps the public lead shape and the trigger-event whitelist in one place so
 * the REST API and the dispatcher agree on field names.
 */
import { queryFirst } from "./db.ts";
import type { Env } from "./env.ts";

/** Trigger events an external service may subscribe to (REST Hooks). */
export const INTEGRATION_EVENTS = [
  "lead.created",
  "lead.replied",
  "lead.status_changed",
  "appointment.booked",
] as const;

export type IntegrationEvent = (typeof INTEGRATION_EVENTS)[number];

export function isIntegrationEvent(value: unknown): value is IntegrationEvent {
  return typeof value === "string" && (INTEGRATION_EVENTS as readonly string[]).includes(value);
}

/** Curated, stable lead shape returned to external callers (Zapier field map). */
export function toLeadView(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    company: row.company ?? null,
    source: row.source ?? null,
    platform: row.platform ?? null,
    status: row.status ?? null,
    lead_type: row.lead_type ?? null,
    intent: row.intent ?? null,
    ai_status: row.ai_status ?? null,
    qualification_status: row.qualification_status ?? null,
    interest_level: row.interest_level ?? null,
    external_id: row.external_id ?? null,
    timezone: row.timezone ?? null,
    last_reply_at: row.last_reply_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

/**
 * A real user id to attribute outbound enrollment to. Prefers the user who
 * created the API key, falling back to the org owner so scheduled_message.user_id
 * is always a valid user.
 */
export async function resolveActorUserId(env: Env, orgId: number, createdByUserId: number | null): Promise<number | null> {
  if (createdByUserId) return createdByUserId;
  const owner = await queryFirst<{ owner_id: number | null }>(
    env.D1DB,
    `SELECT owner_id FROM organization WHERE id = ?`,
    orgId,
  );
  return owner?.owner_id ?? null;
}
