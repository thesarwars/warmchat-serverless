-- 18.create-agent-profile.sql
-- The structured "AI Agent Profile" (a.k.a. AI Knowledge Profile) from
-- docs/automations-ai-flow/AI Agent Profile.md. One row per (org_id, user_id).
-- Every AI agent (Assistant / Inbound / Outbound) pulls from this when texting
-- buyers/sellers so it never has to GUESS agent-specific facts. If a field is
-- blank the prompt instructs the AI to ask a safe follow-up or defer to the
-- agent rather than invent details.
--
-- Lives in the shared "AI Settings" page as the "Agent Profile" section.
-- Pre-filled from organization (avg_deal_price, commission_percent, timezone)
-- and "user" (business_address, agent_slug, email) where available.

CREATE TABLE IF NOT EXISTS agent_profile (
    id                     INTEGER PRIMARY KEY,
    org_id                 INTEGER NOT NULL REFERENCES organization (id),
    user_id                INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,

    -- Identity / contact
    agent_name             TEXT,
    brokerage_name         TEXT,
    phone                  TEXT,
    email                  TEXT,
    website                TEXT,
    license_number         TEXT,

    -- Coverage / experience
    service_areas          TEXT,    -- JSON array of areas/ZIPs
    years_experience       INTEGER,
    languages              TEXT,    -- JSON array (e.g. ["English","Spanish"])
    specialties            TEXT,    -- JSON array: buyers/sellers/investors/luxury/first-time

    -- Commission
    buyer_commission       TEXT,
    seller_commission      TEXT,
    min_commission_rules   TEXT,

    -- Track record
    current_listings       TEXT,    -- JSON or freeform
    past_sales             TEXT,
    avg_price_point        TEXT,

    -- Vendors / scheduling
    preferred_lender       TEXT,
    preferred_title_escrow TEXT,
    calendar_link          TEXT,

    -- Voice
    tone_preference        TEXT,    -- friendly | professional | luxury | casual
    -- The AI Settings "Communication / Behavior" config as JSON (voice, message
    -- length, emoji, humor, response timing, qualification style, lead goals,
    -- follow-up persistence). Rendered into the system prompt so every control
    -- in the AI Settings tab actually shapes the AI - no inert mockups.
    persona_json           TEXT,

    created_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agent_profile UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_agent_profile_user ON agent_profile (user_id);
