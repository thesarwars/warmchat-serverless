-- 11.create-calling.sql
-- Voice / calling domain in D1.
--
-- Mapping note: rather than separate Workspace/User/Lead tables with
-- UUID ids, we map onto the WarmChats core tables:
--   workspaceId -> organization.id  (INTEGER, column named org_id)
--   agentId/userId -> "user".id     (INTEGER, column named agent_id)
--   leadId -> lead.id               (INTEGER)
-- The calling domain's OWN rows (phone numbers, calls, events, usage, configs,
-- webhook logs) keep TEXT/UUID primary keys, because the frontend round-trips
-- them as opaque string ids (callId, etc.) and they never collide with the
-- integer ids of the core schema.
--
-- D1 mapping: enum -> TEXT CHECK, Json/Jsonb -> TEXT, Decimal -> REAL,
-- Boolean -> INTEGER 0/1, DateTime -> TEXT ISO-8601.

-- ---- Per-org calling configuration (one row per organization) ----
CREATE TABLE IF NOT EXISTS calling_configurations (
    id                       TEXT PRIMARY KEY,                       -- uuid
    org_id                   INTEGER NOT NULL UNIQUE REFERENCES organization (id),
    ring_timeout             INTEGER NOT NULL DEFAULT 25,            -- seconds (client req: 25)
    missed_call_sms_template TEXT NOT NULL DEFAULT 'Currently in an appointment. I will call you back shortly or text me please.',
    ring_strategy            TEXT NOT NULL DEFAULT 'parallel'        -- 'parallel' | 'web_first' | 'phone_first'
                               CHECK (ring_strategy IN ('parallel', 'web_first', 'phone_first')),
    provider                 TEXT NOT NULL DEFAULT 'telnyx',
    webhook_url              TEXT,
    webhook_retry_attempts   INTEGER NOT NULL DEFAULT 3,
    webhook_retry_delay      INTEGER NOT NULL DEFAULT 5000,         -- milliseconds
    calling_enabled          INTEGER NOT NULL DEFAULT 1 CHECK (calling_enabled IN (0, 1)),
    recording_enabled        INTEGER NOT NULL DEFAULT 0 CHECK (recording_enabled IN (0, 1)),
    -- Voicemail capture for unanswered inbound calls. Ships dark (off) so the
    -- delicate fork-leg/voicemail divert flow can be enabled per-org once proven.
    voicemail_enabled        INTEGER NOT NULL DEFAULT 0 CHECK (voicemail_enabled IN (0, 1)),
    voicemail_greeting       TEXT NOT NULL DEFAULT 'You have reached us but we are unavailable. Please leave a message after the tone.',
    auto_charge_overage      INTEGER NOT NULL DEFAULT 1 CHECK (auto_charge_overage IN (0, 1)),
    created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---- Provisioned Telnyx phone numbers ----
CREATE TABLE IF NOT EXISTS phone_numbers (
    id                  TEXT PRIMARY KEY,                            -- uuid
    phone_number        TEXT NOT NULL UNIQUE,                        -- E.164
    provider            TEXT NOT NULL DEFAULT 'telnyx',
    provider_sid        TEXT NOT NULL UNIQUE,                        -- Telnyx phone-number id
    status              TEXT NOT NULL DEFAULT 'PROVISIONING'
                          CHECK (status IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'RELEASED')),
    capabilities        TEXT,                                        -- JSON: {voice:true, sms:true}
    assigned_to_user_id INTEGER UNIQUE REFERENCES "user" (id),
    org_id              INTEGER NOT NULL REFERENCES organization (id),
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at         TEXT
);
CREATE INDEX IF NOT EXISTS ix_phone_numbers_org_id     ON phone_numbers (org_id);
CREATE INDEX IF NOT EXISTS ix_phone_numbers_assigned   ON phone_numbers (assigned_to_user_id);

