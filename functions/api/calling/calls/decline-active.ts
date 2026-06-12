/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { hangup } from "../../../_shared/telnyx/client.ts";

/**
 * POST /api/calling/calls/decline-active - decline the agent's CURRENTLY
 * RINGING inbound call without needing its id. A tab whose gateway socket
 * missed the incoming_call event only knows the WebRTC leg (`sdk:`-keyed
 * modal); its local reject could silently fail on a dead SDK socket
 * (BYE_SEND_FAILED), leaving the caller ringing. An agent has at most one
 * inbound call ringing at a time, so resolving it server-side is unambiguous.
 *
 * Same effects as /calls/:callId/decline: broadcast call_ring_ended so every
 * tab stops, then hang up the fork legs - their hangup webhooks run the
 * fork-exhausted path (missed-call handling + voicemail divert / anchor
 * hangup), which stops the caller's phone ringing.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const call = await queryFirst<{
    id: string; agent_id: number | null;
    web_leg_sid: string | null; phone_leg_sid: string | null;
  }>(
    env.D1DB,
    `SELECT id, agent_id, web_leg_sid, phone_leg_sid
       FROM calls
      WHERE agent_id = ? AND direction = 'INBOUND' AND status = 'RINGING'
      ORDER BY created_at DESC LIMIT 1`,
    user.id,
  );
  if (!call) return json({ ok: true, ignored: "no ringing call" });

  if (env.GATEWAY && call.agent_id) {
    await env.GATEWAY.fetch(`http://gw/do/userSocket/user:${call.agent_id}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "call_ring_ended",
        data: { callId: call.id, reason: "declined" },
      }),
    });
  }
  if (call.web_leg_sid) await hangup(env, call.web_leg_sid);
  if (call.phone_leg_sid) await hangup(env, call.phone_leg_sid);
  return json({ ok: true, callId: call.id });
};
