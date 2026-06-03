/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.ts";

/**
 * UserSocketDO - one DO per WarmChats user. Holds the user's open WebSocket(s)
 * (they may have multiple tabs open) and broadcasts server-side events into
 * them. Uses the hibernation API so an idle agent isn't burning CPU.
 *
 * Reached two ways:
 *   GET  with Upgrade: websocket  - a browser is connecting (proxied through
 *     functions/api/calling/ws42.ts which authenticated the cookie first and
 *     stamped `x-wc-user-id`).
 *   POST /emit  body { event, data }  - a Pages Function (typically a webhook
 *     handler) wants to push to this user's tabs.
 *   GET /status                   - admin endpoint: { online, count }.
 *
 * The wire format on the socket is `JSON.stringify({ event, data })` - the
 * client shim in src/utils/wsClient.ts mirrors socket.io's `.on(event, cb)`
 * surface so existing CallingContext code didn't need to change.
 */
export class UserSocketDO extends DurableObject {
  private sessions: Map<WebSocket, { userId: string }>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessions = new Map();
    // Restore sockets after hibernation.
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as { userId?: string } | null;
      if (att?.userId) this.sessions.set(ws, { userId: att.userId });
    }
    // Auto-respond ping/pong without waking us up.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");

    // WebSocket upgrade
    if (upgrade?.toLowerCase().includes("websocket")) {
      const userId = request.headers.get("x-wc-user-id") || "";
      if (!userId) return new Response("Missing x-wc-user-id", { status: 400 });
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      try {
        server.serializeAttachment({ userId });
      } catch {
        // best-effort
      }
      this.sessions.set(server, { userId });
      return new Response(null, { status: 101, webSocket: client });
    }

    // Status probe
    if (url.pathname === "/status") {
      return new Response(JSON.stringify({ online: this.sessions.size > 0, count: this.sessions.size }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Broadcast
    if (url.pathname === "/emit" && request.method === "POST") {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return new Response("Bad JSON", { status: 400 });
      }
      const text = JSON.stringify(payload);
      let delivered = 0;
      for (const [ws] of this.sessions) {
        try {
          ws.send(text);
          delivered++;
        } catch {
          try { ws.close(1011, "send failed"); } catch { /* ignore */ }
          this.sessions.delete(ws);
        }
      }
      return new Response(JSON.stringify({ ok: true, delivered }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  override async webSocketMessage(): Promise<void> {
    // Client -> server messages are currently a no-op (the frontend never emits;
    // the auto-response handles ping). Future: presence beacons, typing, etc.
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
    try { ws.close(1000, "closing"); } catch { /* ignore */ }
  }
}
