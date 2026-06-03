# WarmChats Compliance Reference

Living document covering the regulatory controls in this codebase: what's
implemented, where each control lives, what's still pending, and how to
operate the runtime tools (admin pages, opt-out flow). Pair this with a
qualified attorney for jurisdiction-specific language and state-by-state
rules; this is an engineering reference, not legal advice.

Last updated: 2026-05-28.

---

## 1. Regulatory landscape (what applies and why)

| Law / Spec | Why it applies to WarmChats | Where we touch it |
|---|---|---|
| **TCPA** (Telephone Consumer Protection Act) | Outbound SMS + voice to consumers requires prior express written consent; quiet hours 8am-9pm recipient local time. | SMS consent capture, suppression, quiet hours, AI follow-up dispatch. |
| **CTIA** Short Code & 10DLC messaging guidelines | Carriers enforce STOP/HELP keyword response, opt-out persistence, sender identification. | `inboundProcessing.ts`, `appendStopFooter`, all templated SMS. |
| **CAN-SPAM Act** (15 U.S.C. § 7701 et seq.) | Marketing emails require functional unsubscribe + valid physical postal address of the sender; opt-out honored within 10 business days. | Email unsubscribe endpoint, agent business-address field, CAN-SPAM footer. |
| **CCPA / CPRA** (California) | Right to know, delete, opt-out of sale, non-discrimination for residents of California. | Privacy policy disclosures, `DELETE /api/auth/account`, "we do not sell" statement. |
| **GDPR** (EU residents) | Lawful basis for processing, right to erasure, data portability, consent for non-essential cookies. | Account deletion, privacy policy. **Gaps below.** |
| **Fair Housing Act** | Real estate communications must not steer or discriminate by race, color, religion, sex, familial status, national origin, disability. | Lead schema has no protected-class fields. AI prompts not yet guardrailed (see gaps). |
| **State recording-consent laws** (CA, FL, MD, IL, etc.) | Two-party consent for call recording in 12 states. | Recording capability exists; consent disclosure NOT yet implemented. |
| **State AI-disclosure laws** (CA, MA, etc.) | Bot must disclose when it is not a human in messaging/voice. | NOT yet implemented; pending. |

---

## 2. Implemented controls (with code references)

### 2.1 SMS - TCPA / CTIA

