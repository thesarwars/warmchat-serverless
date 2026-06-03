-- 24.create-listings.sql
-- The agent's property inventory. The inbound AI matches a buyer's stated
-- criteria (area / price / beds / type) against these via the search_listings
-- tool, which is gated by auto_response_settings.listing_search_enabled. One
-- row per property; per-row `enabled` hides a single listing from the AI
-- without deleting it. Managed from the Listings page.

CREATE TABLE IF NOT EXISTS listing (
    id             INTEGER PRIMARY KEY,
    org_id         INTEGER NOT NULL REFERENCES organization (id),
    user_id        INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    address        TEXT,
    city           TEXT,
    state          TEXT,
    zip            TEXT,
    price          REAL,
    bedrooms       REAL,
    bathrooms      REAL,
    square_feet    INTEGER,
    property_type  TEXT,                            -- single_family | condo | townhouse | multi_family | land | other
    listing_type   TEXT NOT NULL DEFAULT 'sale',    -- sale | rent
    status         TEXT NOT NULL DEFAULT 'active',  -- active | coming_soon | pending | sold | off_market
    url            TEXT,
    description    TEXT,
    image_keys     TEXT,                            -- JSON array of R2 object keys (listing photos for MMS)
    enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_listing_org_user ON listing (org_id, user_id);
CREATE INDEX IF NOT EXISTS ix_listing_status   ON listing (status);
