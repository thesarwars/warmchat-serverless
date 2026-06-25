-- 3.create-inbox.sql
-- Unified email/SMS inbox: inboxes, threads, messages and assignments.
-- LONGTEXT columns map to TEXT;
-- JSON columns (attachments, meta) are stored as TEXT JSON strings.

CREATE TABLE IF NOT EXISTS inbox (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    channel    TEXT NOT NULL,                 -- email | sms | ...
    org_id     INTEGER NOT NULL REFERENCES organization (id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS thread (
    id           INTEGER PRIMARY KEY,
    subject      TEXT,
    inbox_id     INTEGER NOT NULL REFERENCES inbox (id),
    created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
    unread_count INTEGER DEFAULT 0,
    updated_at   TEXT DEFAULT CURRENT_TIMESTAMP,
    gm_thrid     TEXT,
    thread_token TEXT
);

CREATE TABLE IF NOT EXISTS inbox_messages (
    id                INTEGER PRIMARY KEY,
    thread_id         INTEGER NOT NULL REFERENCES thread (id),
    sender_id         INTEGER REFERENCES "user" (id),
    sender_name       TEXT,
    sender_email      TEXT,
    to_email          TEXT,
    to_name           TEXT,
    cc                TEXT,
    subject           TEXT NOT NULL,
    body              TEXT NOT NULL,
    attachments       TEXT,                    -- JSON
    direction         TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    channel           TEXT,
    message_id        TEXT,                    -- RFC Message-ID
    in_reply_to       TEXT,                    -- RFC In-Reply-To
    references_header TEXT,                    -- RFC References chain
    gm_thrid          TEXT,
    meta              TEXT,                    -- JSON
    created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
    message_date      TEXT,
    is_read           INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    -- Outbound delivery lifecycle. `delivery_status` is one of
    -- 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed'. The Elastic
    -- Email webhook (functions/api/elastic/status.ts) updates it from the
    -- provider's MessageDelivered / MessageBounced / MessageFailed events.
    -- `opened_at` is set by the tracking pixel the first time the recipient
    -- loads images. Inbound rows leave all of these NULL.
    delivery_status   TEXT,
    sent_at           TEXT,
    delivered_at      TEXT,
    bounced_at        TEXT,
    opened_at         TEXT,
    error_message     TEXT,
    -- Random per-message token embedded in the tracking-pixel URL so the
    -- /api/inbox/email/open/<token>.gif endpoint can flip opened_at without
    -- exposing the internal row id.
    tracking_token    TEXT UNIQUE,
    -- 1 when this outbound email was composed/sent by the AI agent (the
    -- tool-calling agent's send_message on the email channel) rather than typed
    -- by a human in the inbox composer. Drives the "AI Agent" marker above the
    -- bubble in the inbox. Inbound, human-composed, and automation (campaign)
    -- rows leave this 0 - campaign rows are tagged by automation_id instead.
    sent_by_ai        INTEGER NOT NULL DEFAULT 0 CHECK (sent_by_ai IN (0, 1)),
    -- Set when this outbound email was sent by an automation (campaign /
    -- workflow) drip. The inbox shows the automation's name above the bubble
    -- instead of the "AI Agent" marker. NULL for AI-agent + human sends. Plain
    -- INTEGER (no FK) - automation is created in a later sql file.
    automation_id     INTEGER
);
CREATE INDEX IF NOT EXISTS ix_inbox_messages_tracking_token
    ON inbox_messages (tracking_token);
CREATE INDEX IF NOT EXISTS ix_inbox_messages_thread_id ON inbox_messages (thread_id);
-- Lookups in /api/inbox/contacts/:leadId/messages filter by lead email against
-- sender_email/to_email (case-insensitive) and join thread->inbox by org. Without
-- these indexes the join scans the full table on every contact click.
CREATE INDEX IF NOT EXISTS ix_inbox_messages_sender_email_lower
    ON inbox_messages (LOWER(sender_email));
CREATE INDEX IF NOT EXISTS ix_inbox_messages_to_email_lower
    ON inbox_messages (LOWER(to_email));
CREATE INDEX IF NOT EXISTS ix_thread_inbox_id ON thread (inbox_id);
CREATE INDEX IF NOT EXISTS ix_inbox_org_id ON inbox (org_id);

CREATE TABLE IF NOT EXISTS thread_lead_assignments (
    id          INTEGER PRIMARY KEY,
    thread_id   INTEGER NOT NULL REFERENCES thread (id),
    lead_id     INTEGER NOT NULL REFERENCES lead (id),
    assigned_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Inbox per-thread latest-message subqueries + message thread fetch.
CREATE INDEX IF NOT EXISTS ix_inbox_messages_thread_date
    ON inbox_messages (thread_id, message_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_inbox_messages_thread_unread
    ON inbox_messages (thread_id) WHERE is_read = 0;
