-- 14.create-rate-limits.sql
-- Per-second send counters. Used by functions/_shared/sendRateLimiter.ts to
-- enforce provider caps (Telnyx 49 SMS/sec/phone, 14 MMS/sec/phone,
-- ElasticEmail 10/sec/domain). The cron worker increments these atomically
-- before each dispatch and skips the tick when the bucket is saturated.
--
-- We use D1 (not KV) because (a) KV is eventually consistent and would let
-- us blow past the cap on the same second from parallel cron invocations,
-- and (b) D1 lets us inspect / audit the counters in the admin debug page.

CREATE TABLE IF NOT EXISTS send_rate_counter (
    id            INTEGER PRIMARY KEY,
    channel       TEXT NOT NULL,        -- 'sms' | 'mms' | 'email'
    sender_key    TEXT NOT NULL,        -- telnyx phone for sms/mms, sending domain for email
    second_bucket INTEGER NOT NULL,     -- floor(unix_time_ms / 1000)
    count         INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (channel, sender_key, second_bucket)
);
CREATE INDEX IF NOT EXISTS ix_send_rate_counter_bucket
    ON send_rate_counter (channel, sender_key, second_bucket);
