-- inbox_messages.lead_id + lead.last_activity_at: direct message->lead linkage so
-- the inbox contacts list can paginate by recency (ORDER BY last_activity_at
-- LIMIT/OFFSET) instead of enriching all leads per call.
--
-- Additive + idempotent. Apply to prod D1 AFTER a `wrangler d1 export` backup.
-- Stage A = schema (safe, zero behavior change). Stage B = backfill (derived data,
-- fully reversible by setting the columns back to NULL).

-- ============================ STAGE A: schema ============================
-- Plain INTEGER, no FK (mirrors the existing automation_id convention): a hard FK
-- would reject inbound rows from unknown senders and complicate lead deletes.
ALTER TABLE inbox_messages ADD COLUMN lead_id INTEGER;
ALTER TABLE lead ADD COLUMN last_activity_at TEXT;  -- ISO8601; nullable, backfilled below

CREATE INDEX IF NOT EXISTS ix_inbox_messages_lead_date
    ON inbox_messages (lead_id, message_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_lead_org_activity
    ON lead (org_id, last_activity_at DESC, id DESC);

-- ============================ STAGE B: backfill ============================
-- B1: outbound rows -> lead by exact org-scoped to_email match (deterministic MIN(id) tie-break).
UPDATE inbox_messages
   SET lead_id = (
     SELECT MIN(l.id) FROM lead l
       JOIN thread t ON t.id = inbox_messages.thread_id
       JOIN inbox  i ON i.id = t.inbox_id
      WHERE l.org_id = i.org_id
        AND inbox_messages.to_email IS NOT NULL
        AND LOWER(l.email) = LOWER(inbox_messages.to_email))
 WHERE direction = 'outbound' AND lead_id IS NULL;

-- B2: inbound rows -> lead by exact org-scoped sender_email match.
UPDATE inbox_messages
   SET lead_id = (
     SELECT MIN(l.id) FROM lead l
       JOIN thread t ON t.id = inbox_messages.thread_id
       JOIN inbox  i ON i.id = t.inbox_id
      WHERE l.org_id = i.org_id
        AND inbox_messages.sender_email IS NOT NULL
        AND LOWER(l.email) = LOWER(inbox_messages.sender_email))
 WHERE direction = 'inbound' AND lead_id IS NULL;

-- B3: still-NULL rows -> thread_lead_assignments, ONLY when the thread maps to exactly one in-org lead.
UPDATE inbox_messages
   SET lead_id = (
     SELECT tla.lead_id FROM thread_lead_assignments tla
      WHERE tla.thread_id = inbox_messages.thread_id
      GROUP BY tla.thread_id
     HAVING COUNT(DISTINCT tla.lead_id) = 1)
 WHERE lead_id IS NULL;

-- B4: lead.last_activity_at = MAX over email (lead_id) + SMS (phone) channels.
UPDATE lead
   SET last_activity_at = (
     SELECT MAX(ts) FROM (
       SELECT COALESCE(im.message_date, im.created_at) AS ts
         FROM inbox_messages im WHERE im.lead_id = lead.id
       UNION ALL
       SELECT sm.created_at AS ts
         FROM sms_message sm
         JOIN sms_conversation c ON c.id = sm.conversation_id
         JOIN sms_contact sc     ON sc.id = c.contact_id
        WHERE c.org_id = lead.org_id AND sc.phone_number_e164 = lead.phone))
 WHERE EXISTS (SELECT 1 FROM inbox_messages im WHERE im.lead_id = lead.id)
    OR EXISTS (SELECT 1 FROM sms_message sm
                 JOIN sms_conversation c ON c.id = sm.conversation_id
                 JOIN sms_contact sc     ON sc.id = c.contact_id
                WHERE c.org_id = lead.org_id AND sc.phone_number_e164 = lead.phone);
