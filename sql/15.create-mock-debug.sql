-- 15.create-mock-debug.sql
-- Debug-only log for the mock send layer (functions/_shared/mockSendApi.ts).
-- When MOCK_SEND_APIS=1, every outbound SMS/MMS/email writes a row here
-- instead of calling Telnyx/ElasticEmail/Gmail. The /admin/debug page reads
-- this table to verify rate-limit compliance, quiet-hours, recipient lists.

CREATE TABLE IF NOT EXISTS mock_send_log (
    id             INTEGER PRIMARY KEY,
    channel        TEXT NOT NULL,                       -- 'sms' | 'mms' | 'email'
    direction      TEXT NOT NULL DEFAULT 'outbound',
    provider       TEXT NOT NULL,                       -- 'telnyx' | 'elastic' | 'gmail'
    from_address   TEXT,
    to_address     TEXT NOT NULL,
    subject        TEXT,
    body           TEXT,
    org_id         INTEGER,
    lead_id        INTEGER,
    automation_id  INTEGER,
    rate_acquired  INTEGER NOT NULL DEFAULT 1 CHECK (rate_acquired IN (0, 1)),
    second_bucket  INTEGER,                             -- floor(unix_ms / 1000)
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_mock_send_log_org_id        ON mock_send_log (org_id);
CREATE INDEX IF NOT EXISTS ix_mock_send_log_created_at    ON mock_send_log (created_at);
CREATE INDEX IF NOT EXISTS ix_mock_send_log_second_bucket ON mock_send_log (second_bucket);
