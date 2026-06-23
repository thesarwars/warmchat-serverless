-- Comp/promo tracking on organization.
--
-- A "comp" is a 100%-off promo grant that bypasses Stripe entirely: the org is
-- given a paid plan in D1 (subscription_status = 'comp') with NO Stripe
-- customer or subscription. `comp_expires_at` (computed at grant time from the
-- Stripe coupon's duration: forever -> NULL, once -> +1mo, repeating -> +N mo)
-- is the clock the comp-expiry cron job uses to revert the org to free_channel
-- and alert the owner to add a card. `promo_code` records which code was used.
ALTER TABLE organization ADD COLUMN comp_expires_at TEXT;
ALTER TABLE organization ADD COLUMN promo_code TEXT;
