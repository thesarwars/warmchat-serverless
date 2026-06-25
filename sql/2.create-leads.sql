-- 2.create-leads.sql
-- Leads, tags, appointments and deals.

CREATE TABLE IF NOT EXISTS lead (
    id                          INTEGER PRIMARY KEY,
    name                        TEXT,
    first_name                  TEXT,
    last_name                   TEXT,
    email                       TEXT,
    company                     TEXT,
    status                      TEXT DEFAULT 'New Lead',  -- the lead's pipeline Stage (drives Score + hot)
    phone                       TEXT,
    source                      TEXT,
    property_address            TEXT,
    area                        TEXT,
    price_range                 TEXT,
    estimated_price             REAL,
    notes                       TEXT,
    sms_consent_status          TEXT DEFAULT 'unknown',
    email_notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (email_notifications_enabled IN (0, 1)),
    sms_notifications_enabled   INTEGER NOT NULL DEFAULT 1 CHECK (sms_notifications_enabled IN (0, 1)),
    created_at                  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TEXT DEFAULT CURRENT_TIMESTAMP,
    -- Newest message timestamp (email or SMS) for this lead; maintained at message
    -- insert + reconcile cron. Powers the inbox contacts recency pagination.
    last_activity_at            TEXT,
    verified                    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    sms_opt_out                 INTEGER NOT NULL DEFAULT 0 CHECK (sms_opt_out IN (0, 1)),
    last_opt_out_at             TEXT,
    email_opt_out               INTEGER NOT NULL DEFAULT 0 CHECK (email_opt_out IN (0, 1)),
    last_email_opt_out_at       TEXT,
    owner_id                    INTEGER REFERENCES "user" (id),
    org_id                      INTEGER REFERENCES organization (id),
    appointment_booked          INTEGER NOT NULL DEFAULT 0 CHECK (appointment_booked IN (0, 1)),
    auto_response_route         TEXT,
    lead_type                   TEXT,
    intent                      TEXT,
    -- AI is OFF by default: a lead is only "AI Active" once explicitly enrolled
    -- (apply-ai) or toggled on. NULL renders as "AI Off" and follows the
    -- account-level inbound default; it is NOT a per-lead hard block.
    ai_status                   TEXT DEFAULT NULL,
    timeline                    TEXT,
    pre_approved                INTEGER CHECK (pre_approved IN (0, 1)),
    motivation                  TEXT,
    occupancy_status            TEXT,
    financing_status            TEXT,
    interest_level              TEXT,
    -- AI-native CRM intelligence, auto-maintained by the reactive flow
    -- (advanceQualification) and cron - never required from the agent. The agent
    -- can still override any of these manually. bedrooms/bathrooms/property_type
    -- and seller_price_expectations are extracted from conversation; lead_score is
    -- 0-100; next_best_action is a short verb phrase ("Call now", "Schedule
    -- consultation", ...); ai_summary is the one-line auto-generated profile
    -- rendered on the lead card, stamped via ai_summary_updated_at to debounce.
    bedrooms                    INTEGER,
    bathrooms                   REAL,
    property_type               TEXT,
    seller_price_expectations   TEXT,
    lead_score                  INTEGER,
    next_best_action            TEXT,
    ai_summary                  TEXT,
    ai_summary_updated_at       TEXT,
    last_reply_at               TEXT,
    qualification_step          INTEGER NOT NULL DEFAULT 0,
    qualification_status        TEXT,
    timezone                    TEXT,
    timezone_source             TEXT,
    auto_followup_action        TEXT,
    -- External-integration provenance (Zapier/ManyChat etc.). external_id is the
    -- source system's id (e.g. a ManyChat subscriber id) used for idempotent
    -- upsert from /api/integrations/v1/leads; platform is the capture channel
    -- (Instagram | Facebook | Website | ...).
    external_id                 TEXT,
    platform                    TEXT
);
CREATE INDEX IF NOT EXISTS ix_lead_org_id ON lead (org_id);
CREATE INDEX IF NOT EXISTS ix_lead_owner_id ON lead (owner_id);
CREATE INDEX IF NOT EXISTS ix_lead_org_external ON lead (org_id, external_id);

CREATE TABLE IF NOT EXISTS tags (
    id     INTEGER PRIMARY KEY,
    name   TEXT NOT NULL,
    org_id INTEGER REFERENCES organization (id),
    CONSTRAINT uq_tag_name_org UNIQUE (name, org_id)
);

CREATE TABLE IF NOT EXISTS lead_tags (
    lead_id INTEGER NOT NULL REFERENCES lead (id),
    tag_id  INTEGER NOT NULL REFERENCES tags (id),
    PRIMARY KEY (lead_id, tag_id)
);

CREATE TABLE IF NOT EXISTS lead_appointment (
    id                         INTEGER PRIMARY KEY,
    lead_id                    INTEGER REFERENCES lead (id),
    org_id                     INTEGER NOT NULL REFERENCES organization (id),
    appointment_type           TEXT NOT NULL,
    starts_at                  TEXT NOT NULL,
    ends_at                    TEXT,
    meeting_type               TEXT NOT NULL,
    notes                      TEXT,
    status                     TEXT NOT NULL DEFAULT 'proposed',  -- proposed | scheduled | confirmed | cancelled | ...
    external_meeting_url       TEXT,
    sms_confirmation_sent_at   TEXT,
    email_confirmation_sent_at TEXT,
    -- Timestamp the in-app reminder fan-out fired, so the per-minute cron
    -- doesn't send the same appointment_reminder twice.
    reminder_sent_at           TEXT,
    confirmed_at               TEXT,
    created_by_user_id         INTEGER REFERENCES "user" (id),
    -- When the appointment was booked off the back of a call (Calls page
    -- "Schedule" action), this links to calls(id). Powers the "booked from
    -- calls" stat + the "Appt Set" tag on a call row. NULL for appointments
    -- created from other surfaces. calls is created later (sql/11) - SQLite
    -- doesn't validate FK targets at CREATE time so the forward ref is fine.
    call_id                    TEXT REFERENCES calls (id),
    created_at                 TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                 TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_lead_appointment_lead_id ON lead_appointment (lead_id);
CREATE INDEX IF NOT EXISTS ix_lead_appointment_org_id  ON lead_appointment (org_id);
CREATE INDEX IF NOT EXISTS ix_lead_appointment_call_id ON lead_appointment (call_id);

CREATE TABLE IF NOT EXISTS deal (
    id            INTEGER PRIMARY KEY,
    org_id        INTEGER NOT NULL REFERENCES organization (id),
    -- Optional: a deal can exist without a lead (created standalone from the
    -- Deals board). UNIQUE still enforces one deal per lead when a lead IS set
    -- (SQLite treats NULLs as distinct, so multiple lead-less deals are fine).
    lead_id       INTEGER UNIQUE REFERENCES lead (id) ON DELETE CASCADE,
    name          TEXT,                           -- free-form deal name (falls back to the lead's name)
    deal_type     TEXT,                           -- buyer | seller | renter (pipeline tab); falls back to lead.lead_type
    stage         TEXT,
    value         REAL,
    commission    REAL,                           -- commission amount (manual; UI falls back to an estimate when null)
    close_date    TEXT,                           -- expected close date (ISO yyyy-mm-dd)
    description   TEXT,
    probability   REAL,
    status        TEXT NOT NULL DEFAULT 'open',   -- open | won | lost | archived
    status_source TEXT NOT NULL DEFAULT 'auto',   -- auto | manual
    closed_at     TEXT,
    -- AI stage suggestion: major-milestone moves from the AI land here (instead
    -- of stage) until the agent accepts/dismisses them on the deal card.
    ai_suggested_stage   TEXT,
    ai_suggestion_reason TEXT,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_deal_org_id    ON deal (org_id);
CREATE INDEX IF NOT EXISTS ix_deal_status    ON deal (status);
CREATE INDEX IF NOT EXISTS ix_deal_org_status ON deal (org_id, status);

-- Team members assigned to a deal (the modal's TEAM section). Many users per
-- deal; the creator is always added, and brokers (Owner/Manager) can add more.
CREATE TABLE IF NOT EXISTS deal_assignee (
    id         INTEGER PRIMARY KEY,
    deal_id    INTEGER NOT NULL REFERENCES deal (id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES "user" (id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (deal_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_deal_assignee_deal ON deal_assignee (deal_id);
CREATE INDEX IF NOT EXISTS ix_deal_assignee_user ON deal_assignee (user_id);

-- Leads list ordering: WHERE org_id = ? ORDER BY created_at DESC, id DESC.
CREATE INDEX IF NOT EXISTS ix_lead_org_created ON lead (org_id, created_at DESC, id DESC);

-- Inbox contacts recency pagination: WHERE org_id = ? ORDER BY last_activity_at DESC.
CREATE INDEX IF NOT EXISTS ix_lead_org_activity ON lead (org_id, last_activity_at DESC, id DESC);
