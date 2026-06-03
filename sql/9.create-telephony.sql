-- 9.create-telephony.sql
-- Telnyx 10DLC activation (per-user brand/campaign onboarding).
-- (The active SMS message store is `sms_message` in 4.create-sms.sql.)

CREATE TABLE IF NOT EXISTS telnyx_sms_activation (
    id                            INTEGER PRIMARY KEY,
    user_id                       INTEGER NOT NULL UNIQUE REFERENCES "user" (id),
    business_type                 TEXT NOT NULL,
    legal_name                    TEXT NOT NULL,
    address_line1                 TEXT NOT NULL,
    address_line2                 TEXT,
    city                          TEXT NOT NULL,
    state                         TEXT NOT NULL,
    postal_code                   TEXT NOT NULL,
    country                       TEXT NOT NULL DEFAULT 'US',
    email                         TEXT NOT NULL,
    phone                         TEXT,
    brokerage_name                TEXT,
    website                       TEXT,
    privacy_policy_url            TEXT,
    terms_url                     TEXT,
    ein                           TEXT,
    ssn_last4                     TEXT,
    sole_prop_verification_status TEXT,
    sole_prop_verification_id     TEXT,
    sole_prop_verified_at         TEXT,
    created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
