/// <reference types="@cloudflare/workers-types" />
import { queryAll, queryFirst } from "../db.ts";
import type { Env } from "../env.ts";

/**
 * D1 call row -> frontend CallSummary / CallDetails shape. The frontend types
 * are in src/types/calling.ts. We map our integer agent.id / lead.id to strings
 * for transport (the frontend treats them as opaque strings).
 */

export type CallRow = {
  id: string;
  provider_call_sid: string;
  direction: "OUTBOUND" | "INBOUND";
  status: string;
  from_number: string;
  to_number: string;
  lead_id: number | null;
  agent_id: number;
  business_number_id: string | null;
  agent_phone_number: string | null;
  customer_number: string | null;
  duration: number;
  recording_url: string | null;
  is_voicemail: number;
  voicemail_url: string | null;
  voicemail_duration: number | null;
  voicemail_heard: number;
  initiated_at: string;
  ringing_at: string | null;
  answered_at: string | null;
  completed_at: string | null;
  web_leg_sid: string | null;
  phone_leg_sid: string | null;
  answered_via: string | null;
  origin: string | null;
  provider_metadata: string | null;
  error_message: string | null;
  org_id: number;
};

export type CallSummaryJson = {
  id: string;
  direction: string;
  status: string;
  duration: number;
  initiatedAt: string;
  answeredAt: string | null;
  completedAt: string | null;
  fromNumber: string;
  toNumber: string;
  origin: string | null;
  answeredVia: string | null;
  isVoicemail: boolean;
  voicemailHeard: boolean;
  hasRecording: boolean;
  /** AI-derived, present once insights are processed. */
  sentiment?: "positive" | "neutral" | "negative";
  summary?: string;
  hasTasks: boolean;
  agent?: { id: string; name?: string; email?: string };
  businessNumber?: { id: string; phoneNumber: string };
  /** Lead name/id for the list row label (CallDetailsJson carries the fuller `lead`). */
  leadId?: string;
  leadName?: string;
};

export type CallDetailsJson = CallSummaryJson & {
  providerCallSid: string;
  customerNumber: string | null;
  agentPhoneNumber: string | null;
  lead?: { id: string; name?: string; phoneNumber: string };
  callEvents?: Array<{ id: string; eventType: string; timestamp: string; payload?: unknown }>;
  errorMessage: string | null;
};

type SummaryExtras = {
  sentiment?: "positive" | "neutral" | "negative" | null | undefined;
  summary?: string | null | undefined;
  hasTasks?: boolean;
  lead?: { id: number; name: string | null } | null | undefined;
};

function rowToSummary(
  row: CallRow,
  agent?: { name: string | null; email: string | null } | null,
  businessNumber?: { id: string; phone_number: string } | null,
  extras?: SummaryExtras,
): CallSummaryJson {
  const out: CallSummaryJson = {
    id: row.id,
    direction: row.direction,
    status: row.status,
    duration: row.duration,
    initiatedAt: row.initiated_at,
    answeredAt: row.answered_at,
    completedAt: row.completed_at,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    origin: row.origin,
    answeredVia: row.answered_via,
    isVoicemail: row.is_voicemail === 1,
    voicemailHeard: row.voicemail_heard === 1,
    hasRecording: !!row.recording_url,
    hasTasks: extras?.hasTasks ?? false,
  };
  if (extras?.sentiment) out.sentiment = extras.sentiment;
  if (extras?.summary) out.summary = extras.summary;
  if (agent) {
    out.agent = {
      id: String(row.agent_id),
      ...(agent.name ? { name: agent.name } : {}),
      ...(agent.email ? { email: agent.email } : {}),
    };
  }
  if (businessNumber) {
    out.businessNumber = { id: businessNumber.id, phoneNumber: businessNumber.phone_number };
  }
  if (extras?.lead) {
    out.leadId = String(extras.lead.id);
    if (extras.lead.name) out.leadName = extras.lead.name;
  }
  return out;
}

/** Fetch one call by id and serialize with agent + business number joins. */
export async function loadCallSummary(env: Env, callId: string): Promise<CallSummaryJson | null> {
  const row = await queryFirst<CallRow>(env.D1DB, `SELECT * FROM calls WHERE id = ?`, callId);
  if (!row) return null;
  const agent = await queryFirst<{ name: string | null; email: string | null }>(
    env.D1DB, `SELECT name, email FROM "user" WHERE id = ?`, row.agent_id);
  const bn = row.business_number_id
    ? await queryFirst<{ id: string; phone_number: string }>(
        env.D1DB, `SELECT id, phone_number FROM phone_numbers WHERE id = ?`, row.business_number_id)
    : null;
  return rowToSummary(row, agent, bn);
}

