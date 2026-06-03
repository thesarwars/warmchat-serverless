/**
 * Tiny WebSocket client that mirrors enough of socket.io-client's surface
 * (.on / .off / .disconnect, `connect`/`disconnect`/`auth_error` events,
 * auto-reconnect with exponential backoff) for CallingContext + the
 * NotificationsContext to drop in without rewriting their handler code.
 *
 * Wire format: every server-pushed message is `JSON.stringify({ event, data })`.
 * The shim un-wraps `event` and dispatches to listeners registered for that
 * name. `connect` / `disconnect` are synthesized locally from the underlying
 * WebSocket open/close events.
 *
 * Connection sharing: multiple callers (calling + notifications) connect to the
 * SAME same-origin URL (/api/calling/ws42), which routes to the SAME per-user
 * UserSocketDO. The DO broadcasts every event to all sockets, so opening one
 * socket per consumer just doubles connections for no benefit. Instead we keep
 * a single underlying WebSocket per URL and hand out lightweight, ref-counted
 * handles. The real socket is closed only when the last handle disconnects.
 *
 * Auth: the URL is same-origin (e.g. wss://www.warmchats.com/api/calling/ws42)
 * so the access_token cookie rides along automatically - no need to put a
 * token in query string or headers.
 */

type Listener = (data: unknown) => void;

export type WcSocket = {
  on: <T = unknown>(event: string, fn: (data: T) => void) => void;
  off: <T = unknown>(event: string, fn?: (data: T) => void) => void;
  disconnect: () => void;
  readonly connected: boolean;
};

/**
 * How often to send a keepalive "ping". The server-side DO auto-responds with
 * "pong" (setWebSocketAutoResponse) without waking, so this is cheap. Must be
 * well under the edge/proxy idle timeout (~2 min observed) or the socket gets
 * culled and we churn through reconnects.
 */
const PING_INTERVAL_MS = 30_000;

interface SharedConn {
  id: number;
  url: string;
  ws: WebSocket | null;
  connected: boolean;
  manuallyClosed: boolean;
  reconnectAttempt: number;
  reconnectTimer: number | null;
  pingTimer: number | null;
  refCount: number;
  /** Aggregated listeners across every handle bound to this connection. */
  listeners: Map<string, Set<Listener>>;
}

function clearPing(conn: SharedConn): void {
  if (conn.pingTimer != null) {
    (typeof window !== "undefined" ? window : globalThis).clearInterval(conn.pingTimer);
    conn.pingTimer = null;
  }
}

function startPing(conn: SharedConn): void {
  clearPing(conn);
  conn.pingTimer = (typeof window !== "undefined" ? window : globalThis).setInterval(() => {
    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      try { conn.ws.send("ping"); } catch { /* ignore */ }
    }
  }, PING_INTERVAL_MS) as unknown as number;
}

let connSeq = 0;
const sharedByUrl = new Map<string, SharedConn>();

function emitLocal(conn: SharedConn, event: string, data: unknown): void {
  const set = conn.listeners.get(event);
  if (!set) return;
  // Copy before iterating: a listener may add/remove listeners (e.g. auth_error
  // → disconnect) which would otherwise mutate the set mid-iteration.
  for (const fn of [...set]) {
    try { fn(data); } catch (err) { console.error("wsClient listener error", err); }
  }
}

function scheduleReconnect(conn: SharedConn): void {
  if (conn.manuallyClosed) return;
  conn.reconnectAttempt++;
  const delay = Math.min(10_000, 500 * 2 ** Math.min(conn.reconnectAttempt, 5));
  conn.reconnectTimer = (typeof window !== "undefined" ? window : globalThis)
    .setTimeout(() => connect(conn), delay) as unknown as number;
}

