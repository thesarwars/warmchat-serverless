-- 6.create-automations.sql
-- Automations + message templates / categories / personas / tones / presets.
-- `preset` lives here (not onboarding) because message_templates FK-references it.

CREATE TABLE IF NOT EXISTS template_categories (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    org_id    INTEGER NOT NULL REFERENCES organization (id)
);
-- Required as the conflict target for the UPSERT in functions/api/ai/templates/seed-defaults.ts
-- and as the DB-level guard against concurrent seed runs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_categories_org_name
    ON template_categories (org_id, name);

CREATE TABLE IF NOT EXISTS tones (
    id        INTEGER PRIMARY KEY,
    label     TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS persona (
    id        INTEGER PRIMARY KEY,
    label     TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS preset (
    id             INTEGER PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    avg_replies    TEXT NOT NULL,
    no_of_messages INTEGER NOT NULL,
    days           TEXT
);

CREATE TABLE IF NOT EXISTS message_templates (
    id            INTEGER PRIMARY KEY,
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    subject       TEXT,
    channel       TEXT,
    delay_days    INTEGER,
    delay_seconds INTEGER,
    delay_label   TEXT,
    send_at       TEXT,
    timezone      TEXT,
    image_url     TEXT,
    prompt        TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    -- Which AI agent this template is curated for. Drives the per-agent
    -- "Templates" tab (a filtered view of the shared library). NULL / 'manual'
    -- = a general template usable everywhere and by humans in the inbox.
    agent         TEXT,    -- assistant | inbound | outbound | manual (NULL = all)
    -- Lifetime send count + last-used timestamp, shown on the agent template
    -- cards ("142 sent · 2m ago"). Maintained by the send paths / seed.
    sent_count    INTEGER NOT NULL DEFAULT 0,
    last_used_at  TEXT,
    tone_id       INTEGER REFERENCES tones (id),
    preset_id     INTEGER REFERENCES preset (id),
    category_id   INTEGER NOT NULL REFERENCES template_categories (id),
    org_id        INTEGER NOT NULL REFERENCES organization (id),
    created_by    TEXT
);
CREATE INDEX IF NOT EXISTS ix_message_templates_org_agent ON message_templates (org_id, agent);
CREATE INDEX IF NOT EXISTS ix_message_templates_org_id ON message_templates (org_id);
-- Required as the conflict target for the UPSERT in functions/api/ai/templates/seed-defaults.ts;
-- also prevents duplicate templates when two concurrent seed runs race on the same org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_templates_org_cat_channel_title
    ON message_templates (org_id, category_id, channel, title);

CREATE TABLE IF NOT EXISTS automation (
    id                   INTEGER PRIMARY KEY,
    name                 TEXT NOT NULL,
    channels             TEXT NOT NULL,        -- JSON
    message              TEXT NOT NULL,
    -- Opening-message send time. NULL = send instantly on enroll (the default);
    -- "HH:MM" (account timezone) = schedule the opening for that time on the
    -- enrollment day instead. Follow-up times live in followup_steps[].send_time.
    opening_send_time    TEXT,
    email_subject        TEXT,
    attachments          TEXT,                 -- JSON
    sources              TEXT NOT NULL,        -- JSON
    leads                TEXT NOT NULL,        -- JSON
    org_id               TEXT NOT NULL,        -- stored as string in source model
    owner_id             TEXT NOT NULL,
    created_at           TEXT DEFAULT CURRENT_TIMESTAMP,
    completed            INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    status               TEXT NOT NULL DEFAULT 'Running',
    email_sender_type    TEXT DEFAULT 'personal',
    followup_sequence_id TEXT,
    followup_steps       TEXT,                 -- JSON
    is_archived          INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    archived_at          TEXT,
    delivered_count      INTEGER NOT NULL DEFAULT 0,
    opened_count         INTEGER NOT NULL DEFAULT 0,
    converted_count      INTEGER NOT NULL DEFAULT 0,
    timezone             TEXT,
    workflow_key         TEXT,                 -- links to an Outbound AI workflow card (o1-o5) for card-level pause/resume
    thread_id            INTEGER REFERENCES thread (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_automation_org_id ON automation (org_id);
CREATE INDEX IF NOT EXISTS ix_automation_workflow_key ON automation (org_id, workflow_key);
