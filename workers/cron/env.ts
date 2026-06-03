/// <reference types="@cloudflare/workers-types" />
/**
 * Bindings for the warmchats-cron Worker. A subset of the Pages Functions
 * Env in functions/_shared/env.ts - only what the background jobs need.
 */
export interface CronEnv {
  D1DB: D1Database;
  ENV: string;

  // Secrets used by jobs (set via `wrangler secret put NAME --name warmchats-cron`).
  TELNYX_API_KEY: string;
  ELASTIC_EMAIL_API_KEY: string;
  ELASTIC_SENDER_EMAIL: string;
  ELASTIC_SENDER_NAME: string;
  FERNET_KEY: string;
  GMAIL_OAUTH_CLIENT_ID: string;
  GMAIL_OAUTH_CLIENT_SECRET: string;
  // HMAC key for signing unsubscribe tokens (CAN-SPAM footer links). Mirrors
  // functions/_shared/env.ts:Env.EMAIL_UNSUB_SIGNING_KEY - same key on both
  // bundles so the cron-emitted tokens verify against the Pages-Functions
  // unsubscribe handler.
  EMAIL_UNSUB_SIGNING_KEY: string;
  // Public base for unsubscribe URLs - prepended to /api/email/unsubscribe.
  // Optional; defaults to https://www.warmchats.com when unset.
  PUBLIC_BASE_URL?: string;

  // Mirror of functions/_shared/env.ts:Env.MOCK_SEND_APIS. When truthy, the
  // cron scheduler dispatches through mockSendApi.ts instead of real Telnyx /
  // ElasticEmail / Gmail providers.
  MOCK_SEND_APIS?: string;

  // For background notifications (appointment reminders, quota warnings).
  // Set via the same `wrangler secret put`; same VAPID keypair as Pages.
  GATEWAY?: Fetcher;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_CONTACT_EMAIL?: string;
}
