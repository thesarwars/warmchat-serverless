/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { execute, queryFirst, nowIso } from "./db.ts";
import { bumpLeadActivity } from "./leadActivity.ts";
import {
  cancelPendingFollowups,
  activateAiOnReply,
  attachTag,
  aiSendAllowedForLead,
  type AutoResponseRow,
} from "./autoResponse.ts";
import { extractInboundData } from "./qualificationFlow.ts";
import { runInboundAgent } from "./aiOrchestrator.ts";
import { openEscalation } from "./escalation.ts";
import { notify } from "./notify.ts";
import { suppressPhone, unsuppressPhone } from "./suppression.ts";
import { mockTelnyxSendSms } from "./mockSendApi.ts";
import { dispatchZapierEvent } from "./zapierDispatch.ts";
import { toLeadView } from "./integrationApi.ts";

/**
 * Inbound message processing extracted from the provider webhooks so the same
 * code path can be driven by both the real webhook handlers and the
 * /admin/debug "simulate inbound reply" tool.
 *
 *   - processInboundSms  : mirror of /api/webhooks/telnyx/inbound (message.received)
 *   - processInboundEmail: mirror of /api/elastic/inbound
 *
 * Each takes already-parsed fields (the webhooks own the parsing + signature
 * verification) and returns a plain result the caller turns into a Response.
 */

export interface InboundSmsInput {
  /** Sender (the lead's E.164 number). */
  fromNumber: string;
  /** Recipient (the agent's provisioned Telnyx number). */
  toNumber: string;
  text: string;
  /** Provider-reported receive time; defaults to now. */
  receivedAt?: string | null;
  /** Provider message id - idempotency key so webhook retries don't double-process. */
  providerMessageId?: string | null;
}

export interface InboundSmsResult {
  ok: boolean;
  ignored?: string;
  deduped?: boolean;
  dispatched?: string;
  opted_out?: boolean;
  lead_id?: number;
  conversation_id?: number;
}

/**
 * If the inbound text matches any of the agent's configured escalation keywords
 * (auto_response_settings.escalation_keywords, a JSON array), open an escalation
 * to the human agent. Case-insensitive substring match. openEscalation dedups
 * (one open escalation per lead), so this is safe to call on every inbound.
 */
async function escalateOnKeywordMatch(
  env: Env,
  opts: { orgId: number; leadId: number; ownerId: number | null; text: string; keywordsRaw: string | null },
): Promise<void> {
  if (!opts.keywordsRaw || !opts.text.trim()) return;
  let keywords: string[] = [];
  try {
    const parsed = JSON.parse(opts.keywordsRaw);
    if (Array.isArray(parsed)) keywords = parsed.map((x) => String(x));
  } catch {
    keywords = opts.keywordsRaw.split(",");
  }
  const hay = opts.text.toLowerCase();
  const hit = keywords.map((k) => k.trim()).find((k) => k && hay.includes(k.toLowerCase()));
  if (!hit) return;
  await openEscalation(env, {
    orgId: opts.orgId, leadId: opts.leadId, ownerId: opts.ownerId,
    reason: "Escalation keyword matched",
    detail: `Inbound message matched the rule "${hit}".`,
  });
}

/**
 * Record an inbound SMS and drive the AI Follow-Up flow exactly as the Telnyx
 * `message.received` webhook does: resolve recipient -> org, upsert the
 * contact/conversation, persist the inbound message, notify, honour STOP/START
 * compliance keywords, then dispatch the qualification flow / new-lead path.
 */
