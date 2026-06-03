/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";

/**
 * GET /api/calling/ws - HONEYPOT.
 *
 * The real per-user WebSocket upgrade endpoint was moved to ws42.ts. No
 * legitimate client connects here anymore (the frontend points at
 * /api/calling/ws42), so any request that lands on this path is unsolicited -
 * a scanner, a probe, or a stale/hostile client.
 *
 * This handler records the full request fingerprint to the `server_logs` D1
 * table (sql/26) and then returns the SAME 426 / 401 responses the original
 * endpoint did, so a probing attacker can't tell the path is now a trap. It
 * NEVER forwards anything to the gateway Worker - it is a dead end.
 *
 * Cheap on CPU: the D1 insert is network wait (doesn't count toward the 10ms
 * free-tier budget) and the body read is capped. Logging is wrapped so a
 * failure can never change the response the caller sees.
 */

const MAX_BODY_CHARS = 10_000;

async function recordHit(env: Env, request: Request, responseStatus: number): Promise<void> {
  try {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // WebSocket upgrade GETs carry no body; other verbs (scanners POST junk)
    // might. Read at most MAX_BODY_CHARS so a huge payload can't blow the
    // budget or the row. We don't forward, so consuming the body is safe.
    let body: string | null = null;
    if (request.body && request.method !== "GET" && request.method !== "HEAD") {
      try {
        const text = await request.text();
        body = text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}...[truncated]` : text;
      } catch {
        body = null;
      }
    }

    await env.D1DB.prepare(
      `INSERT INTO server_logs
         (source, method, path, query_string, upgrade, ip, country, ray_id, user_agent, referer, headers, body, response_status)
       VALUES ('calling-ws-trap', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        request.method,
        url.pathname,
        url.search ? url.search.slice(1) : null,
        request.headers.get("Upgrade") ?? null,
        request.headers.get("cf-connecting-ip") ?? null,
        request.headers.get("cf-ipcountry") ?? null,
        request.headers.get("cf-ray") ?? null,
        request.headers.get("user-agent") ?? null,
        request.headers.get("referer") ?? null,
        JSON.stringify(headers),
        body,
        responseStatus,
      )
      .run();
  } catch {
    // A logging failure must never leak the trap or change the response.
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Mimic the original endpoint exactly: 426 unless it's a websocket upgrade,
  // otherwise 401 (we never authenticate here - there's nothing to reach).
  const isUpgrade = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
  const responseStatus = isUpgrade ? 401 : 426;
  const responseBody = isUpgrade ? "Unauthorized" : "Expected WebSocket upgrade";

  await recordHit(env, request, responseStatus);

  return new Response(responseBody, { status: responseStatus });
};
