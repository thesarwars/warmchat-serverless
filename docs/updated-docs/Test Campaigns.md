Outbound Campaign QA Request — Bulk SMS \+ Email Testing

Please validate bulk campaign sending before I test with real contacts.

Important:  
Do not send real SMS or emails for Phase 2 load testing.  
Please create a testing mode / sandbox mode with fake leads where messages are queued, processed, logged, and marked as test-delivered without actually sending to carriers or email inboxes.

Goal:  
Validate that campaigns work with 100, 500, and 1,000 leads safely.

Test Mode Requirements:

* Create fake leads with fake phone numbers and fake emails  
* Add a campaign setting like “Test Mode”  
* In Test Mode, do not call Telnyx or email provider  
* Still create message records  
* Still update statuses  
* Still process scheduled steps  
* Still simulate delivery success/failure  
* Still test pause/resume/stop  
* Still test AI stop rules  
* Still test SMS \+ email mixed campaigns

SMS Bulk Tests:  
Create test campaigns with:

* 100 fake leads  
* 500 fake leads  
* 1,000 fake leads

Validate:

* Queue is created correctly  
* No duplicate sends  
* Messages send in batches, not all at once  
* Delivery statuses update  
* Failed messages are logged  
* Campaign continues if one message fails  
* Lead only receives one scheduled message at a time  
* Replies remove lead from campaign  
* AI pauses campaign automation when lead replies  
* STOP unsubscribes immediately  
* Campaign can be paused while sending  
* Campaign can resume  
* Campaign can be stopped

Email Bulk Tests:  
Create test campaigns with:

* 100 fake email leads  
* 500 fake email leads  
* 1,000 fake email leads

Validate:

* Emails queue correctly  
* No duplicate emails  
* Email statuses update  
* Failed emails are logged  
* Campaign continues if some emails fail  
* Replies stop campaign automation for that lead  
* Email unsubscribe works if applicable

Mixed SMS \+ Email Campaign Test:  
User should be able to create one campaign with both SMS and email.

Example:  
Day 1: SMS message sends  
Day 2: Email sends  
Day 3: SMS follow-up sends

For testing, reduce delay to every 2–5 minutes so we can validate quickly.

Validate:

* SMS and email steps stay in correct order  
* Scheduled timing works  
* Lead does not receive two messages at the same time  
* If lead replies to SMS, future SMS/email automation stops  
* If lead replies to email, future SMS/email automation stops  
* AI can respond if AI is enabled

AI Bulk Reply Test:  
Please simulate replies from bulk campaign leads.

Example:  
Campaign sends to 300 fake leads.  
Simulate 20 replies.  
AI should create responses for those 20 leads if AI is enabled.

Validate:

* AI responds to multiple replies correctly  
* AI does not respond to unsubscribed leads  
* AI does not respond if campaign/AI is paused  
* AI does not duplicate replies  
* AI handles many replies at once without delay or failure

Rate Limit Testing:  
Please validate campaign throttle settings.

Test:

* 10 messages/minute  
* 25 messages/minute  
* 50 messages/minute  
* 100 messages/minute if safe  
* 300 messages/minute only if queue/worker/provider limits support it

Do not send 1,000 messages instantly.

Default logic should be:  
Campaign Started  
↓  
Leads Added  
↓  
Queue Created  
↓  
Send First Batch  
↓  
Wait Based On Rate Limit  
↓  
Send Next Batch  
↓  
Continue Until Complete

Campaign Statuses Needed:

* Draft  
* Scheduled  
* Sending  
* Paused  
* Completed  
* Failed

Please confirm:

1. Max SMS campaign send rate currently supported  
2. Max email campaign send rate currently supported  
3. Whether rate limits are configurable per account/plan  
4. Whether previous dev already implemented queue batching  
5. Whether campaigns are safe for 100, 500, and 1,000 leads  
6. Whether fake/test mode exists or needs to be added  
7. Whether logs show every send attempt, success, failure, reply, unsubscribe, pause, resume, and stop event

This needs to be validated before I test with real contacts.

