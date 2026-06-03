// Base URL of the WarmChats integration API. Defaults to production; override
// with `zapier env:set WARMCHATS_BASE_URL=...` for a custom domain or staging.
const BASE_URL = process.env.WARMCHATS_BASE_URL || 'https://www.warmchats.com/api/integrations/v1';

module.exports = { BASE_URL };
