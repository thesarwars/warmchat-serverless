-- AI lead auto-update engine: per-field provenance + field-change audit columns.
-- Apply once to existing DBs (the canonical CREATE TABLEs in sql/2 + sql/17
-- already carry these for fresh installs). SQLite/D1 has no "ADD COLUMN IF NOT
-- EXISTS"; if a column already exists the statement errors harmlessly - skip it.

-- lead: JSON provenance map { field -> { source:'ai'|'manual', confidence, updated_at } }.
ALTER TABLE lead ADD COLUMN ai_field_provenance TEXT;

-- ai_activity_log: structured field-change provenance for event='lead.field_updated'.
ALTER TABLE ai_activity_log ADD COLUMN field TEXT;
ALTER TABLE ai_activity_log ADD COLUMN old_value TEXT;
ALTER TABLE ai_activity_log ADD COLUMN new_value TEXT;
ALTER TABLE ai_activity_log ADD COLUMN confidence REAL;
ALTER TABLE ai_activity_log ADD COLUMN evidence TEXT;
