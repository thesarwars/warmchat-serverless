- Calling webhooks live at `/api/webhooks/calling/telnyx/*` (Pages Functions),
  with the realtime/orchestration pieces in the gateway Worker.

### 3.4 Calling feature

The Click-to-Call, parallel-ring inbound, and missed-call-SMS flows run inside
this project: REST endpoints under `functions/api/calling/**`, Telnyx webhooks
under `functions/api/webhooks/calling/telnyx/**`, and the realtime/call
orchestration in the gateway Worker (`warmchats-calling-gateway`) via its
`UserSocketDO` / `CallActorDO` Durable Objects. The frontend talks to the same
origin via `VITE_CALLING_API_BASE` / `VITE_CALLING_WS_URL`.

Telnyx Call Control configuration:

- **Voice -> Call Control Applications -> your app**:
  - Webhook URL: `https://www.warmchats.com/api/webhooks/calling/telnyx/status`
  - Failover URL: optional (same handler is fine).
  - Subscribe to events: `call.initiated`, `call.answered`, `call.hangup`
    (and any others the call flow handles - see
    `functions/api/webhooks/calling/telnyx/status.ts`).
- **Voice -> SIP Connections -> your credential connection** (only if you use
  WebRTC click-to-call from the browser): Telnyx WebRTC delivers
  `call.initiated` with `direction=outgoing` and `from` = the agent's SIP URI
  to the same `/api/webhooks/calling/telnyx/status` URL above.
- Inbound number routing: point each business number's "Voice -> Webhook URL"
  at `https://www.warmchats.com/api/webhooks/calling/telnyx/inbound`
  (used by the parallel-ring fork flow).

Required Telnyx env/secrets: `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`,
`TELNYX_CREDENTIAL_CONNECTION_ID`, `TELNYX_MESSAGING_PROFILE_ID`,
`TELNYX_PUBLIC_KEY`. The gateway Worker that runs the call AI pipeline also
needs an R2 `ATTACHMENTS` binding plus `OPENAI_API_KEY` / `TELNYX_API_KEY`
secrets (`wrangler secret put <KEY> --name warmchats-calling-gateway`).
