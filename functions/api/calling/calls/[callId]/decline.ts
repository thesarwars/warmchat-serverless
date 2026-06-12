/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryFirst } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { canAccessCall } from "../../../../_shared/callingAccess.ts";
import { hangup } from "../../../../_shared/telnyx/client.ts";

/**
 * POST /api/calling/calls/:callId/decline - the agent pressed Decline on the
 * incoming-call modal. A local-only rejection left every OTHER tab (and the
 * cell fork) ringing, so decline is made authoritative here:
 *   1. broadcast `call_ring_ended` so every open tab stops ringing instantly;
 *   2. hang up the fork legs at Telnyx - their call.hangup webhooks then run
 *      the fork-exhausted path in the status webhook (missed-call text + task,
 *      then voicemail divert, or anchor hangup when voicemail is off).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const callId = String(params.callId || "");
  if (!callId) return error("callId is required", 400);
  if (!(await canAccessCall(env, user.id, callId))) return error("Forbidden", 403);

  const call = await queryFirst<{
    id: string; agent_id: number | null; status: string; direction: string;
    web_leg_sid: string | null; phone_leg_sid: string | null;
  }>(
    env.D1DB,
    `SELECT id, agent_id, status, direction, web_leg_sid, phone_leg_sid
       FROM calls WHERE id = ? LIMIT 1`,
    callId,
  );
  if (!call) return error("Call not found", 404);
  // Already answered/ended (race with another tab): nothing to decline.
  if (call.direction !== "INBOUND" || call.status !== "RINGING") {
    return json({ ok: true, ignored: "not ringing" });
  }

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
  return json({ ok: true });
};
