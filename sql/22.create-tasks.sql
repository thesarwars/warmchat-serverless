-- 22.create-tasks.sql
-- General task / to-do backend (the AI generates follow-up tasks; agents create
-- them too). Distinct from call_tasks (per-call checklists). FK-references
-- organization/user/lead/deal, so it drops before them in 0.drop-tables.sql.

CREATE TABLE IF NOT EXISTS task (
    id                 INTEGER PRIMARY KEY,
    org_id             INTEGER NOT NULL REFERENCES organization (id),
    user_id            INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE, -- owner / assignee
    lead_id            INTEGER REFERENCES lead (id) ON DELETE SET NULL,
    deal_id            INTEGER REFERENCES deal (id) ON DELETE SET NULL,
    title              TEXT NOT NULL,
    description        TEXT,
    why                TEXT,                                -- AI: why this task matters (AI Recommended cards)
    recommendation     TEXT,                                -- AI: recommended next action (AI Recommended cards)
    score              TEXT,                                -- AI: conversion score, e.g. "92%" / "+87%"
    score_label        TEXT,                                -- AI: score caption, e.g. "Likely to convert"
    type               TEXT,                                -- call | email | showing | followup | cma | task | ...
    priority           TEXT NOT NULL DEFAULT 'normal',      -- low | normal | high | urgent
    due_at             TEXT,
    status             TEXT NOT NULL DEFAULT 'open',         -- open | done | dismissed
    source             TEXT NOT NULL DEFAULT 'manual',       -- manual | ai
    created_by_user_id INTEGER REFERENCES "user" (id),
    created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_task_org_status ON task (org_id, status, due_at);
CREATE INDEX IF NOT EXISTS ix_task_owner      ON task (user_id, status);
CREATE INDEX IF NOT EXISTS ix_task_lead       ON task (lead_id);
