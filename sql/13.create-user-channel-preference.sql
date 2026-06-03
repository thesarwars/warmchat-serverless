-- 13.create-user-channel-preference.sql
-- Per-user default sending-channel preferences for the Connected Accounts page.

CREATE TABLE IF NOT EXISTS user_channel_preference (
    id                  INTEGER PRIMARY KEY,
    user_id             INTEGER NOT NULL UNIQUE REFERENCES "user" (id),
    default_email_mode  TEXT    NOT NULL DEFAULT 'auto', -- 'personal' | 'business' | 'auto'
    default_sms_enabled INTEGER NOT NULL DEFAULT 1,      -- bool
    created_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT    DEFAULT CURRENT_TIMESTAMP
);
