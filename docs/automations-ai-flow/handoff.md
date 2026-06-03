README - updated for the AI restructure
Added a new "AI agents (Assistant / Inbound / Outbound)" section: the sidebar/tab structure, "replies are Inbound / no Copilot," no-redirect-routes rule, the 3-level control model (master app_settings.ai_master_enabled -> per-agent -> per-lead ai_status), AI off by default, usage metering via generateWithOpenAI({orgId}), the agent knowledge profile prompt injection, and the new tables/routes.
Rewrote "Outstanding work" - removed the now-done items (usage counter is wired; import auto-response now routes through the canonical engine) and listed what's actually still stubbed (Inbound Lead Scoring/Buyer AI/Seller AI; Outbound sub-tabs; Templates UI removed).
Updated "Lead import + auto-enrollment" to explain apply-ai now gates on AI-enabled and calls queueInstantAndFollowups (and the usual "nothing sent" causes).
Handoff for the next AI (since you're deleting this chat)
Saved to project memory - it'll auto-load next session via MEMORY.md:

project-ai-restructure.md - the full state: confirmed decisions (3 agents, replies=Inbound, no Copilot, no redirects, AI off by default, count all AI usage, keep lint green), tab structure, 3-level control wiring, key frontend/backend/DB files, the engine/metering/profile flow, what's already cleaned up, and the likely next tasks (build the placeholder tabs; verify the fire path on remote).
Plus the earlier entries it links to: project-gotchas.md (now includes the local-D1-per-config-dir / --persist-to cron fix), feedback-no-redirect-routes.md, and the secrets/Explorer notes.
Everything is type-clean and pnpm lint passes. The one thing the next session (or you) must remember for remote testing: changes need pnpm upload + pnpm db-remote reseed, and AI is now off by default so master + Inbound must be toggled on before anything fires.

Good luck - the next AI will have the full picture from memory.