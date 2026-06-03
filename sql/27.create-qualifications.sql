-- 27.create-qualifications.sql
-- User-editable lead qualification questions behind the AI Agent > AI Settings >
-- Qualifications tab. Each row is ONE question the AI may ask to qualify a lead,
-- scoped to a lead type via `applies_to` (buyer/seller/renter/open_house, or
-- `all`). buildAgentSystemPrompt layers the enabled rows into the inbound prompt
-- so the agent asks the right questions (one at a time, after the lead engages)
-- instead of the old hardcoded QUALIFICATION_FLOWS. FK-references organization
-- and user, so it is dropped before those parents in 0.drop-tables.sql.
CREATE TABLE IF NOT EXISTS ai_qualification (
    id          INTEGER PRIMARY KEY,
    org_id      INTEGER NOT NULL REFERENCES organization (id),
    user_id     INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    applies_to  TEXT NOT NULL DEFAULT 'all', -- all | buyer | seller | renter | open_house
    question    TEXT NOT NULL,               -- the qualifying question to ask
    guidance    TEXT,                        -- optional: how/why the AI should use the answer
    enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ai_qualification_user ON ai_qualification (user_id, applies_to, position);
