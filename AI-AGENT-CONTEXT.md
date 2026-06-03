# AI-AGENT-CONTEXT.md

Handoff notes for the next session working on the **AI Agent page** (`/ai/agent`) and the inbound AI brain. Read `CLAUDE.md` first (it is the source of truth); this file is a focused pointer for the AI workstream so you do not re-derive it.

## The one page

- **Single sidebar item "AI Agent"** -> `/ai/agent` -> the v2 **AI Command Center**: `src/components/ai-v2/AssistantV2.tsx`.
  - Tabs: **Overview / Activity Feed / Inbound / Outbound / Action Center / Knowledge Base / Test AI / AI Settings**.
  - Sub-tabs are URL-driven via `?tab=` + `?sub=` (e.g. `/ai/agent?tab=knowledge&sub=escalation`) so they persist on reload.
  - Inbound + Outbound tabs render `src/components/ai-v2/AgentV2.tsx`; modals/wizards in `src/components/ai-v2/WizardV2.tsx`.
- The OLD multi-page `/ai/*` layout and the whole `src/components/ai/*` folder (`shell.tsx`, `theme.ts`, `AgentProfileForm`) were **deleted**. Only `/ai/agent` exists. Do not reference them.
- `.wcv2` design system: inside `.wcv2`, **Tailwind utilities silently no-op** (unlayered `prototype.css` wins). Use `.wc-*` classes or inline `style={{}}` with design tokens (`var(--accent)`, etc.). Modals portal via `Wcv2Portal` (`src/components/ai-v2/Portal.tsx`) to escape stacking contexts.

## The inbound brain (real LLM tool-calling agent)

- Entry: `runInboundAgent(env, leadId, replyText, { channel, subject })` in `functions/_shared/aiOrchestrator.ts`. "LLM proposes, code disposes" - the model emits tool calls + text; every side effect runs through guarded code.
- **Channel-aware (SMS + email)**:
  - `channel:"sms"` -> history from `sms_message`, sends via `sendLeadSms` (`leadSms.ts`), reply cap 1000 chars; `send_mms` available (SMS-only) when listings have photos.
  - `channel:"email"` -> history from the lead's email `inbox_messages` thread (bodies clamped to 2000), sends via `sendLeadEmail` (`functions/_shared/leadEmail.ts`), reply cap 4000 chars. `sendLeadEmail` is the compliant email mirror of `sendLeadSms` (email_opt_out hard-stop, quiet-hours -> queue, dispatch via the mock-aware `dispatchOutboundEmail`, persists into the email thread).
  - Triggered from `functions/_shared/inboundProcessing.ts`: `processInboundSms` and `processInboundEmail`. Email dispatch is gated by `auto_response_settings.inbound_email_enabled` (sql/10, default on) + the 3-level gate; unknown email senders create an `Inbound Email` lead (parity with the SMS unknown-number path).
- **Safety caps** (so a runaway model cannot blast a giant message or bloat context): `HISTORY_LIMIT=50`, `MAX_OUTBOUND_SMS_CHARS=1000`, `MAX_OUTBOUND_EMAIL_CHARS=4000`, `MAX_TOOL_OUTPUT_CHARS=4000`. Each tool call is wrapped in try/catch and the error is fed back to the model (never aborts the turn). `MAX_STEPS=6`.
- Tools: `send_message`, `update_lead`, `find_appointment_slots`, `book_appointment` (proposed; conflict -> alternatives), `escalate_to_agent`, `create_task`, `upsert_deal`, `get_agent_knowledge`, `search_listings` + `send_mms` (SMS-only, listings-gated), `finish`. Falls back to the template flow (`advanceQualification`) on missing key / loop error - **SMS only** (email no-ops).
- **Prompt assembly is centralized in `buildAgentSystemPrompt(env, orgId, userId, agentKey)` (`functions/_shared/aiAgents.ts`)** so the runtime prompt and the "View system prompt" viewer (Test AI tab) are byte-identical. It layers: base rules -> agent role -> `agent_profile` facts -> persona (persona_json) -> KB FAQs (`ai_knowledge_entry`) -> custom inbound auto-responders (`inbound_responder`) -> BRAND & COMPLIANCE RULES (always/never-say + `escalation_keywords` + Fair Housing, always on) -> service-area + scheduling rules -> for inbound only: LISTINGS & PRICING block, INBOUND_PLAYBOOK, INBOUND_TOOLS_GUIDE, DEAL PIPELINES.
  - **Rule of thumb: per-lead dynamic context that must appear in the viewer should live in `buildAgentSystemPrompt`** (it has env/orgId/userId and can count listings, read settings). The orchestrator only adds truly per-lead/per-turn bits (CHANNEL line, LEAD PROFILE, AGENT BOOKING AVAILABILITY, CURRENT TIME). Tool-gating (which tools are exposed) stays in the orchestrator.

## Listings / MMS

