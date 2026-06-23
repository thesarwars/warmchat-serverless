/// <reference types="@cloudflare/workers-types" />

/**
 * Bindings + plaintext vars + secrets available to every Pages Function.
 *
 * - `D1DB` is declared in wrangler.toml [[d1_databases]].
 * - The string fields below come from wrangler.toml [vars] in production and
 *   .dev.vars in local dev. Secrets set via `wrangler pages secret put` show
 *   up as the same shape - there's no separate type at runtime.
 *
 * Every secret/var is typed `string` (always present in prod) - but if you
 * leave any blank in wrangler.toml or .dev.vars you'll get an empty string at
 * runtime, so guard at call sites for the optional integrations.
 */
export interface Env {
  // ---- Bindings ----
  D1DB: D1Database;

  // ---- Calling sidecar Worker (Durable Objects + service binding) ----
  // GATEWAY is a service binding to the `warmchats-calling-gateway` Worker that
  // hosts the two DO classes below. Pages Functions can't host DOs directly, so
  // they reach them by calling GATEWAY.fetch("http://gw/do/<class>/<name>/<method>").
  GATEWAY: Fetcher;
  // Set up via wrangler.toml [[r2_buckets]]. Endpoints guard on its presence
  // so the platform doesn't crash if you haven't created the bucket yet.
  ATTACHMENTS?: R2Bucket;

  // ---- App identity / URLs ----
  ENV: string;
  FRONTEND_URL: string;
  PUBLIC_SITE_URL: string;
  PUBLIC_BASE_URL: string;
  REPLY_DOMAIN: string;
  SUPPORT_EMAIL: string;
  // Comma-separated emails pinned as PLATFORM super-admins (gates /admin/* tools
  // + the is_admin flag). Authoritative when set; see adminAccess.ts.
  SUPER_ADMIN_EMAILS?: string;

  // ---- Auth / crypto ----
  JWT_SECRET: string;
  // HMAC-SHA256 key for signing CAN-SPAM unsubscribe-link tokens. Single use:
  // functions/_shared/emailCompliance.ts. Rotating invalidates all previously
  // issued unsubscribe links.
  EMAIL_UNSUB_SIGNING_KEY: string;
  FERNET_KEY: string;

  // ---- Cloudflare Turnstile (bot protection on public forms) ----
  // Secret half of the Turnstile widget. The matching site key lives in the
  // frontend env (VITE_TURNSTILE_SITE_KEY). If left blank, verifyTurnstile()
  // skips the check so the app still works in unconfigured environments.
  TURNSTILE_SECRET_KEY: string;

  // ---- Google OAuth (login) & Gmail OAuth ----
  GOOGLE_CLIENT_ID: string;
  GMAIL_OAUTH_CLIENT_ID: string;
  GMAIL_OAUTH_CLIENT_SECRET: string;
  GMAIL_OAUTH_REDIRECT_URI: string;
  GMAIL_PUBSUB_TOPIC_FULL_NAME: string;

  // ---- AI provider (OpenAI) ----
  OPENAI_API_KEY: string;

  // ---- Billing ----
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_FREE: string;
  STRIPE_PRICE_STARTER: string;
  STRIPE_PRICE_GROWTH: string;

  // ---- SMS: Telnyx ----
  TELNYX_API_KEY: string;
  TELNYX_PUBLIC_KEY: string;

  // ---- Voice: Telnyx Call Control + WebRTC ----
  TELNYX_CONNECTION_ID: string;            // Call Control App / connection id (PSTN legs)
  TELNYX_CREDENTIAL_CONNECTION_ID: string; // SIP credential connection (WebRTC legs)
  TELNYX_SIP_DOMAIN: string;               // e.g. warmchats.sip.telnyx.com
  TELNYX_VOICE_PROFILE_ID: string;         // outbound voice profile (optional)
  // 10DLC "ISV Platform Umbrella" - ONE shared brand + campaign + messaging
  // profile for the whole platform. New agent numbers are assigned to these;
  // we never register per-client brands/campaigns.
  TELNYX_MASTER_BRAND_ID: string;
  TELNYX_MASTER_CAMPAIGN_ID: string;
  TELNYX_MESSAGING_PROFILE_ID: string;

  // ---- Email: ElasticEmail ----
  ELASTIC_SENDER_NAME: string;
  ELASTIC_SENDER_EMAIL: string;
  ELASTIC_EMAIL_API_KEY: string;
  ELASTIC_WEBHOOK_URL: string;

  // ---- Web Push (VAPID) ----
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_CONTACT_EMAIL: string;

  // ---- Dev / debug ----
  // When truthy ("1"/"true"), outbound SMS/MMS/email goes through the mock
  // layer in functions/_shared/mockSendApi.ts instead of Telnyx/Elastic/Gmail.
  // The dev wrangler.toml sets this to "1" by default so local sends never
  // touch real providers.
  MOCK_SEND_APIS?: string;
}

export type AppContext = EventContext<Env, string, Record<string, unknown>>;
