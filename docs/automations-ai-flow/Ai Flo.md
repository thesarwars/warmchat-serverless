WarmChats - Phase 1 (MVP) AI Follow-Up SMS ENABLED

 🎯 Goal

Automatically respond to new leads, ask 1 qualification question at a time, save answers, tag intent, and allow agent to book. 

### **Speed-to-Lead Automation**

One of Follow Up Boss's biggest selling points.

Example:

* Zillow lead comes in  
* Instant text/email sent  
* Agent notified immediately  
* Call option appears instantly

This is VERY aligned with WarmChats.

But WarmChats can make this way stronger with:

* AI conversational qualification  
* Dynamic responses  
* Auto-booking  
* AI follow-up sequences

That's your biggest opportunity.

**1\) Lead Types**

 Supported lead\_type values:

\- buyer

\- seller

\- unknown (DEFAULT)

\- open\_house

 Where lead\_type comes from:

\- Form field (buyer/seller/open house)

\- Manual selection by agent

\- \- If none -> set lead\_type \= unknown

**2\) Instant Reply Templates**

Templates:

\- Buyer Template \- Hey {{first\_name}}, this is {{agent\_name}}.Just wanted to see what you're looking for right now?

\- Seller Template \- Hey {Firstname}, are you looking to sell soon or just exploring your options?

\- General Template (default fallback) \- Hey {{first\_name}}, this is {{agent\_name}}. Thanks for reaching out. Are you looking to buy, sell, or both?

 Selection logic: 

ON NEW LEAD: IF lead\_type \== buyer -> use Buyer template ELSE IF lead\_type \== seller -> use Seller template ELSE -> use General template

Default (General) template:

Hi {{first\_name}}, this is {{agent\_name}}. Thanks for reaching out. Are you looking to buy, sell, or both?

Variable fallback:

\- If first\_name is null/empty -> use "there"

 **3\) Trigger System (MVP)**

### 

### **1\. New Lead Created**

Sources:  
Form, manual add, inbound SMS/email.

When lead is created:

Check:  
 AI Follow-Up ON/OFF  
 Lead type known? Buyer / Seller / General / Open House  
 Channel available? SMS, Email or both

Then:  
 If ON -> send instant reply using the right template after 30 seconds

## 

## 

## **Manual Lead Exception**

If manually added:  
 Show modal:

Start AI Follow-Up?

* Send Now  
* Schedule  
* Don't Send

This prevents old leads from getting random texts.

Templates:

Buyer:  
 "Hey {{first\_name}}, this is {{agent\_name}}. Thanks for reaching out. What price range are you hoping to stay around?"

Seller:  
 "Hey {{first\_name}}, this is {{agent\_name}}. Are you thinking about selling soon, or just starting to explore?"

Unknown:  
 "Hey {{first\_name}}, this is {{agent\_name}}. Thanks for reaching out. Are you looking to buy, sell, or both?"

Open House: Hey {{first\_name}}, thanks for coming by today\! Let me know if you have any questions

**Manual add exception:**  
 When user manually adds a lead, show:

Start AI Follow-Up?  
 \[Send now\] \[Schedule\] \[Don't send\]

This prevents random old leads from getting auto-texted.

### **2\. Lead Reply**

When lead replies:

System automatically:

1. stops pending follow-ups  
2. saves reply to conversation  
3. updates lead status -> Engaged  
4. detects basic intent/data  
5. asks ONE next question only  
6. alerts agent if booking-ready

## **Best MVP Rule**

Use automation for:

New lead created -> instant reply  
 Lead replies -> next question  
 No reply -> simple follow-up

Use manual control for:

Old/manual leads  
 Starting AI follow-up  
 Pausing/resuming automation  
 Editing templates

So the MVP should be:

Automatic for new inbound leads. Manual approval for manually added leads

 **4\) Qualification Flow**

## **Clean system logic (for your dev)**

* Send Q1  
* Wait for reply  
* If no reply -> send follow-up (1-2 max)  
* If still no reply -> STOP  
* Tag: `Not Engaged`

### **If lead doesn't answer a question:**

👉 AI sends **1-2 light follow-ups**  
 👉 Then **pauses** and lets agent step in (if needed)

## **🔥 What happens next**

