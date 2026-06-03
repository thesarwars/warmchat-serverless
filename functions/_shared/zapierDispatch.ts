/// <reference types="@cloudflare/workers-types" />

/**
 * Outbound event dispatch for instant (REST Hook) Zapier triggers. When a
 * WarmChats event fires, POST the payload to every Zapier-subscribed target_url
 * for that org + event.
 *
 * Cheap by design: if the org has no subscriptions the work is a single indexed
 * SELECT and we return. fetch() is a network wait (not CPU), so it doesn't count
 * against the free-tier 10ms CPU cap. Always best-effort - a failed or slow
 * subscriber URL must never break the user-facing path.
 *
 * Pass `waitUntil` (context.waitUntil) on request paths to fire-and-forget so
 * the user isn't blocked on the subscriber round-trip; shared helpers without a
 * context fall back to an awaited call bounded by a 2.5s per-request timeout.
 */
import { queryAll } from "./db.ts";
import type { IntegrationEvent } from "./integrationApi.ts";
import type { Env } from "./env.ts";

type WaitUntil = (promise: Promise<unknown>) => void;

export async function dispatchZapierEvent(
  env: Env,
  orgId: number,
  event: IntegrationEvent,
  payload: Record<string, unknown>,
  waitUntil?: WaitUntil,
): Promise<void> {
  const run = (async () => {
    try {
      const subs = await queryAll<{ target_url: string }>(
        env.D1DB,
        `SELECT target_url FROM integration_subscription WHERE org_id = ? AND event = ?`,
        orgId,
        event,
      );
      if (subs.length === 0) return;

      const body = JSON.stringify({
        event,
        org_id: orgId,
        occurred_at: new Date().toISOString(),
        data: payload,
      });
      await Promise.allSettled(
        subs.map((s) =>
          fetch(s.target_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: AbortSignal.timeout(2500),
          }),
        ),
      );
    } catch {
      /* best-effort: never block or throw on the caller's path */
    }
  })();

  if (waitUntil) {
    waitUntil(run);
    return;
  }
  await run;
}
