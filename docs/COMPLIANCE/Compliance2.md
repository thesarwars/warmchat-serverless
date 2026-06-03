I now have a complete picture. Before the compliance report, one urgent finding needs to lead: **real production API keys are committed in wrangler.toml** (which is tracked by git, not gitignored). I've confirmed live-looking OpenAI, Telnyx, ElasticEmail, Stripe, Gmail OAuth, and Turnstile secrets are in the file, plus SECRET\_KEY \= "supersecretkey" - a weak key that's used to encrypt your users' email OAuth tokens and IMAP passwords.

Here's the full audit.

---

# **Compliance Audit - WarmChats Real Estate CRM**

*Note: I'm giving you a technical/engineering audit mapped to the relevant laws. This is not legal advice - for SMS consent language, your privacy policy, and state-by-state AI/recording laws you should have a telecom/privacy attorney do a final review. The good news: the foundation here is unusually solid for a CRM at this stage.*

---

## **✅ What's already implemented (this is genuinely good)**

| Area | Status | Where |
| ----- | ----- | ----- |
| **STOP / opt-out keyword handling** (CTIA) | ✅ STOP, UNSUBSCRIBE, CANCEL, END, QUIT, OPT-OUT \+ START re-opt-in; cancels pending sends | functions/\_shared/inboundProcessing.ts |
| **Quiet hours 8am-9pm** (TCPA) | ✅ Per-recipient timezone, enforced in campaigns, scheduled msgs, and sequences | workers/cron/\_shared/quietHours.ts |
| **SMS consent capture** (TCPA) | ✅ Stores opt-in status, source, IP, user-agent, consent text version, page URL \+ proof-retrieval endpoint | functions/api/sms/consent.ts, sql/4.create-sms.sql |
| **Privacy Policy \+ Terms of Service** | ✅ Comprehensive, footer-linked, dated, California governing law | src/pages/PrivacyPolicy.tsx, TermsOfService.tsx |
| **Account deletion** (GDPR/CCPA erasure) | ✅ DELETE /api/auth/account \+ UI | functions/api/auth/account.ts |
| **Multi-tenant isolation** | ✅ Org-membership checks, WHERE org\_id \= ? scoping | functions/\_shared/orgAccess.ts |
| **Password storage** | ✅ PBKDF2-SHA256, per-user salt, constant-time compare | functions/\_shared/password.ts |
| **Audit trail** | ✅ Full SMS/email/call logging with direction, timestamp, body, delivery status | sql/3,4,11.\*.sql |
| **No protected-class data fields** (Fair Housing) | ✅ Lead schema is transaction-based only (price, area, buyer/seller) | sql/2.create-leads.sql |
| **10DLC registration** | ✅ Master brand/campaign model | functions/api/telnyx/provision/\* |

## **⚠️ Gaps, by priority**

### **High - direct legal exposure**

| Gap | Regulation | Fix |
| ----- | ----- | ----- |
| **No HELP keyword response** | CTIA / carrier requirement | Add HELP handling next to STOP in inboundProcessing.ts returning sender ID \+ support contact \+ "Reply STOP to cancel" |
| **No opt-out confirmation reply** ("You're unsubscribed") | CTIA | Send one final confirmation SMS on STOP |
| **No "Reply STOP" in auto-responses, appointment confirmations, campaign bodies** | TCPA/CTIA | Append compliance footer to all outbound message builders (autoResponse.ts, appointmentConfirmations.ts, campaign send) |
| **No physical postal address in marketing emails** | CAN-SPAM (legally required) | Add WarmChats LLC mailing address to email footer |
| **Email opt-out not honored** - only sms\_opt\_out exists; sequences can email opted-out leads | CAN-SPAM | Add email\_opt\_out to lead schema \+ a real HTTP unsubscribe endpoint, and check it before every email send |
| **No signup consent record** - no "I agree to Terms/Privacy" checkbox, agreement not stored | Contract formation / TCPA defense | Add checkbox to SignUp.tsx \+ persist timestamp/version |
| **No AI / automation disclosure** in auto-SMS and voicemail | CA \+ emerging state bot-disclosure laws | Add "automated message" disclosure to AI-driven/auto messages |

### **Medium**

* **No Fair Housing guardrail in AI prompts** - LEAD\_ASSISTANT\_SYSTEM\_BASE and the generation endpoints have no rule against steering/discriminatory language. Add explicit prohibitions to the system prompts (functions/\_shared/openai.ts).  
* **No call-recording consent disclosure** - recording is supported (sql/11) with no two-party-consent announcement. Risky in CA/FL/etc. (12 two-party-consent states).  
* **No cookie consent banner** while Mixpanel session replay runs at 100% - GDPR/ePrivacy issue for any EU visitor (text is masked, which helps, but consent is still required).  
* **No per-recipient frequency cap** - only provider rate limits exist; a contact could be messaged unlimited times.  
* **No DNC suppression list** beyond post-STOP handling.  
* **Missing security headers** - no CSP / HSTS / X-Frame-Options.

### **Lower / polish**

* No CCPA "Do Not Sell" link or DSAR form (you don't sell data, so a statement \+ request form likely suffices).  
* No automated data-export (portability) endpoint.  
* Account deletion orphans some lead/call data rather than cascading - tighten for true "right to erasure."  
* No documented data-retention schedule / auto-purge.  
* No ai\_generated flag on messages for audit defensibility.

---

## **Suggested sequence**

1. **Today:** rotate \+ remove committed secrets, fix SECRET\_KEY, gitignore the toml files.  
2. **This week:** HELP keyword \+ opt-out confirmation \+ "Reply STOP" footers \+ email opt-out flag \+ CAN-SPAM physical address. These are cheap and close the biggest gaps.  
3. **Next:** signup consent checkbox, AI/Fair-Housing prompt guardrails, cookie banner, recording-consent disclosure.  
4. **Backlog:** DNC, frequency caps, security headers, data export, retention policy.

---

Want me to start on any of these? The fastest high-impact set is the **secret rotation \+ the SMS compliance footers (HELP, opt-out confirmation, "Reply STOP")** - I can implement those now. Which would you like me to tackle first?