* Lead stays in **"Not Engaged"**  
* Agent can manually reach out later

 **5\) Data Capture (Auto-save)**

**AI reads the reply -> extracts any matching field -> saves it -> asks the next missing qualification question.**

Map answers to lead fields when possible:

\- budget -> budget

\- area -> area

\- timeline -> timeline

\- pre-approval -> pre\_approved

Store all messages in conversation history.

**6\) Intent Tagging (Basic)**

On each reply, update tags:

\- Warm:

  \- "interested", "send homes"

\- Cold:

  \- "just browsing", "later", "not sure"

\- Booking Intent:

 \- "call", "appointment", "tour", "showing", "tomorrow", "today"

Update:

\- lead\_status (warm/cold)

\- tags\[\]

**7\) Booking (Manual)**

Inbox button:

"Send Booking Message"

 On click:

Send:

Based on what you're looking for, it probably makes sense to connect for a few minutes. I can walk you through your options. When are you available to call?

\- Message is editable before sending

\- Log in conversation

**Automation Rules (Global)**

\- AI sends ONLY one question at a time

\- AI waits for reply before next message

\- AI stops when:

 lead replies (reset flow step)

 agent sends a message

 All messages logged

 Lead profile updates automatically

 **UX Flow (User Experience)**

1\. When a new lead is created, send an instant auto-response using the selected template.

2\. When the lead replies, the system should ask only 1 qualification question at a time.

3\. The lead's reply should be saved to their lead profile fields when possible.

Example:  
\- If AI asks budget -> save reply to budget field  
\- If AI asks area -> save reply to area field  
\- If AI asks timeline -> save reply to timeline field

4\. Add basic intent detection:  
\- If lead sounds interested, tag as Interested/Warm  
\- If lead says "just browsing", "not interested ", "later", tag as Not Ready/Cold  
\- If lead says "call", "appointment", "tour", "showing", "tomorrow", "today", tag as Booking Intent

**Agent can jump in anytime** 

5\. Add a manual "Send Booking Message" button inside the lead conversation.

When agent clicks it, send:  
"Sounds good. What day/time works best for a quick call?"

6\. Stop automation when lead replies or when agent manually takes over.

Rules:  
\- AI should never send multiple questions at once  
\- AI should wait for lead reply before sending next message  
\- AI should not continue if agent manually sends a message  
\- All AI messages and lead replies should be logged in conversation history  
\- Lead status/tags should update automatically

**Data Model (Minimum)**

Lead:

\- id

\- first\_name

\- phone

\- email

\- lead\_type

\- price range

\- area

\- timeline

\- pre\_approved

\- status (warm/cold)

\- tags\[\]

\- last\_reply\_at

![][image1]

**Need help setting this up?**   
**Leave subtext underneath** 

For Book Setup Call leave the button: If user clicks book setup call send them to my Calendly link to book a call

