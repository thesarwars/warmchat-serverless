-- 19.create-integrations.sql
-- External integration plumbing (Zapier, ManyChat, and any future partner).
--
-- api_key: long-lived per-org bearer keys so an external service (a standing
-- Zap) can call /api/integrations/v1/** without a browser session. The full
-- key is shown to the user ONCE on creation; only the SHA-256 hash + a short
-- display prefix are stored. High-entropy random key, so a single SHA-256 is
-- safe AND cheap (no PBKDF2 - we stay under the free-tier 10ms CPU cap).
--
-- integration_subscription: Zapier REST Hook (instant trigger) targets. When a
-- WarmChats event fires (lead.created / lead.replied / lead.status_changed /
-- appointment.booked) we POST the payload to every subscribed target_url for
-- that org + event. Zapier subscribes/unsubscribes via POST/DELETE /hooks.

CREATE TABLE IF NOT EXISTS api_key (
    id                 INTEGER PRIMARY KEY,
    org_id             INTEGER NOT NULL REFERENCES organization (id),
    created_by_user_id INTEGER REFERENCES "user" (id),
    name               TEXT NOT NULL,
    key_prefix         TEXT NOT NULL,                                    -- e.g. "wc_live_3f9a" for display
    key_hash           TEXT NOT NULL,                                    -- SHA-256 hex of the full key
    scopes             TEXT NOT NULL DEFAULT 'leads:write,leads:read',  -- comma-separated scope list
    last_used_at       TEXT,
    created_at         TEXT DEFAULT CURRENT_TIMESTAMP,
    revoked_at         TEXT                                             -- set = immediately rejected by requireApiKey
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_key_hash ON api_key (key_hash);
CREATE INDEX IF NOT EXISTS ix_api_key_org ON api_key (org_id);

CREATE TABLE IF NOT EXISTS integration_subscription (
    id         INTEGER PRIMARY KEY,
    org_id     INTEGER NOT NULL REFERENCES organization (id),
    api_key_id INTEGER REFERENCES api_key (id),
    event      TEXT NOT NULL,                  -- lead.created | lead.replied | lead.status_changed | appointment.booked
    target_url TEXT NOT NULL,                  -- Zapier-provided REST Hook URL
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_sub ON integration_subscription (org_id, event, target_url);
CREATE INDEX IF NOT EXISTS ix_integration_sub_lookup ON integration_subscription (org_id, event);
