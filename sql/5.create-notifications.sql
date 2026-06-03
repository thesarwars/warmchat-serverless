-- 5.create-notifications.sql
-- In-app notification center and the scheduled-message queue.

-- Unified notification feed. One row per surfaced event (message, call, appt,
-- billing, system). `kind` drives the icon + routing on the client.
CREATE TABLE IF NOT EXISTS notification (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    org_id          INTEGER REFERENCES organization (id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,             -- sms_inbound | email_inbound | call_incoming
                                               -- | call_missed | voicemail
                                               -- | appointment_booked | appointment_rescheduled
                                               -- | appointment_cancelled | appointment_reminder
                                               -- | automation_completed | message_failed | message_bounced
                                               -- | dlc_status_changed
                                               -- | payment_failed | subscription_changed | quota_warning
                                               -- | system
    channel         TEXT,                      -- sms | email | call | system
    contact_id      INTEGER,
    conversation_id INTEGER,
    appointment_id  INTEGER,
    severity        TEXT NOT NULL DEFAULT 'info', -- info | success | warning | error
    title           TEXT NOT NULL,
    body            TEXT,
    -- Free-form JSON blob the client can use to route (e.g. {"path":"/appointments/42"}).
    data            TEXT,
    is_read         INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    read_at         TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_notification_user_id ON notification (user_id);
CREATE INDEX IF NOT EXISTS ix_notification_org_id  ON notification (org_id);
CREATE INDEX IF NOT EXISTS ix_notification_user_unread ON notification (user_id, is_read);

CREATE TABLE IF NOT EXISTS scheduled_message (
    id               INTEGER PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    org_id           INTEGER NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
    contact_id       INTEGER REFERENCES lead (id) ON DELETE SET NULL,
    automation_id    INTEGER,                  -- automation(id) when queued from an automation send
    channel          TEXT NOT NULL,            -- sms | email
    to_address       TEXT NOT NULL,            -- E.164 phone or email
    subject          TEXT,
    body             TEXT,
    attachments_json TEXT,                     -- JSON array
    scheduled_at     TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | sending | sent | failed | cancelled
    error_message    TEXT,
    sent_message_id  INTEGER,
    sent_at          TEXT,
    -- 1 when the queued send was composed by the AI agent (AI-personalized
    -- automation drip, instant reply, or an AI conversational send deferred by
    -- quiet hours). The cron copies this onto the materialized
    -- sms_message/inbox_messages row so the inbox shows the "AI Agent" marker.
    -- Human-scheduled sends (inbox compose -> schedule) leave this 0.
    sent_by_ai       INTEGER NOT NULL DEFAULT 0 CHECK (sent_by_ai IN (0, 1)),
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_scheduled_message_user_id      ON scheduled_message (user_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_message_org_id       ON scheduled_message (org_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_message_scheduled_at ON scheduled_message (scheduled_at);
CREATE INDEX IF NOT EXISTS ix_scheduled_message_automation_id ON scheduled_message (automation_id);
