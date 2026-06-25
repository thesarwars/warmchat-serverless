-- Performance indexes for the hot list/thread queries.
-- Added after the production data migration (1278 leads / 2051 messages) exposed
-- full-scan + in-memory filesort costs that were invisible at test-data scale.
-- All idempotent + additive (safe to re-run; reversible via DROP INDEX).
-- Apply to prod D1 then run ANALYZE; so the planner adopts them.

-- Leads list: WHERE org_id = ? ORDER BY created_at DESC, id DESC + the
-- created_at >= ? window aggregates. Was a full org scan + filesort on every
-- page / filter / search (only ix_lead_org_id existed).
CREATE INDEX IF NOT EXISTS ix_lead_org_created
    ON lead (org_id, created_at DESC, id DESC);

-- Inbox contacts: the 5 per-thread "latest message" subqueries
-- (ORDER BY ... DESC LIMIT 1) and the per-conversation message thread fetch.
-- Only ix_inbox_messages_thread_id existed, so each subquery scanned the thread
-- + filesorted.
CREATE INDEX IF NOT EXISTS ix_inbox_messages_thread_date
    ON inbox_messages (thread_id, message_date DESC, created_at DESC);

-- Unread COUNT(*) per thread -> index-only on the unread rows.
CREATE INDEX IF NOT EXISTS ix_inbox_messages_thread_unread
    ON inbox_messages (thread_id) WHERE is_read = 0;

-- SMS: per-conversation chronological thread + MAX(created_at) recency scan.
CREATE INDEX IF NOT EXISTS ix_sms_message_conv_created
    ON sms_message (conversation_id, created_at);
