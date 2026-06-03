-- 0.drop-tables.sql
-- Reset the schema. Drop in reverse foreign-key dependency order so D1's FK
-- enforcement never blocks a drop. Triggers are dropped with their tables.

-- Standalone tables with no FK references (26). Safe to drop in any order.
DROP TABLE IF EXISTS server_logs;

-- AI agents + intelligence (17, 18, 20). Drop first - they FK-reference
-- user/organization/lead, so they must go before those parent tables or D1's FK
-- enforcement aborts the parent DROPs (FOREIGN KEY constraint failed).
DROP TABLE IF EXISTS listing;
DROP TABLE IF EXISTS inbound_responder;
DROP TABLE IF EXISTS task;
DROP TABLE IF EXISTS agent_availability;
DROP TABLE IF EXISTS ai_qualification;
DROP TABLE IF EXISTS ai_knowledge_entry;
DROP TABLE IF EXISTS lead_escalation;
DROP TABLE IF EXISTS ai_activity_log;
DROP TABLE IF EXISTS ai_workflow;
DROP TABLE IF EXISTS ai_agent_state;
DROP TABLE IF EXISTS agent_profile;

-- Integrations (19). FK-reference api_key/organization/user, so drop the
-- subscription child before api_key, and both before organization/user.
DROP TABLE IF EXISTS integration_subscription;
DROP TABLE IF EXISTS api_key;

-- App settings (16)
DROP TABLE IF EXISTS app_settings;

-- Mock send + rate limits (14, 15)
DROP TABLE IF EXISTS mock_send_log;
DROP TABLE IF EXISTS send_rate_counter;

-- User channel preferences (13)
DROP TABLE IF EXISTS user_channel_preference;

-- Calling / voice (11). Tables with FKs to calls(id) must drop BEFORE calls -
-- otherwise D1's FK enforcement aborts the DROP TABLE calls with a constraint
-- error. Includes lead_appointment because the Calls page added a
-- lead_appointment.call_id FK (the booked-from-calls link); it's also dropped
-- again later with the leads section, which is a no-op the second time.
DROP TABLE IF EXISTS lead_appointment;
DROP TABLE IF EXISTS call_notes;
DROP TABLE IF EXISTS call_tasks;
DROP TABLE IF EXISTS call_ai_insights;
DROP TABLE IF EXISTS webhook_logs;
DROP TABLE IF EXISTS usage_records;
DROP TABLE IF EXISTS call_events;
DROP TABLE IF EXISTS calls;
DROP TABLE IF EXISTS billing_cycles;
DROP TABLE IF EXISTS phone_numbers;
DROP TABLE IF EXISTS calling_configurations;

-- Misc (10)
DROP TABLE IF EXISTS usage;
DROP TABLE IF EXISTS onboarding_progress;
DROP TABLE IF EXISTS email_domain;
DROP TABLE IF EXISTS domain_ownership_verification;
DROP TABLE IF EXISTS business_email_verification;
DROP TABLE IF EXISTS device_token;
DROP TABLE IF EXISTS push_subscription;
DROP TABLE IF EXISTS ai_custom_step;
DROP TABLE IF EXISTS auto_response_settings;

-- Telephony (9)
DROP TABLE IF EXISTS telnyx_sms_activation;

-- Email connections (8)
DROP TABLE IF EXISTS email_events;
DROP TABLE IF EXISTS inbound_messages;
DROP TABLE IF EXISTS inbox_connection;
DROP TABLE IF EXISTS gmail_watch_state;
DROP TABLE IF EXISTS oauth_tokens;
DROP TABLE IF EXISTS email_connections;

-- Sequences (7)
DROP TABLE IF EXISTS step_executions;
DROP TABLE IF EXISTS sequence_instances;
DROP TABLE IF EXISTS sequence_steps;
DROP TABLE IF EXISTS sequences;

-- Automations/templates (6)
DROP TABLE IF EXISTS automation;
DROP TABLE IF EXISTS message_templates;
DROP TABLE IF EXISTS preset;
DROP TABLE IF EXISTS persona;
DROP TABLE IF EXISTS tones;
DROP TABLE IF EXISTS template_categories;

DROP TABLE IF EXISTS scheduled_message;
DROP TABLE IF EXISTS notification;

DROP TABLE IF EXISTS sms_message;
DROP TABLE IF EXISTS sms_conversation;
DROP TABLE IF EXISTS sms_contact;

DROP TABLE IF EXISTS thread_lead_assignments;
DROP TABLE IF EXISTS inbox_messages;
DROP TABLE IF EXISTS thread;
DROP TABLE IF EXISTS inbox;

DROP TABLE IF EXISTS deal_assignee;
DROP TABLE IF EXISTS deal;
DROP TABLE IF EXISTS lead_appointment;
DROP TABLE IF EXISTS lead_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS lead;

DROP TABLE IF EXISTS auth_session;
DROP TABLE IF EXISTS invite;
DROP TABLE IF EXISTS office;
DROP TABLE IF EXISTS team_member;
DROP TABLE IF EXISTS team;
DROP TABLE IF EXISTS membership;
DROP TABLE IF EXISTS organization;
DROP TABLE IF EXISTS "user";
DROP TABLE IF EXISTS role;

DROP TABLE IF EXISTS users;
