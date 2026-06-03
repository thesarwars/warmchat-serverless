Stubs still outstanding (NOT yet wired - flagging, not fixing without your go-ahead)
/api/campaigns - records campaign messages but no SMTP/Telnyx dispatch (campaigns/index.ts:78).
/api/onboarding/:userId/send-test - returns "not wired yet", sends nothing.
Gmail OAuth (connect-url, connection, disconnect) - labeled Phase 4; need to confirm the full OAuth round-trip + token refresh actually works end-to-end.
/api/billing/status - reads DB only, no live Stripe sync.
/api/elastic/business-email/status - may report static status rather than live Elastic provisioning.
Want me to work through that outstanding list next (campaigns dispatch is probably the highest-impact), or verify the Gmail OAuth path first? Reseed (pnpm db) before testing so the verify-otp inbox-connection and index changes apply.