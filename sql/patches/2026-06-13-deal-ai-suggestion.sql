-- Deals.md "AI Stage Updates": major-milestone stage moves from the AI are not
-- applied directly - they are recorded as a suggestion the agent confirms from
-- the deal card ("AI suggests -> stage"). Applied to remote D1 2026-06-13.
ALTER TABLE deal ADD COLUMN ai_suggested_stage TEXT;
ALTER TABLE deal ADD COLUMN ai_suggestion_reason TEXT;
