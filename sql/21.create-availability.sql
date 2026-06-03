-- 21.create-availability.sql
-- The human agent's bookable hours - the single source of truth the AI honors
-- when proposing/booking appointments (docs/automations-ai-flow: the agent sets
-- when HE is available so the AI never books 12am or double-books). One row per
-- (org_id, user_id). Edited from the Calendar, Settings v2, and AI Inbound
-- settings; read by functions/_shared/availability.ts (findOpenSlots /
-- isSlotBookable) which also becomes the appointment double-booking guard.
-- FK-references organization/user, so it drops before them in 0.drop-tables.sql.

CREATE TABLE IF NOT EXISTS agent_availability (
    id               INTEGER PRIMARY KEY,
    org_id           INTEGER NOT NULL REFERENCES organization (id),
    user_id          INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    -- IANA tz the weekly_hours are expressed in (defaults to the org timezone).
    timezone         TEXT,
    -- JSON map of weekday -> array of [start,end] "HH:MM" windows, e.g.
    -- {"mon":[["09:00","17:00"]],"sat":[],...}. NULL = use the service default
    -- (Mon-Fri 9-17). An empty array for a day = not bookable that day.
    weekly_hours     TEXT,
    -- JSON array of blocked dates / one-off exceptions: ["2026-07-04", ...].
    exceptions       TEXT,
    slot_minutes     INTEGER NOT NULL DEFAULT 30,
    buffer_minutes   INTEGER NOT NULL DEFAULT 0,
    -- Minimum lead time before a slot can be offered (no "in 5 minutes" booking).
    min_notice_hours INTEGER NOT NULL DEFAULT 2,
    -- How far ahead the AI may offer slots.
    horizon_days     INTEGER NOT NULL DEFAULT 14,
    enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agent_availability UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_agent_availability_user ON agent_availability (user_id);