export async function processInboundSms(env: Env, input: InboundSmsInput): Promise<InboundSmsResult> {
  const fromNumber = input.fromNumber || "";
  const toNumber = input.toNumber || "";
  const messageText = input.text || "";
  if (!fromNumber || !toNumber) return { ok: true, ignored: "missing from/to" };

  const u = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM "user" WHERE telnyx_phone_number = ? LIMIT 1`, toNumber,
  );
  if (!u) return { ok: true, ignored: "unknown recipient" };
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, u.id,
  );
  if (!m) return { ok: true, ignored: "user not in org" };

  // Idempotency: Telnyx retries the webhook if our (slow, LLM-driven) response
  // times out, which previously re-ran the agent and sent a SECOND reply. If we
  // already recorded this provider message id, stop now - before any send.
  if (input.providerMessageId) {
    const seen = await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM sms_message WHERE provider_message_sid = ? AND direction = 'inbound' LIMIT 1`,
      input.providerMessageId,
    );
    if (seen) return { ok: true, deduped: true, ignored: "duplicate webhook" };
  }

  let contact = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM sms_contact WHERE org_id = ? AND phone_number_e164 = ? LIMIT 1`,
    m.org_id, fromNumber,
  );
  if (!contact) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO sms_contact (org_id, phone_number_e164) VALUES (?, ?)`,
      m.org_id, fromNumber,
    );
    contact = { id: Number(ins.meta.last_row_id) };
  }
  let conv = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM sms_conversation WHERE org_id = ? AND contact_id = ? LIMIT 1`,
    m.org_id, contact.id,
  );
  if (!conv) {
    const ins = await execute(
      env.D1DB,
      `INSERT INTO sms_conversation (org_id, contact_id, last_message_at) VALUES (?, ?, ?)`,
      m.org_id, contact.id, nowIso(),
    );
    conv = { id: Number(ins.meta.last_row_id) };
  }
  await execute(
    env.D1DB,
    `INSERT INTO sms_message (org_id, conversation_id, direction, body, status, provider_message_sid, created_at)
     VALUES (?, ?, 'inbound', ?, 'received', ?, ?)`,
    m.org_id, conv.id, messageText, input.providerMessageId ?? null, input.receivedAt || nowIso(),
  );
  await execute(env.D1DB,
    `UPDATE sms_conversation SET last_message_at = ? WHERE id = ?`, nowIso(), conv.id);

  // Notification fan-out: live in-app toast/sound + persistent bell-list row
  // + web-push when the user isn't actively connected. Best-effort; failure
  // here must not break the webhook reply (Telnyx will retry on non-2xx).
  try {
    const leadRow = await queryFirst<{ id: number; name: string | null }>(
      env.D1DB,
      `SELECT id, name FROM lead WHERE org_id = ? AND phone = ? LIMIT 1`,
      m.org_id, fromNumber,
    );
    const senderLabel = (leadRow?.name && leadRow.name.trim()) || fromNumber;
    await notify(env, {
      userId: u.id,
      orgId: m.org_id,
      kind: "sms_inbound",
      channel: "sms",
      contactId: leadRow?.id ?? contact.id,
      conversationId: conv.id,
      title: `New message from ${senderLabel}`,
      body: messageText.slice(0, 240),
      data: {
        // Routing + reply context. The service worker / in-app toast use
        // these to POST a reply through /api/messages/send. SMS opens the
        // unified inbox focused on the lead (the standalone SMS thread page
        // was removed); fall back to the inbox root when no lead matched.
        path: leadRow?.id ? `/inbox?lead=${leadRow.id}` : `/inbox`,
        from_number: fromNumber,
        lead_id: leadRow?.id ?? null,
        lead_name: leadRow?.name ?? null,
      },
    });
  } catch (err) {
    console.warn("[inbound-sms] notify failed", err);
  }

  // STOP / HELP / START compliance. Telnyx's carrier-level STOP also blocks
  // outbound at the network layer, but we maintain our own suppression so
  // every send path can hard-stop before hitting the wire (see suppression.ts)
  // and so admins/agents have a manageable view. Match the CTIA-mandated
  // keyword sets, case-insensitive, whitespace-trimmed.
  //
  // Confirmation replies bypass the suppression gate (mockTelnyxSendSms has
  // no suppression check): they're the one outbound message we MUST send to a
  // number we just blocked. The carrier exempts the immediate STOP response
  // from network-level filtering for exactly this reason. Routing through the
  // mock wrapper means they also land in the debug log when mock mode is on.
  // Whole-message keyword match (not fuzzy / not substring). The message body
  // after trimming whitespace must equal one of the keywords, ignoring case
  // and trailing punctuation. This matches Twilio/Telnyx provider behaviour
  // and the CTIA Short Code Handbook - "STOP" means opt-out, "Stop me from
  // calling" is a conversational reply that must NOT trip the suppression
  // gate. Same anchoring rule for HELP and START so "yes please" doesn't
  // accidentally re-opt someone in mid-conversation.
  const keyword = messageText.trim().replace(/[\s!.,?;:]+$/g, "").toLowerCase();
  const isStop  = ["stop", "stopall", "stop all", "unsubscribe", "cancel", "end", "quit", "optout", "opt out", "opt-out"].includes(keyword);
  const isHelp  = !isStop && ["help", "info"].includes(keyword);
  const isStart = !isStop && !isHelp && ["start", "unstop", "optin", "opt in", "opt-in"].includes(keyword);
  // Only look up the agent's number/name when we need to send a confirmation
  // reply (the vast majority of inbound messages aren't keyword triggers and
  // shouldn't pay for an extra round-trip).
  const agentName = (isStop || isHelp || isStart)
    ? await queryFirst<{ name: string | null; telnyx_phone_number: string | null }>(
        env.D1DB, `SELECT name, telnyx_phone_number FROM "user" WHERE id = ?`, u.id,
      )
    : null;
  const senderLabel = agentName?.name?.trim() || "WarmChats";

  if (isStop) {
    await suppressPhone(env, m.org_id, fromNumber, { reason: "keyword" });
    // CTIA: send a single opt-out confirmation. Skip on simulated/admin
    // inbound (no agent number) - the mock path doesn't have a real wire to
    // send back on.
    if (agentName?.telnyx_phone_number) {
      const reply = `You have been unsubscribed from ${senderLabel}. Reply START to opt back in. No further messages will be sent.`;
      const sent = await mockTelnyxSendSms(env, agentName.telnyx_phone_number, fromNumber, reply, { orgId: m.org_id });
      if (sent.ok) {
        await execute(
          env.D1DB,
          `INSERT INTO sms_message (org_id, conversation_id, direction, body, status, provider_message_sid, created_at, sent_at)
           VALUES (?, ?, 'outbound', ?, 'sent', ?, ?, ?)`,
          m.org_id, conv.id, reply, sent.data.id, nowIso(), nowIso(),
        );
      }
    }
    return { ok: true, opted_out: true, conversation_id: conv.id };
  }

  // HELP keyword - CTIA requires a response identifying the sender, how to
  // get support, and the opt-out instruction. Does not change opt-in state,
  // does not cancel scheduled follow-ups, does not advance qualification
  // (the HELP reply IS the response - chaining a qualification question
  // right after would be aggressive and ignores why they texted HELP).
  if (isHelp) {
    if (agentName?.telnyx_phone_number) {
      const reply = `${senderLabel} via WarmChats: For help, email support@warmchats.com. Msg & data rates may apply. Reply STOP to opt out.`;
      const sent = await mockTelnyxSendSms(env, agentName.telnyx_phone_number, fromNumber, reply, { orgId: m.org_id });
      if (sent.ok) {
        await execute(
          env.D1DB,
          `INSERT INTO sms_message (org_id, conversation_id, direction, body, status, provider_message_sid, created_at, sent_at)
           VALUES (?, ?, 'outbound', ?, 'sent', ?, ?, ?)`,
          m.org_id, conv.id, reply, sent.data.id, nowIso(), nowIso(),
        );
      }
    }
    return { ok: true, conversation_id: conv.id };
  }

  // START / UNSTOP - lead is re-opting in. Falls through (no early return)
  // to the AI follow-up dispatch below, so a re-engaged lead can immediately
  // resume the qualification flow they paused.
  if (isStart) {
    await unsuppressPhone(env, m.org_id, fromNumber);
    if (agentName?.telnyx_phone_number) {
      const reply = `You have been re-subscribed to messages from ${senderLabel}. Reply STOP at any time to opt out.`;
      const sent = await mockTelnyxSendSms(env, agentName.telnyx_phone_number, fromNumber, reply, { orgId: m.org_id });
      if (sent.ok) {
        await execute(
          env.D1DB,
          `INSERT INTO sms_message (org_id, conversation_id, direction, body, status, provider_message_sid, created_at, sent_at)
           VALUES (?, ?, 'outbound', ?, 'sent', ?, ?, ?)`,
          m.org_id, conv.id, reply, sent.data.id, nowIso(), nowIso(),
        );
      }
    }
  }

  // ---- AI Follow-Up dispatch -------------------------------------------------
  // Load the agent's auto-response settings. The settings row is per-user but
  // the inbound number resolves to a user, so we key on that.
  const settings = await queryFirst<AutoResponseRow>(
    env.D1DB,
    `SELECT * FROM auto_response_settings WHERE user_id = ?`,
    u.id,
  );

  // Match an existing lead by phone in this org.
  const existingLead = await queryFirst<{ id: number; lead_type: string | null; ai_status: string | null }>(
    env.D1DB,
    `SELECT id, lead_type, ai_status FROM lead WHERE org_id = ? AND phone = ? LIMIT 1`,
    m.org_id, fromNumber,
  );
  // An inbound SMS from a known lead bubbles its contact to the top of the inbox
  // immediately (regardless of AI settings). Cold-inbound new leads bump below.
  if (existingLead) await bumpLeadActivity(env.D1DB, existingLead.id, nowIso(), "inbound");

  // Deterministic escalation: if the inbound text matches one of the agent's
  // configured escalation keywords, open an escalation to the human (dedup'd by
  // openEscalation). This is independent of the AI auto-reply - the agent asked
  // to be alerted on these phrases. Fires for an existing lead here; new leads
  // are checked after creation below.
  if (existingLead && settings) {
    await escalateOnKeywordMatch(env, {
      orgId: m.org_id, leadId: existingLead.id, ownerId: u.id,
      text: messageText, keywordsRaw: settings.escalation_keywords,
    });
  }

  // Stop-on-reply: a reply from a known lead always halts any running outbound
  // automation drip for them (cancel their pending scheduled messages).
  // Unconditional - it only ever prevents sends, and shouldn't depend on the
  // inbound AI settings being on.
  if (existingLead) {
    await cancelPendingFollowups(env, existingLead.id);
    // Texting us IS consent to be texted back: upgrade an unknown/cold consent
    // state to opted_in (mirrors the inbound-call rule). Never overrides an
    // explicit opt-out - and STOP/HELP keywords returned early above anyway.
    await execute(
      env.D1DB,
      `UPDATE lead SET sms_consent_status = 'opted_in', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND COALESCE(sms_opt_out, 0) = 0
          AND (sms_consent_status IS NULL OR sms_consent_status NOT IN ('opted_in', 'opted_out'))`,
      existingLead.id,
    );
    // Instant "Lead Replied" trigger for any subscribed Zap. Reached only for
    // genuine conversational replies (STOP/HELP returned early above).
    const repliedRow = await queryFirst<Record<string, unknown>>(
      env.D1DB, `SELECT * FROM lead WHERE id = ?`, existingLead.id,
    );
    await dispatchZapierEvent(env, m.org_id, "lead.replied", {
      lead_id: existingLead.id,
      message: messageText,
      lead: toLeadView(repliedRow),
    });
  }

  if (settings && settings.enabled && existingLead) {
    // Stop-on-reply is a safety stop: cancelling queued follow-ups only ever
    // prevents sends, so it runs regardless of the AI master/pause switches.
    if (settings.behavior_stop_lead_reply) {
      await cancelPendingFollowups(env, existingLead.id);
    }
    // Campaign -> reply -> AI handoff (core product behavior): a lead who was in
    // pure-outbound campaign mode ('outbound') and replies is now an active
    // conversation, so flip them to 'active' before the gate lets the AI take over.
    existingLead.ai_status = await activateAiOnReply(env, existingLead.id, existingLead.ai_status);
    // Level 1 (workspace master) + Level 3 (per-lead pause) gate the AI-driven
    // response. The transactional STOP/HELP/START confirmations above are
    // mandatory compliance replies and are intentionally NOT gated here.
    if (await aiSendAllowedForLead(env, { org_id: m.org_id, ai_status: existingLead.ai_status })) {
      if (settings.inbound_existing_continue) {
        await runInboundAgent(env, existingLead.id, messageText);
      } else {
        // Track-only mode: mark engaged + warm without auto-replying, but still
        // keep the CRM current (extract fields + score + summary in the
        // background). No send, so no quiet-hours/rate concern.
        await execute(
          env.D1DB,
          `UPDATE lead SET last_reply_at = ?, status = 'Engaged',
                           intent = COALESCE(intent, 'warm'),
                           updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          nowIso(), existingLead.id,
        );
        await extractInboundData(env, existingLead.id, messageText);
      }
    }
    return { ok: true, dispatched: "existing_lead", lead_id: existingLead.id, conversation_id: conv.id };
  }

  if (settings && settings.enabled && !existingLead && settings.inbound_sms_enabled && settings.inbound_new_create_lead) {
    // Inbound-from-unknown (cold inbound): create a lead, tag, and start the
    // qualification flow - the lead texted us first, so we react by qualifying.
    // Texting us first IS consent to be texted back - record opted_in so
    // replies go out without the STOP footer (mirrors the inbound-call rule).
    const leadIns = await execute(
      env.D1DB,
      `INSERT INTO lead (name, phone, source, status, owner_id, org_id, lead_type, intent, sms_consent_status, created_at, updated_at)
       VALUES (NULL, ?, 'Inbound SMS', 'New', ?, ?, 'unknown', 'warm', 'opted_in', ?, ?)`,
      fromNumber, u.id, m.org_id, nowIso(), nowIso(),
    );
    const newLeadId = Number(leadIns.meta.last_row_id);
    await bumpLeadActivity(env.D1DB, newLeadId, nowIso(), "inbound");
    const newLeadRow = await queryFirst<Record<string, unknown>>(
      env.D1DB, `SELECT * FROM lead WHERE id = ?`, newLeadId,
    );
    await dispatchZapierEvent(env, m.org_id, "lead.created", { lead: toLeadView(newLeadRow) });
    await escalateOnKeywordMatch(env, {
      orgId: m.org_id, leadId: newLeadId, ownerId: u.id,
      text: messageText, keywordsRaw: settings.escalation_keywords,
    });
    if (settings.inbound_new_tag) {
      await attachTag(env, m.org_id, newLeadId, "Inbound SMS");
    }
    if (settings.inbound_new_send_reply) {
      // Cold inbound from an unknown number: the AI agent opens the conversation.
      await runInboundAgent(env, newLeadId, messageText);
    }
    return { ok: true, dispatched: "new_lead", lead_id: newLeadId, conversation_id: conv.id };
  }

  return { ok: true, conversation_id: conv.id };
}

