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
  const to = (payload.to || "").trim().toLowerCase();
  if (!to) return error("missing 'to' address", 400);

  const result = await processInboundEmail(env, {
    from: payload.from || "",
    to,
    subject: payload.subject || "(no subject)",
    body: payload.bodyText || payload.bodyHtml || payload.message || "",
    receivedAt: payload.Date || nowIso(),
    messageId: payload.messageId || null,
  });
  return json(result);
};

export const onRequestGet = handle;
export const onRequestHead = handle;
export const onRequestPost = handle;
