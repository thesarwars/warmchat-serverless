-- 7.create-sequences.sql
-- Drip sequences: templates, per-lead instances and per-step executions.
-- UUID PKs map to TEXT.

CREATE TABLE IF NOT EXISTS sequences (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    user_id    INTEGER REFERENCES "user" (id),
    org_id     INTEGER REFERENCES organization (id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sequence_steps (
    id               TEXT PRIMARY KEY,
    sequence_id      TEXT NOT NULL REFERENCES sequences (id),
    step_number      INTEGER NOT NULL,
    subject          TEXT,
    message_template TEXT NOT NULL,
    delay_amount     INTEGER NOT NULL DEFAULT 0,
    delay_unit       TEXT NOT NULL DEFAULT 'days',   -- minutes | hours | days
    send_at          TEXT,                           -- "HH:MM"
    timezone         TEXT,
    attachments      TEXT,                           -- JSON
    channel          TEXT NOT NULL                   -- email | sms
);
CREATE INDEX IF NOT EXISTS ix_sequence_steps_sequence_id ON sequence_steps (sequence_id);

CREATE TABLE IF NOT EXISTS sequence_instances (
    id           TEXT PRIMARY KEY,
    sequence_id  TEXT NOT NULL REFERENCES sequences (id),
    lead_id      TEXT NOT NULL,
    lead_contact TEXT NOT NULL,
    user_id      INTEGER REFERENCES "user" (id),
    org_id       INTEGER REFERENCES organization (id),
    status       TEXT NOT NULL DEFAULT 'active',     -- active | paused | completed | cancelled
    started_at   TEXT DEFAULT CURRENT_TIMESTAMP,
    extra_data   TEXT                                -- JSON
);
CREATE INDEX IF NOT EXISTS ix_sequence_instances_sequence_id ON sequence_instances (sequence_id);

CREATE TABLE IF NOT EXISTS step_executions (
    id              TEXT PRIMARY KEY,
    instance_id     TEXT NOT NULL REFERENCES sequence_instances (id),
    step_id         TEXT NOT NULL REFERENCES sequence_steps (id),
    step_number     INTEGER NOT NULL,
    scheduled_at    TEXT NOT NULL,
    attempted_count INTEGER DEFAULT 0,
    sent_at         TEXT,
    status          TEXT DEFAULT 'scheduled',        -- scheduled | processing | sent | failed | cancelled
    result          TEXT                             -- JSON
);
CREATE INDEX IF NOT EXISTS ix_step_executions_instance_id  ON step_executions (instance_id);
CREATE INDEX IF NOT EXISTS ix_step_executions_scheduled_at ON step_executions (scheduled_at);
