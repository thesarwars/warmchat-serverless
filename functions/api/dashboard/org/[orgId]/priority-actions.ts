/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";

interface Action {
  type: string;
  lead_id: number;
  lead_name: string;
  title: string;
  description: string;
  priority: "high" | "medium";
  /** 0-100 AI confidence shown on the card (omitted when not meaningful). */
  confidence?: number | null;
  cta: { label: string; action: string; deep_link: string };
  occurred_at: string | null;
  appointment_id?: number | null;
}

function leadName(r: {
  name: string | null; first_name: string | null; last_name: string | null;
  email?: string | null; phone?: string | null;
}): string {
  // Nameless-but-real leads (e.g. auto-created from an unknown inbound
  // caller/texter) display by their contact identity, never a placeholder.
  return (
    r.name ||
    [r.first_name, r.last_name].filter(Boolean).join(" ") ||
    r.email ||
    r.phone ||
    "Unknown contact"
  );
}

function clip(s: string | null | undefined, n = 80): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
}

const NOT_DEAD = `COALESCE(l.status,'') NOT IN ('Cold / Lost','Lost','Closed')`;

/**
 * GET /api/dashboard/org/:orgId/priority-actions - the AI Intelligence feed:
 * the highest-priority opportunities AI found, each with a type, why-it-matters
 * line, confidence, and a working one-click deep link into the inbox. Signal
 * sources (all real data, in priority order):
 *   1. human_takeover / needs_response - the lead spoke last (SMS) and is waiting
 *   2. appointment_unconfirmed        - proposed appointment needs confirming
 *   3. ready_to_buy                   - high AI score, still active
 *   4. appointment_opportunity        - next-best-action points at booking
 *   5. re_engage                      - previously active, silent 7+ days
 *   6. warm_lead_no_outreach          - fallback: fresh lead nobody contacted
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const url = new URL(request.url);
  const warmDays = Math.max(1, Math.min(Number(url.searchParams.get("warm_lookback_days")) || 30, 365));
  const apptHorizonH = Math.max(1, Math.min(Number(url.searchParams.get("appointment_confirmation_horizon_hours")) || 48, 168));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 100));
  const perType = Math.max(1, Math.min(Number(url.searchParams.get("per_type_limit")) || 3, 100));
  const warmCutoff = new Date(Date.now() - warmDays * 864e5).toISOString();
  const nowIso = new Date().toISOString();
  const apptEnd = new Date(Date.now() + apptHorizonH * 36e5).toISOString();

  const items: Action[] = [];
  const seenLeads = new Set<number>();
  const push = (a: Action) => {
    if (seenLeads.has(a.lead_id)) return;
    seenLeads.add(a.lead_id);
    items.push(a);
  };

  // 1. Leads waiting on a human (SMS conversation where the lead spoke last).
  //    ai_status off/paused => "human takeover needed"; else "needs response".
  const waiting = await queryAll<{
    id: number; name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
    ai_status: string | null; last_message_at: string | null; last_msg: string | null;
  }>(
    env.D1DB,
    `SELECT l.id, l.name, l.first_name, l.last_name, l.email, l.phone, l.ai_status,
            c.last_message_at,
            (SELECT m.body FROM sms_message m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_msg
       FROM sms_conversation c
       JOIN sms_contact sc ON c.contact_id = sc.id
       JOIN lead l ON l.org_id = c.org_id AND l.phone IS NOT NULL
        AND substr(replace(replace(replace(replace(sc.phone_number_e164,'-',''),' ',''),'(',''),')',''), -10)
          = substr(replace(replace(replace(replace(l.phone,'-',''),' ',''),'(',''),')',''), -10)
      WHERE c.org_id = ? AND ${NOT_DEAD}
        AND (SELECT m.direction FROM sms_message m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) = 'inbound'
      ORDER BY c.last_message_at ASC LIMIT ?`,
    orgId, perType,
  );
  for (const l of waiting) {
    const takeover = ["off", "paused", "human", "human_takeover"].includes(String(l.ai_status || "").toLowerCase());
    push({
      type: takeover ? "human_takeover" : "needs_response",
      lead_id: l.id, lead_name: leadName(l),
      title: takeover ? "Human takeover needed" : "Waiting on your reply",
      description: l.last_msg ? `Asked: "${clip(l.last_msg, 70)}"` : "The lead messaged you and is waiting.",
      priority: "high",
      cta: takeover
        ? { label: "Open Conversation", action: "open_conversation", deep_link: `/inbox?lead=${l.id}` }
        : { label: "Draft Reply", action: "draft_reply", deep_link: `/inbox?lead=${l.id}` },
      occurred_at: l.last_message_at,
    });
  }

  // 2. Unconfirmed appointments within the horizon.
  const appts = await queryAll<{ id: number; lead_id: number; starts_at: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }>(
    env.D1DB,
    `SELECT a.id, a.lead_id, a.starts_at, l.name, l.first_name, l.last_name, l.email, l.phone
       FROM lead_appointment a JOIN lead l ON l.id = a.lead_id
      WHERE a.org_id = ? AND a.status = 'proposed'
        AND datetime(a.starts_at) > datetime(?) AND datetime(a.starts_at) <= datetime(?)
      ORDER BY a.starts_at ASC LIMIT ?`,
    orgId, nowIso, apptEnd, perType,
  );
  for (const a of appts) {
    push({
      type: "appointment_unconfirmed", lead_id: a.lead_id, lead_name: leadName(a),
      title: "Appointment to confirm", description: `An AI-proposed appointment with ${leadName(a)} needs your confirmation.`,
      priority: "high",
      cta: { label: "Confirm Appointment", action: "confirm_appointment", deep_link: `/inbox?lead=${a.lead_id}` },
      occurred_at: a.starts_at, appointment_id: a.id,
    });
  }

  // 3. Ready to buy - high AI score, still active.
  const hot = await queryAll<{ id: number; name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; lead_score: number | null; ai_summary: string | null; updated_at: string | null }>(
    env.D1DB,
    `SELECT l.id, l.name, l.first_name, l.last_name, l.email, l.phone, l.lead_score, l.ai_summary, l.updated_at
       FROM lead l
      WHERE l.org_id = ? AND COALESCE(l.lead_score,0) >= 80 AND ${NOT_DEAD}
      ORDER BY l.lead_score DESC, l.updated_at DESC LIMIT ?`,
    orgId, perType,
  );
  for (const l of hot) {
    const why = clip((l.ai_summary || "").split(/(?<=\.)\s+/)[0], 90) || "Strong buying signals across recent activity.";
    push({
      type: "ready_to_buy", lead_id: l.id, lead_name: leadName(l),
      title: "Ready to buy", description: why,
      priority: "high", confidence: Math.min(99, Number(l.lead_score) || 80),
      cta: { label: "Call Now", action: "call", deep_link: `/inbox?lead=${l.id}` },
      occurred_at: l.updated_at,
    });
  }

  // 3b. Seller motivation captured - likely motivated seller.
  const motivated = await queryAll<{ id: number; name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; motivation: string | null; updated_at: string | null }>(
    env.D1DB,
    `SELECT l.id, l.name, l.first_name, l.last_name, l.email, l.phone, l.motivation, l.updated_at
       FROM lead l
      WHERE l.org_id = ? AND ${NOT_DEAD}
        AND COALESCE(l.motivation,'') <> '' AND LOWER(COALESCE(l.lead_type,'')) = 'seller'
      ORDER BY l.updated_at DESC LIMIT ?`,
    orgId, perType,
  );
  for (const l of motivated) {
    push({
      type: "motivation", lead_id: l.id, lead_name: leadName(l),
      title: "Seller motivation", description: `Mentioned "${clip(l.motivation, 70)}" - likely a motivated seller.`,
      priority: "high",
      cta: { label: "Send Listing Prep", action: "listing_prep", deep_link: `/inbox?lead=${l.id}` },
      occurred_at: l.updated_at,
    });
  }

  // 4. Appointment opportunity - the AI's next best action points at booking.
  const apptOpp = await queryAll<{ id: number; name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; lead_score: number | null; next_best_action: string | null; updated_at: string | null }>(
    env.D1DB,
    `SELECT l.id, l.name, l.first_name, l.last_name, l.email, l.phone, l.lead_score, l.next_best_action, l.updated_at
       FROM lead l
      WHERE l.org_id = ? AND COALESCE(l.appointment_booked,0) = 0 AND ${NOT_DEAD}
        AND (LOWER(COALESCE(l.next_best_action,'')) LIKE '%appoint%'
          OR LOWER(COALESCE(l.next_best_action,'')) LIKE '%book%'
          OR LOWER(COALESCE(l.next_best_action,'')) LIKE '%showing%'
          OR LOWER(COALESCE(l.next_best_action,'')) LIKE '%schedule%')
      ORDER BY COALESCE(l.lead_score,0) DESC LIMIT ?`,
    orgId, perType,
  );
  for (const l of apptOpp) {
    push({
      type: "appointment_opportunity", lead_id: l.id, lead_name: leadName(l),
      title: "Appointment opportunity", description: clip(l.next_best_action, 90) || "Signals point to booking a showing.",
      priority: "high", confidence: Math.min(95, (Number(l.lead_score) || 70) + 10),
      cta: { label: "Schedule Showing", action: "schedule", deep_link: `/inbox?lead=${l.id}` },
      occurred_at: l.updated_at,
    });
  }

  // 5. Re-engage - previously active, silent for 7+ days.
  const cooled = await queryAll<{ id: number; name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; last_reply_at: string | null }>(
    env.D1DB,
    `SELECT l.id, l.name, l.first_name, l.last_name, l.email, l.phone, l.last_reply_at
       FROM lead l
      WHERE l.org_id = ? AND ${NOT_DEAD}
        AND l.last_reply_at IS NOT NULL AND datetime(l.last_reply_at) <= datetime('now','-7 days')
        AND (COALESCE(l.lead_score,0) >= 45 OR COALESCE(l.status,'') IN ('Engaged','Qualified'))
      ORDER BY l.last_reply_at DESC LIMIT ?`,
    orgId, perType,
  );
  for (const l of cooled) {
    const days = l.last_reply_at ? Math.max(7, Math.round((Date.now() - Date.parse(l.last_reply_at)) / 864e5)) : 7;
    push({
      type: "re_engage", lead_id: l.id, lead_name: leadName(l),
      title: "Re-engage lead", description: `Previously active - no reply for ${days} days.`,
      priority: "medium",
      cta: { label: "Launch Sequence", action: "nurture", deep_link: `/inbox?lead=${l.id}` },
      occurred_at: l.last_reply_at,
    });
  }

  // 6. Fallback: warm leads created recently with no outbound contact yet.
  if (items.length < limit) {
    const warm = await queryAll<{ id: number; name: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; created_at: string | null }>(
      env.D1DB,
      `SELECT l.id, l.name, l.first_name, l.last_name, l.email, l.phone, l.created_at
         FROM lead l
        WHERE l.org_id = ? AND datetime(l.created_at) >= datetime(?) AND ${NOT_DEAD}
          AND LOWER(COALESCE(l.email,'')) NOT IN (
            SELECT LOWER(im.to_email) FROM inbox_messages im
              JOIN thread t ON im.thread_id=t.id JOIN inbox i ON t.inbox_id=i.id
             WHERE i.org_id = ? AND im.direction='outbound' AND im.to_email IS NOT NULL)
        ORDER BY l.created_at DESC LIMIT ?`,
      orgId, warmCutoff, orgId, perType,
    );
    for (const l of warm) {
      push({
        type: "warm_lead_no_outreach", lead_id: l.id, lead_name: leadName(l),
        title: "No outreach yet", description: `New lead ${leadName(l)} hasn't been contacted.`,
        priority: "medium",
        cta: { label: "Send Message", action: "compose", deep_link: `/inbox?lead=${l.id}` },
        occurred_at: l.created_at,
      });
    }
  }

  const trimmed = items.slice(0, limit);
  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  for (const it of trimmed) {
    byType[it.type] = (byType[it.type] ?? 0) + 1;
    byPriority[it.priority] = (byPriority[it.priority] ?? 0) + 1;
  }

  return json({
    items: trimmed,
    count: trimmed.length,
    by_type: byType,
    by_priority: byPriority,
    thresholds: {
      warm_lookback_days: warmDays,
      awaiting_reply_min_hours: Number(url.searchParams.get("awaiting_reply_min_hours")) || 0,
      appointment_confirmation_horizon_hours: apptHorizonH,
      limit, per_type_limit: perType,
    },
    computed_at: nowIso,
  });
};
