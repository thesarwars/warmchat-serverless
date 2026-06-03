/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * GET /api/inbox/contacts -> { contacts: [...] }
 *
 * Builds the contact index: list of leads with email and/or SMS history,
 * sorted by last activity. Only leads with any message history are included.
 */

interface ContactEntry {
  id: number;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  company: string | null;
  property_address: string | null;
  price_range: string | null;
  tags: string[];
  notes: string | null;
  lead_type: string | null;
  intent: string | null;
  ai_status: string | null;
  timezone: string | null;
  last_activity_at: string | null;
  last_activity_channel: "email" | "sms" | null;
  last_activity_label: string | null;
  /**
   * Direction of the single most recent message across all channels. Drives
   * `needs_reply`: the conversation needs a reply when the LAST word was the
   * lead's (inbound), regardless of whether the agent has READ it. (Read state
   * is tracked separately by *_unread_count.)
   */
  last_activity_direction: "inbound" | "outbound" | null;
  /** True when the most recent message is inbound -> the agent still owes a reply. */
  needs_reply: boolean;
  preview: string;
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  email_thread_ids: number[];
  latest_email_thread_id: number | null;
  latest_email_subject: string | null;
  sms_conversation_id: number | null;
  email_unread_count: number;
  sms_unread_count: number;
  total_unread_count: number;
  has_email_history: boolean;
  has_sms_history: boolean;
  /**
   * Compliance state. Driven by lead.sms_opt_out / lead.email_opt_out so the
   * UI can show a red "SMS Opted Out" / "Email Unsubscribed" badge in the
   * lead row + thread header + right panel and disable the SMS/Email send
   * controls without an extra round-trip.
   */
  sms_opt_out: boolean;
  email_opt_out: boolean;
}

