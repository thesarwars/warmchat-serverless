## 4. Background scheduler (Cron Trigger Worker)

Pages Functions cannot self-schedule, so the scheduled-message dispatch,
sequence-step execution, and Gmail-token refresh run in a **separate Worker**.
**This is now built** - it lives at `workers/cron/` (`name = "warmchats-cron"`)
and fires every 2 minutes.

Jobs (`workers/cron/jobs/`):
- `sequenceDispatch.ts` - pops due `step_executions` (200/tick) and sends via
  ElasticEmail / Telnyx.
- `scheduledMessages.ts` - flushes the `scheduled_message` queue.
- `gmailTokenRefresh.ts` - refreshes Gmail OAuth tokens expiring within 24h.

Deploy + secrets (the Worker needs its own copy of the API secrets it uses):
```powershell
cd workers/cron
wrangler deploy
wrangler secret put TELNYX_API_KEY        --name warmchats-cron
wrangler secret put ELASTIC_EMAIL_API_KEY --name warmchats-cron
wrangler secret put FERNET_KEY            --name warmchats-cron
wrangler secret put GMAIL_OAUTH_CLIENT_ID --name warmchats-cron
wrangler secret put GMAIL_OAUTH_CLIENT_SECRET --name warmchats-cron
```
Local test: `cd workers/cron && wrangler dev --test-scheduled` then
`curl 'http://localhost:8787/__scheduled?cron=*/2+*+*+*+*'` (or `POST /run-now`).
See `workers/cron/README.md`. The cron cadence is **every 2 minutes** (not the
1-minute example previously sketched here) - adjust `crons` in
`workers/cron/wrangler.toml` if you need tighter latency.