| Control | File | Notes |
|---|---|---|
| **SMS consent capture** at opt-in form | [`functions/api/sms/consent.ts`](functions/api/sms/consent.ts) | Persists phone, source, IP, user-agent, consent text version, page URL into `sms_contact`. |
| **Consent proof retrieval** | [`functions/api/sms/consent-proof.ts`](functions/api/sms/consent-proof.ts) | `GET` returns the stored consent record for audit. |
| **STOP / UNSUBSCRIBE / CANCEL / END / QUIT / OPT-OUT keyword** | [`functions/_shared/inboundProcessing.ts`](functions/_shared/inboundProcessing.ts) `isStop` branch | Suppresses via `suppressPhone`, cancels scheduled, sends opt-out confirmation. |
| **HELP / INFO keyword** | [`functions/_shared/inboundProcessing.ts`](functions/_shared/inboundProcessing.ts) `isHelp` branch | Replies with sender ID + support email + "Reply STOP to opt out". Does NOT change opt-in state. |
| **START / UNSTOP re-opt-in** | [`functions/_shared/inboundProcessing.ts`](functions/_shared/inboundProcessing.ts) `isStart` branch | Lifts suppression, sends confirmation, falls through to AI follow-up. |
| **Central suppression gate** | [`functions/_shared/suppression.ts`](functions/_shared/suppression.ts) | Single source of truth. Every send path calls `isPhoneSuppressed(org, phone)` before dispatch. |
| **Enforced in every SMS send path** | `functions/api/inbox/send.ts`, `functions/api/messages/send.ts`, `functions/_shared/autoResponse.ts` (`queueScheduledMessage`), `functions/_shared/qualificationFlow.ts`, `workers/cron/jobs/sequenceDispatch.ts`, `functions/api/webhooks/calling/telnyx/status.ts` (missed-call) | A STOP recorded anywhere blocks every send everywhere. |
| **CTIA opt-out footer** on all templated SMS | [`functions/_shared/smsCompliance.ts`](functions/_shared/smsCompliance.ts) `appendStopFooter` | Idempotent; applied to auto-response, appointment-confirmation, campaign, sequence, missed-call, qualification messages. |
| **Quiet hours 8am-9pm recipient local time** | [`workers/cron/_shared/quietHours.ts`](workers/cron/_shared/quietHours.ts), [`functions/_shared/quietHours.ts`](functions/_shared/quietHours.ts) | Per-recipient timezone preferred, falls back to org timezone. Enforced in campaigns, scheduled messages, sequences, manual send. |
| **10DLC registration** | [`functions/api/telnyx/provision/brand.ts`](functions/api/telnyx/provision/brand.ts), [`campaign.ts`](functions/api/telnyx/provision/campaign.ts), [`assign-campaign.ts`](functions/api/telnyx/provision/assign-campaign.ts) | Single Warmchats LLC master brand + campaign. All agent numbers assigned to it. |
| **Provider rate limiting** | [`workers/cron/_shared/sendRateLimiter.ts`](workers/cron/_shared/sendRateLimiter.ts) | Per-number per-second caps (49 SMS/sec, 14 MMS/sec). |
| **Admin Blocked Numbers manager** | [`/admin/blocked`](src/components/admin/BlockedPhoneNumbers.tsx), [`functions/api/admin/blocked-numbers/index.ts`](functions/api/admin/blocked-numbers/index.ts) | Site-admin view of every opt-out across every account; manual block / unblock + counts. |
| **Agent read-only Blocked Numbers view** | [`/account/blocked`](src/components/BlockedNumbersView.tsx), [`functions/api/blocked-numbers/index.ts`](functions/api/blocked-numbers/index.ts) | Per-agent visibility, no unblock action (admin only). Linked in the Settings sidebar. |

### 2.2 Email - CAN-SPAM

| Control | File | Notes |
|---|---|---|
| **Per-lead `email_opt_out` flag** | [`sql/2.create-leads.sql`](sql/2.create-leads.sql) | Hard-blocks sending in cron paths. |
| **CAN-SPAM footer** with agent's physical address + signed unsubscribe link | [`functions/_shared/emailCompliance.ts`](functions/_shared/emailCompliance.ts), [`workers/cron/_shared/emailCompliance.ts`](workers/cron/_shared/emailCompliance.ts) | Applied to campaign + sequence emails (the marketing paths). Idempotent. |
| **Agent business mailing address** | `user.business_address` ([`sql/1.create-core.sql`](sql/1.create-core.sql)), set in `/settings` (Workspace Settings), also collected in Step 3 of [`Onboarding.tsx`](src/components/Onboarding.tsx) | Marketing email sends are refused if blank. Real-format validation ([`functions/_shared/addressValidator.ts`](functions/_shared/addressValidator.ts) + mirror in [`src/utils/addressValidator.ts`](src/utils/addressValidator.ts)) - must contain street number + city + US state + 5-digit ZIP. Placeholder text ("asdf", "blah blah") is rejected on both client and server. |
| **Missing-address UX nudges** | [`src/components/MissingBusinessAddressBanner.tsx`](src/components/MissingBusinessAddressBanner.tsx) | Auto-fetches `/profile/me`; renders an amber banner with an "Add address" deep-link (`/settings?tab=workspace#business-address`) on the dashboard ([`DashboardV2.tsx`](src/components/DashboardV2.tsx)), the automations page ([`automations.tsx`](src/components/automations/automations.tsx)), the new-campaign composer ([`NewCampaign.tsx`](src/components/NewCampaign.tsx)), AND inside the Settings Workspace tab itself (inline warning above the input). Clicking the link scrolls the input into view and applies a 2.8s ring-glow so the target field is obvious. |
| **One-click HTTP unsubscribe** | [`functions/api/email/unsubscribe.ts`](functions/api/email/unsubscribe.ts) | HMAC-SHA256 signed per-lead token, no auth needed. GET + POST both honored (RFC 8058). Renders a friendly confirmation page. |
| **RFC 8058 List-Unsubscribe headers** | [`workers/cron/jobs/scheduledMessages.ts`](workers/cron/jobs/scheduledMessages.ts), [`workers/cron/jobs/sequenceDispatch.ts`](workers/cron/jobs/sequenceDispatch.ts) | `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` set so Gmail/Yahoo show a native unsubscribe button. |
| **Honored in every marketing email path** | Campaign cron, sequence cron | A lead with `email_opt_out=1` triggers immediate `cancelled` / `skipped` on the row. |

