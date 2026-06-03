-- 8.create-email-connections.sql
-- Email provider plumbing: Gmail OAuth connections/tokens/watch, in/outbound
-- message dedupe, IMAP/SMTP connections.

CREATE TABLE IF NOT EXISTS email_connections (
    id             INTEGER PRIMARY KEY,
    tenant_id      INTEGER REFERENCES organization (id),
    user_id        INTEGER NOT NULL REFERENCES "user" (id),
    provider       TEXT NOT NULL DEFAULT 'gmail',
    status         TEXT NOT NULL DEFAULT 'active',
    email_address  TEXT NOT NULL,
    google_sub     TEXT,
    scopes_granted TEXT,
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    last_send_at   TEXT,
    last_ingest_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_email_connections_user_id ON email_connections (user_id);

CREATE TABLE IF NOT EXISTS oauth_tokens (
    id                      INTEGER PRIMARY KEY,
    connection_id           INTEGER NOT NULL REFERENCES email_connections (id),
    refresh_token_encrypted TEXT NOT NULL,
    access_token_cache      TEXT,
    access_token_expires_at TEXT,
    scopes_granted          TEXT,
    revoked_at              TEXT,
    created_at              TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at              TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gmail_watch_state (
    id                    INTEGER PRIMARY KEY,
    connection_id         INTEGER NOT NULL REFERENCES email_connections (id),
    history_id_checkpoint TEXT,
    watch_expiration_at   TEXT,
    watch_status          TEXT NOT NULL DEFAULT 'active',
    last_watch_renew_at   TEXT,
    created_at            TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at            TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inbound_messages (
    id                  INTEGER PRIMARY KEY,
    connection_id       INTEGER NOT NULL REFERENCES inbox_connection (id),
    provider            TEXT NOT NULL DEFAULT 'elastic',
    provider_message_id TEXT NOT NULL,
    provider_thread_id  TEXT,
    rfc822_message_id   TEXT,
    in_reply_to         TEXT,
    "references"        TEXT,
    sender_email        TEXT,
    to_email            TEXT,
    subject             TEXT,
    received_at         TEXT,
    thread_id           INTEGER REFERENCES thread (id),
    created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_events (
    id                  INTEGER PRIMARY KEY,
    provider            TEXT NOT NULL DEFAULT 'elastic',
    provider_message_id TEXT,
    event_type          TEXT NOT NULL,      -- sent | opened | clicked | bounced | unsubscribed | abuse | error
    to_email            TEXT,
    from_email          TEXT,
    subject             TEXT,
    category            TEXT,
    raw                 TEXT,                -- JSON payload as received
    occurred_at         TEXT,
    created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_email_events_msgid    ON email_events (provider_message_id);
CREATE INDEX IF NOT EXISTS ix_email_events_to_email ON email_events (to_email);

CREATE TABLE IF NOT EXISTS inbox_connection (
    id                               INTEGER PRIMARY KEY,
    user_id                          INTEGER NOT NULL REFERENCES "user" (id),
    email_address                    TEXT NOT NULL,
    imap_host                        TEXT,
    smtp_host                        TEXT,
    encrypted_password               TEXT,
    port_imap                        INTEGER DEFAULT 993,
    port_smtp                        INTEGER DEFAULT 465,
    created_at                       TEXT DEFAULT CURRENT_TIMESTAMP,
    elastic_from_email               TEXT,
    provider                         TEXT,                  -- gmail | elastic
    can_receive                      INTEGER DEFAULT 1 CHECK (can_receive IN (0, 1)),
    status                           TEXT,
    is_verified                      INTEGER DEFAULT 1 CHECK (is_verified IN (0, 1)),
    elastic_email_inbound_route_added INTEGER DEFAULT 0 CHECK (elastic_email_inbound_route_added IN (0, 1))
);