/** Full details - adds lead + last 50 call_events. */
export async function loadCallDetails(env: Env, callId: string): Promise<CallDetailsJson | null> {
  const summary = await loadCallSummary(env, callId);
  if (!summary) return null;
  const row = await queryFirst<CallRow>(env.D1DB, `SELECT * FROM calls WHERE id = ?`, callId);
  if (!row) return null;
  const lead = row.lead_id
    ? await queryFirst<{ id: number; name: string | null; phone: string | null }>(
        env.D1DB, `SELECT id, name, phone FROM lead WHERE id = ?`, row.lead_id)
    : null;
  const events = await queryAll<{ id: string; event_type: string; timestamp: string; payload: string | null }>(
    env.D1DB,
    `SELECT id, event_type, timestamp, payload FROM call_events WHERE call_id = ? ORDER BY timestamp DESC LIMIT 50`,
    callId,
  );
  const out: CallDetailsJson = {
    ...summary,
    providerCallSid: row.provider_call_sid,
    customerNumber: row.customer_number,
    agentPhoneNumber: row.agent_phone_number,
    errorMessage: row.error_message,
    callEvents: events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      timestamp: e.timestamp,
      payload: e.payload ? safeJsonParse(e.payload) : undefined,
    })),
  };
  if (lead) {
    out.lead = {
      id: String(lead.id),
      ...(lead.name ? { name: lead.name } : {}),
      phoneNumber: lead.phone ?? "",
    };
  }
  return out;
}

/** List calls with the same agent/business-number joins. */
export async function listCallSummaries(
  env: Env,
  where: { sql: string; params: unknown[] },
  limit: number,
  offset: number,
): Promise<{ items: CallSummaryJson[]; total: number }> {
  const rows = await queryAll<CallRow>(
    env.D1DB,
    `SELECT * FROM calls WHERE ${where.sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...where.params, limit, offset,
  );
  const total = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM calls WHERE ${where.sql}`,
    ...where.params,
  );

  // Batch-fetch agent + business number + lead + AI insights + task flags to
  // avoid N+1. All keyed on this page's rows only.
  const agentIds = Array.from(new Set(rows.map((r) => r.agent_id)));
  const bnIds = Array.from(new Set(rows.map((r) => r.business_number_id).filter((x): x is string => !!x)));
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter((x): x is number => x != null)));
  const callIds = rows.map((r) => r.id);

  const agents = agentIds.length
    ? await queryAll<{ id: number; name: string | null; email: string | null }>(
        env.D1DB,
        `SELECT id, name, email FROM "user" WHERE id IN (${agentIds.map(() => "?").join(",")})`,
        ...agentIds,
      )
    : [];
  const bns = bnIds.length
    ? await queryAll<{ id: string; phone_number: string }>(
        env.D1DB,
        `SELECT id, phone_number FROM phone_numbers WHERE id IN (${bnIds.map(() => "?").join(",")})`,
        ...bnIds,
      )
    : [];
  const leads = leadIds.length
    ? await queryAll<{ id: number; name: string | null }>(
        env.D1DB,
        `SELECT id, name FROM lead WHERE id IN (${leadIds.map(() => "?").join(",")})`,
        ...leadIds,
      )
    : [];
  const insights = callIds.length
    ? await queryAll<{ call_id: string; sentiment: string | null; summary: string | null }>(
        env.D1DB,
        `SELECT call_id, sentiment, summary FROM call_ai_insights WHERE call_id IN (${callIds.map(() => "?").join(",")})`,
        ...callIds,
      )
    : [];
  const taskCalls = callIds.length
    ? await queryAll<{ call_id: string }>(
        env.D1DB,
        `SELECT DISTINCT call_id FROM call_tasks WHERE call_id IN (${callIds.map(() => "?").join(",")})`,
        ...callIds,
      )
    : [];

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const bnMap = new Map(bns.map((b) => [b.id, b]));
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const insightMap = new Map(insights.map((i) => [i.call_id, i]));
  const taskSet = new Set(taskCalls.map((t) => t.call_id));

  return {
    items: rows.map((r) => {
      const insight = insightMap.get(r.id);
      return rowToSummary(
        r,
        agentMap.get(r.agent_id),
        r.business_number_id ? bnMap.get(r.business_number_id) : null,
        {
          sentiment: insight?.sentiment as SummaryExtras["sentiment"],
          summary: insight?.summary,
          hasTasks: taskSet.has(r.id),
          lead: r.lead_id != null ? leadMap.get(r.lead_id) ?? null : null,
        },
      );
    }),
    total: total?.n ?? 0,
  };
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
