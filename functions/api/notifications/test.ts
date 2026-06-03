/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { notify } from "../../_shared/notify.ts";

/**
 * POST /api/notifications/test - fire a one-off notification through the
 * unified `notify()` pipeline so the user can verify their setup. The
 * notification:
 *   - persists a row in `notification` (lands in the bell list)
 *   - WS-broadcasts a `notification` event (live in-app toast + chime)
 *   - sends a Web Push to every registered device (OS-level notification)
 *
 * Two flavors, selected by the request body `type`:
 *   - default (no body / type omitted): an `sms_inbound`-shaped notification
 *     that exercises the SMS reply path (chime + reply box + SW inline reply).
 *   - `type: "call"`: a `call_incoming`-shaped notification that exercises the
 *     call path (the in-app toast renders Answer / Decline, and the SW shows
 *     Answer / Decline notification actions on supported browsers).
 *
 * The `data.test = true` flag lets the SW / in-app UI route any reply or
 * answer attempt to a local no-op preview instead of touching a real lead,
 * SMS, or WebRTC call leg.
 *
 * `forcePush: true` skips the "user is online via WS, skip the push" guard
 * - the user clicked Send Test specifically to verify out-of-app delivery,
 * so we always fire the OS push.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = (await request.json().catch(() => ({}))) as { type?: string };

  if (body?.type === "call") {
    const row = await notify(env, {
      userId: user.id,
      kind: "call_incoming",
      channel: "call",
      severity: "info",
      title: "Incoming call (test)",
      body:
        "Test call from WarmChats test - tap Answer or Decline to verify call alerts. " +
        "No real call is placed.",
      data: {
        path: "/settings",
        test: true,
        test_call: true,
        from_number: "+10000000000",
        lead_name: "WarmChats test",
      },
      forcePush: true,
    });

    return json({ ok: true, notification_id: row?.id ?? null });
  }

  const row = await notify(env, {
    userId: user.id,
    kind: "sms_inbound",
    channel: "sms",
    severity: "info",
    title: "Test notification",
    body:
      "If you can see this, hear the chime, and see an OS popup, your setup is working. " +
      "Tap Reply to verify the reply box - the reply is intercepted and no SMS is sent.",
    data: {
      path: "/settings",
      test: true,
      from_number: "+10000000000",
      lead_name: "WarmChats test",
    },
    forcePush: true,
  });

  return json({ ok: true, notification_id: row?.id ?? null });
};
