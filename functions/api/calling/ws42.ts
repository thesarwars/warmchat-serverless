/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/calling/ws42 - WebSocket upgrade entrypoint.
 *
 * Pages Functions can't host WebSockets directly, so this proxies the upgrade
 * to the gateway Worker (which routes to UserSocketDO). Authentication runs
 * here on the cookie before we hand off - the DO trusts `x-wc-user-id`
 * because the only path to it is via the GATEWAY service binding (private,
 * not reachable from the public internet).
 *
 * The frontend connects to the same origin so the access_token cookie is sent
 * automatically. We swap the `Upgrade` request straight through after auth.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }
  const user = await requireUser(env, request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!env.GATEWAY) return new Response("Calling gateway not deployed", { status: 503 });

  const forwarded = new Request(`http://gw/do/userSocket/user:${user.id}/`, {
    method: "GET",
    headers: {
      Upgrade: "websocket",
      "x-wc-user-id": String(user.id),
    },
  });
  return env.GATEWAY.fetch(forwarded);
};
