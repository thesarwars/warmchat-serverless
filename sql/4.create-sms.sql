-- 4.create-sms.sql
-- Modern SMS set: provisioned numbers, contacts, conversations,
-- messages and inbound webhook dedupe.

CREATE TABLE IF NOT EXISTS sms_contact (
    id                   INTEGER PRIMARY KEY,
    org_id               INTEGER NOT NULL REFERENCES organization (id),
    phone_number_e164    TEXT NOT NULL,
    name                 TEXT,
    opted_out            INTEGER NOT NULL DEFAULT 0 CHECK (opted_out IN (0, 1)),
    opted_out_at         TEXT,
    opt_in_status        TEXT NOT NULL DEFAULT 'unsubscribed',
    opt_in_message_sent  INTEGER NOT NULL DEFAULT 0 CHECK (opt_in_message_sent IN (0, 1)),
    opt_in_source        TEXT,
    opt_in_at            TEXT,
    opt_in_ip            TEXT,
    opt_in_user_agent    TEXT,
    consent_text_version TEXT,
    consent_page_url     TEXT,
    -- Distinguishes how this number ended up opted-out:
    --   'keyword'       -> recipient texted STOP / UNSUBSCRIBE / etc.
    --   'manual_admin'  -> site admin manually blocked from /admin/blocked
    --   'manual_agent'  -> agent blocked from the lead profile in their inbox
    --   'manual_import' -> CSV import row was flagged as opted-out
    -- Null when opted_out = 0.
    opt_out_reason       TEXT,
    blocked_by_user_id   INTEGER REFERENCES "user" (id),
    CONSTRAINT uq_sms_contact_org_phone UNIQUE (org_id, phone_number_e164)
);
CREATE INDEX IF NOT EXISTS ix_sms_contact_org_id        ON sms_contact (org_id);
CREATE INDEX IF NOT EXISTS ix_sms_contact_phone         ON sms_contact (phone_number_e164);
CREATE INDEX IF NOT EXISTS ix_sms_contact_opt_in_status ON sms_contact (opt_in_status);

CREATE TABLE IF NOT EXISTS sms_conversation (
    id              INTEGER PRIMARY KEY,
    org_id          INTEGER NOT NULL REFERENCES organization (id),
    contact_id      INTEGER NOT NULL REFERENCES sms_contact (id),
    last_message_at TEXT,
    CONSTRAINT uq_sms_conversation_org_contact UNIQUE (org_id, contact_id)
);
CREATE INDEX IF NOT EXISTS ix_sms_conversation_org_id     ON sms_conversation (org_id);
CREATE INDEX IF NOT EXISTS ix_sms_conversation_contact_id ON sms_conversation (contact_id);

CREATE TABLE IF NOT EXISTS sms_message (
    id                 INTEGER PRIMARY KEY,
    org_id             INTEGER NOT NULL REFERENCES organization (id),
    conversation_id    INTEGER NOT NULL REFERENCES sms_conversation (id),
    direction          TEXT NOT NULL,
    body               TEXT NOT NULL,
    attachments        TEXT,                  -- JSON
    status             TEXT NOT NULL,
    provider_message_sid TEXT,
    error_code         TEXT,
    client_request_id  TEXT,
    created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at            TEXT,
    delivered_at       TEXT,
    is_read            INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    -- 1 when this outbound message was composed/sent by the AI agent (the
    -- tool-calling inbound agent, qualification flow, or instant reply) rather
    -- than typed by a human in the inbox composer. Drives the "AI Agent" marker
    -- above the bubble in the inbox. Inbound, human-composed, and automation
    -- (campaign) rows leave this 0 - campaign rows are tagged by automation_id.
    sent_by_ai         INTEGER NOT NULL DEFAULT 0 CHECK (sent_by_ai IN (0, 1)),
    -- Set when this outbound message was sent by an automation (campaign /
    -- workflow) drip rather than the conversational AI or a human. The inbox
    -- shows the automation's name above the bubble instead of the "AI Agent"
    -- marker. NULL for AI-agent + human-composed sends. Plain INTEGER (no FK)
    -- to match scheduled_message.automation_id - automation is created in a
    -- later sql file, so a REFERENCES clause would be a forward reference.
    automation_id      INTEGER,
    CONSTRAINT uq_sms_message_org_client_request UNIQUE (org_id, client_request_id)
);
CREATE INDEX IF NOT EXISTS ix_sms_message_org_id          ON sms_message (org_id);
CREATE INDEX IF NOT EXISTS ix_sms_message_conversation_id ON sms_message (conversation_id);
CREATE INDEX IF NOT EXISTS ix_sms_message_provider_sid    ON sms_message (provider_message_sid);


-- Per-conversation SMS thread + MAX(created_at) recency.
CREATE INDEX IF NOT EXISTS ix_sms_message_conv_created ON sms_message (conversation_id, created_at);