### 2.3 Privacy / Terms

| Control | File | Notes |
|---|---|---|
| **App Privacy Policy** | [`src/pages/PrivacyPolicy.tsx`](src/pages/PrivacyPolicy.tsx), public route `/privacy` | 12-section policy. Last updated dated. Linked in main Footer. |
| **App Terms of Service** | [`src/pages/TermsOfService.tsx`](src/pages/TermsOfService.tsx), public route `/terms` | 16-section ToS. California governing law. Linked in main Footer. |
| **Per-agent Privacy page** (for leads receiving messages) | [`src/pages/AgentPublicPage.tsx`](src/pages/AgentPublicPage.tsx), routes `/agents/:slug/privacy` and `/agent/:slug/privacy` | Each agent gets their own dynamic privacy disclosure. |
| **Per-agent Terms page** | [`src/pages/AgentTermsPage.tsx`](src/pages/AgentTermsPage.tsx), routes `/agents/:slug/terms` and `/agent/:slug/terms` | Each agent gets their own dynamic terms disclosure for the SMS program they run. |
| **Lead-facing opt-in form** | [`src/pages/OptInForm.tsx`](src/pages/OptInForm.tsx), route `/opt-in` | Captures SMS consent with the disclosures TCPA expects. |

### 2.4 Data protection / access control

| Control | File | Notes |
|---|---|---|
| **Password storage** | [`functions/_shared/password.ts`](functions/_shared/password.ts) | PBKDF2-SHA256, per-user salt, constant-time compare. Iterations capped at 12k to stay under the Workers Free 10ms CPU cap. |
| **Session management** | [`functions/_shared/auth.ts`](functions/_shared/auth.ts), [`cookies.ts`](functions/_shared/cookies.ts), table `auth_session` | HttpOnly + Secure cookies, refresh-token JTI, revocation column. |
| **AES-256-GCM encryption at rest** for OAuth refresh tokens / IMAP passwords | [`functions/_shared/crypto.ts`](functions/_shared/crypto.ts), `inbox_connection.refresh_token_encrypted` / `.encrypted_password` | Key derived (SHA-256) from `FERNET_KEY` for Fernet-compatible token encryption. |
| **Multi-tenant isolation** | [`functions/_shared/orgAccess.ts`](functions/_shared/orgAccess.ts) | `isOrgMember(user, org)` gate; every per-org endpoint scopes queries by `org_id`. |
| **Right to erasure** (GDPR / CCPA) | [`functions/api/auth/account.ts`](functions/api/auth/account.ts), UI button in `/settings` (Workspace Settings danger zone) | `DELETE /api/auth/account` revokes sessions + deletes user. **Caveat:** some lead/call data is orphaned rather than cascaded - pending tightening. |
| **Geo allow-list** (cost / abuse defense) | [`functions/_middleware.ts`](functions/_middleware.ts) | 403s requests from 60+ non-target countries before any auth work runs. |

### 2.5 Audit trail

| Control | File | Notes |
|---|---|---|
| **SMS message log** | `sms_message` table ([`sql/4.create-sms.sql`](sql/4.create-sms.sql)) | direction, body, sent_at, status, provider_message_sid. |
| **Email message log** | `inbox_messages` table ([`sql/3.create-inbox.sql`](sql/3.create-inbox.sql)) | direction, subject, body, delivery_status, sent_at, opened_at. |
| **Call event log** | `call_events` table ([`sql/11.create-calling.sql`](sql/11.create-calling.sql)) | CALL_INITIATED, AGENT_ANSWERED, CALL_COMPLETED, MISSED_CALL_SMS_SENT, etc. |
| **Webhook deduplication** | `webhook_logs` table | INSERT OR IGNORE on `provider_event_id`. |
| **Mock send log** (dev/debug) | `mock_send_log` table, [`/admin/debug`](src/components/admin/DebugSendLogs.tsx) | Every mocked SMS/email visible to site admins. Clearable. |

