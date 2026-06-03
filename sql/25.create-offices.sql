-- 25.create-offices.sql
-- Brokerage offices (physical locations) for the Custom Brokerage plan's
-- Organization settings. One row per office; org-scoped. Lightweight - agent
-- assignment to a specific office is not modeled yet (count surfaces as 0).

CREATE TABLE IF NOT EXISTS office (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organization(id),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  timezone TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_office_org ON office(org_id);
