# warmchats-cron - background-job Worker

Cloudflare **Pages Functions cannot register cron triggers** - only standalone
Workers can. This sibling Worker (`name = "warmchats-cron"`) runs every 2
minutes on the same D1 database and handles the periodic work.

## Jobs

| File | What it does |
|---|---|---|
| `jobs/sequenceDispatch.ts` | Polls `step_executions WHERE status='scheduled' AND scheduled_at <= now` (200 at a time) and dispatches each step via ElasticEmail or Telnyx |
| `jobs/scheduledMessages.ts` | Polls `scheduled_message WHERE status='scheduled' AND scheduled_at <= now`, sends the message, flips status to `sent`/`failed` |
| `jobs/gmailTokenRefresh.ts` | Refreshes Gmail OAuth tokens that expire within 24 hours, so user actions never block on a refresh round-trip |

Add more job modules under `jobs/` and call them from `index.ts`'s `scheduled`
handler.

## Local dev

```
cd workers/cron
wrangler dev --test-scheduled
# in another shell, manually trigger:
curl 'http://localhost:8787/__scheduled?cron=*/2+*+*+*+*'
```

## Deploy

```
cd workers/cron
wrangler deploy
```

## Secrets

Mirror the Pages secrets (TELNYX_API_KEY, ELASTIC_EMAIL_API_KEY, FERNET_KEY,
GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, etc.) with:

```
wrangler secret put TELNYX_API_KEY --name warmchats-cron
wrangler secret put ELASTIC_EMAIL_API_KEY --name warmchats-cron
wrangler secret put FERNET_KEY --name warmchats-cron
wrangler secret put GMAIL_OAUTH_CLIENT_ID --name warmchats-cron
wrangler secret put GMAIL_OAUTH_CLIENT_SECRET --name warmchats-cron
```
