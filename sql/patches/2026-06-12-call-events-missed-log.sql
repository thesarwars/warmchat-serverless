-- call_events.event_type CHECK was missing 'MISSED_CALL_LOGGED' - the
-- recordMissedCall dedupe row was silently dropped by INSERT OR IGNORE, so
-- missed-call notifications/tasks could double-fire (and the new atomic-claim
-- idempotency would deadlock the feature entirely). SQLite can't ALTER a
-- CHECK, so rebuild the table.
ALTER TABLE call_events RENAME TO call_events_old;

CREATE TABLE call_events (
    id                TEXT PRIMARY KEY,                              -- uuid
    call_id           TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
    event_type        TEXT NOT NULL
                        CHECK (event_type IN ('CALL_INITIATED', 'AGENT_RINGING', 'AGENT_ANSWERED',
                                              'CUSTOMER_RINGING', 'CUSTOMER_ANSWERED', 'CALL_CONNECTED',
                                              'CALL_COMPLETED', 'CALL_FAILED', 'CALL_NO_ANSWER',
                                              'CALL_BUSY', 'CALL_CANCELED', 'MISSED_CALL_SMS_SENT',
                                              'MISSED_CALL_LOGGED',
                                              'WEB_LEG_RINGING', 'PHONE_LEG_RINGING', 'ANSWERED_ON_WEB',
                                              'ANSWERED_ON_PHONE', 'LOSER_LEG_CANCELED', 'BUSY_AGENT_OCCUPIED')),
    timestamp         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payload           TEXT,                                          -- JSON
    provider_event_id TEXT UNIQUE,
    webhook_payload   TEXT                                           -- JSON
);

INSERT INTO call_events SELECT id, call_id, event_type, timestamp, payload, provider_event_id, webhook_payload FROM call_events_old;
DROP TABLE call_events_old;
CREATE INDEX ix_call_events_call_ts ON call_events (call_id, timestamp);
