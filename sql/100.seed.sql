-- 100.seed.sql
-- Minimal, valid demo data for local development.
-- Demo user login:  jv@jovrealestate.com  /  Greenbay24
-- Demo user login:  velasquezjojo7@gmail.com  /  Greenbay24
-- The password_hash below is PBKDF2-SHA256 in the format produced by
-- functions/_shared/password.ts (verify with verifyPassword()).
--
-- Scope: account/setup state only (the two demo logins + the global config
-- tables + the same starter templates a real signup gets). No mock CRM content
-- (leads, calls, AI notes, appointments, activity logs, demo workflow cards) -
-- those are left empty so a fresh DB looks like a freshly-registered account.

INSERT OR IGNORE INTO role (name) VALUES ('Owner'), ('Manager'), ('Representative'), ('Guest');

-- Onboarding sequence presets (global, no org scope). Seeded early because
-- onboarding_progress.selected_preset FK-references this table and user 2's
-- onboarding_progress row sets selected_preset = 1. Re-running the seed is a
-- no-op (PK conflict + OR IGNORE).
INSERT OR IGNORE INTO preset (id, name, description, avg_replies, no_of_messages, days) VALUES
  (1, 'Buyer lead follow-up',      'Instant follow-ups for new buyer inquiries.',  '32-45%', 3, 'Day 0, Day 1, Day 3'),
  (2, 'Open house follow-up',      'Re-engage attendees after an open house.',     '28-38%', 2, 'Day 0, Day 2'),
  (3, 'Seller lead follow-up',     'Stay top of mind with motivated sellers.',     '25-35%', 3, 'Day 0, Day 2, Day 5'),
  (4, 'Past client re-engagement', 'Reconnect with past clients for referrals.',   '20-30%', 2, 'Day 0, Day 4');

-- Default AI personas (global, no org scope).
-- The /ai/personas/seed-defaults endpoint exists for parity, but nothing calls it at
-- runtime and these tables are global, so they belong in the static seed.
-- Explicit ids so re-running the seed is a no-op (PK conflict + OR IGNORE),
-- since persona/tones have no UNIQUE constraint on label.
INSERT OR IGNORE INTO persona (id, label) VALUES
    (1, 'Real Estate Marketing Leader'),
    (2, 'Trusted Local Advisor'),
    (3, 'Neighborhood Expert'),
    (4, 'Listing Specialist'),
    (5, 'Buyer Specialist'),
    (6, 'Investment Advisor'),
    (7, 'Luxury Home Specialist'),
    (8, 'New Construction Specialist'),
    (9, 'Community Connector'),
    (10, 'Straight-Talking Negotiator');

-- Default AI tones (global, no org scope).
INSERT OR IGNORE INTO tones (id, label) VALUES
    (1, 'Friendly'),
    (2, 'Professional'),
    (3, 'Warm'),
    (4, 'Consultative'),
    (5, 'Confident'),
    (6, 'Persuasive'),
    (7, 'Direct'),
    (8, 'Empathetic'),
    (9, 'Urgent'),
    (10, 'Luxury');

