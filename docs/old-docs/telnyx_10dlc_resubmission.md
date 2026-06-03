# Telnyx 10DLC Resubmission Pack (WarmChats LLC)

## 1) Message Flow (copy/paste)

If a contact has an existing opt-in or prior relationship, SMS messages may be sent immediately. If opt-in status is unknown, the platform sends a one-time confirmation request before any follow-up messaging.

For uploaded leads, customers can select **Send SMS opt-in request** during add/import and must attest prior consent was collected before sending that confirmation request.  
WarmChats sends a one-time SMS (`Reply YES to confirm`) and marks the contact as `pending_confirmation`.  
Only contacts that reply `YES` are moved to `subscribed` and become eligible for campaign sends. Contacts that reply `NO` or `STOP` are marked unsubscribed.  
We store consent status, timestamp, source, IP address, user agent, consent text version, and consent page URL/reference for auditability.  
Messages are sent only to first-party consented users. We do not use purchased, rented, affiliate, or cold-lead lists.

## 2) Subscriber/Keyword Responses

- Initial opt-in confirmation:
  - `WarmChats: You are subscribed to SMS updates. Msg frequency varies. Msg and data rates may apply. Reply HELP for help, STOP to opt out.`
- Lead upload confirmation request:
  - `WarmChats: Thanks for your interest. Reply YES to confirm SMS updates. Msg frequency varies. Msg and data rates may apply. Reply STOP to opt out, HELP for help.`
- YES confirmation response:
  - `WarmChats: You are subscribed to SMS updates. Msg frequency varies. Msg and data rates may apply. Reply STOP to opt out.`
- NO confirmation response:
  - `WarmChats: You are not subscribed to SMS updates. No further messages will be sent.`
- STOP confirmation:
  - `WarmChats: You are unsubscribed and will no longer receive SMS. Reply START to resubscribe.`
- HELP response:
  - `WarmChats support: support@warmchats.com. Reply STOP to opt out. Msg and data rates may apply.`
- START confirmation:
  - `WarmChats: You are subscribed to SMS updates. Msg frequency varies. Msg and data rates may apply. Reply STOP to opt out.`

## 3) Example Outbound Samples (mixed campaign)

- Informational:
  - `WarmChats: Your onboarding call is confirmed for tomorrow at 2:00 PM ET. Reply HELP for help or STOP to opt out.`
- Informational:
  - `WarmChats: Your account setup is complete. You can now connect your SMS number in settings. Reply STOP to opt out.`
- Promotional:
  - `WarmChats: New automation templates are available this week. Reply if you want a quick walkthrough. Reply STOP to opt out.`

## 4) Evidence Checklist

- Updated website screenshot showing no lead-generation/cold-lead language.
- Add/Import lead screenshot showing the SMS opt-in request checkbox + prior-consent attestation checkbox.
- Screenshot/log of consent record fields for one redacted number.
- Keyword test logs for YES, NO, STOP, HELP, START.