export interface InboundEmailInput {
  /** Sender (the lead's email). */
  from: string;
  /** Recipient (the agent's connected inbox address). */
  to: string;
  subject?: string | null;
  body?: string | null;
  receivedAt?: string | null;
  messageId?: string | null;
  /**
   * Org override. The webhook leaves this undefined and resolves the org from
   * the recipient connection; the admin tool already knows the lead's org and
   * passes it so the path works even when the agent has no inbox_connection.
   */
  orgId?: number | null;
  /** Lead to attach a freshly-created thread to (admin path only). */
  leadId?: number | null;
  /**
   * When true and no existing thread matches, create an email inbox/thread so
   * the simulated reply still surfaces in the unified inbox. The real webhook
   * leaves this false (it only attaches to existing outbound threads).
   */
  ensureThread?: boolean;
}

export interface InboundEmailResult {
  ok: boolean;
  ignored?: string;
  thread_id?: number | null;
}

/**
 * Strip the quoted reply chain from an inbound email body so the inbox bubble
 * (and the AI) sees only the NEW text the sender wrote - mail clients append
 * the entire prior thread below "On <date>, <name> wrote:" / "> " quoting,
 * which the inbox already renders as its own message history. Falls back to
 * the full body if stripping would leave nothing (e.g. a forward with no new
 * text).
 */
