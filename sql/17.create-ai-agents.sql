-- 17.create-ai-agents.sql
-- Backs the restructured "AI" section: three named agents (AI Agent,
-- Inbound AI, Outbound AI), each with its own state, a set of workflow cards,
-- and an activity log. These tables are a thin presentation/config layer over
-- the existing engines (auto_response_settings for inbound, automations/sequences
-- for outbound) - they do NOT replace them. See sql/10 (auto_response_settings)
-- and sql/6 (automation).

-- Per-agent enable + persona/tone/system-prompt overrides. One row per
-- (org_id, user_id, agent_key). agent_key is the stable identifier the UI and
-- routes use (assistant | inbound | outbound).
CREATE TABLE IF NOT EXISTS ai_agent_state (
    id            INTEGER PRIMARY KEY,
    org_id        INTEGER NOT NULL REFERENCES organization (id),
    user_id       INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    agent_key     TEXT NOT NULL,           -- assistant | inbound | outbound
    enabled       INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    display_name  TEXT,                    -- overrides the default agent name
    tone          TEXT,                    -- per-agent tone override (NULL = workspace default)
    system_prompt TEXT,                    -- per-agent system prompt override
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ai_agent_state UNIQUE (org_id, user_id, agent_key)
);
CREATE INDEX IF NOT EXISTS ix_ai_agent_state_user ON ai_agent_state (user_id, agent_key);

-- The workflow cards shown on each agent's "Workflows" tab. Each card is a
-- live toggle whose `enabled` is mirrored onto the real engine when flipped
-- (handled in the route, not the DB). workflow_key is stable (w1..w5 inbound,
-- o1..o6 outbound). trigger/action/outcome are display copy; runs_24h is a
-- cached display counter refreshed by the activity log / cron.
CREATE TABLE IF NOT EXISTS ai_workflow (
    id             INTEGER PRIMARY KEY,
    org_id         INTEGER NOT NULL REFERENCES organization (id),
    user_id        INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    agent_key      TEXT NOT NULL,          -- inbound | outbound (assistant has capabilities, not workflows)
    workflow_key   TEXT NOT NULL,          -- w1..w5 / o1..o6
    name           TEXT NOT NULL,
    trigger_type   TEXT,
    trigger_source TEXT,
    action         TEXT,
    outcome        TEXT,
    enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    position       INTEGER NOT NULL DEFAULT 0,
    runs_24h       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ai_workflow UNIQUE (org_id, user_id, agent_key, workflow_key)
);
CREATE INDEX IF NOT EXISTS ix_ai_workflow_user_agent ON ai_workflow (user_id, agent_key, position);

-- Append-only feed of what an agent did. Powers the per-agent "Logs" tab and
-- the right-rail "Live activity" stream. Written by the AI generate/reply,
-- leads/chat, test-chat routes and the cron senders.
CREATE TABLE IF NOT EXISTS ai_activity_log (
    id         INTEGER PRIMARY KEY,
    org_id     INTEGER NOT NULL REFERENCES organization (id),
    user_id    INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    agent_key  TEXT NOT NULL,              -- assistant | inbound | outbound
    event      TEXT NOT NULL,              -- reply.sent | lead.qualified | appointment.booked | reply.skipped | webhook.received | sequence.paused | ...
    lead_id    INTEGER REFERENCES lead (id) ON DELETE SET NULL,
    lead_label TEXT,                       -- denormalized display name (lead may be a webhook source, not a row)
    detail     TEXT,
    status     TEXT NOT NULL DEFAULT 'ok', -- ok | warn | error
    -- AI field-update provenance (populated for event='lead.field_updated'):
    -- which field changed, old/new value, classifier confidence (0-1) and the
    -- triggering message quote. Powers "AI updated Lead Type from Unknown to
    -- Buyer based on: '...' (confidence 0.92)" in the activity feed.
    field      TEXT,
    old_value  TEXT,
    new_value  TEXT,
    confidence REAL,
    evidence   TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ai_activity_log_feed ON ai_activity_log (org_id, agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_activity_log_user ON ai_activity_log (user_id, created_at DESC);
