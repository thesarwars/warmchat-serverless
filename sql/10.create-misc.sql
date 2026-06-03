-- 10.create-misc.sql
-- Auto-response settings, push/device tokens, CRM integrations, business-email
-- verification, email domains, onboarding progress, and usage counters.

CREATE TABLE IF NOT EXISTS auto_response_settings (
    id                  INTEGER PRIMARY KEY,
    user_id             INTEGER NOT NULL UNIQUE REFERENCES "user" (id),
    org_id              INTEGER NOT NULL REFERENCES organization (id),
    enabled             INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    stop_on_reply       INTEGER NOT NULL DEFAULT 1 CHECK (stop_on_reply IN (0, 1)),
    stop_on_appointment INTEGER NOT NULL DEFAULT 1 CHECK (stop_on_appointment IN (0, 1)),
    missed_call_enabled INTEGER NOT NULL DEFAULT 1 CHECK (missed_call_enabled IN (0, 1)),
    missed_call_message TEXT NOT NULL DEFAULT 'Currently in an appointment. I will call you back shortly or text me please.',
    missed_call_template_id INTEGER REFERENCES message_templates (id) ON DELETE SET NULL,
    inbound_sms_enabled            INTEGER NOT NULL DEFAULT 1 CHECK (inbound_sms_enabled IN (0, 1)),
    -- When on, the tool-calling AI also answers inbound EMAIL (not just SMS):
    -- the lead emails the agent's connected inbox -> runInboundAgent replies over
    -- email through dispatchOutboundEmail. Same 3-level gate as SMS.
    inbound_email_enabled          INTEGER NOT NULL DEFAULT 1 CHECK (inbound_email_enabled IN (0, 1)),
    inbound_existing_continue      INTEGER NOT NULL DEFAULT 1 CHECK (inbound_existing_continue IN (0, 1)),
    inbound_existing_reengage      INTEGER NOT NULL DEFAULT 1 CHECK (inbound_existing_reengage IN (0, 1)),
    inbound_reengage_days          INTEGER NOT NULL DEFAULT 7,
    inbound_new_create_lead        INTEGER NOT NULL DEFAULT 1 CHECK (inbound_new_create_lead IN (0, 1)),
    inbound_new_send_reply         INTEGER NOT NULL DEFAULT 1 CHECK (inbound_new_send_reply IN (0, 1)),
    inbound_new_tag                INTEGER NOT NULL DEFAULT 1 CHECK (inbound_new_tag IN (0, 1)),
    qualification_enabled          INTEGER NOT NULL DEFAULT 1 CHECK (qualification_enabled IN (0, 1)),
    booking_handoff_enabled        INTEGER NOT NULL DEFAULT 0 CHECK (booking_handoff_enabled IN (0, 1)),
    handoff_user_id                INTEGER REFERENCES "user" (id) ON DELETE SET NULL,
    behavior_stop_lead_reply       INTEGER NOT NULL DEFAULT 1 CHECK (behavior_stop_lead_reply IN (0, 1)),
    behavior_stop_agent_reply      INTEGER NOT NULL DEFAULT 1 CHECK (behavior_stop_agent_reply IN (0, 1)),
    behavior_one_question_at_a_time INTEGER NOT NULL DEFAULT 1 CHECK (behavior_one_question_at_a_time IN (0, 1)),
    behavior_wait_for_reply        INTEGER NOT NULL DEFAULT 1 CHECK (behavior_wait_for_reply IN (0, 1)),
    behavior_log_every_message     INTEGER NOT NULL DEFAULT 1 CHECK (behavior_log_every_message IN (0, 1)),
    behavior_auto_status_tag       INTEGER NOT NULL DEFAULT 1 CHECK (behavior_auto_status_tag IN (0, 1)),
    -- AI Agent "Rules & Escalation" (Knowledge Base). escalation_keywords: JSON
    -- array of phrases that force a human handoff + open a lead_escalation
    -- (matched in inboundProcessing.ts). always_say / never_say: JSON arrays
    -- layered into the system prompt. (Fair Housing is always enforced in the
    -- prompt - it is a legal requirement, not a stored toggle.)
    escalation_keywords            TEXT,
    always_say                     TEXT,
    never_say                      TEXT,
    -- Listings: when 0, the AI never offers or searches property listings (the
    -- search_listings tool is withheld and the prompt says to defer to the
    -- agent). Default on; an agent with no listings naturally returns no match.
    listing_search_enabled         INTEGER NOT NULL DEFAULT 1 CHECK (listing_search_enabled IN (0, 1)),
    -- When on (default), and the agent has NO offerable listings, the AI is told
    -- to escalate to the human agent as soon as a lead asks about specific
    -- listings or pricing (instead of just deferring), and the listing/pricing
    -- tools stay withheld. Toggle in AI Agent > Knowledge Base > Escalation.
    escalate_no_listings           INTEGER NOT NULL DEFAULT 1 CHECK (escalate_no_listings IN (0, 1)),
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User-defined extra steps in the AI Follow-Up flow (after the built-in ones).
CREATE TABLE IF NOT EXISTS ai_custom_step (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    org_id      INTEGER NOT NULL REFERENCES organization (id),
    position    INTEGER NOT NULL DEFAULT 0,
    title       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    template_id INTEGER REFERENCES message_templates (id) ON DELETE SET NULL,
    message     TEXT NOT NULL DEFAULT '',
    delay_label TEXT NOT NULL DEFAULT 'Same day',
    delay_minutes INTEGER NOT NULL DEFAULT 0,
    enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ai_custom_step_user_id ON ai_custom_step (user_id, position);

CREATE TABLE IF NOT EXISTS push_subscription (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_push_subscription_user_id ON push_subscription (user_id);

CREATE TABLE IF NOT EXISTS device_token (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
    token        TEXT NOT NULL UNIQUE,
    platform     TEXT NOT NULL,                 -- ios | android | web
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS ix_device_token_user_id ON device_token (user_id);

CREATE TABLE IF NOT EXISTS business_email_verification (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES "user" (id),
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    verified_at TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_business_email_verification_user_email UNIQUE (user_id, email)
);
CREATE INDEX IF NOT EXISTS ix_business_email_verification_user_id ON business_email_verification (user_id);

-- Domain-ownership proof via a unique DNS TXT token at the apex. Used when the
-- user is letting WarmChats *be* their inbound mail provider (MX takeover) -
-- they don't have a working mailbox yet, so the OTP-to-business-email approach
-- in business_email_verification doesn't work. The token is opaque random
-- entropy bound to (user_id, domain); single-use (consumed_at), short-lived
-- (expires_at), so leaving the TXT record in DNS afterwards is harmless and
-- can't be used to hijack a different account.
CREATE TABLE IF NOT EXISTS domain_ownership_verification (
    id             INTEGER PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES "user" (id),
    domain         TEXT NOT NULL,
    sending_prefix TEXT NOT NULL,        -- e.g. "hello" -> hello@<domain>
    token          TEXT NOT NULL,        -- random opaque value; appears verbatim in user's DNS
    expires_at     TEXT NOT NULL,
    verified_at    TEXT,
    consumed_at    TEXT,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_domain_ownership_user_domain UNIQUE (user_id, domain)
);
CREATE INDEX IF NOT EXISTS ix_domain_ownership_user_id ON domain_ownership_verification (user_id);

CREATE TABLE IF NOT EXISTS email_domain (
    id             INTEGER PRIMARY KEY,
    org_id         INTEGER NOT NULL REFERENCES organization (id),
    domain         TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    spf_name       TEXT NOT NULL,
    spf_value      TEXT NOT NULL,
    dkim_name      TEXT NOT NULL,
    dkim_value     TEXT NOT NULL,
    tracking_name  TEXT NOT NULL,
    tracking_value TEXT NOT NULL,
    bounce_name    TEXT,
    bounce_value   TEXT,
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    verified_at    TEXT,
    CONSTRAINT uq_org_domain UNIQUE (org_id, domain)
);

CREATE TABLE IF NOT EXISTS onboarding_progress (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL UNIQUE REFERENCES "user" (id),
    step            INTEGER DEFAULT 1,
    goal            TEXT,
    email_connected INTEGER DEFAULT 0 CHECK (email_connected IN (0, 1)),
    sms_connected   INTEGER DEFAULT 0 CHECK (sms_connected IN (0, 1)),
    selected_preset INTEGER REFERENCES preset (id),
    flow_activated  INTEGER DEFAULT 0 CHECK (flow_activated IN (0, 1)),
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    payment_cleared INTEGER DEFAULT 0 CHECK (payment_cleared IN (0, 1)),
    -- Post-onboarding "Getting started" checklist state. The data-backed items
    -- (email/sms/leads/automations/templates) are auto-detected from
    -- real tables; these flags only track the visit-based items + dismissal.
    checklist_dismissed  INTEGER DEFAULT 0 CHECK (checklist_dismissed IN (0, 1)),
    visited_ai_agent INTEGER DEFAULT 0 CHECK (visited_ai_agent IN (0, 1)),
    visited_dashboard    INTEGER DEFAULT 0 CHECK (visited_dashboard IN (0, 1))
);

CREATE TABLE IF NOT EXISTS usage (
    id          INTEGER PRIMARY KEY,
    org_id      INTEGER NOT NULL,
    month       TEXT NOT NULL,                  -- YYYY-MM
    emails_sent INTEGER DEFAULT 0,
    sms_sent    INTEGER DEFAULT 0,
    ai_requests INTEGER DEFAULT 0,
    -- One-shot quota-exceeded notification stamps. NULL until we've notified
    -- the org owner for that channel in the current month. The usage row is
    -- keyed (org_id, month), so a new month auto-resets the stamps.
    email_limit_notified_at TEXT,
    sms_limit_notified_at   TEXT,
    ai_limit_notified_at    TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_org_month_usage UNIQUE (org_id, month)
);
CREATE INDEX IF NOT EXISTS ix_usage_org_id ON usage (org_id);