---

## 3. Outstanding items

### 3.1 Known accepted risks (intentionally not fixed yet)

These were flagged but explicitly deferred. They should be revisited before scaling beyond the current customer set.

- **Secrets committed to `wrangler.toml` files.** All three (`wrangler.toml`, `gateway-worker/wrangler.toml`, `workers/cron/wrangler.toml`) contain real-looking API keys (OpenAI, Telnyx, ElasticEmail, Stripe, Gmail OAuth, Turnstile) and `JWT_SECRET` / `FERNET_KEY` values. They are tracked in git and not in `.gitignore`. Even though the repo is private today, git history is permanent, every collaborator inherits production credentials, and a single privacy toggle exposes everything. Rotate via `wrangler pages secret put` / `wrangler secret put` when ready.

### 3.2 Next batch (now shipped - documented here for git-archaeology)

Every item in this section was implemented in the same release as Section 2's controls. They are listed here so the rationale stays discoverable.

| Shipped | Regulation | Where it lives |
|---|---|---|
| **Smart STOP-footer + AI-disclosure helper** (`appendComplianceFooter` with `first_auto` / `campaign` / `sequence_first` / `followup_in_thread` / `transactional` kinds) | TCPA / CTIA / state bot-disclosure | [`functions/_shared/smsCompliance.ts`](../../functions/_shared/smsCompliance.ts) + matching mirror at [`workers/cron/_shared/smsCompliance.ts`](../../workers/cron/_shared/smsCompliance.ts). Caller picks kind; helper handles idempotency. Wired across `instantReply`, `leadSms`, `automationEnroll`, `appointmentConfirmations`, `automations/send`, `webhooks/calling/.../status` (missed-call), `workers/cron/jobs/sequenceDispatch`. Day-1 / day-3 / qualification steps 2+ / sequence steps 2+ / appointment confirmations now SKIP the footer (mature programs don't put STOP on every message). |
| **Signup terms consent** with timestamp + version stored | Contract formation; TCPA defense | Checkbox in [`src/components/SignUp.tsx`](../../src/components/SignUp.tsx) (Submit disabled until checked). Server enforces in [`functions/api/auth/register.ts`](../../functions/api/auth/register.ts) with `code: "TERMS_NOT_ACCEPTED"`. New `user.terms_accepted_at` + `user.terms_version` columns ([`sql/1.create-core.sql`](../../sql/1.create-core.sql)). `CURRENT_TERMS_VERSION` constant in `register.ts` lets you force re-acceptance after a legal-text bump. |
| **Per-row SMS consent CSV mapping** + attestation gate | TCPA prior-consent evidence | New `sms_consent` mapping field in [`ImportLeadsModal.tsx`](../../src/components/leads/components/ImportLeadsModal.tsx). Backend `parseConsentCell` in [`functions/api/leads/import/[orgId].ts`](../../functions/api/leads/import/%5BorgId%5D.ts) reads the mapped column per row. Global default is **`"opted_in"`** ([`useLeadImport.ts`](../../src/components/leads/hooks/useLeadImport.ts)) - we briefly defaulted to `"unknown"` for a belt-and-suspenders posture, then flipped back because (a) the legal risk attaches to the *existence* of consent, not to a radio's preselected state, and (b) most import sources are agents' existing client lists where written consent does exist; forcing them to flip a radio every time was friction without legal benefit. The defense lives in the **attestation banner** ("I confirm I have prior express written consent (TCPA 47 USC 227)..."), which gates the Continue button whenever any row would import as `opted_in` (global default OR per-row column resolves to opt-in) and is captured server-side per import. Opt-out rows flow through `suppressPhone(reason: 'manual_import')`. Same default applies to manual Add Lead in both the Leads page ([`Leads.tsx`](../../src/components/leads/Leads.tsx)) and the inbox Add Lead path ([`Inbox.tsx`](../../src/components/inbox/Inbox.tsx) via `openAddLead`) - the per-action attestation checkbox in [`AddLeadModal.tsx`](../../src/components/leads/components/AddLeadModal.tsx) (`needsAttestation = leadSmsConsent === "opted_in"`) carries the same legal weight. Edit-mode populate fallback stays `"unknown"` (reflects what's actually stored on the row; we don't retroactively claim consent we don't have evidence of). |
| **Fair Housing + AI-disclosure rules** in `LEAD_ASSISTANT_SYSTEM_BASE` | Fair Housing Act + state bot-disclosure | [`functions/_shared/openai.ts`](../../functions/_shared/openai.ts) - explicit `FAIR HOUSING RULES` block covering steering, neighborhood/school proxies, "good for families / great for singles" / coded language, audience filtering, religious imagery. Propagates to `buildAgentSystemPrompt` in [`aiAgents.ts`](../../functions/_shared/aiAgents.ts) automatically since it layers the base. AI must refuse + offer a feature-focused alternative. Includes the "do not impersonate a human" rule. |
| **Cookie consent banner** gating Mixpanel session replay | GDPR / ePrivacy | [`src/components/CookieConsentBanner.tsx`](../../src/components/CookieConsentBanner.tsx) mounted from `App.tsx`. `localStorage["cookie_consent"]` = `accepted`/`rejected`/`(unset)`. `initMixpanel()` in [`src/lib/mixpanel.ts`](../../src/lib/mixpanel.ts) now bails until consent is granted; `setAnalyticsConsent("accepted")` initializes Mixpanel on the fly. Essential HttpOnly auth cookies are NOT gated (the banner copy explains the distinction). |
| **Call recording two-party consent disclosure** | 12 two-party-consent states (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA, CT, OR) | New `announceAndStartRecording()` helper in [`functions/api/webhooks/calling/telnyx/status.ts`](../../functions/api/webhooks/calling/telnyx/status.ts) speaks `"Please note: this call may be recorded for quality and training purposes."` on the anchor leg before recording. Routed through `maybeStartRecording` so every recorded inbound + agent-first PSTN call carries the disclosure. Voicemail-recording paths are exempt (the agent's voicemail greeting acts as notice + the caller voluntarily speaks into a recording device). |
| **Compliance settings tab** + opt-out badges + Block Contact action | Operational visibility / TCPA | New `/settings?tab=compliance` ([`CompliancePage.tsx`](../../src/components/settings/CompliancePage.tsx) + `GET /api/compliance/summary` at [`functions/api/compliance/summary.ts`](../../functions/api/compliance/summary.ts)) shows SMS opt-outs, email unsubscribes and manual blocks in one place. The agent-facing `/account/blocked` page was removed (folded in here). Inbox + leads table now render "SMS opted out" / "Email opted out" pills via [`AiContactBadges`](../../src/components/inbox/components/AiInboxExtras.tsx) (extended) and a new badge pair in the leads table. Inbox right-panel kebab gained a "Block contact" action (calls new `POST /api/blocked-numbers/by-lead/[leadId].ts`, `reason: 'manual_agent'`). Unblock is intentionally NOT exposed to agents - only admins can lift via `/admin/blocked`. |

### 3.3 Backlog

| Gap | Regulation | Notes |
|---|---|---|
| **Per-recipient frequency cap** | TCPA defensibility | E.g. max 3 SMS / 24h per contact across all campaigns. Schema-level cap counter. |
| **DNC (Do-Not-Call) suppression list** | Federal/state DNC | Beyond post-STOP handling. Optional integration with FTC DNC registry for cold outreach lists. |
| **Security headers** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) | Defense in depth | Add to `functions/_middleware.ts` response chain. |
| **GDPR data export endpoint** | GDPR Article 20 (portability) | `GET /api/auth/account/export` returning JSON of user-owned data. |
| **CCPA "Do Not Sell" link + DSAR form** | CCPA / CPRA | Statement already exists in privacy policy; add a dedicated link in the footer + a request form (we don't sell, so it's mostly disclosure). |
| **Cascade delete on account deletion** | True GDPR right-to-erasure | Tighten `DELETE /api/auth/account` to cascade to leads, calls, messages owned by the user. |
| **Documented data retention schedule + auto-purge** | GDPR / CCPA storage limitation | E.g. delete inbound messages > 36 months unless flagged. |
| **`ai_generated` flag on outbound message rows** | Audit defensibility | Distinguish AI-drafted vs agent-typed in `sms_message` / `inbox_messages`. |

---

## 4. How the runtime controls work

### 4.0 Keyword-matching rule (applies to STOP / HELP / START)

The keyword check is **strict whole-message equality**, not fuzzy / substring. The body is trimmed, trailing punctuation (`!.,?;:`) is stripped, and the result is lowercased and compared to a fixed allowlist:

- **STOP family:** `stop`, `stopall`, `stop all`, `unsubscribe`, `cancel`, `end`, `quit`, `optout`, `opt out`, `opt-out`
- **HELP family:** `help`, `info`
- **START family:** `start`, `unstop`, `optin`, `opt in`, `opt-in` (NOT `yes` - too easy to confuse with a conversational reply)

So `"STOP"`, `"Stop."`, `"unsubscribe"` opt out. But `"Stop calling me"`, `"yes please"`, `"end of story"`, `"start over"`, `"HELP me find a 3-br"` are all treated as normal conversational replies and flow through the AI follow-up dispatcher unchanged. This matches Twilio/Telnyx provider behavior and the CTIA Short Code Handbook.

If you ever loosen this regex, you're trading false-positive opt-outs against compliance - don't do it without legal sign-off.

### 4.1 When a recipient texts STOP

1. Inbound webhook hits [`functions/api/webhooks/telnyx/inbound.ts`](functions/api/webhooks/telnyx/inbound.ts) -> calls `processInboundSms`.
2. Message is persisted in `sms_message` (inbound).
3. Whole-message keyword check (see 4.0) matches STOP family -> `suppressPhone(env, org, phone, { reason: 'keyword' })` runs:
   - Upserts `sms_contact.opted_out = 1` + `opted_out_at` + `opt_out_reason = 'keyword'`.
   - Updates `lead.sms_opt_out = 1` + `sms_consent_status = 'opted_out'` + `last_opt_out_at`.
   - Cancels every `scheduled_message` row whose `to_address` matches that phone.
4. A confirmation SMS is sent via `telnyxSendSms` directly (bypassing the suppression gate - this is the one outbound the carrier permits).
5. Function returns early. The AI follow-up dispatch block is intentionally skipped.

From this moment, every send path (manual, campaign, sequence, qualification, missed-call) returns `403 SMS_OPTED_OUT` for that (org, phone) pair until a START re-subscribes them or an admin lifts the block on `/admin/blocked`.

### 4.2 When a recipient texts HELP

1. Inbound persisted as above.
2. HELP regex matches -> reply with `"{sender} via WarmChats: For help, email support@warmchats.com. Msg & data rates may apply. Reply STOP to opt out."`.
3. Function returns early. Opt-in state is unchanged, scheduled follow-ups are unchanged, qualification step is unchanged.
4. The next non-HELP message from the lead flows through normal AI follow-up logic.

### 4.3 When a recipient texts START / UNSTOP / OPT IN

1. `unsuppressPhone(env, org, phone)` runs - flips both `sms_contact.opted_out` and `lead.sms_opt_out` back to 0.
2. Confirmation SMS sent.
3. Falls through to the AI follow-up block. If the lead had been mid-qualification, they resume.

### 4.4 When an email recipient clicks "Unsubscribe"

1. Link in the footer is `{PUBLIC_BASE_URL}/api/email/unsubscribe?l={lead_id}&t={hmac_token}`.
2. Endpoint verifies the HMAC against `EMAIL_UNSUB_SIGNING_KEY` - any tampering fails verification and returns a friendly error page.
3. If valid, sets `lead.email_opt_out = 1` + `last_email_opt_out_at`.
4. From that moment, the marketing cron paths (`scheduledMessages.ts`, `sequenceDispatch.ts`) skip the row with status `cancelled` / `skipped` and `error_message = 'lead opted out of email'`. Transactional sends (appointment confirmations, inbox replies) are NOT affected - that's by design under CAN-SPAM.

### 4.5 When an admin manually blocks a number

`POST /api/admin/blocked-numbers { org_id, phone }` -> `suppressPhone(..., { reason: 'manual_admin', blockedByUserId })`. Same effect as a STOP, but tagged so the admin page shows "Manual admin block" instead of "STOP keyword" in the Reason column.

---

## 5. Operating runbook

### 5.1 Onboarding a new agent

Onboarding is now **three steps** (see [`Onboarding.tsx`](src/components/Onboarding.tsx)):

1. Choose a follow-up preset.
2. Connect channels (email + optionally SMS).
3. **Business mailing address** - required, validated against [`validateBusinessAddress`](src/utils/addressValidator.ts) before the "Finish setup" button enables. The same validator re-runs server-side in `PUT /api/profile/me` so a tampered client can't slip placeholder text through.

If an agent somehow lands on the dashboard without a business address set (older account, partial-onboarding state), [`MissingBusinessAddressBanner`](src/components/MissingBusinessAddressBanner.tsx) surfaces on the dashboard, automations page, new-campaign composer, and inside the Settings Workspace tab itself. Clicking "Add address" deep-links to `/settings?tab=workspace#business-address` - the page scrolls the input into view and applies a ring-glow.

Marketing email sends are refused (`failed`/`Sender business address required`) until the address is set and passes validation. Transactional emails (appointment confirmations, conversational replies) work without it.

Before they can send marketing SMS:
- Their Telnyx number must be assigned to the master campaign (handled by the provisioning flow).
- The org's plan must permit SMS (`smsBlockReason` enforces this).
- They are bound by the shared Warmchats LLC 10DLC brand - they can not opt out of the master campaign.

### 5.2 Handling a "this lead unsubscribed by mistake" request

The agent does NOT have unblock privileges (intentional - see [`/account/blocked`](src/components/BlockedNumbersView.tsx) is read-only). They must:
1. Contact support with the phone number + brief justification.
2. Support / site admin verifies, then either:
   - Asks the lead to text **START** to re-opt-in (preferred - fresh consent), OR
   - Unblocks manually via [`/admin/blocked`](src/components/admin/BlockedPhoneNumbers.tsx).

Both options write to the same `sms_contact` row and lift the suppression in both tables.

### 5.3 Pulling consent proof for a dispute

`GET /api/sms/consent-proof?phone=+15551234567&org_id=N` returns the stored consent record (timestamp, IP, user-agent, consent text version, page URL) from [`functions/api/sms/consent-proof.ts`](functions/api/sms/consent-proof.ts). Pair with the inbound/outbound history in `sms_message` for a full audit trail.

### 5.4 Clearing the debug log

[`/admin/debug`](src/components/admin/DebugSendLogs.tsx) -> "Clear logs" button (channel-aware). Backed by `DELETE /api/admin/mock-logs?channel=sms|email|mms`.

---

## 6. Open questions for legal review

These are policy / language calls, not code. Surface to counsel before launch in any new jurisdiction:

- Does the master 10DLC campaign description accurately reflect how all agent sub-tenants use it? (Telnyx requires the registered use-case to match actual messaging content.)
- Are the per-agent Privacy / Terms pages legally sufficient if the agent operates as a separate LLC, or do we need explicit attribution that WarmChats is the platform-of-record?
- Two-party-consent recording: is a one-time UI checkbox on the call-start dialog sufficient, or does each call need an audio disclosure to the caller? (CA, IL, MD generally require notice during the call.)
- Cookie consent: with Mixpanel session-replay at 100% sample + text masking, does that mitigate enough to defer a banner until EU traffic is non-trivial?
- AI-disclosure laws are evolving rapidly state-by-state - do we add a single "Automated message via WarmChats" disclosure to all auto-response first messages now, or wait?
