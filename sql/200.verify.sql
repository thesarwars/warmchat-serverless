-- 200.verify.sql
-- Sanity check after seeding. Expect: roles=4, users=1, orgs=1, memberships=1, leads=3.

SELECT 'role'         AS table_name, COUNT(*) AS rows FROM role
UNION ALL SELECT 'user',        COUNT(*) FROM "user"
UNION ALL SELECT 'organization', COUNT(*) FROM organization
UNION ALL SELECT 'membership',  COUNT(*) FROM membership
UNION ALL SELECT 'lead',        COUNT(*) FROM lead;
