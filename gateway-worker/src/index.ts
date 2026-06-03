/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { UserSocketDO } from "./userSocket.ts";
import { CallActorDO } from "./callActor.ts";
import { runScheduled } from "./cron.ts";

export { UserSocketDO, CallActorDO };

/**
 * Sidecar Worker entrypoint. The main `warmchats` Pages project reaches us
 * through a service binding (env.GATEWAY) and addresses Durable Objects via:
 *
 *   GATEWAY.fetch("http://gw/do/<class>/<name>/<method>", { ... })
 *
 *   <class>  - "userSocket" | "callActor"
 *   <name>   - DO idFromName seed, e.g. "user:42", "call:abcd-..."
 *   <method> - the DO's internal path (e.g. /emit, /claim-winner)
 *
 * Pages Functions never instantiate DurableObjectNamespaces directly; the
 * routing happens here so all DO concerns live in one Worker.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    // /do/<class>/<name>/<...method>
    if (parts.length < 3 || parts[0] !== "do") return new Response("Not found", { status: 404 });
    const className = parts[1];
    const name = parts[2];
    const methodPath = "/" + parts.slice(3).join("/");

    let ns: DurableObjectNamespace;
    switch (className) {
      case "userSocket": ns = env.USER_SOCKET; break;
      case "callActor":  ns = env.CALL_ACTOR;  break;
      default: return new Response("Unknown DO class", { status: 404 });
    }

    const id = ns.idFromName(name as string);
    const stub = ns.get(id);

    // Forward the same method/headers/body to the DO, but rewrite the URL so
    // the DO sees its method path (/emit, /claim-winner, etc.).
    const forwarded = new Request("http://do" + methodPath + url.search, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    return stub.fetch(forwarded);
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await runScheduled(event, env);
  },
};