function fmtLabel(channel: "email" | "sms", iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleString("en-US", {
    month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
  return `${channel === "sms" ? "SMS" : "Email"} · ${date}`;
}

function makeEntry(l: {
  id: number; name: string | null; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null; status: string | null; company: string | null;
  property_address: string | null; price_range: string | null; notes: string | null;
  email_notifications_enabled: number; sms_notifications_enabled: number;
  lead_type: string | null; intent: string | null; ai_status: string | null; timezone: string | null;
  sms_opt_out: number | null; email_opt_out: number | null;
}): ContactEntry {
  return {
    id: l.id, name: l.name, first_name: l.first_name, last_name: l.last_name,
    email: l.email, phone: l.phone, stage: l.status || "New",
    company: l.company, property_address: l.property_address, price_range: l.price_range,
    tags: [], notes: l.notes,
    lead_type: l.lead_type, intent: l.intent, ai_status: l.ai_status, timezone: l.timezone,
    last_activity_at: null, last_activity_channel: null, last_activity_label: null,
    last_activity_direction: null, needs_reply: false, preview: "",
    email_notifications_enabled: Boolean(l.email_notifications_enabled),
    sms_notifications_enabled: Boolean(l.sms_notifications_enabled),
    email_thread_ids: [], latest_email_thread_id: null, latest_email_subject: null,
    sms_conversation_id: null,
    email_unread_count: 0, sms_unread_count: 0, total_unread_count: 0,
    has_email_history: false, has_sms_history: false,
    sms_opt_out: l.sms_opt_out === 1,
    email_opt_out: l.email_opt_out === 1,
  };
}

// Stage -> score, mirrored from src/components/leads/constants.ts so the inbox
// "Hot Leads" chip count matches the lead-display logic (hot = score > 45).
const STAGE_SCORE: Record<string, number> = {
  "Lost": 5, "New Lead": 10, "Contacted": 25, "Engaged": 45, "Qualified": 65,
  "Appointment Set": 80, "Active Client": 90, "Under Contract": 98, "Closed": 100,
};
const HOT_SCORE_THRESHOLD = 45;
/** Port of getStageValue (leadDisplay.ts) - normalise a free-form stage label. */
function normalizeStageLabel(raw: string | null): string {
  const lower = String(raw || "").trim().toLowerCase();
  if (!lower) return "New Lead";
  const exact = Object.keys(STAGE_SCORE).find((s) => s.toLowerCase() === lower);
  if (exact) return exact;
  if (lower === "new") return "New Lead";
  if (lower === "nurture") return "Contacted";
  if (lower === "warm" || lower === "warm lead" || lower === "new warm lead") return "Engaged";
  if (lower.includes("hot")) return "Qualified";
  if (lower.includes("appointment") || lower === "pending confirmation") return "Appointment Set";
  if (lower === "active client" || lower === "active_client") return "Active Client";
  if (lower === "under contract" || lower === "pending") return "Under Contract";
  if (lower === "closed" || lower === "closed won" || lower === "won") return "Closed";
  if (lower === "lost" || lower === "closed lost" || lower === "archived" || lower.includes("cold") || lower.includes("dead")) return "Lost";
  return "New Lead";
}
function isHotContact(c: ContactEntry): boolean {
  return (STAGE_SCORE[normalizeStageLabel(c.stage)] ?? 0) > HOT_SCORE_THRESHOLD;
}

function contactMatchesSearch(c: ContactEntry, term: string): boolean {
  if (!term) return true;
  const parts = [
    c.name, c.first_name, c.last_name, c.email, c.phone,
    c.company, c.property_address, c.stage, c.preview,
    c.latest_email_subject, c.notes,
    ...c.tags,
  ];
  const haystack = parts
    .filter((v) => v != null && String(v).trim())
    .map((v) => String(v).toLowerCase())
    .join(" ");
  return haystack.includes(term);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id);
  if (!membership) return error("User not part of organization", 403);
  const orgId = membership.org_id;

  const url = new URL(request.url);
  const searchQuery = (url.searchParams.get("q") || url.searchParams.get("search") || "").trim().toLowerCase();
  const pageRaw = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSizeRaw = Math.min(300, Math.max(1, Number(url.searchParams.get("page_size")) || 10));

  // All leads in the org keyed by id.
  const leads = await queryAll<{
    id: number; name: string | null; first_name: string | null; last_name: string | null;
    email: string | null; phone: string | null; status: string | null; company: string | null;
    property_address: string | null; price_range: string | null; notes: string | null;
    email_notifications_enabled: number; sms_notifications_enabled: number;
    lead_type: string | null; intent: string | null; ai_status: string | null; timezone: string | null;
    sms_opt_out: number | null; email_opt_out: number | null;
  }>(
    env.D1DB,
    `SELECT id, name, first_name, last_name, email, phone, status, company,
            property_address, price_range, notes,
            email_notifications_enabled, sms_notifications_enabled,
            lead_type, intent, ai_status, timezone,
            sms_opt_out, email_opt_out
       FROM lead WHERE org_id = ?`,
    orgId,
  );
  if (!leads.length) return json({ contacts: [] });

  const byId = new Map<number, ContactEntry>();
  const byEmail = new Map<string, ContactEntry>();
  const byPhoneSuffix = new Map<string, ContactEntry>();
  for (const l of leads) {
    const e = makeEntry(l);
    byId.set(l.id, e);
    if (l.email) byEmail.set(l.email.toLowerCase(), e);
    if (l.phone) {
      const digits = l.phone.replace(/\D/g, "");
      if (digits.length >= 10) byPhoneSuffix.set(digits.slice(-10), e);
    }
  }

  // ---- Email threads/messages ----
  type ThreadAgg = {
    thread_id: number; subject: string | null; updated_at: string | null;
    last_inbound_email: string | null;
    last_outbound_email: string | null;
    last_body: string | null;
    last_ts: string | null;
    last_direction: string | null;
    unread_count: number;
  };
  const threadAggs = await queryAll<ThreadAgg>(
    env.D1DB,
    `SELECT t.id AS thread_id, t.subject, t.updated_at,
            (SELECT LOWER(im.sender_email) FROM inbox_messages im
               WHERE im.thread_id=t.id AND im.direction='inbound'
               ORDER BY COALESCE(im.message_date, im.created_at) DESC LIMIT 1) AS last_inbound_email,
            (SELECT LOWER(im.to_email) FROM inbox_messages im
               WHERE im.thread_id=t.id AND im.direction='outbound'
               ORDER BY COALESCE(im.message_date, im.created_at) DESC LIMIT 1) AS last_outbound_email,
            (SELECT im.body FROM inbox_messages im
               WHERE im.thread_id=t.id
               ORDER BY COALESCE(im.message_date, im.created_at) DESC LIMIT 1) AS last_body,
            (SELECT COALESCE(im.message_date, im.created_at) FROM inbox_messages im
               WHERE im.thread_id=t.id
               ORDER BY COALESCE(im.message_date, im.created_at) DESC LIMIT 1) AS last_ts,
            (SELECT im.direction FROM inbox_messages im
               WHERE im.thread_id=t.id
               ORDER BY COALESCE(im.message_date, im.created_at) DESC LIMIT 1) AS last_direction,
            (SELECT COUNT(*) FROM inbox_messages im
               WHERE im.thread_id=t.id AND im.is_read=0) AS unread_count
       FROM thread t JOIN inbox i ON t.inbox_id=i.id
      WHERE i.org_id = ?`,
    orgId,
  );

  for (const t of threadAggs) {
    const candidate = (t.last_inbound_email && byEmail.get(t.last_inbound_email))
      || (t.last_outbound_email && byEmail.get(t.last_outbound_email));
    if (!candidate) continue;
    candidate.has_email_history = true;
    candidate.email_unread_count += Number(t.unread_count) || 0;
    if (!candidate.email_thread_ids.includes(t.thread_id)) {
      candidate.email_thread_ids = [...candidate.email_thread_ids, t.thread_id].sort((a, b) => a - b);
    }
    if (t.last_ts && (!candidate.last_activity_at || t.last_ts > candidate.last_activity_at)) {
      candidate.last_activity_at = t.last_ts;
      candidate.last_activity_channel = "email";
      candidate.last_activity_label = fmtLabel("email", t.last_ts);
      candidate.last_activity_direction = t.last_direction === "inbound" ? "inbound" : "outbound";
      candidate.preview = t.last_body || "";
      candidate.latest_email_thread_id = t.thread_id;
      candidate.latest_email_subject = t.subject || null;
    }
  }

  // ---- SMS conversations ----
  type SmsAgg = {
    conversation_id: number; phone_e164: string; last_message_at: string | null;
    last_body: string | null; last_direction: string | null; unread_count: number;
  };
  const smsAggs = await queryAll<SmsAgg>(
    env.D1DB,
    `SELECT c.id AS conversation_id, sc.phone_number_e164 AS phone_e164,
            c.last_message_at,
            (SELECT m.body FROM sms_message m WHERE m.conversation_id=c.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_body,
            (SELECT m.direction FROM sms_message m WHERE m.conversation_id=c.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_direction,
            (SELECT COUNT(*) FROM sms_message m
              WHERE m.conversation_id=c.id AND m.direction='inbound' AND m.is_read=0) AS unread_count
       FROM sms_conversation c JOIN sms_contact sc ON c.contact_id=sc.id
      -- Only surface conversations that actually have a message. A row stranded
      -- with zero messages (e.g. a dispatcher that created the conversation then
      -- crashed before persisting the message) must not show as an empty thread.
      WHERE c.org_id = ?
        AND EXISTS (SELECT 1 FROM sms_message m WHERE m.conversation_id = c.id)`,
    orgId,
  );

  for (const s of smsAggs) {
    const digits = (s.phone_e164 || "").replace(/\D/g, "");
    if (digits.length < 10) continue;
    const entry = byPhoneSuffix.get(digits.slice(-10));
    if (!entry) continue;
    entry.has_sms_history = true;
    entry.sms_conversation_id = s.conversation_id;
    entry.sms_unread_count = Number(s.unread_count) || 0;
    const ts = s.last_message_at;
    if (ts && (!entry.last_activity_at || ts > entry.last_activity_at)) {
      entry.last_activity_at = ts;
      entry.last_activity_channel = "sms";
      entry.last_activity_label = fmtLabel("sms", ts);
      entry.last_activity_direction = s.last_direction === "inbound" ? "inbound" : "outbound";
      entry.preview = s.last_body || "";
    }
  }

  const all: ContactEntry[] = [];
  for (const e of byId.values()) {
    e.total_unread_count = e.email_unread_count + e.sms_unread_count;
    // "Needs reply" = the lead spoke last. Read state is deliberately NOT part
    // of this - opening a thread to read it doesn't discharge the obligation to
    // reply, so reading must not clear the flag (only an outbound message does).
    e.needs_reply = e.last_activity_direction === "inbound";
    if (e.has_email_history || e.has_sms_history) all.push(e);
  }
  all.sort((a, b) => (b.last_activity_at || "").localeCompare(a.last_activity_at || ""));

  // Search filter (applied in memory after building the full index).
  const filtered = searchQuery ? all.filter((c) => contactMatchesSearch(c, searchQuery)) : all;

  // Active filter chip applied SERVER-SIDE. The list is paginated/capped, so a
  // contact that matches a chip (e.g. a brand-new inbound that "needs reply")
  // but sits past the loaded window would otherwise be invisible - the chip
  // count would read 1 while the client-filtered page showed nothing. Filtering
  // here guarantees the chip's contacts are actually returned. "all" is a
  // pass-through. Counts (below) stay over the full search-filtered set so the
  // OTHER chips still show their true totals.
  const leadTypeOf = (c: ContactEntry) => String(c.lead_type || "").trim().toLowerCase();
  const chip = (url.searchParams.get("filter") || "all").trim().toLowerCase();
  const matchesChip = (c: ContactEntry): boolean => {
    switch (chip) {
      case "needs_reply": return c.needs_reply;
      case "hot": return isHotContact(c);
      case "buyers": return leadTypeOf(c) === "buyer" || leadTypeOf(c) === "both";
      case "sellers": return leadTypeOf(c) === "seller" || leadTypeOf(c) === "both";
      default: return true;
    }
  };
  const visible = chip === "all" ? filtered : filtered.filter(matchesChip);

  const total = visible.length;
  const totalPages = total ? Math.max(1, Math.ceil(total / pageSizeRaw)) : 1;
  const page = Math.min(pageRaw, totalPages);
  const offset = (page - 1) * pageSizeRaw;
  const contacts = visible.slice(offset, offset + pageSizeRaw);

  // True totals for the inbox filter chips, computed over the WHOLE filtered set
  // (not just the current page) so "All" et al. don't keep growing as the user
  // scrolls / loads more.
  const filterCounts = {
    all: filtered.length,
    needs_reply: filtered.reduce((n, c) => n + (c.needs_reply ? 1 : 0), 0),
    hot: filtered.reduce((n, c) => n + (isHotContact(c) ? 1 : 0), 0),
    buyers: filtered.reduce((n, c) => n + (leadTypeOf(c) === "buyer" || leadTypeOf(c) === "both" ? 1 : 0), 0),
    sellers: filtered.reduce((n, c) => n + (leadTypeOf(c) === "seller" || leadTypeOf(c) === "both" ? 1 : 0), 0),
  };

  return json({
    contacts,
    count: contacts.length,
    filter_counts: filterCounts,
    pagination: {
      page,
      page_size: pageSizeRaw,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
    applied_filters: {
      q: searchQuery || null,
      page,
      page_size: pageSizeRaw,
    },
  });
};