-- ---- Billing cycles (per-org metering window) ----
CREATE TABLE IF NOT EXISTS billing_cycles (
    id                TEXT PRIMARY KEY,                              -- uuid
    org_id            INTEGER NOT NULL REFERENCES organization (id),
    start_date        TEXT NOT NULL,                                 -- ISO-8601
    end_date          TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'COMPLETED', 'SETTLED')),
    plan_minute_limit INTEGER NOT NULL,
    overage_rate      REAL NOT NULL,                                 -- per-minute overage cost
    -- One-shot quota-exceeded notification stamp for voice. NULL until we've
    -- notified the org owner that this cycle's minute pool is exhausted. A
    -- fresh billing_cycles row (cron rollover) starts NULL, resetting it.
    limit_notified_at TEXT,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_billing_cycles_org_start ON billing_cycles (org_id, start_date);

-- ---- Calls ----
CREATE TABLE IF NOT EXISTS calls (
    id                 TEXT PRIMARY KEY,                             -- uuid (frontend callId)
    provider_call_sid  TEXT NOT NULL UNIQUE,                         -- Telnyx call_control_id (or pending-web-<id>)
    direction          TEXT NOT NULL CHECK (direction IN ('OUTBOUND', 'INBOUND')),
    status             TEXT NOT NULL DEFAULT 'INITIATED'
                         CHECK (status IN ('INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED',
                                           'NO_ANSWER', 'BUSY', 'FAILED', 'CANCELED')),
    from_number        TEXT NOT NULL,
    to_number          TEXT NOT NULL,
    lead_id            INTEGER REFERENCES lead (id),
    agent_id           INTEGER NOT NULL REFERENCES "user" (id),
    business_number_id TEXT REFERENCES phone_numbers (id),
    agent_phone_number TEXT,                                         -- agent's real cell (for PSTN fork leg)
    customer_number    TEXT,
    duration           INTEGER NOT NULL DEFAULT 0,                   -- seconds
    recording_url      TEXT,                                         -- R2 object key (served via /api/calling/calls/:id/recording), NOT the Telnyx URL
    recording_sid      TEXT,
    -- Voicemail (subset of recording): set when an unanswered inbound call was
    -- diverted to voicemail. voicemail_url is its own R2 key.
    is_voicemail       INTEGER NOT NULL DEFAULT 0 CHECK (is_voicemail IN (0, 1)),
    voicemail_url      TEXT,
    voicemail_duration INTEGER,                                      -- seconds
    voicemail_heard    INTEGER NOT NULL DEFAULT 0 CHECK (voicemail_heard IN (0, 1)),
    initiated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ringing_at         TEXT,
    answered_at        TEXT,
    completed_at       TEXT,
    web_leg_sid        TEXT,                                         -- call_control_id of SIP/web fork
    phone_leg_sid      TEXT,                                         -- call_control_id of PSTN/cell fork
    answered_via       TEXT CHECK (answered_via IN ('web', 'phone')),
    origin             TEXT DEFAULT 'phone',                         -- 'web' | 'phone'
    provider_metadata  TEXT,                                         -- JSON
    error_message      TEXT,
    org_id             INTEGER NOT NULL REFERENCES organization (id),
    created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_calls_lead_id    ON calls (lead_id);
CREATE INDEX IF NOT EXISTS ix_calls_agent_id   ON calls (agent_id);
CREATE INDEX IF NOT EXISTS ix_calls_org_id     ON calls (org_id);
CREATE INDEX IF NOT EXISTS ix_calls_status     ON calls (status);
CREATE INDEX IF NOT EXISTS ix_calls_created_at ON calls (created_at);

-- ---- Call events (event sourcing / audit trail) ----
CREATE TABLE IF NOT EXISTS call_events (
    id                TEXT PRIMARY KEY,                              -- uuid
    call_id           TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
    event_type        TEXT NOT NULL
                        CHECK (event_type IN ('CALL_INITIATED', 'AGENT_RINGING', 'AGENT_ANSWERED',
                                              'CUSTOMER_RINGING', 'CUSTOMER_ANSWERED', 'CALL_CONNECTED',
                                              'CALL_COMPLETED', 'CALL_FAILED', 'CALL_NO_ANSWER',
                                              'CALL_BUSY', 'CALL_CANCELED', 'MISSED_CALL_SMS_SENT',
                                              'WEB_LEG_RINGING', 'PHONE_LEG_RINGING', 'ANSWERED_ON_WEB',
                                              'ANSWERED_ON_PHONE', 'LOSER_LEG_CANCELED', 'BUSY_AGENT_OCCUPIED')),
    timestamp         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payload           TEXT,                                          -- JSON
    provider_event_id TEXT UNIQUE,
    webhook_payload   TEXT                                           -- JSON
);
CREATE INDEX IF NOT EXISTS ix_call_events_call_ts ON call_events (call_id, timestamp);

-- ---- Usage records (per-call metered minutes/cost) ----
CREATE TABLE IF NOT EXISTS usage_records (
    id               TEXT PRIMARY KEY,                               -- uuid
    call_id          TEXT NOT NULL REFERENCES calls (id),
    billing_cycle_id TEXT NOT NULL REFERENCES billing_cycles (id),
    org_id           INTEGER NOT NULL REFERENCES organization (id),
    agent_id         INTEGER NOT NULL REFERENCES "user" (id),
    minutes          REAL NOT NULL,                                  -- fractional minutes
    cost             REAL NOT NULL,
    is_overage       INTEGER NOT NULL DEFAULT 0 CHECK (is_overage IN (0, 1)),
    recorded_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_usage_records_cycle_org   ON usage_records (billing_cycle_id, org_id);
CREATE INDEX IF NOT EXISTS ix_usage_records_agent_cycle ON usage_records (agent_id, billing_cycle_id);

-- ---- Webhook logs (Telnyx event idempotency + retry) ----
CREATE TABLE IF NOT EXISTS webhook_logs (
    id                TEXT PRIMARY KEY,                              -- uuid
    provider_event_id TEXT NOT NULL UNIQUE,                          -- Telnyx event id (dedupe key)
    provider          TEXT NOT NULL DEFAULT 'telnyx',
    event_type        TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'RECEIVED'
                        CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'RETRYING')),
    retry_count       INTEGER NOT NULL DEFAULT 0,
    last_retry_at     TEXT,
    next_retry_at     TEXT,                                          -- cron sweep picks rows where this <= now
    processed_at      TEXT,
    payload           TEXT NOT NULL,                                 -- JSON (raw event)
    error_message     TEXT,
    call_id           TEXT,
    org_id            INTEGER,
    received_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_webhook_logs_status_retry ON webhook_logs (status, retry_count);
CREATE INDEX IF NOT EXISTS ix_webhook_logs_next_retry   ON webhook_logs (next_retry_at);

-- ---- AI insights per call (transcript + summary, produced async) ----
-- One row per call once a recording lands. The Telnyx recording webhook inserts
-- a PENDING row (with recording_source_url, the time-limited Telnyx URL); the
-- gateway-worker cron downloads -> R2, transcribes (Whisper), extracts structured
-- fields (one OpenAI call), then flips to DONE. attempts caps retries.
CREATE TABLE IF NOT EXISTS call_ai_insights (
    call_id             TEXT PRIMARY KEY REFERENCES calls (id) ON DELETE CASCADE,
    transcript          TEXT,
    summary             TEXT,
    sentiment           TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    intent              TEXT,
    budget_min          REAL,
    budget_max          REAL,
    recording_source_url TEXT,                                       -- transient Telnyx URL the cron fetches from
    status              TEXT NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),
    error_message       TEXT,
    attempts            INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_call_ai_insights_status ON call_ai_insights (status);

-- ---- AI-detected next steps for a call (the detail panel checklist) ----
CREATE TABLE IF NOT EXISTS call_tasks (
    id         TEXT PRIMARY KEY,                                     -- uuid
    call_id    TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('email', 'calendar', 'task', 'automation')),
    label      TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_call_tasks_call_id ON call_tasks (call_id);

-- ---- Manual agent notes on a call (detail panel "Add note") ----
CREATE TABLE IF NOT EXISTS call_notes (
    id         TEXT PRIMARY KEY,                                     -- uuid
    call_id    TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
    author_id  INTEGER NOT NULL REFERENCES "user" (id),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_call_notes_call_id ON call_notes (call_id);
