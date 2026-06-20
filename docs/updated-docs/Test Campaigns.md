# **Campaign Expected Behavior**

## **Campaign Creation**

User creates campaign:

* Name  
* SMS, Email, or SMS \+ Email  
* Audience  
* Schedule  
* Rate Limit  
* AI Enabled ON/OFF  
* Test Mode ON/OFF

Status:

Draft → Scheduled → Sending → Completed

---

# **Initial Send Logic**

## **Instant Send**

If user selects:

“Send immediately”

Flow:

Campaign Saved  
 ↓  
 Campaign Activated  
 ↓  
 Queue Created  
 ↓  
 First Batch Starts Immediately  
 ↓  
 Campaign Status \= Sending

Validation:

* First message should begin processing immediately  
* No waiting for cron cycle delays  
* Queue creation timestamp logged  
* First send timestamp logged

---

## **Scheduled Send**

If user selects:

Send at 9:00 AM

Flow:

Campaign Saved  
 ↓  
 Scheduled  
 ↓  
 Wait  
 ↓  
 9:00:00 AM reached  
 ↓  
 Queue Starts

Validation:

* Campaign starts exactly at scheduled time  
* Not 2-5 minutes later  
* Not next cron cycle  
* Timezone respected

---

# **Message Personalization**

Every campaign message should support merge fields.

Examples:

Hi {{first\_name}}

Hi {{first\_name}}, I saw you’re looking in {{area}}

Expected behavior:

Lead A

Name \= John  
 Area \= Burbank

Result:

Hi John, I saw you’re looking in Burbank

---

Lead B

Name \= Sarah  
 Area \= Empty

Result:

Hi Sarah

NOT:

Hi Sarah, I saw you’re looking in

NOT:

Hi Sarah, I saw you’re looking in {{area}}

Missing variables should automatically be removed.

Validation:

* First Name always inserted  
* Area inserted if exists  
* Missing fields removed cleanly  
* No broken text

---

# **AI Improve Tone**

When user clicks:

AI Improve Tone

Validate:

* Message rewrites successfully  
* Preserves merge fields  
* Preserves links  
* Preserves campaign intent

Bad:

Hi John becomes Hi Joseph

Bad:

{{first\_name}} removed

Good:

Hi {{first\_name}}, just checking in regarding your home search.

---

# **Queue System Requirements**

Never send 1,000 messages at once.

Expected:

Campaign  
 ↓  
 Queue Created  
 ↓  
 Batch Sent  
 ↓  
 Wait  
 ↓  
 Next Batch  
 ↓  
 Continue

Validation:

* No duplicate sends  
* Queue survives server restart  
* Failed sends don’t stop campaign  
* Campaign resumes properly

---

# **SMS Campaign Validation**

Test:

* 100 leads  
* 500 leads  
* 1,000 leads

Validate:

* Queue creation  
* Delivery updates  
* Failure logging  
* Reply handling  
* Pause  
* Resume  
* Stop  
* Unsubscribe  
* AI stop rules

---

# **Email Campaign Validation**

Test:

* 100 emails  
* 500 emails  
* 1,000 emails

Validate:

* Email queue creation  
* Delivery tracking  
* Bounce handling  
* Reply detection  
* Unsubscribe handling  
* Pause  
* Resume  
* Stop

---

# **Mixed Campaign Validation**

Example:

Day 1  
 SMS

Day 2  
 Email

Day 3  
 SMS

QA Mode:

Every 2 minutes

Validate:

* Correct order maintained  
* No skipped steps  
* No duplicate steps  
* No simultaneous sends  
* Future automation stops after reply

If lead replies on Day 1 SMS:

Day 2 email should NOT send.

Day 3 SMS should NOT send.

---

# **AI Reply Load Testing**

Simulate:

300 leads  
 20 replies

Validate:

* AI responds to all 20  
* No duplicate responses  
* No response to unsubscribed leads  
* No response when AI paused  
* Human takeover works  
* AI queue handles spikes

---

# **Campaign Statuses**

Required:

* Draft  
* Scheduled  
* Sending  
* Paused  
* Completed  
* Failed

Recommended:

* Cancelled  
* Processing  
* Stopping

These help prevent status confusion.

---

# **Event Logging (Critical)**

Every event should create a log record.

Log:

* Campaign Created  
* Campaign Started  
* Campaign Paused  
* Campaign Resumed  
* Campaign Stopped  
* Queue Created  
* SMS Sent  
* Email Sent  
* SMS Failed  
* Email Failed  
* Reply Received  
* AI Replied  
* Unsubscribed  
* Delivery Confirmed

Every log should include:

* Timestamp  
* Campaign ID  
* Lead ID  
* Message ID  
* Event Type

---

# **Questions Dev Must Answer Before Launch**

1. What is the maximum SMS throughput currently supported?  
2. What is the maximum email throughput currently supported?  
3. Are rate limits configurable by plan/account?  
4. Is queue batching already implemented?  
5. Have 100, 500, and 1,000 lead campaigns been successfully tested?  
6. Does Test Mode exist, or must it be built?  
7. Does the system log every send attempt, delivery, failure, reply, unsubscribe, pause, resume, and stop action?  
8. Does campaign scheduling fire at the exact scheduled time?  
9. Does AI Improve Tone preserve merge fields?  
10. Does personalization properly remove empty variables?  
11. Does replying to either SMS or Email stop all future campaign automation for that lead?  
12. Can campaigns safely continue when workers restart or fail?

If WarmChats passes all of the above in both Test Mode and live testing, then it will be operating much closer to the mass campaign behavior agents expect from platforms like Follow Up Boss, Lofty, and GoHighLevel.

