/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json } from "../../_shared/http.ts";
import { execute, nowIso } from "../../_shared/db.ts";

/**
 * GET|POST /api/webhooks/elastic - delivery-event webhook from ElasticEmail
 * (Sent, Opened, Clicked, Bounced, Unsubscribed, AbuseReport, Error).
 * Configured in ElasticEmail Console > Webhooks > Notifications.
 *
 * ElasticEmail can send either a single event as form-urlencoded params, or a
 * JSON array of events. We accept both and persist each into email_events.
 */

interface ElasticEvent {
  msgid?: string;
  messageid?: string;
  to?: string;
  from?: string;
  fromemail?: string;
  status?: string;
  event?: string;
  category?: string;
  subject?: string;
  date?: string;
  timestamp?: string;
}

function normalizeType(raw: string | undefined): string {
  const s = (raw || "").toLowerCase();
  if (s.includes("open")) return "opened";
  if (s.includes("click")) return "clicked";
  if (s.includes("bounce")) return "bounced";
  if (s.includes("unsub")) return "unsubscribed";
  if (s.includes("abuse") || s.includes("spam")) return "abuse";
  if (s.includes("error") || s.includes("fail")) return "error";
  if (s.includes("sent") || s.includes("deliver")) return "sent";
  return s || "unknown";
}

async function parseEvents(req: Request): Promise<ElasticEvent[]> {
  const ct = req.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) {
    try {
      const body = await req.json();
      if (Array.isArray(body)) return body as ElasticEvent[];
      return [body as ElasticEvent];
    } catch { return []; }
  }
  const text = await req.text();
  const out: ElasticEvent = {};
  for (const pair of text.split("&")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const k = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, " "));
    const v = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "));
    (out as Record<string, string>)[k] = v;
  }
  return [out];
}

const handle: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (request.method === "GET" || request.method === "HEAD") {
    return json({ ok: true, mode: "elastic delivery webhook ready" });
  }
  const events = await parseEvents(request);
  let stored = 0;
  for (const ev of events) {
    const eventType = normalizeType(ev.status || ev.event);
    await execute(
      env.D1DB,
      `INSERT INTO email_events
         (provider, provider_message_id, event_type, to_email, from_email,
          subject, category, raw, occurred_at, created_at)
       VALUES ('elastic', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ev.msgid || ev.messageid || null,
      eventType,
      ev.to ? ev.to.toLowerCase() : null,
      (ev.from || ev.fromemail || "").toLowerCase() || null,
      ev.subject || null,
      ev.category || null,
      JSON.stringify(ev),
      ev.date || ev.timestamp || nowIso(),
      nowIso(),
    );
    stored++;
  }
  return json({ ok: true, stored });
};

export const onRequestGet = handle;
export const onRequestHead = handle;
export const onRequestPost = handle;
