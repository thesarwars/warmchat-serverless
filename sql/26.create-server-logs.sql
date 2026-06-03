-- 26.create-server-logs.sql
-- Honeypot / intrusion log. The real per-user WebSocket upgrade endpoint was
-- moved to /api/calling/ws42; the old /api/calling/ws path is now a trap
-- (functions/api/calling/ws.ts) that no legitimate client touches, so every
-- request landing on it is unsolicited. Each hit is recorded here with the
-- full request fingerprint (method, path, ip, headers, body) for review.
--
-- Not wired to any UI yet - inspect with a direct D1 query, e.g.
--   wrangler d1 execute warmchats-db --remote \
--     --command "SELECT created_at, ip, country, method, user_agent FROM server_logs ORDER BY id DESC LIMIT 50"

CREATE TABLE IF NOT EXISTS server_logs (
    id              INTEGER PRIMARY KEY,
    source          TEXT NOT NULL DEFAULT 'calling-ws-trap', -- which trap caught it
    method          TEXT,                                    -- GET / POST / HEAD / ...
    path            TEXT,
    query_string    TEXT,
    upgrade         TEXT,                                    -- value of the Upgrade header, if any
    ip              TEXT,                                    -- cf-connecting-ip
    country         TEXT,                                    -- cf-ipcountry
    ray_id          TEXT,                                    -- cf-ray (correlate with CF logs/WAF)
    user_agent      TEXT,
    referer         TEXT,
    headers         TEXT,                                    -- JSON object of all request headers
    body            TEXT,                                    -- request body, truncated
    response_status INTEGER,                                 -- status the trap returned
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_server_logs_created_at ON server_logs (created_at);
CREATE INDEX IF NOT EXISTS ix_server_logs_ip         ON server_logs (ip);
