-- 1.create-core.sql
-- Core identity & tenancy: roles, users, organizations, memberships, invites, auth sessions.
-- SQLite/D1 mapping: Boolean -> INTEGER 0/1, DateTime -> TEXT (ISO-8601),
-- Numeric -> REAL, String(n) -> TEXT.

CREATE TABLE IF NOT EXISTS role (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE          -- Guest | Representative | Manager | Owner
);

CREATE TABLE IF NOT EXISTS "user" (
    id                            INTEGER PRIMARY KEY,
    name                          TEXT,
    email                         TEXT NOT NULL UNIQUE,
    password_hash                 TEXT,
    gmail_user_name               TEXT,
    gmail_email_id                TEXT,
    email_confirmed               INTEGER NOT NULL DEFAULT 0 CHECK (email_confirmed IN (0, 1)),
    email_confirm_token           TEXT,
    reset_password_token          TEXT,
    reset_token_expiry            TEXT,
    is_google_user                INTEGER NOT NULL DEFAULT 0 CHECK (is_google_user IN (0, 1)),
    is_email_confirmed            INTEGER NOT NULL DEFAULT 0 CHECK (is_email_confirmed IN (0, 1)),
    email_confirm_expiry          TEXT,
    is_invited                    INTEGER NOT NULL DEFAULT 0 CHECK (is_invited IN (0, 1)),
    telnyx_messaging_profile_id   TEXT,
    telnyx_phone_number           TEXT UNIQUE,
    telnyx_brand_id               TEXT,
    telnyx_campaign_id            TEXT,
    telnyx_sms_status             TEXT,
    telnyx_error_reason           TEXT,
    telnyx_campaign_number_status TEXT,
    agent_slug                    TEXT UNIQUE,
    notify_sms_inbound            INTEGER NOT NULL DEFAULT 1 CHECK (notify_sms_inbound IN (0, 1)),
    notify_email_inbound          INTEGER NOT NULL DEFAULT 1 CHECK (notify_email_inbound IN (0, 1)),
    notify_calls                  INTEGER NOT NULL DEFAULT 1 CHECK (notify_calls IN (0, 1)),
    notify_appointments           INTEGER NOT NULL DEFAULT 1 CHECK (notify_appointments IN (0, 1)),
    notify_billing                INTEGER NOT NULL DEFAULT 1 CHECK (notify_billing IN (0, 1)),
    notify_system                 INTEGER NOT NULL DEFAULT 1 CHECK (notify_system IN (0, 1)),
    -- Transparency alert: fire when an AI agent auto-replies to a lead on the
    -- user's behalf, so the human has passive awareness without watching the
    -- AI page. On by default (compliance-first - the agent should always know).
    notify_ai_reply               INTEGER NOT NULL DEFAULT 1 CHECK (notify_ai_reply IN (0, 1)),
    notify_via_web_push           INTEGER NOT NULL DEFAULT 1 CHECK (notify_via_web_push IN (0, 1)),
    notify_via_mobile_push        INTEGER NOT NULL DEFAULT 1 CHECK (notify_via_mobile_push IN (0, 1)),
    notify_via_email_digest       INTEGER NOT NULL DEFAULT 0 CHECK (notify_via_email_digest IN (0, 1)),
    notify_in_app_toast           INTEGER NOT NULL DEFAULT 1 CHECK (notify_in_app_toast IN (0, 1)),
    notify_sound                  INTEGER NOT NULL DEFAULT 1 CHECK (notify_sound IN (0, 1)),
    -- Site-wide admin flag. Independent of membership.role - lets us grant
    -- access to /admin/* (mock-send toggle, debug feed) to a specific human
    -- (currently jv@jovrealestate.com only) without affecting per-org roles.
    is_admin                      INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    -- Agent's real-world mailing address. Rendered in CAN-SPAM footer of
    -- marketing emails (campaigns/sequences) since those go from the agent,
    -- not WarmChats. Marketing email sends are refused when this is blank.
    business_address              TEXT,
    -- Calling-domain columns, stored on the WarmChats user.
    agent_phone_number            TEXT,  -- agent's real cell, for PSTN fork leg
    telnyx_credential_id          TEXT,  -- Telnyx SIP credential connection id (WebRTC)
    telnyx_sip_uri                TEXT,  -- sip:agent-<id>@<domain> for the web fork leg
    -- Terms-of-service + privacy-policy acceptance audit. Set on register
    -- (signup checkbox is required there). `terms_version` is a string like
    -- "2026-05" so a future ToS revision can ask returning users to re-accept.
    terms_accepted_at             TEXT,
    terms_version                 TEXT
);
CREATE INDEX IF NOT EXISTS ix_user_telnyx_messaging_profile_id ON "user" (telnyx_messaging_profile_id);
CREATE INDEX IF NOT EXISTS ix_user_telnyx_brand_id            ON "user" (telnyx_brand_id);
CREATE INDEX IF NOT EXISTS ix_user_telnyx_campaign_id         ON "user" (telnyx_campaign_id);

CREATE TABLE IF NOT EXISTS organization (
    id                           INTEGER PRIMARY KEY,
    name                         TEXT NOT NULL,
    owner_id                     INTEGER REFERENCES "user" (id),
    stripe_customer_id           TEXT UNIQUE,
    plan                         TEXT DEFAULT 'free_channel',
    subscription_status          TEXT DEFAULT 'free',
    plan_started_at              TEXT,
    stripe_subscription_id       TEXT,
    provider_messaging_service_sid TEXT,
    sms_compliance_status        TEXT,
    average_deal_price           REAL NOT NULL DEFAULT 400000,
    commission_percent           REAL NOT NULL DEFAULT 2.5,
    timezone                     TEXT NOT NULL DEFAULT 'America/New_York',
    quiet_hours_start            INTEGER NOT NULL DEFAULT 8,
    quiet_hours_end              INTEGER NOT NULL DEFAULT 21,
    -- Monthly dashboard KPI goals (per org). 0 = not set -> the dashboard hides
    -- that card's progress bar / goal label until the user configures it.
    goal_pipeline_value          REAL NOT NULL DEFAULT 0,
    goal_hot_leads               INTEGER NOT NULL DEFAULT 0,
    goal_appointments            INTEGER NOT NULL DEFAULT 0,
    goal_deals_closed            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS membership (
    id      INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user" (id),
    org_id  INTEGER NOT NULL REFERENCES organization (id),
    role_id INTEGER NOT NULL REFERENCES role (id)
);
CREATE INDEX IF NOT EXISTS ix_membership_user_id ON membership (user_id);
CREATE INDEX IF NOT EXISTS ix_membership_org_id  ON membership (org_id);

CREATE TABLE IF NOT EXISTS team (
    id          INTEGER PRIMARY KEY,
    org_id      INTEGER NOT NULL REFERENCES organization (id),
    name        TEXT NOT NULL,
    description TEXT,
    leader_id   INTEGER REFERENCES "user" (id),
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_team_org_id ON team (org_id);

CREATE TABLE IF NOT EXISTS team_member (
    id        INTEGER PRIMARY KEY,
    team_id   INTEGER NOT NULL REFERENCES team (id),
    user_id   INTEGER NOT NULL REFERENCES "user" (id),
    added_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_team_member_team_id ON team_member (team_id);
CREATE INDEX IF NOT EXISTS ix_team_member_user_id ON team_member (user_id);

CREATE TABLE IF NOT EXISTS invite (
    id         INTEGER PRIMARY KEY,
    email      TEXT NOT NULL,
    org_id     INTEGER NOT NULL,
    role_id    INTEGER NOT NULL,
    token      TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    accepted   INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0, 1)),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_session (
    id                INTEGER PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES "user" (id),
    session_id        TEXT NOT NULL UNIQUE,
    refresh_token_jti TEXT NOT NULL UNIQUE,
    expires_at        TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at        TEXT,
    user_agent        TEXT,
    ip_address        TEXT
);
CREATE INDEX IF NOT EXISTS ix_auth_session_user_id    ON auth_session (user_id);
CREATE INDEX IF NOT EXISTS ix_auth_session_expires_at ON auth_session (expires_at);
CREATE INDEX IF NOT EXISTS ix_auth_session_revoked_at ON auth_session (revoked_at);