-- Demo user, pre-activated for SMS so the inbox lets you send right away.
-- The inbox gate checks user.telnyx_sms_status = 'approved' AND a phone number.
-- is_admin=1 grants access to /admin/* (mock-send toggle, debug feed). The
-- second seeded user (id 2) intentionally stays at is_admin=0.
INSERT INTO "user" (id, name, email, password_hash, is_email_confirmed,
                    telnyx_messaging_profile_id, telnyx_phone_number,
                    telnyx_brand_id, telnyx_campaign_id,
                    telnyx_sms_status, telnyx_campaign_number_status,
                    business_address,
                    is_admin)
VALUES (
    1,
    'Joseph Velasquez',
    'jv@jovrealestate.com',
    'pbkdf2$sha256$12000$Av8LEXYvzWId5K2WfqFcjQ==$hinFpiqfKqX6+Q6Xr2ersTmPHhIzLHK+o+qxuibeWhw=',
    1,
    'demo-messaging-profile-1',
    '+17472017203',
    'demo-brand-1', 'demo-campaign-1',
    'approved',
    'assigned',
    '123 Demo Street, San Francisco, CA 94105',
    1
);

-- Demo org on the Growth plan (unlocks SMS, team management, lead routing, offices).
INSERT INTO organization (id, name, owner_id, plan, subscription_status, plan_started_at, timezone, quiet_hours_start, quiet_hours_end)
VALUES (1, 'Demo Realty', 1, 'growth', 'active', '2026-05-01 00:00:00', 'America/Los_Angeles', 7, 24);

INSERT INTO membership (user_id, org_id, role_id)
SELECT 1, 1, id FROM role WHERE name = 'Owner';

-- Mock 10DLC activation so /connect-phone sees a completed registration
-- instead of bouncing the demo user back to step 1.
INSERT INTO telnyx_sms_activation (
    user_id, business_type, legal_name,
    address_line1, city, state, postal_code, country,
    email, phone, brokerage_name,
    privacy_policy_url, terms_url, ssn_last4
) VALUES (
    1, 'sole_proprietor', 'Joseph Velasquez',
    '123 Demo Street', 'San Francisco', 'CA', '94105', 'US',
    'jv@jovrealestate.com', '+17472017203', 'Demo Realty',
    'https://www.warmchats.com/agents/joseph-velasquez-2/privacy',
    'https://www.warmchats.com/agents/joseph-velasquez-2/terms',
    '0000'
);

-- Mark onboarding complete so the demo user lands straight on the dashboard.
INSERT INTO onboarding_progress (user_id, step, email_connected, sms_connected, flow_activated)
VALUES (1, 5, 1, 1, 1);

-- ── Second seeded user: velasquezjojo7@gmail.com ──────────────────────────────
-- Mirrors a real signup with their own workspace (org 2) on the custom_brokerage plan,
-- with SMS approved, the business email connected (same Elastic setup as user 1),
-- and onboarding complete (step 5). Useful for the second-tenant / owner-scoped
-- query case.
-- Same Greenbay24 password hash as user 1.
INSERT INTO "user" (
    id, name, email, password_hash,
    email_confirmed, is_google_user, is_email_confirmed,
    telnyx_messaging_profile_id, telnyx_phone_number,
    telnyx_brand_id, telnyx_campaign_id,
    telnyx_sms_status, telnyx_error_reason, telnyx_campaign_number_status,
    agent_slug,
    business_address,
    telnyx_credential_id, telnyx_sip_uri
) VALUES (
    2,
    'JOSEPH VELASQUEZ',
    'velasquezjojo7@gmail.com',
    'pbkdf2$sha256$12000$Av8LEXYvzWId5K2WfqFcjQ==$hinFpiqfKqX6+Q6Xr2ersTmPHhIzLHK+o+qxuibeWhw=',
    1, 1, 1,
    '40019e49-4441-4395-875c-b5be0ffceb82',
    '+17473210095',
    '4b20019d-a98b-a4e7-1a00-357bf2aca97d',
    '4b30019d-b165-ecc2-aff0-fedd0df37d98',
    'approved',
    NULL,
    'assigned',
    'joseph-velasquez',
    '6035 East Lyell Avenue, Fresno, CA 93727',
    'b0df58da-9b3e-4fc9-ba37-4abf666e34fb',
    'sip:gencred4zE3KMLfR4hFx9tfWMUnGTElahf0t6aa1AkUribSCt@sip.telnyx.com'
);

INSERT INTO organization (
    id, name, owner_id, stripe_customer_id, plan, subscription_status,
    plan_started_at, stripe_subscription_id, timezone, quiet_hours_start, quiet_hours_end
) VALUES (
    2,
    'JOSEPH VELASQUEZ''s Workspace',
    2,
    'cus_Ua8RgwMjqZEHRJ',
    'custom_brokerage',
    'active',
    '2026-05-25 13:08:38',
    'sub_1TayFBFk4wccBvlXg7el3cCH',
    'America/Los_Angeles',
    7, 24
);

INSERT INTO membership (user_id, org_id, role_id)
SELECT 2, 2, id FROM role WHERE name = 'Owner';

INSERT INTO telnyx_sms_activation (
    user_id, business_type, legal_name,
    address_line1, city, state, postal_code, country,
    email, phone, brokerage_name,
    privacy_policy_url, terms_url, ssn_last4
) VALUES (
    2, 'sole_proprietor', 'Joseph Velasquez',
    '6035 East Lyell Avenue', 'Fresno', 'CA', '93727', 'US',
    'jv@jovrealestate.com', '+17473242077', 'Legacy',
    'https://www.warmchats.com/agents/joseph-velasquez/privacy',
    'https://www.warmchats.com/agents/joseph-velasquez/terms',
    '1220'
);

INSERT INTO onboarding_progress (user_id, step, selected_preset, email_connected, sms_connected, flow_activated, visited_dashboard)
VALUES (2, 5, 1, 1, 1, 0, 1);

-- Demo email connection: Elastic with a verified custom domain so the dashboard
-- "Email Connected" pill renders and inbound webhook lookups succeed.
INSERT INTO inbox_connection
    (id, user_id, email_address, provider, elastic_from_email,
     can_receive, is_verified, status, elastic_email_inbound_route_added)
VALUES
    (1, 1, 'jv@jovrealestate.com', 'elastic', 'jv@jovrealestate.com',
     1, 1, 'verified', 1);

-- Matching verified domain row (what /api/elastic/domain/verify would write).
-- DNS values mirror the hardcoded SPF/DKIM/Tracking records in BusinessEmailSetup.tsx.
INSERT INTO email_domain
    (id, org_id, domain, status,
     spf_name, spf_value,
     dkim_name, dkim_value,
     tracking_name, tracking_value,
     bounce_name, bounce_value,
     verified_at)
VALUES
    (1, 1, 'jovrealestate.com', 'verified',
     '@',           'v=spf1 include:_spf.elasticemail.com ~all',
     'api._domainkey', 'api.elasticemail.com',
     'tracking',    'api.elasticemail.com',
     'bounce',      'api.elasticemail.com',
     '2026-05-15 00:00:00');

-- Email connection for User 2 - the same business email the main account (User 1)
-- has connected. Mirrors User 1's Elastic setup above (NOT a Gmail OAuth token), so
-- the seed stays self-contained: no email_connections / oauth_tokens rows needed.
INSERT INTO inbox_connection
    (id, user_id, email_address, provider, elastic_from_email,
     can_receive, is_verified, status, elastic_email_inbound_route_added)
VALUES
    (2, 2, 'jv@jovrealestate.com', 'elastic', 'jv@jovrealestate.com',
     1, 1, 'verified', 1);

INSERT INTO email_domain
    (id, org_id, domain, status,
     spf_name, spf_value,
     dkim_name, dkim_value,
     tracking_name, tracking_value,
     bounce_name, bounce_value,
     verified_at)
VALUES
    (2, 2, 'jovrealestate.com', 'verified',
     '@',           'v=spf1 include:_spf.elasticemail.com ~all',
     'api._domainkey', 'api.elasticemail.com',
     'tracking',    'api.elasticemail.com',
     'bounce',      'api.elasticemail.com',
     '2026-05-15 00:00:00');

-- Empty email inbox so the unified inbox renders for the org without demo content.
INSERT INTO inbox (id, name, channel, org_id) VALUES (1, 'Email', 'email', 1);

-- ── Calling state for seeded users ───────────────────────────────────────────
-- Mirrors what functions/_shared/calling/provision.ts:ensureCallingForNumber
-- writes on a real provisioning event. The seed inserts user 1 + user 2 with
-- telnyx_phone_number already set but bypasses the provisioning endpoint, so
-- those calling rows would otherwise be missing and /api/calling/can-call would
-- return "Calling is not configured" / "No business number assigned" for both
-- demo accounts. Keeping the seed internally consistent with the helper's
-- output - if you ever change ensureCallingForNumber's defaults, mirror them
-- here so a fresh DB still matches the live-provisioning state.
INSERT OR IGNORE INTO calling_configurations (id, org_id) VALUES
    ('00000000-0000-0000-0000-000000000011', 1),
    ('00000000-0000-0000-0000-000000000012', 2);

INSERT OR IGNORE INTO phone_numbers
    (id, phone_number, provider, provider_sid, status, capabilities, assigned_to_user_id, org_id)
VALUES
    ('00000000-0000-0000-0000-000000000001', '+17472017203', 'telnyx', '+17472017203', 'ACTIVE',
     '{"voice":true,"sms":true}', 1, 1),
    ('00000000-0000-0000-0000-000000000002', '+17473210095', 'telnyx', '+17473210095', 'ACTIVE',
     '{"voice":true,"sms":true}', 2, 2);

-- ── AI defaults (same as a real signup) ──────────────────────────────────────
-- A real signup (functions/api/auth/register.ts) only provisions the master AI
-- switch (OFF) and a starter auto-response config. The agents page lazily
-- defaults agent on/off state, the workflows list starts empty, and the agent
-- knowledge profile starts blank - so none of those are seeded here either.

-- Master AI switch (OFF by default - agents only run once turned on).
-- No spend cap is seeded: spend should be governed by account usage, not a
-- user-set number, and a real signup never writes one either.
INSERT OR IGNORE INTO app_settings (org_id, key, value) VALUES
  (1, 'ai_master_enabled', '0'),
  (2, 'ai_master_enabled', '0');

-- Inbound + Outbound agents ON by default (matches register.ts). The master
-- switch above stays OFF, so nothing sends until AI is turned on - this just
-- spares the user from flipping the per-agent switches. Assistant is left to its
-- OFF default (no row). One row per (org_id, user_id, agent_key); INSERT OR
-- IGNORE is a no-op on re-seed.
INSERT OR IGNORE INTO ai_agent_state (org_id, user_id, agent_key, enabled) VALUES
  (1, 1, 'outbound', 1),
  (2, 2, 'outbound', 1),
  (1, 1, 'inbound', 1),
  (2, 2, 'inbound', 1);

-- Per-agent templates are not hand-seeded here. The agent's Templates tab
-- auto-seeds the curated design library on first visit (POST
-- /api/ai/templates/seed-agent-library) and waits for it to finish, so a
-- freshly reset DB still lands on a fully-populated Templates tab.

-- Inbound auto-response: the same starter copy a real signup gets, so a freshly
-- reset DB has an inbound auto-response row per seed user, ON by default (the
-- master switch above stays OFF, so nothing sends until AI is turned on).
-- Reactive replies run through the qualification flow; there is no
-- instant/day1/day3 drip (that duplicated the outbound automation, so it was
-- removed). user_id is UNIQUE (sql/10.create-misc.sql), and INSERT OR IGNORE
-- makes re-running a no-op. always_say / never_say / escalation_keywords start
-- with sensible real-estate defaults (matches what register.ts seeds new
-- signups); the agent edits them in AI Knowledge Base. escalation_keywords
-- values match the AI Settings checklist options so they render as "on".
INSERT OR IGNORE INTO auto_response_settings (user_id, org_id, enabled, always_say, never_say, escalation_keywords)
VALUES
  (1, 1, 1, '["Local market expertise","Pre-approval recommendation","Free home valuation"]', '["Guaranteed results","Lowest rates","Guaranteed pricing"]', '["Wants to buy now","Wants to sell now","Requests phone call","Wants to make an offer","Commission questions","Financing questions","Legal or compliance questions","Lead is upset"]'),
  (2, 2, 1, '["Local market expertise","Pre-approval recommendation","Free home valuation"]', '["Guaranteed results","Lowest rates","Guaranteed pricing"]', '["Wants to buy now","Wants to sell now","Requests phone call","Wants to make an offer","Commission questions","Financing questions","Legal or compliance questions","Lead is upset"]');

-- A few ready-to-run example workflows seeded per org, so a new workspace has
-- proven follow-up sequences to enroll imported leads into out of the box. Each
-- shows in the Outbound Workflows tab (an `automation` row); the opening
-- `message` is sent instantly on enroll, and each `followup_steps` entry fires
-- `delay_days` later at its `send_time` (HH:MM, account timezone - see
-- workflowSchedule.ts / queueAutomationForLead). Status 'Running' so they are
-- live, usable workflows (they only send to leads explicitly enrolled at import -
-- not a broadcast). `sources` seeds the default enroll audience. Explicit ids
-- keep re-seeding idempotent. (org_id / owner_id are TEXT in this table.) Kept in
-- sync with the same list seeded for new signups in functions/api/auth/register.ts.
INSERT OR IGNORE INTO automation
  (id, name, channels, message, sources, leads, org_id, owner_id, status, followup_steps)
VALUES
  (1, 'Buyer Follow-Up', '["sms"]',
   'Hi {{first_name}}, it''s {{agent_name}}. Saw you were looking at homes in {{area}} are you hoping to buy soon, or still exploring?',
   '["buyer"]', '[]', '1', '1', 'Running',
   '[{"delay_days":2,"send_time":"10:00","message":"Hi {{first_name}}, want me to send a few listings that match what you''re after? Happy to line them up."},{"delay_days":5,"send_time":"11:00","message":"Hi {{first_name}}, a couple of homes in {{area}} are moving fast. Want a quick look before they go?"},{"delay_days":9,"send_time":"10:00","message":"Hi {{first_name}}, no rush at all - want me to set up alerts so you only hear from me when something great hits?"}]'),
  (2, 'Seller Home-Value Follow-Up', '["sms"]',
   'Hi {{first_name}}, it''s {{agent_name}}. I can put together a free, no-obligation estimate of what your home could sell for. Want me to send it over?',
   '["seller"]', '[]', '1', '1', 'Running',
   '[{"delay_days":2,"send_time":"12:00","message":"Hi {{first_name}}, homes near {{area}} have been selling quickly lately. Curious what you''d list yours for?"},{"delay_days":6,"send_time":"10:00","message":"Hi {{first_name}}, even if you''re not ready to sell, I can keep you posted on your home value over time. Want that?"}]'),
  (3, 'New Lead Welcome', '["sms"]',
   'Hi {{first_name}}, it''s {{agent_name}} - thanks for reaching out! What are you looking for, and how can I help you get started?',
   '["new"]', '[]', '1', '1', 'Running',
   '[{"delay_days":1,"send_time":"09:00","message":"Hi {{first_name}}, just checking in - happy to answer any questions or send over some options whenever you''re ready."},{"delay_days":4,"send_time":"11:00","message":"Hi {{first_name}}, still here to help! Want me to put together a few listings or a quick home-value estimate?"}]'),
  (4, 'Buyer Follow-Up', '["sms"]',
   'Hi {{first_name}}, it''s {{agent_name}}. Saw you were looking at homes in {{area}} are you hoping to buy soon, or still exploring?',
   '["buyer"]', '[]', '2', '2', 'Running',
   '[{"delay_days":2,"send_time":"10:00","message":"Hi {{first_name}}, want me to send a few listings that match what you''re after? Happy to line them up."},{"delay_days":5,"send_time":"11:00","message":"Hi {{first_name}}, a couple of homes in {{area}} are moving fast. Want a quick look before they go?"},{"delay_days":9,"send_time":"10:00","message":"Hi {{first_name}}, no rush at all - want me to set up alerts so you only hear from me when something great hits?"}]'),
  (5, 'Seller Home-Value Follow-Up', '["sms"]',
   'Hi {{first_name}}, it''s {{agent_name}}. I can put together a free, no-obligation estimate of what your home could sell for. Want me to send it over?',
   '["seller"]', '[]', '2', '2', 'Running',
   '[{"delay_days":2,"send_time":"12:00","message":"Hi {{first_name}}, homes near {{area}} have been selling quickly lately. Curious what you''d list yours for?"},{"delay_days":6,"send_time":"10:00","message":"Hi {{first_name}}, even if you''re not ready to sell, I can keep you posted on your home value over time. Want that?"}]'),
  (6, 'New Lead Welcome', '["sms"]',
   'Hi {{first_name}}, it''s {{agent_name}} - thanks for reaching out! What are you looking for, and how can I help you get started?',
   '["new"]', '[]', '2', '2', 'Running',
   '[{"delay_days":1,"send_time":"09:00","message":"Hi {{first_name}}, just checking in - happy to answer any questions or send over some options whenever you''re ready."},{"delay_days":4,"send_time":"11:00","message":"Hi {{first_name}}, still here to help! Want me to put together a few listings or a quick home-value estimate?"}]');

-- Default lead qualification questions (AI Settings -> Qualifications) for both
-- seed accounts, matching what register.ts seeds new signups. One question per
-- row, scoped by lead type via applies_to; the inbound AI works through the
-- relevant ones to qualify a lead (one at a time, after the lead engages).
INSERT INTO ai_qualification (org_id, user_id, applies_to, question, guidance, enabled, position)
VALUES
  (1, 1, 'buyer', 'What price range are you hoping to stay around?', 'Save to price_range.', 1, 0),
  (1, 1, 'buyer', 'Are you looking to buy in the next few months or just exploring for now?', 'Save to timeline.', 1, 1),
  (1, 1, 'buyer', 'Have you already gotten pre-approved, or still figuring out the financing side?', 'Save to financing_status and pre_approved.', 1, 2),
  (1, 1, 'buyer', 'What area are you hoping to buy in?', 'Save to area; ask only if the area is still unknown.', 1, 3),
  (1, 1, 'seller', 'What''s the property address or area?', 'Save to property_address.', 1, 4),
  (1, 1, 'seller', 'Is the home currently owner-occupied, rented, or vacant?', 'Save to occupancy_status.', 1, 5),
  (1, 1, 'seller', 'What''s got you thinking about selling?', 'Save to motivation.', 1, 6),
  (1, 1, 'renter', 'What area are you hoping to rent in?', 'Save to area.', 1, 7),
  (1, 1, 'renter', 'What monthly budget would you like to stay around?', 'Save to price_range.', 1, 8),
  (1, 1, 'renter', 'How many bedrooms are you looking for?', 'Save to bedrooms.', 1, 9),
  (1, 1, 'renter', 'When are you hoping to move?', 'Save to timeline.', 1, 10),
  (2, 2, 'buyer', 'What price range are you hoping to stay around?', 'Save to price_range.', 1, 0),
  (2, 2, 'buyer', 'Are you looking to buy in the next few months or just exploring for now?', 'Save to timeline.', 1, 1),
  (2, 2, 'buyer', 'Have you already gotten pre-approved, or still figuring out the financing side?', 'Save to financing_status and pre_approved.', 1, 2),
  (2, 2, 'buyer', 'What area are you hoping to buy in?', 'Save to area; ask only if the area is still unknown.', 1, 3),
  (2, 2, 'seller', 'What''s the property address or area?', 'Save to property_address.', 1, 4),
  (2, 2, 'seller', 'Is the home currently owner-occupied, rented, or vacant?', 'Save to occupancy_status.', 1, 5),
  (2, 2, 'seller', 'What''s got you thinking about selling?', 'Save to motivation.', 1, 6),
  (2, 2, 'renter', 'What area are you hoping to rent in?', 'Save to area.', 1, 7),
  (2, 2, 'renter', 'What monthly budget would you like to stay around?', 'Save to price_range.', 1, 8),
  (2, 2, 'renter', 'How many bedrooms are you looking for?', 'Save to bedrooms.', 1, 9),
  (2, 2, 'renter', 'When are you hoping to move?', 'Save to timeline.', 1, 10);

-- Starter custom auto-responses (inbound_responder) per seed user, matching what
-- register.ts seeds new signups. Shown as cards in AI Agent -> Inbound ->
-- Workflows and injected into the inbound system prompt; enabled so they apply
-- once the AI master + Inbound are turned on. Explicit ids keep re-seed idempotent.
INSERT OR IGNORE INTO inbound_responder (id, org_id, user_id, name, trigger_label, keywords, tone, message, enabled) VALUES
  (1, 1, 1, 'Pricing question', 'Pricing question', 'price, cost, how much, commission, fees, rate', 'Helpful', 'Great question - pricing depends on the specific home and your situation. I''d be glad to put together exact numbers for you. What area and price range are you considering?', 1),
  (2, 1, 1, 'Wants to see a home', 'Showing request', 'see, tour, showing, visit, walk through, view, open house', 'Warm', 'I''d be happy to set up a showing for you. What days or times generally work best?', 1),
  (3, 1, 1, 'Just browsing', 'Not ready yet', 'just looking, browsing, not ready, early, no rush, someday', 'Low-pressure', 'Totally understand - no pressure at all. I can send you new listings as they come up so you stay in the loop. Want me to do that?', 1),
  (4, 2, 2, 'Pricing question', 'Pricing question', 'price, cost, how much, commission, fees, rate', 'Helpful', 'Great question - pricing depends on the specific home and your situation. I''d be glad to put together exact numbers for you. What area and price range are you considering?', 1),
  (5, 2, 2, 'Wants to see a home', 'Showing request', 'see, tour, showing, visit, walk through, view, open house', 'Warm', 'I''d be happy to set up a showing for you. What days or times generally work best?', 1),
  (6, 2, 2, 'Just browsing', 'Not ready yet', 'just looking, browsing, not ready, early, no rush, someday', 'Low-pressure', 'Totally understand - no pressure at all. I can send you new listings as they come up so you stay in the loop. Want me to do that?', 1);

-- AI Knowledge Profile for user 1. Clean defaults the agent edits in AI Settings;
-- agent_name/email come from the account (same shape as user 2 below).
INSERT OR IGNORE INTO agent_profile
  (org_id, user_id, agent_name, email, languages, specialties, buyer_commission,
   seller_commission, min_commission_rules, avg_price_point, preferred_lender,
   preferred_title_escrow, persona_json)
VALUES
  (1, 1, 'Joseph Velasquez', 'jv@jovrealestate.com', '["English"]',
   '["Buyers","Sellers","First-time buyers","Luxury","Investors"]', '2.5%',
   '5.0% total (2.5% listing / 2.5% co-op)',
   'Minimum commission of $5,000 or 2.5% per side, whichever is greater.', '400000',
   'Preferred Mortgage Co. (add your lender''s contact)',
   'Preferred Title & Escrow (add your contact)',
   '{"voice":"Warm & Professional","length":"Short","emoji":"Rarely","humor":"Light","timing":"Natural Delay (30 seconds)","qual":"Balanced Qualification","goals":["Book Appointments","Collect Information"],"persist":"High","property_types":"Single Family, Condo, Townhouse"}');
-- AI Knowledge Profile for user 2 (user 1's is seeded above). Generic defaults
-- the agent edits in AI Settings; agent_name/email come from the account.
INSERT OR IGNORE INTO agent_profile
  (org_id, user_id, agent_name, email, languages, specialties, buyer_commission,
   seller_commission, min_commission_rules, avg_price_point, preferred_lender,
   preferred_title_escrow, persona_json)
VALUES
  (2, 2, 'JOSEPH VELASQUEZ', 'velasquezjojo7@gmail.com', '["English"]',
   '["Buyers","Sellers","First-time buyers","Luxury","Investors"]', '2.5%',
   '5.0% total (2.5% listing / 2.5% co-op)',
   'Minimum commission of $5,000 or 2.5% per side, whichever is greater.', '400000',
   'Preferred Mortgage Co. (add your lender''s contact)',
   'Preferred Title & Escrow (add your contact)',
   '{"voice":"Warm & Professional","length":"Short","emoji":"Rarely","humor":"Light","timing":"Natural Delay (30 seconds)","qual":"Balanced Qualification","goals":["Book Appointments","Collect Information"],"persist":"High","property_types":"Single Family, Condo, Townhouse"}');

-- Starter FAQs for both seed accounts (matches what register.ts seeds new
-- signups). One merged FAQ list - the UI no longer splits buyer/seller/custom
-- and the AI prompt reads every entry regardless of category, so all use 'faq'.
INSERT INTO ai_knowledge_entry (org_id, user_id, category, question, answer, enabled, position)
VALUES
  (1, 1, 'faq', 'Do you work with first-time buyers?', 'Absolutely - I guide first-time buyers through every step, from pre-approval to closing.', 1, 0),
  (1, 1, 'faq', 'How much do I need for a down payment?', 'It depends on the loan - some programs allow as little as 3% down. I can connect you with a lender for exact numbers.', 1, 1),
  (1, 1, 'faq', 'How do you decide my home''s price?', 'I run a free comparative market analysis on recent nearby sales and walk you through the numbers.', 1, 2),
  (1, 1, 'faq', 'How long will it take to sell?', 'It depends on price and condition, but I''ll give you a realistic timeline based on current local activity.', 1, 3),
  (1, 1, 'faq', 'What areas do you serve?', 'Let me know which area you''re focused on and I''ll confirm my coverage.', 1, 4),
  (1, 1, 'faq', 'Are you available on weekends?', 'Yes - I keep weekend slots open for showings and calls. What works for you?', 1, 5),
  (2, 2, 'faq', 'Do you work with first-time buyers?', 'Absolutely - I guide first-time buyers through every step, from pre-approval to closing.', 1, 0),
  (2, 2, 'faq', 'How much do I need for a down payment?', 'It depends on the loan - some programs allow as little as 3% down. I can connect you with a lender for exact numbers.', 1, 1),
  (2, 2, 'faq', 'How do you decide my home''s price?', 'I run a free comparative market analysis on recent nearby sales and walk you through the numbers.', 1, 2),
  (2, 2, 'faq', 'How long will it take to sell?', 'It depends on price and condition, but I''ll give you a realistic timeline based on current local activity.', 1, 3),
  (2, 2, 'faq', 'What areas do you serve?', 'Let me know which area you''re focused on and I''ll confirm my coverage.', 1, 4),
  (2, 2, 'faq', 'Are you available on weekends?', 'Yes - I keep weekend slots open for showings and calls. What works for you?', 1, 5);

CREATE TABLE IF NOT EXISTS api_key (
    id                 INTEGER PRIMARY KEY,
    org_id             INTEGER NOT NULL REFERENCES organization (id),
    created_by_user_id INTEGER REFERENCES "user" (id),
    name               TEXT NOT NULL,
    key_prefix         TEXT NOT NULL,                                    
    key_hash           TEXT NOT NULL,                                    
    scopes             TEXT NOT NULL DEFAULT 'leads:write,leads:read',  
    last_used_at       TEXT,
    created_at         TEXT DEFAULT CURRENT_TIMESTAMP,
    revoked_at         TEXT                                             
);