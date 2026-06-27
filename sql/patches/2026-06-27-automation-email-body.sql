-- Separate opening EMAIL body for outbound campaigns (distinct from `message`,
-- the SMS body) so a multi-channel campaign can send a short/cheap SMS and a
-- longer email. NULL/empty -> the email falls back to `message`. Per-follow-up
-- email bodies live in followup_steps[].email_body (JSON, no schema change).
-- Additive + idempotent-ish; apply once to warmchats-prod-us.
ALTER TABLE automation ADD COLUMN email_body TEXT;
