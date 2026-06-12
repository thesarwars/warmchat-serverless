/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { nowIso } from "../../_shared/db.ts";
import { processInboundEmail } from "../../_shared/inboundProcessing.ts";

/**
 * GET/HEAD/POST /api/elastic/inbound - public webhook from ElasticEmail when
 * an email arrives at a verified inbox. We write into inbound_messages and,
 * if a matching outbound thread exists, also create a new inbox_messages
 * row so it shows up in the unified inbox.
 *
 * ElasticEmail's webhook can use either form-urlencoded or JSON; we handle both.
 */

interface InboundPayload {
  from?: string;
  to?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  message?: string;
  messageId?: string;
  Date?: string;
}

async function parsePayload(req: Request): Promise<InboundPayload> {
  const ct = req.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) {
    try { return await req.json() as InboundPayload; } catch { return {}; }
  }
  // ElasticEmail's inbound HTTP notification posts multipart/form-data - the
  // urlencoded fallback below cannot parse boundary-delimited bodies, which
  // silently dropped every real inbound email (400 "missing 'to'").
  if (ct.includes("multipart/form-data")) {
    try {
      const fd = await req.formData();
      const out: InboundPayload = {};
      for (const [k, v] of fd.entries()) {
        if (typeof v === "string") (out as Record<string, string>)[k] = v;
      }
      return out;
    } catch { return {}; }
  }
  const text = await req.text();
  const out: InboundPayload = {};
  for (const pair of text.split("&")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const k = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, " "));
    const v = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "));
    (out as Record<string, string>)[k] = v;
  }
  return out;
}

const handle: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (request.method === "GET" || request.method === "HEAD") {
    return json({ ok: true, mode: "inbound webhook ready" });
  }
  const payload = await parsePayload(request);
  // Field names vary across Elastic notification versions - accept the common
  // variants for each field.
  const p = payload as Record<string, string | undefined>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = p[k];
      if (v && String(v).trim()) return String(v);
    }
    return "";
  };
  const to = pick("to", "To", "recipient").trim().toLowerCase();
  if (!to) return error("missing 'to' address", 400);

  const result = await processInboundEmail(env, {
    from: pick("from", "From", "sender", "from_email"),
    to,
    subject: pick("subject", "Subject") || "(no subject)",
    body: pick("bodyText", "body_text", "text", "message") || pick("bodyHtml", "body_html", "html"),
    receivedAt: pick("Date", "date") || nowIso(),
    messageId: pick("messageId", "message_id", "MessageID") || null,
  });
  return json(result);
};

export const onRequestGet = handle;
export const onRequestHead = handle;
export const onRequestPost = handle;
