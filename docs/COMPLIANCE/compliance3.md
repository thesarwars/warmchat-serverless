Clean. (The earlier ESLint failure was a transient - a stale .wrangler/tmp deploy artifact being scanned mid-deletion, unrelated to my edits.)

Here's what shipped in this round:

Banner UX - scroll + highlight
The dashboard / automations / new-campaign banner now deep-links to /settings?tab=workspace#business-address. On that page, the Settings Workspace tab detects the hash, scrolls the input into view (scrollIntoView({ behavior: "smooth", block: "center" })), focuses it, and applies a ring glow. Clicking the in-page banner's "Add address" button does the same thing - no page reload needed.

Account Usage page warnings (multi-layered)
Top-of-page banner when address is missing (with its own "Add address" button that re-triggers the scroll-and-glow).
Inline missing warning directly above the input.
Live red-bordered field + error text as you type, with the specific reason ("must include a 5-digit US ZIP code", "must include a US state", etc.).
Save button refuses to submit if the validator returns a reason - focuses the field, toasts the reason.
Real validation (not "blah blah text")
functions/_shared/addressValidator.ts and src/utils/addressValidator.ts - identical logic on both sides. An address must contain:

Street-number pattern (\d+ \w...)
5-digit US ZIP (with optional +4)
US state code (2 letters) or full state name from the canonical list
At least one comma
Length ≥ 15 chars
Not all-same-letter junk
Server-side PUT /api/profile/me re-runs the validator and returns 400 INVALID_BUSINESS_ADDRESS if a tampered client submits placeholder text. Examples that get rejected: "blah blah text", "asdf", "123", "123 Main St" (missing ZIP/state), "aaaaaaaaaaa". Examples accepted: "123 Main St, Springfield, IL 62701", "45 Oak Avenue Suite 7, San Francisco, California 94102-1234".

Onboarding Step 3
Bumped onboarding to three steps (was 2). The new Step 3: Business mailing address uses the same validator, blocks the "Finish setup" button until valid, saves via PUT /api/profile/me, then completes onboarding. Pre-fills if the agent already saved an address elsewhere.

COMPLIANCE.md updates
New control row in §2.2 covering the multi-surface banner + validation behavior (file references for the validator pair and every banner placement).
New §4.0 documenting the strict whole-message keyword rule with the full allowlist + a warning not to loosen it without legal sign-off.
§4.3 corrected to remove "YES" from the START list (it was confusing and now intentionally not in the allowlist).
§5.1 rewritten to describe the 3-step onboarding flow and the missing-address rescue path for partial-onboarding accounts.
Want me to start the Next batch now (signup consent checkbox + Fair-Housing AI prompt guardrails + AI/automation disclosure + cookie banner + call-recording consent)?

d:\Projects\ServerlessWarmChats\CLAUDE.md
the client said that when importing leads they can mark if they already opted, we currently have this option, but is it legal like that, because that should skip that it sends them reply to stop right, he doesnt want every message sent to have replay to stop he says others dont do that and you just get it once, but he assumes that when someone submit a lead on his site and accept the terms he will be already opted in and there is no need to send them reply to stop, is he right? he says its teh agents responsibility to mark them as already opted in the leads import screen, currently set to on by default
This is a legitimate compliance nuance question and your client is partially right, partially wrong. Let me break it down clearly because it affects which way we should change the code.

On "Reply STOP" on every message - partially right
CTIA does NOT require STOP in every message. The Short Code Monitoring Handbook and the 10DLC Messaging Principles say opt-out instructions must be clear and conspicuous, not omnipresent. The canonical guidance (Twilio, Bandwidth, Telnyx all agree) is:

Required: opt-out instructions in the first message of a program/conversation.
Strongly recommended: include them in every standalone marketing/promotional broadcast (campaign blasts, periodic newsletters).
Recommended: periodic reminders in long-running sequences - typically monthly or every N messages.
Not expected: in mid-conversation conversational replies between two known parties.
What we have today is over-conservative - I added the footer to almost everything templated. That's safer than under-doing it, but it does look spammy to recipients and your client is right that mature programs don't do that.

What carrier STOP enforcement does regardless of footer:

T-Mobile/AT&T/Verizon enforce STOP at the network level for 10DLC traffic.
Telnyx auto-responds to STOP at the messaging-profile level.
Our own suppression gate hard-blocks any send to a suppressed number.
So a recipient can always opt out by texting STOP whether or not we remind them - removing the constant footer doesn't reduce their ability to opt out. It just stops nagging them.

Recommended change: include the footer only on:

Auto-response instant message (first message of a thread/program) - keep
Campaign SMS broadcasts (each campaign send is a fresh marketing touch) - keep
Sequence step 1 (first message of a sequence; not every step) - change
Re-engagement messages after long silence - keep
Missed-call auto-SMS - keep (it's automated marketing context)
Skip on:

Day-1 / Day-3 auto-response follow-ups (same thread, recipient just received the instant)
Mid-conversation qualification questions
Appointment confirmations (transactional, exempt)
That's defensible under CTIA and matches what Twilio's reference implementation does.

On "default to already opted in" at import - he's wrong about the default
This is the riskier part of his ask. Legally, the agent can mark a lead as already opted-in if they have actual proof of consent (a signed form, a TCPA-compliant web form, etc.). The platform isn't expected to verify it - the agent carries the liability (you can see this in your own ToS section on agent compliance).

But two things matter:

Default ON is dangerous. If an agent uploads a scraped or purchased list and the checkbox is pre-checked, they will send through your shared 10DLC brand without thinking about consent. That hurts WarmChats because:

The brand reputation belongs to Warmchats LLC under the master campaign.
Carrier complaints / spam reports go against your master campaign.
One bad agent's mass-send tanks deliverability for every other agent on the platform.
In a TCPA suit, "the platform's default was to assume consent" is a bad fact pattern even if liability is on the agent.
We should capture the attestation. When the agent does check the box, we should record:

When they marked the lead as opted-in (timestamp)
That the source is "agent attestation at import" (not first-party web form)
Optionally a free-text "Where did this consent come from?" field
That's what gets pulled in a dispute. Your sms_contact schema already has opt_in_source, opt_in_at, consent_text_version columns for exactly this - we just need to populate them when import marks a lead as opted-in.

Recommended change: default the checkbox to OFF. When checked, surface a one-line attestation ("By checking this, I confirm I have prior express written consent for each contact in this import - TCPA §227") and write opt_in_source = 'agent_attest_import' + timestamp to sms_contact for each lead. The agent can still bulk-mark; the friction is one click + one read.

What I'd propose to change
Footer logic: restrict to first-message-in-thread + campaigns + missed-call. Drop from day1/day3 auto-followups, qualification questions, appointment confirmations.
Import opt-in default: OFF, with an explicit attestation when checked, and proof-of-consent metadata persisted to sms_contact.
Backlog item: periodic-reminder logic - every Nth message in a long-running sequence re-include the footer. (Can add later; not urgent.)
COMPLIANCE.md updates documenting the rule and the agent's attestation flow.
If the client pushes back on #2 ("but the leads ARE consented, default ON is more convenient!"), the answer is: the consent claim is theirs to make, not ours to assume. Defaulting OFF doesn't stop them - it forces them to affirmatively claim consent each time, which is the exact legal posture they need to be in.

Want me to implement all three? Or do you want to push back on the client first on #2 before I change anything?