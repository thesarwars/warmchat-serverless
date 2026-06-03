-- 20.create-ai-intelligence.sql
-- AI-native CRM intelligence layer (docs/automations-ai-flow/): the hot-lead
-- escalation ladder and the structured knowledge base used by the AI Agent.
-- Both FK-reference organization/user/lead, so they are dropped before those
-- parents in 0.drop-tables.sql.

-- The hot-lead escalation ladder ("WarmChats should be obsessed with making sure
-- hot leads never get ignored" - biggest-differentiator.md). When the reactive
-- flow detects booking/ready intent it opens ONE open row per lead at level 1
-- (in-app notify). A cron pass advances the level (1 -> in-app, 2 -> SMS to the
-- agent, 3 -> push/email) every time next_alert_at passes, repeating until the
-- agent responds / books / dismisses. Powers Activity "Needs Attention" + the
-- Action Center "Urgent Now" list.
CREATE TABLE IF NOT EXISTS lead_escalation (
    id              INTEGER PRIMARY KEY,
    org_id          INTEGER NOT NULL REFERENCES organization (id),
    lead_id         INTEGER NOT NULL REFERENCES lead (id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES "user" (id) ON DELETE SET NULL, -- agent to alert (lead owner / handoff target)
    reason          TEXT NOT NULL,                 -- "Booking intent" | "Ready to buy" | matched keyword | ...
    detail          TEXT,                          -- triggering message excerpt
    level           INTEGER NOT NULL DEFAULT 1,    -- 1 = in-app, 2 = SMS to agent, 3 = push/email
    status          TEXT NOT NULL DEFAULT 'open',  -- open | resolved
    next_alert_at   TEXT,                          -- when cron should escalate to the next level
    resolved_at     TEXT,
    resolved_reason TEXT,                          -- agent_reply | appointment_booked | dismissed | lead_optout
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_lead_escalation_pending ON lead_escalation (org_id, status, next_alert_at);
CREATE INDEX IF NOT EXISTS ix_lead_escalation_lead    ON lead_escalation (lead_id, status);

-- Structured knowledge base behind the AI Agent "Knowledge Base" tab. Goes
-- beyond agent_profile (which holds brokerage facts): FAQ answers, custom canned
-- answers, and the enabled/disabled state of knowledge sources. buildAgentSystemPrompt
-- layers the enabled entries so the AI answers from structured data and defers
-- ("the agent will confirm") when a fact is missing, never inventing details.
CREATE TABLE IF NOT EXISTS ai_knowledge_entry (
    id          INTEGER PRIMARY KEY,
    org_id      INTEGER NOT NULL REFERENCES organization (id),
    user_id     INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    category    TEXT NOT NULL DEFAULT 'general', -- general | faq | source
    question    TEXT,                            -- FAQ question / trigger (NULL for a "source" toggle row)
    answer      TEXT,                            -- the answer the AI should give
    source      TEXT,                            -- provenance label (manual | listings | calendar | website | ...)
    enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ai_knowledge_entry_user ON ai_knowledge_entry (user_id, category, position);
