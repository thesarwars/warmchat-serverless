# WarmChats Zapier app

The WarmChats CRM integration for Zapier, built with the Zapier Platform CLI.
It talks to the WarmChats integration API (`/api/integrations/v1/**`) using a
per-org API Key.

- Auth: API Key (`authentication.js`, `middleware.js`) - validated via `GET /me`.
- Triggers (REST Hooks): New Lead, Lead Replied, Lead Status Changed, Appointment Booked (`triggers/`).
- Actions: Create or Update Lead, Add Tag, Enroll Lead (`creates/`).
- Searches: Find Lead (`searches/`).

The API base URL defaults to production and can be overridden with the
`WARMCHATS_BASE_URL` Zapier env var (see `constants.js`).

## Develop

```
npm install
zapier login
zapier validate     # lint the app definition
zapier push         # upload to your Zapier account
```

Full setup, versioning, and client-sharing steps are in
[../docs/zapier/PUBLISHING.md](../docs/zapier/PUBLISHING.md).

This package is intentionally outside the main app's lint/build (it is plain
Node.js for Zapier, not part of the Vite/Workers TypeScript projects).
