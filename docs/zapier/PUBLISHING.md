# Publishing the WarmChats Zapier app

This is the step-by-step to upload the WarmChats integration to Zapier so it
appears under Triggers and Actions, then share it with clients. The app source
lives in [`zapier-app/`](../../zapier-app/).

## What the app exposes

Authentication: **API Key** (per-org). A user generates a key in
WarmChats > Connected Accounts > API & Integrations and pastes it into Zapier.
Zapier validates it against `GET /api/integrations/v1/me`.

| Kind | Name | WarmChats endpoint |
| ---- | ---- | ------------------ |
| Trigger | New Lead | REST Hook `lead.created` (+ poll `GET /leads`) |
| Trigger | Lead Replied | REST Hook `lead.replied` (+ poll `GET /replies`) |
| Trigger | Lead Status Changed | REST Hook `lead.status_changed` (+ poll `GET /leads`) |
| Trigger | Appointment Booked | REST Hook `appointment.booked` (+ poll `GET /appointments`) |
| Action | Create or Update Lead | `POST /leads` (upsert + optional enrollment) |
| Action | Add Tag to Lead | `POST /leads/{id}/tags` |
| Action | Enroll Lead in AI Workflow | `POST /leads/{id}/enroll` |
| Search | Find Lead | `GET /leads?email=&phone=` |

## One-time setup

```
npm i -g zapier-platform-cli
zapier login                      # opens a browser to authenticate your Zapier account
cd zapier-app
npm install
```

## Register and upload

```
# First push only - creates the private app in your Zapier account:
zapier register "WarmChats"

# Upload the current version (re-run after any code change):
zapier push
```

After `zapier push`, open https://zapier.com/app/developer - the WarmChats app
now appears with its Triggers, Actions, and Searches. Build a test Zap and add a
real WarmChats API key to confirm `GET /me` succeeds (the connection should label
itself with your organization name).

If WarmChats runs on a non-production domain, point the app at it before pushing:

```
zapier env:set 1.0.0 WARMCHATS_BASE_URL=https://staging.example.com/api/integrations/v1
```

(Default is `https://www.warmchats.com/api/integrations/v1`.)

## Versioning

```
# After changes, bump "version" in zapier-app/package.json, then:
zapier push
zapier promote 1.0.1          # make this version the public/default one
zapier migrate 1.0.0 1.0.1    # move existing users onto the new version
```

## Share with clients (no public listing required)

The app does not need to be in the public Zapier directory to be usable.

```
# Option A - a private Secret Invite Link anyone can use to add the app:
zapier user:links            # prints the shareable invite URL

# Option B - invite specific people by email:
zapier users:add client@example.com
```

Share the invite link/email; the client adds WarmChats in their own Zapier
account and connects with their own WarmChats API key.

## Optional: public app directory

When the app is stable, submit it for the public directory from the Developer
Platform UI (Manage > Publishing). Public listing requires meeting Zapier's
review checklist (sample data, help text, error handling - already wired here).

## Compliance / WAF note

The integration endpoints (`/api/integrations/keys/*`, `/api/integrations/v1/*`)
should be added to the Cloudflare WAF rate-limit rule alongside the existing
`/api/auth/*` paths (dashboard, not code - see CLAUDE.md "WAF rate-limit rule").
Leads pushed in default to `sms_consent_status = 'unknown'`; never set
`opted_in` unless the lead explicitly consented. All sends remain gated at send
time by quiet hours, opt-out suppression, and the per-second rate limiter.
