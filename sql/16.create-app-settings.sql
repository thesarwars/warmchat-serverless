-- 16.create-app-settings.sql
-- Lightweight key/value store for runtime-toggleable settings. Rows scoped to
-- a single org via `org_id`, or system-wide when `org_id IS NULL`. The first
-- consumer is the `mock_sends_enabled` flag exposed on /admin/debug so an
-- Owner can flip the mock send layer on/off without redeploying. Other small
-- toggles can pile on without inventing yet another bespoke table.

CREATE TABLE IF NOT EXISTS app_settings (
    id         INTEGER PRIMARY KEY,
    org_id     INTEGER REFERENCES organization (id), -- NULL = system-wide
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (org_id, key)
);
CREATE INDEX IF NOT EXISTS ix_app_settings_key ON app_settings (key);
