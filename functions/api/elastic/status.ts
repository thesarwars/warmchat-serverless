/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json } from "../../_shared/http.ts";
import { execute, nowIso } from "../../_shared/db.ts";

/**
 * POST /api/elastic/status - delivery-status webhook from Elastic Email.
 *
 * Elastic Email posts one event per status change. The interesting events are
 * `Delivered`, `Opened` (when their own open-tracking is on), `Bounced`,
 * `AbuseReport`, and `Error/Failed`. We map them onto inbox_messages columns
 * by looking up the row via `message_id` (the provider id returned at send
 * time and stored as inbox_messages.message_id).
 *
 * Their webhook can be configured to send either JSON or form-urlencoded.
 * Field names also differ between v2/v4 - accept the common variants.
 */

interface StatusPayload {
  // Provider's message id ("transactionid" / "messageid" / "MessageID").
  messageid?: string;
  transactionid?: string;
  MessageID?: string;

  // Event name (varies by API version).
  status?: string;
  Status?: string;
  event?: string;

  // Optional error detail on failure events.
  reason?: string;
  errormessage?: string;
}

async function parsePayload(req: Request): Promise<StatusPayload> {
  const ct = req.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) {
    try {
      return (await req.json()) as StatusPayload;
    } catch {
      return {};
    }
  }
  const text = await req.text();
  const out: Record<string, string> = {};
  for (const pair of text.split("&")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const k = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, " "));
    const v = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "));
    out[k] = v;
  }
  return out as StatusPayload;
}

function normalizeStatus(raw: string): {
  delivery_status: string;
  setColumn: "delivered_at" | "bounced_at" | null;
} | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === "delivered" || s === "sent") {
    return { delivery_status: "delivered", setColumn: "delivered_at" };
  }
  if (s === "bounced" || s === "bounce" || s === "hardbounce" || s === "softbounce") {
    return { delivery_status: "bounced", setColumn: "bounced_at" };
  }
  if (s === "failed" || s === "error" || s === "rejected" || s === "abusereport") {
    return { delivery_status: "failed", setColumn: null };
  }
  if (s === "opened" || s === "open") {
    // Elastic's own open-tracking - we also do our own via the pixel, but if
    // theirs fires first we still flip opened_at.
    return { delivery_status: "delivered", setColumn: null };
  }
  return null;
}

const handle: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (request.method === "GET" || request.method === "HEAD") {
    return json({ ok: true, mode: "status webhook ready" });
  }
  const payload = await parsePayload(request);
  const providerId = (
    payload.messageid || payload.transactionid || payload.MessageID || ""
  ).trim();
  const rawStatus = (payload.status || payload.Status || payload.event || "").trim();
  if (!providerId || !rawStatus) {
    return json({ ok: false, error: "missing message id or status" }, 400);
  }
  const norm = normalizeStatus(rawStatus);
  if (!norm) {
    return json({ ok: true, ignored: rawStatus });
  }

  const now = nowIso();
  const error_message =
    norm.delivery_status === "failed" || norm.delivery_status === "bounced"
      ? (payload.errormessage || payload.reason || rawStatus).slice(0, 500)
      : null;

  // Build the UPDATE dynamically so we only set the timestamp column for the
  // current event without clobbering other columns.
  const sets = ["delivery_status = ?"];
  const args: unknown[] = [norm.delivery_status];
  if (norm.setColumn === "delivered_at") {
    sets.push("delivered_at = COALESCE(delivered_at, ?)");
    args.push(now);
  } else if (norm.setColumn === "bounced_at") {
    sets.push("bounced_at = COALESCE(bounced_at, ?)");
    args.push(now);
  }
  if (rawStatus.toLowerCase() === "opened" || rawStatus.toLowerCase() === "open") {
    sets.push("opened_at = COALESCE(opened_at, ?)");
    args.push(now);
  }
  if (error_message) {
    sets.push("error_message = ?");
    args.push(error_message);
  }

  await execute(
    env.D1DB,
    `UPDATE inbox_messages SET ${sets.join(", ")} WHERE message_id = ?`,
    ...args,
    providerId,
  );

  return json({ ok: true, applied: norm.delivery_status });
};

export const onRequestGet = handle;
export const onRequestHead = handle;
export const onRequestPost = handle;