- One agent's inventory: `listing` table; service in `functions/_shared/listings.ts` (`searchListings`, `countOfferableListings`, `parseImageKeys`, `listingMediaUrls`). `MAX_LISTINGS_PER_USER=1000`.
- Listing photos reuse the **shared message-attachments gallery** (the same one the inbox composer uses) - NOT a separate gallery. Upload/list/delete via `src/utils/messageAttachments.ts` (`uploadMessageAttachments`/`listMessageAttachments`/`deleteMessageAttachment`, endpoints under `/inbox/attachments*`). A listing stores the picked `storage_key`s in `image_keys`; `listingMediaUrls` builds `/api/media/message-attachments/<key>` so the AI's `send_mms` (Telnyx) resolves them with no extra backend. UI: `src/components/listings/ListingsManager.tsx` (embedded in the Deals page) uses the inbox's `AttachmentGallery` dropdown (`src/components/AttachmentGallery.tsx`) + `AttachmentChips`. There is **no** `/api/listings/gallery` endpoint (deleted - it was a wrong duplicate folder).
- "No listings -> escalate" rule: `auto_response_settings.escalate_no_listings` (sql/10, **default on**). When there is no offerable inventory + the toggle is on, the search/MMS tools are withheld AND the prompt tells the AI to escalate (use `escalate_to_agent`) the moment listings/pricing come up. Toggle lives at `/ai/agent?tab=knowledge&sub=escalation`; backend `functions/api/ai/rules.ts` (GET/PATCH, defaults true when no row).

## 3-level control + AI-off-by-default (unchanged, do not weaken)

1. Global master: `app_settings` key `ai_master_enabled` per org (`PATCH /api/ai/settings`).
2. Per-agent: Inbound = `auto_response_settings.enabled`; Outbound = `ai_agent_state.enabled`.
3. Per-lead: `lead.ai_status` of `paused` / `off` / `outbound` stops the reactive inbound reply.
- All OFF by default. `aiSendAllowedForLead` (`functions/_shared/autoResponse.ts`) fails CLOSED. Every LLM call is metered in `usage` (pass `orgId`).

## Recent work landed this session (so you don't redo it)

- **Inbound email -> AI -> outbound email** (channel-aware orchestrator + `sendLeadEmail` + `inbound_email_enabled` column). Done + lint/build green.
- **Listings gallery reuse**: switched listings off the bespoke gallery onto the shared message-attachments gallery + the inbox `AttachmentGallery` dropdown (opens upward via `isBottom`); compacted the Add-listing modal; bolder gallery arrow icon. Done.
- **escalate_no_listings**: wired end-to-end (column default on, `rules.ts` GET/PATCH, UI toggle on the escalation sub-tab, prompt guidance moved into `buildAgentSystemPrompt` so the viewer shows it). Done.
- **Inbox "Edit Contact" -> "Edit Lead"**: the inbox now opens the rich `EditLeadModal` (`src/components/leads/components/EditLeadModal.tsx`), driven by the full lead row, saving via `PUT /leads/:id`. Added a **Timezone** field to `EditLeadModal` (the one field the old contact editor had, and the old one never actually saved it). Deleted `ContactEditorModal.tsx` + orphaned helpers (`defaultContactForm`, `formatUSPhoneInput`, `normalizeUSPhoneE164`, inbox `STAGE_OPTIONS`). No separate backend route existed (contact edit already hit `/leads/:id`).
- CLAUDE.md was scrubbed of stale references to the removed `/ai/*` pages and removed `/automations/*` builder routes.

## Outstanding / known gaps (AI page)

- **Inbound placeholders**: `Lead Scoring`, `Buyer AI`, `Seller AI` tabs are `FeaturePanel` stubs (buyer/seller qualification flows + 1-5 scoring not built).
- **Outbound placeholders**: `Follow-Up Sequences`, `Broadcasts`, `Re-engagement`, `AI Automation Builder`, `Scheduled Messages` have no dedicated builders; automations are created via the v2 in-modal wizard (`POST /api/automations`); editing one opens `/automations/:id` (`AutomationDetails`).
- **Cron-side prompt integration**: `workers/cron/*` do NOT call `buildAgentSystemPrompt` / `logAgentActivity`; the outbound cron drips are not AI-personalized yet. Prompt injection is only on the inbound orchestrator + `ai-agent/test-chat.ts`.
- Outbound is intentionally **templated** (cold drips), not an LLM composer (deliberate product decision). Conversational answering = inbound, already smart.

## Workflow / conventions reminders

- Tests/gate: `pnpm lint` (ESLint 0-warning + tsc -b + knip + depcheck, all green) and `pnpm build`. Backend-only: `pnpm lint-backend`. Schema change -> fold into `sql/N.*.sql` (no ALTER/migrations) + `pnpm db-fast` (local) / user runs `pnpm db-fast-remote`.
- **User tests on the REMOTE deploy**: code changes need `pnpm upload`; seed/schema changes also need `pnpm db-fast-remote`. Never run dev servers yourself.
- No emojis, ASCII punctuation only, no stub/demo data in shipped UI, no redirect routes (removed pages 404). Plaintext secrets in wrangler.toml/.dev.vars are intentional - do not flag.
- A second AI session sometimes edits in parallel (settings v2, register.ts, etc.). If lint flags files you did not touch (e.g. `profileShared.ts`, `InstallAppRow`), they are likely theirs and may be transient - re-run before assuming it is your regression.