function connect(conn: SharedConn): void {
  if (conn.manuallyClosed) return;
  try {
    conn.ws = new WebSocket(conn.url);
  } catch (err) {
    console.error("wsClient: failed to construct", err);
    scheduleReconnect(conn);
    return;
  }
  const sock = conn.ws;
  sock.addEventListener("open", () => {
    conn.reconnectAttempt = 0;
    conn.connected = true;
    startPing(conn);
    emitLocal(conn, "connect", undefined);
  });
  sock.addEventListener("message", (ev) => {
    // Keepalive pong from the DO's auto-response - not a real event.
    if (ev.data === "pong") return;
    let parsed: { event?: string; data?: unknown };
    try {
      parsed = JSON.parse(ev.data as string) as { event?: string; data?: unknown };
    } catch {
      return;
    }
    if (!parsed || typeof parsed.event !== "string") return;
    emitLocal(conn, parsed.event, parsed.data);
  });
  sock.addEventListener("close", (ev) => {
    conn.connected = false;
    clearPing(conn);
    emitLocal(conn, "disconnect", { code: ev.code, reason: ev.reason });
    if (ev.code === 1008 || ev.code === 4001) {
      // policy / auth failure - don't reconnect, surface auth_error
      emitLocal(conn, "auth_error", { code: ev.code, reason: ev.reason });
      conn.manuallyClosed = true;
      return;
    }
    scheduleReconnect(conn);
  });
  sock.addEventListener("error", () => {
    // close will fire after; nothing else to do here.
  });
}

function teardownConn(conn: SharedConn): void {
  conn.manuallyClosed = true;
  clearPing(conn);
  if (conn.reconnectTimer != null) {
    (typeof window !== "undefined" ? window : globalThis).clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = null;
  }
  const sock = conn.ws;
  conn.ws = null;
  conn.connected = false;
  sharedByUrl.delete(conn.url);
  if (!sock) return;
  // Closing a socket that's still mid-handshake (CONNECTING) doesn't reliably
  // abort it; once we drop the reference it leaks as an orphaned open
  // connection. Defer the close until it opens in that case.
  if (sock.readyState === WebSocket.CONNECTING) {
    sock.addEventListener(
      "open",
      () => { try { sock.close(1000, "client disconnect"); } catch { /* ignore */ } },
      { once: true },
    );
  } else {
    try { sock.close(1000, "client disconnect"); } catch { /* ignore */ }
  }
}

export function createWcSocket(url: string): WcSocket {
  let conn = sharedByUrl.get(url);
  // A connection that was permanently closed (auth failure) must not be reused
  // by a fresh consumer - drop it so we build a clean one below.
  if (conn?.manuallyClosed) {
    sharedByUrl.delete(url);
    conn = undefined;
  }
  if (!conn) {
    conn = {
      id: ++connSeq,
      url,
      ws: null,
      connected: false,
      manuallyClosed: false,
      reconnectAttempt: 0,
      reconnectTimer: null,
      pingTimer: null,
      refCount: 0,
      listeners: new Map(),
    };
    sharedByUrl.set(url, conn);
    connect(conn);
  }
  conn.refCount++;
  const sharedConn = conn;

  // Per-handle bookkeeping so disconnect() only removes THIS handle's listeners
  // (not those of the other consumer sharing the connection).
  const own = new Map<string, Set<Listener>>();
  let disposed = false;

  return {
    on(event, fn) {
      if (disposed) return;
      const listener = fn as Listener;
      let shared = sharedConn.listeners.get(event);
      if (!shared) { shared = new Set(); sharedConn.listeners.set(event, shared); }
      shared.add(listener);
      let mine = own.get(event);
      if (!mine) { mine = new Set(); own.set(event, mine); }
      mine.add(listener);
      // The connection may already be open when a later consumer subscribes;
      // replay `connect` so it learns it's online (it missed the live event).
      if (event === "connect" && sharedConn.connected) {
        queueMicrotask(() => { try { listener(undefined); } catch { /* ignore */ } });
      }
    },
    off(event, fn) {
      const shared = sharedConn.listeners.get(event);
      const mine = own.get(event);
      if (fn) {
        const listener = fn as Listener;
        shared?.delete(listener);
        mine?.delete(listener);
      } else {
        if (mine) for (const l of mine) shared?.delete(l);
        own.delete(event);
      }
    },
    disconnect() {
      if (disposed) return;
      disposed = true;
      // Drop only this handle's listeners from the shared connection.
      for (const [event, mine] of own) {
        const shared = sharedConn.listeners.get(event);
        if (shared) for (const l of mine) shared.delete(l);
      }
      own.clear();
      sharedConn.refCount--;
      if (sharedConn.refCount <= 0) teardownConn(sharedConn);
    },
    get connected() { return sharedConn.connected; },
  };
}