[**https://calendly.com/velasquezjojo7/30min**](https://calendly.com/velasquezjojo7/30min)

**Have all auto responses respond 30 seconds after message received**

**Inbound SMS Handling:**

When someone texts your WarmChats number:

\[ ON \] Auto-reply to unknown numbers

If phone matches a lead:  
-> Continue conversation

If phone is new:  
-> Create Unknown lead    
-> Send General instant reply    
-> Tag as "Inbound SMS"

**Goal: When user misses a call from Warmchats number an auto response should automatically be sent.**

Currently in an appointment. I will call you back shortly or text me please.

Subtext under **Missed Call Auto Response:** Never miss a lead. Automatically follow up by text when you miss a call.

Auto \[ ON \] but user can toggle On/Off

Selected Template:  
Missed Call \- Default

If user clicks edit template they're able to edit this single message that appears when they received missed call and preview will show how it looks

**Auto enter this message for missed call message** 

**Preview:**  
Currently in an appointment. I will call you back shortly or text me please.

**![][image2]**

**When user clicks edit template**

Allow agents to send message in timezone pst or est  
Only for all follow up qualification messages pst or est for all messages because the auto response and auto reply should be automatic always after 30 seconds but the qualification messages are always sent at a specific time which user can edit in templates or message

**Step 2\. Qualification:** 

**1\. Buyer Lead (MOST IMPORTANT) Open House falls under buyer lead for qualifcation**

**Send Auto response 30 seconds after message received** 

**Goal:**  
 👉 Budget \+ timeline \+ area -> book call

# **Golden Rule** 

Never ask new questions until the lead engages

### 

### **Flow (in order)**

**Step 1\.** **Instant Reply (30 sec delay)**

Hey {{first\_name}}, this is {{agent\_name}}. Are you looking to buy soon or just exploring right now?

## **Step 2 - Follow-ups (ONLY if no reply)**

These should feel like nudges - NOT questions stack

### **Follow-up 1 (1 hour after first message sent if no reply)**

Just wanted to make sure you saw my message 👍

### **Follow-up 2 (Next day, 10 AM) pst** 

Hey {{first\_name}}, not sure if timing is right yet-are you still thinking about buying or just browsing for now?

👉 STOP here  
 👉 Do NOT ask more questions

Agent takes over forward on and lead gets intent as cold lead no reply intent

## **🟢 Step 3 - Qualification (ONLY after reply) If no reply to any messages above then qualification should not start but if they answer 1 question ask Question 1 and don't send another message until lead replies. If lead replies send Question 2 and follow the same flow forward on which should lead to booking trigger which is Warmchats users goal**

Now your flow becomes:

### **Question 1 - Budget**

Got it.  What price range are you hoping to stay around?

Q2-Timeline   
Nice, are you looking to buy in the next few months or just exploring for now?

Q3 \- Financing   
Got it, have you already gotten pre-approved, or still figuring out the financing side?

Step 4 After Q3 \- Booking trigger  
Based on that, I can show you homes that fit exactly what you're looking for and walk you through next steps.

What day/time works best for a quick call?

#  **2\. Seller Lead**

Goal:  
 👉 Timeline \+ property \+ motivation -> book call

### **Flow:**

# **STEP 1 - Instant Reply (sent \~30 seconds)**

Seller Template \- Hey {{first\_name}}, this is {{agent\_name}}. Are you thinking about selling soon or just exploring your options?

# **STEP 2 - Follow-Ups (ONLY if no reply)**

###  **Follow-up 1 - 2 hours after 1 message sent**

Just wanted to make sure you saw my message 👍

### **⏱ Follow-up 2 - Next day (10 AM) pst** 

All good if now's not the right time, I can also give you a quick idea of what your home could sell for if that helps.

# **STEP 3 - Qualification (ONLY after reply)**

The moment they respond -> start this flow. Only ask the next question if the lead replies. If no reply agent can take over if they want to send new message

## **Q1 - Property**

### Got it. What's the property address or area?

### **Save -> `property_address to notes`**

### 

### **Q2 - Occupancy**

### Is the home currently owner-occupied, rented, or vacant?

Save -> `occupancy_status to notes` 

**Q3 - Motivation**

### What's got you thinking about selling?

👉 Save -> `motivation to notes` 

# **STEP 4 - Transition** 

# I can show you what your home could realistically sell for in today's market. Do you want me to send that over, or go through it together on a quick call?

# **STEP 5 - Booking Trigger**

If they say:

* yes  
* sure  
* together  
* call

Perfect\! what day/time works best?

## **Tag: `hot_seller`**  **👉 Notify agent**

## 

# **EDGE CASE - Late reply (IMPORTANT)**

## **If lead replies after follow-ups:**

## **Example: Lead: Yeah I might sell**

👉 System should:

1. Cancel all follow-ups  
2. Jump into:

Got it. Are you thinking of selling soon or more in the next few months?

# 

# **3\. General / Unknown Lead**

Goal:  
 👉 Identify buyer vs seller FIRST

# **STEP 1 - Instant Reply (sent \~30 seconds)**

Hey {{first\_name}}, this is {{agent\_name}}.  
Are you mainly looking to buy, sell, or both?

# **STEP 2 - Follow-Ups (ONLY if no reply)**

### **Follow-up 1 - 1 hour after first message sent**

Just wanted to make sure you saw my message 👍

### **Follow-up 2 - Next day (10 AM) pst**

Or are you just exploring options right now?

# **STEP 3 - Intent Detection (CRITICAL LOGIC)**

When they reply, your system should map:

### **Buyer intent:**

* "buy"  
* "looking to buy"  
* "purchase"  
* "homes"

👉 Tag -> `buyer`  
 👉 Start -> **Buyer Flow**

---

### **Seller intent:**

* "sell"  
* "selling"  
* "list"  
* "my home"

👉 Tag -> `seller`  
 👉 Start -> **Seller Flow**

---

### **Both:**

* "both"  
* "sell then buy"  
* "upgrade"

👉 Tag -> `both`  
 👉 Start -> **Seller Flow FIRST** (then buyer after)

---

### **Unknown / vague:**

* "just looking"  
* "maybe"  
* "not sure"

👉 Keep them in **light qualification**

---

# **STEP 4 - Smart Transition (THIS IS KEY)**

## **If BUYER:**

Got it.  Are you looking to buy soon or just exploring right now?

Then continue Buyer Flow (Q1)

## **If SELLER:**

Got it. Are you thinking about selling soon or just exploring your options?

Then continue Seller Flow (Q1)

## **If BOTH:**

Got it. Are you planning to sell first, or buy first?

Then:

* If sell first -> Seller Flow  
* If buy first -> Buyer Flow

**If UNCLEAR:**

Got it - are you mostly interested in buying, selling, or just exploring right now?

# **EDGE CASE - Late reply**

If they reply after follow-ups:

Lead: maybe buy or maybe sell

System:

* Cancels all follow-ups  
* Starts Buyer or seller flow immediately depending on response 

# **RULES (VERY IMPORTANT)**

### **1\. Don't stack questions**

Only ONE question at a time

**2\. Don't assume intent**

Always confirm first

**3\. Stop all messages on reply**

This applies globally

# **🟣 4\. Open House Lead (HIGH CONVERSION)**

Goal:  
 👉 Turn walk-in into appointment

# **Step 1: Instant Message (send \~20 min after lead added)**

Hey {{first\_name}}, thanks for coming by. What did you think of the home after seeing everything?

# **STEP 2 - Follow-Ups (ONLY if no reply)**

### **Follow-up 1 - Same day 2 hours after 1st message**

 Are you looking to buy soon or just exploring right now?

### **Follow-up 2 - Next day (10 AM) pst**

No worries if you're still thinking it over. I can also send you similar homes in the area if that helps.

### **Rules:**

* No stacking questions  
* No qualification yet  
* STOP if they reply

# **STEP 3 - Qualification (ONLY after reply)**

Once they respond -> begin flow

## **✅ Q1 - Financing**

Have you already been pre-approved, or still figuring that part out?

Save -> `financing_status`

## 

# **STEP 4 - Booking Trigger for qualification question 1**

If they say:

* No  
* Yes  
* interested  
* send homes  
* liked it

Send:

Perfect\! I can also walk you through the best options and what's available off-market.  
What's a good time for a quick call?

# **EDGE CASE - They loved the home**

If lead says:

* "I liked it"  
* "I'm interested"  
* "what's next"

👉 Skip ahead:

Nice, it sounds like a good fit. Want to set up a quick call so I can walk you through next steps and what to expect?

# **🧠 IMPORTANT RULES (for all flows)**

Tell your dev:

* Ask **ONLY 1 question at a time**  
* Wait for reply before next  
* Stop if agent replies  
* Stop if lead goes silent (later add nurture)

# **What actually matters (this is key)**

Every flow is designed to get:

👉 **Timeline \+ Motivation \+ Specifics**

**Step 3\. Booking manual click send in inbox** 

### **1️⃣ One Default Booking Message (used everywhere)**

Based on what you're looking for, it probably makes sense to connect for a few minutes. I can walk you through your options. When are you available to call?

Works for:

* Buyer  
* Seller  
* Open house  
* Re-engagement

**2️⃣ Add 3 Variations (Dropdown)**

Give users options, not complexity.

## **Variation A - Soft**

Makes sense to hop on a quick call. I can walk you through what's available. Are you available today or tomorrow at 1 or 2pm.

## **Variation B - Value-driven**

I can walk you through your options and next steps. What day/time works best for a quick call?

## **Variation C - Direct**

Let's do a quick call. I'll walk you through everything. What time works for you?

# **🎯 That's it.**
