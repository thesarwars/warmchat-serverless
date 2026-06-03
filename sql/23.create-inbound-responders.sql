-- Custom inbound auto-responders (AI Agent -> Inbound -> Workflows). Each row is
-- a user-defined rule: when an inbound message matches the trigger / keywords,
-- the AI replies along the lines of `message` in `tone`. These are injected into
-- the inbound system prompt (buildAgentSystemPrompt) so the agent applies them,
-- and surfaced as cards in the inbound Workflows tab (create / edit / remove).
-- `trigger_label` is named to avoid the reserved SQLite keyword TRIGGER.
CREATE TABLE IF NOT EXISTS inbound_responder (
    id            INTEGER PRIMARY KEY,
    org_id        INTEGER NOT NULL REFERENCES organization (id),
    user_id       INTEGER NOT NULL REFERENCES "user" (id),
    name          TEXT NOT NULL,
    trigger_label TEXT,                 -- e.g. "Pricing question", "Specific keywords"
    keywords      TEXT,                 -- comma-separated phrases (for keyword triggers)
    tone          TEXT,
    message       TEXT NOT NULL,
    enabled       INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_inbound_responder_org_user ON inbound_responder (org_id, user_id);
