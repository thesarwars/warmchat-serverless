### Still genuinely missing / intentionally skipped
- `DELETE /api/admin2/delete_user/[id]` - admin helper, **intentionally skipped**
- `DELETE /api/automations/{draft|live}/[id]` and `POST /api/automations/[id]/stop` -
  the SPA references these but no backend handler exists yet;
  confirm whether the FE truly needs them before building

### Caveats carried over (see ROUTE_PARITY.md "Caveats / TODO")
- Campaign `create`/`send` still record DB rows only - dispatch through the new
  `elasticEmail.ts` / `telnyx.ts` clients is a follow-up
- Google `id_token` verified via Google's `tokeninfo` HTTP endpoint, not local JWKS
- Web-push uses the empty-payload variant

### Caveats / TODO

- **Phase-4 dispatch caveat lifted:** earlier campaign `create` and `send`
  endpoints recorded DB rows only; with the new `elasticEmail.ts` + `telnyx.ts`
  modules in place, the dispatcher logic can be wired through, but those campaign
  endpoints were NOT re-edited in this session - that's a follow-up.
- **Swagger UI** (`/docs`) intentionally skipped.
- **Role enforcement is now applied** (done 2026-05-21) to every endpoint whose
  role gate excludes a commonly-assigned role - the **Owner-only**
  and **Owner/Manager** boundaries - via `requireOrgRole` / `requireCallerOrgRole`:
  `orgs PUT` (Owner); `orgs/all`, `auth/users`, `orgs timezone PATCH`,
  `orgs deal-defaults PUT`, CRM connect/status/fetch-leads/disconnect,
  `domains POST`+`verify`, `campaigns duplicate-best`, AI `personas`/`tones` POST
  + their seed-defaults + `template-categories/:id` PUT/DELETE (all O/M).
  The remaining role gates are all-four-roles or `O/M/R`; since **Guest is never
  assigned**, those equal "any org member," which `isOrgMember` already enforces.
- **OpenAuth google `id_token` verification** uses Google's `tokeninfo` HTTP
  endpoint instead of validating the JWT locally. For high-volume signin, switch
  to local Google JWKS verification.
- **Web push** payload encryption is the "empty payload" variant; for rich
  notifications wire the aes128gcm content-encoding properly.


## 🟦 Frontend calls with no backend match

The frontend ships calls to endpoints with no backend implementation. These are either
planned future features or stale code that should be removed:

| FE path | Where in `src/` | Notes |
|---|---|---|
| `/api/calling/*`, `/api/admin/calling/*` | Calling feature |
| `/api/orgs/addorg` | `src/components/...` | Old URL, use `/api/orgs/` |
| `/api/profile/phone-number` | profile screen | No backend handler |

## Biggest gaps to close (by frontend usage)

These are the missing endpoints the frontend actively calls today - port these
first to avoid runtime 404s in the SPA:

1. **Auth user mgmt** - `PUT /auth/users/:id/role`, `PUT /auth/users/:id/org`, `POST /auth/invite`, `POST /auth/accept-invite`
2. **Auth recovery** - `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/resend-confirmation`, `GET /auth/confirm-email`
3. **Auth Google SSO** - `POST /auth/google-login`
4. **Orgs** - `PUT /orgs/:org_id`
5. **AI generate** - `POST /ai/generate`, `POST /ai/generate/reply`, `POST /ai/generate/improve`, `GET /ai/fetch/template-categories`
6. **CRM connect**
7. **Elastic email** - `business-email/send-otp`, `verify-otp`, `domain`, `domain/verify`, `domain/disconnect`
9. **Telnyx provisioning** - `activation`, `ids`, all `provision/*`, `activate-texting`
10. **SMS messages** - `POST /messages/send`
11. **Campaigns** - `messages_sent` sort (the only `?sort=` value not handled in serverless list)