export function stripQuotedReply(raw: string): string {
  if (!raw || !raw.trim()) return raw;
  const text = raw.replace(/\r\n/g, "\n");
  const cutPatterns: RegExp[] = [
    /\n+On [^\n]{0,200}\n?[^\n]{0,200}wrote:\s*\n/, // Gmail/Apple "On <date>, <name> wrote:" (may wrap once)
    /\n-{2,}\s*Original Message\s*-{2,}/i,           // classic Outlook
    /\n_{10,}\s*\n/,                                  // Outlook divider
    /\nFrom:\s[^\n]+\nSent:\s[^\n]+/,                 // Outlook header block
    /\n\s*>/,                                         // first "> " quoted line
    /<div[^>]+class="gmail_quote/,                    // HTML-only bodies
    /<blockquote/i,
  ];
  let cut = text.length;
  for (const re of cutPatterns) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  const result = text
    .slice(0, cut)
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .trim();
  return result || raw.trim();
}

/**
 * Record an inbound email, mirroring /api/elastic/inbound: attach to the most
 * recent outbound thread for the sender (creating one when `ensureThread` is
 * set), and write the provider-level audit row when a connection is known.
 */
export async function processInboundEmail(env: Env, input: InboundEmailInput): Promise<InboundEmailResult> {
  const from = (input.from || "").trim().toLowerCase();
  const to = (input.to || "").trim().toLowerCase();
  const subject = input.subject || "(no subject)";
  // `body` keeps the raw payload; everything user-facing (inbox bubble,
  // notification snippet, AI context) uses the quote-stripped version.
  const body = input.body || "";
  const cleanBody = stripQuotedReply(body);
  // Normalize the provider's Date header to ISO 8601. It often arrives RFC-2822
  // ("Sat, 20 Jun 2026 13:06:07 GMT"); message_date is compared as a STRING all
  // over the app, and an RFC-2822 value sorts ABOVE every ISO date ("S" > "2"),
  // so an inbound reply looked like the newest activity forever -> the thread was
  // stuck in "Needs Reply" even after the agent/AI replied. Fall back to now on
  // an unparseable header.
  const parsedReceived = Date.parse(input.receivedAt || "");
  const receivedAt = Number.isFinite(parsedReceived) ? new Date(parsedReceived).toISOString() : nowIso();
  if (!to) return { ok: false, ignored: "missing to" };

  // Resolve the recipient connection for the org (and the audit row's FK).
  // Replies are addressed to inbound+<connId>@<reply-domain> (see
  // dispatchOutboundEmail), so resolve that connection id directly. Fall back to
  // matching the recipient against a connection's email_address for any mail
  // still sent straight to a verified business address.
  let conn: { id: number; user_id: number } | null = null;
  const tokenMatch = to.match(/^inbound\+(\d+)@/);
  if (tokenMatch) {
    conn = await queryFirst<{ id: number; user_id: number }>(
      env.D1DB, `SELECT id, user_id FROM inbox_connection WHERE id = ? LIMIT 1`, Number(tokenMatch[1]),
    );
  }
  if (!conn) {
    conn = await queryFirst<{ id: number; user_id: number }>(
      env.D1DB, `SELECT id, user_id FROM inbox_connection WHERE LOWER(email_address) = ? LIMIT 1`, to,
    );
  }
  // Webhook contract: an unknown recipient is ignored. The admin tool bypasses
  // this by supplying orgId directly.
  if (!conn && input.orgId == null) return { ok: true, ignored: "unknown recipient" };

  // Idempotency: ElasticEmail can retry the inbound webhook; if we already
  // recorded this provider message id, stop before re-threading + re-replying.
  if (input.messageId) {
    const seen = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM inbound_messages WHERE provider_message_id = ? LIMIT 1`, input.messageId,
    );
    if (seen) return { ok: true, ignored: "duplicate webhook" };
  }

  let orgId = input.orgId ?? null;
  if (orgId == null && conn) {
    const membership = await queryFirst<{ org_id: number }>(
      env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, conn.user_id,
    );
    orgId = membership?.org_id ?? null;
  }

  // Try to attach to an existing thread by matching the most recent thread
  // where an outbound to `from` exists.
  let thread = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT t.id FROM thread t
       JOIN inbox_messages m ON m.thread_id = t.id
       JOIN inbox i ON i.id = t.inbox_id
      WHERE i.org_id = ? AND m.direction = 'outbound'
        AND LOWER(m.to_email) = ?
      ORDER BY t.id DESC LIMIT 1`,
    orgId, from,
  );

  if (!thread && input.ensureThread && orgId != null) {
    let inbox = await queryFirst<{ id: number }>(
      env.D1DB, `SELECT id FROM inbox WHERE org_id = ? AND channel = 'email' LIMIT 1`, orgId,
    );
    if (!inbox) {
      const ins = await execute(
        env.D1DB,
        `INSERT INTO inbox (name, channel, org_id, created_at) VALUES ('Email', 'email', ?, ?)`,
        orgId, nowIso(),
      );
      inbox = { id: Number(ins.meta.last_row_id) };
    }
    const tIns = await execute(
      env.D1DB,
      `INSERT INTO thread (subject, inbox_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      subject, inbox.id, nowIso(), nowIso(),
    );
    thread = { id: Number(tIns.meta.last_row_id) };
    if (input.leadId != null) {
      await execute(
        env.D1DB,
        `INSERT INTO thread_lead_assignments (thread_id, lead_id, assigned_at) VALUES (?, ?, ?)`,
        thread.id, input.leadId, nowIso(),
      );
    }
  }

  // Resolve the lead this inbound email belongs to BEFORE the insert so we can
  // stamp lead_id + bump recency immediately - the contact must jump to the top
  // of the inbox the moment the reply lands. NULL for a cold/unknown sender (the
  // lead may be auto-created below, which then backfills this row's lead_id).
  let inboundLeadId: number | null = input.leadId ?? null;
  if (inboundLeadId == null && thread) {
    const tla = await queryFirst<{ lead_id: number }>(
      env.D1DB,
      `SELECT lead_id FROM thread_lead_assignments WHERE thread_id = ?
        GROUP BY thread_id HAVING COUNT(DISTINCT lead_id) = 1`,
      thread.id,
    );
    inboundLeadId = tla?.lead_id ?? null;
  }
  if (inboundLeadId == null && orgId != null && from) {
    const l = await queryFirst<{ id: number | null }>(
      env.D1DB,
      `SELECT MIN(id) AS id FROM lead WHERE org_id = ? AND LOWER(email) = LOWER(?)`,
      orgId, from,
    );
    inboundLeadId = l?.id ?? null;
  }

  if (thread) {
    await execute(
      env.D1DB,
      `INSERT INTO inbox_messages
         (thread_id, sender_email, to_email, subject, body, direction, channel, created_at, message_date, lead_id)
       VALUES (?, ?, ?, ?, ?, 'inbound', 'email', ?, ?, ?)`,
      thread.id, from, to, subject, cleanBody, nowIso(), receivedAt, inboundLeadId,
    );
    await bumpLeadActivity(env.D1DB, inboundLeadId, receivedAt, "inbound");
  }

  // Provider-level audit row (FK requires a connection id, so skip it when the
  // recipient address has no inbox_connection).
  if (conn) {
    await execute(
      env.D1DB,
      `INSERT INTO inbound_messages
         (connection_id, provider, provider_message_id, sender_email, to_email, subject, received_at, thread_id, created_at)
       VALUES (?, 'elastic', ?, ?, ?, ?, ?, ?, ?)`,
      conn.id, input.messageId || crypto.randomUUID(),
      from, to, subject, receivedAt, thread?.id ?? null, nowIso(),
    );
  }

  // Notification fan-out: live in-app toast/sound + persistent bell-list row +
  // web-push, mirroring processInboundSms. Only fires when the email was
  // actually recorded (a thread was matched/created) and we can resolve both an
  // org and a user to alert. Best-effort - a failure here must not break the
  // webhook reply. Drives both the real ElasticEmail webhook and the
  // /admin/mock-inbound tool, since both go through this function.
  if (thread && orgId != null) {
    try {
      const lead =
        input.leadId != null
          ? await queryFirst<{ id: number; name: string | null; owner_id: number | null }>(
              env.D1DB,
              `SELECT id, name, owner_id FROM lead WHERE id = ?`,
              input.leadId,
            )
          : await queryFirst<{ id: number; name: string | null; owner_id: number | null }>(
              env.D1DB,
              `SELECT id, name, owner_id FROM lead WHERE org_id = ? AND LOWER(email) = ? LIMIT 1`,
              orgId, from,
            );

      // Who to alert: the inbox owner, else the lead owner, else any org member.
      let notifyUserId = conn?.user_id ?? lead?.owner_id ?? null;
      if (notifyUserId == null) {
        const member = await queryFirst<{ user_id: number }>(
          env.D1DB, `SELECT user_id FROM membership WHERE org_id = ? LIMIT 1`, orgId,
        );
        notifyUserId = member?.user_id ?? null;
      }

      if (notifyUserId != null) {
        const senderLabel = (lead?.name && lead.name.trim()) || from;
        const snippet = cleanBody.replace(/\s+/g, " ").trim().slice(0, 200);
        await notify(env, {
          userId: notifyUserId,
          orgId,
          kind: "email_inbound",
          channel: "email",
          contactId: lead?.id ?? undefined,
          conversationId: thread.id,
          title: `New email from ${senderLabel}`,
          body: snippet ? `${subject} - ${snippet}` : subject,
          data: {
            // Email opens the unified inbox focused on the lead (the standalone
            // email thread page was removed); fall back to the inbox root.
            path: lead?.id ? `/inbox?lead=${lead.id}` : `/inbox`,
            from_email: from,
            thread_id: thread.id,
            lead_id: lead?.id ?? null,
            lead_name: lead?.name ?? null,
            subject,
          },
        });
      }
    } catch (err) {
      console.warn("[inbound-email] notify failed", err);
    }
  }

  // ---- AI inbound EMAIL dispatch --------------------------------------------
  // Answer the email with the tool-calling agent (email -> AI -> email), the
  // mirror of the SMS path. Gated by the per-agent toggle + the email channel
  // toggle (inbound_email_enabled) + the 3-level lead gate (runInboundAgent
  // re-checks master/per-lead). Best-effort - a failure must not break the
  // webhook reply (the email is already recorded above).
  if (thread && orgId != null && cleanBody.trim()) {
    try {
      let lead = input.leadId != null
        ? await queryFirst<{ id: number; owner_id: number | null; ai_status: string | null }>(
            env.D1DB, `SELECT id, owner_id, ai_status FROM lead WHERE id = ?`, input.leadId)
        : await queryFirst<{ id: number; owner_id: number | null; ai_status: string | null }>(
            env.D1DB, `SELECT id, owner_id, ai_status FROM lead WHERE org_id = ? AND LOWER(email) = ? LIMIT 1`, orgId, from);
      const ownerId = lead?.owner_id ?? conn?.user_id ?? null;
      const settings = ownerId
        ? await queryFirst<AutoResponseRow>(env.D1DB, `SELECT * FROM auto_response_settings WHERE user_id = ?`, ownerId)
        : await queryFirst<AutoResponseRow>(env.D1DB, `SELECT * FROM auto_response_settings WHERE org_id = ? ORDER BY id LIMIT 1`, orgId);

      if (settings && settings.enabled && settings.inbound_email_enabled) {
        // Cold inbound email from an unknown sender: create the lead (parity
        // with the SMS unknown-number path) and link it to this thread.
        if (!lead && ownerId && settings.inbound_new_create_lead) {
          const ins = await execute(
            env.D1DB,
            `INSERT INTO lead (name, email, source, status, owner_id, org_id, lead_type, intent, created_at, updated_at)
             VALUES (NULL, ?, 'Inbound Email', 'New', ?, ?, 'unknown', 'warm', ?, ?)`,
            from, ownerId, orgId, nowIso(), nowIso(),
          );
          lead = { id: Number(ins.meta.last_row_id), owner_id: ownerId, ai_status: null };
          await execute(
            env.D1DB,
            `INSERT INTO thread_lead_assignments (thread_id, lead_id, assigned_at) VALUES (?, ?, ?)`,
            thread.id, lead.id, nowIso(),
          );
          // The inbound row above was written with lead_id = NULL (the lead didn't
          // exist yet). Link it now + bump recency so the new contact surfaces at
          // the top of the inbox immediately.
          await execute(
            env.D1DB,
            `UPDATE inbox_messages SET lead_id = ?
              WHERE thread_id = ? AND direction = 'inbound' AND lead_id IS NULL
                AND LOWER(sender_email) = LOWER(?)`,
            lead.id, thread.id, from,
          );
          await bumpLeadActivity(env.D1DB, lead.id, receivedAt, "inbound");
        }
        if (lead) {
          await escalateOnKeywordMatch(env, {
            orgId, leadId: lead.id, ownerId, text: cleanBody, keywordsRaw: settings.escalation_keywords,
          });
          // Stop-on-reply parity: a known lead replying halts pending drips.
          await cancelPendingFollowups(env, lead.id);
          // Campaign -> reply -> AI handoff: flip an outbound-campaign lead to
          // 'active' so the email reply hands off to the AI (same as SMS).
          lead.ai_status = await activateAiOnReply(env, lead.id, lead.ai_status);
          if (await aiSendAllowedForLead(env, { org_id: orgId, ai_status: lead.ai_status })) {
            await runInboundAgent(env, lead.id, cleanBody, { channel: "email", subject });
          }
        }
      }
    } catch (err) {
      console.warn("[inbound-email] AI dispatch failed", err);
    }
  }

  return { ok: true, thread_id: thread?.id ?? null };
}
