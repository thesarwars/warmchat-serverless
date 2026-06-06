## **AI Flow (For Dev)**

1. New lead enters system  
   * Source: form, webhook, manual add, inbound SMS/email  
   * Detect lead type: buyer, seller, open\_house, unknown  
2. Instant response (\~30 sec)  
   * Send correct template based on lead type  
   * SMS, email, or both  
3. Wait for lead reply  
   * Never stack questions  
   * AI asks only ONE question at a time  
4. Qualification flow  
   * Buyer → budget → timeline → financing  
   * Seller → property → occupancy → motivation  
   * Open house lead towards buyer flow so can just input these leads to buyer flow → interest → financing  
   * Unknown → detect buyer/seller intent first  
5. Auto-save data  
   * Save replies to lead fields  
   * budget, area, timeline, pre\_approved, etc.  
6. Intent detection  
   * Warm \= interested, send homes  
   * Cold \= browsing, later  
   * Booking intent \= call, tour, appointment  
7. Stop rules  
   * Stop automation if:  
     * lead replies  
     * agent replies  
     * appointment booked  
     * no reply after follow-ups  
8. Booking trigger  
   * AI sends booking message  
   * Agent notified for hot leads  
9. Inbox updates  
   * Log all AI \+ user messages  
   * Update tags/status automatically

---

## **Automations Flow (For Dev)**

1. User creates campaign  
   * Name campaign  
   * Select SMS, Email, or both  
2. Select audience  
   * All leads  
   * Buyer leads  
   * Seller leads  
   * New leads  
   * Tags/custom filters  
3. Build sequence  
   * Add follow-ups  
   * Set delays (1 day, 3 days, etc.)  
   * Add SMS/email messages  
   * AI Write \+ Personalize buttons  
4. Timing controls  
   * Send now or schedule later  
   * Workspace timezone support (PST/EST)  
5. Stop conditions  
   * Stop when lead replies  
   * Stop when appointment booked  
6. Launch campaign  
   * Campaign starts automatically  
   * Track sends, replies, conversions  
7. Analytics dashboard  
   * Contacts reached  
   * Reply rate  
   * Positive replies  
   * Appointments booked  
8. Campaign management  
   * Pause  
   * Duplicate  
   * Archive  
   * View analytics drawer  
9. Quick reply system  
   * Respond to leads directly from campaign analytics/inbox

## **Dev Logic: Response → Intent → Qualification**

1. Lead replies to any message  
   * AI automation message  
   * Campaign message  
   * General/manual message  
   * Inbound SMS/email  
2. System checks response intent  
   * Buyer intent  
   * Seller intent  
   * Both  
   * Open house  
   * Unknown/vague  
   * Booking intent  
3. If intent is clear  
   * Buyer → start buyer qualification  
   * Seller → start seller qualification  
   * Both → ask “Are you planning to sell first or buy first?”  
   * Booking intent → skip qualification and push appointment  
4. If intent is unclear

   * Ask simple clarification:  
      “Are you looking to buy, sell, or just exploring right now?”  
5. Qualification rules  
   * Ask only 1 question at a time  
   * Wait for reply before next question  
   * Save answer to lead profile  
   * Update tags/status automatically  
6. Stop rules  
   * Stop scheduled follow-ups when lead replies  
   * Stop AI if agent manually responds  
   * Stop if appointment is booked

## **Example**

Lead replies: “I’m looking to buy soon.”

AI detects: Buyer intent  
 AI asks: “Got it. What price range are you hoping to stay around?”

Lead replies: “Around $700k.”

AI saves budget \= $700k  
 AI asks next question: “Nice, are you looking to buy in the next few months or just exploring?”

**Intent Detection System** 

Every lead reply should go through AI intent detection BEFORE qualification starts.

Possible intents:

\- buyer\_intent

\- seller\_intent

\- both\_intent

\- unknown\_intent

\- booking\_intent

\- not\_interested

\--------------------------------------------------

\#\# Buyer Intent Signals

Examples:

\- buy

\- looking for homes

\- house hunting

\- first-time buyer

\- pre-approved

\- mortgage

\- price range

\- tour homes

\- interested in buying

If detected:

\- set lead\_type \= buyer

\- start buyer qualification flow

\--------------------------------------------------

\#\# Seller Intent Signals

Examples:

\- sell

\- listing my home

\- home value

\- property address

\- thinking of moving

\- what is my home worth

\- cash offer

\- interested in selling

If detected:

\- set lead\_type \= seller

\- start seller qualification flow

\--------------------------------------------------

\#\# Both Intent Signals

Examples:

\- sell then buy

\- buy and sell

\- upgrade

\- downsize

\- moving from current home

If detected:

\- set lead\_type \= both

\- ask:

“Are you planning to sell first or buy first?”

\--------------------------------------------------

\#\# Booking Intent Signals

Examples:

\- call me

\- appointment

\- showing

\- tour

\- available tomorrow

\- can we talk

\- schedule a call

If detected:

\- skip qualification

\- send booking message

\- notify agent immediately

\--------------------------------------------------

\#\# Unknown Intent Signals

Examples:

\- maybe

\- not sure

\- browsing

\- just looking

\- exploring

If detected:

Ask:

“Are you mainly looking to buy, sell, or just exploring right now?”

\--------------------------------------------------

\#\# Routing Logic

IF booking\_intent:

  send booking message

  notify agent

ELSE IF buyer\_intent:

  set lead\_type \= buyer

  start buyer qualification

ELSE IF seller\_intent:

  set lead\_type \= seller

  start seller qualification

ELSE IF both\_intent:

  set lead\_type \= both

  ask:

  “Are you planning to sell first or buy first?”

ELSE:

  ask:

  “Are you mainly looking to buy, sell, or just exploring right now?”

\--------------------------------------------------

\#\# Buyer Qualification Flow

Q1:

“What price range are you hoping to stay around?”

Q2:

“Are you looking to buy in the next few months or just exploring?”

Q3:

“Have you already been pre-approved?”

Booking Trigger:

“Based on what you’re looking for, I can walk you through the best options and next steps. What day/time works best for a quick call?”

\--------------------------------------------------

\#\# Seller Qualification Flow

Q1:

“What’s the property address or area?”

Q2:

“Is the home owner-occupied, rented, or vacant?”

Q3:

“What’s got you thinking about selling?”

Booking Trigger:

“I can walk you through what your home could realistically sell for and next steps. What day/time works best for a quick call?”

\--------------------------------------------------

\#\# Main Rules

\- Never ask multiple questions at once

\- Wait for reply before next question

\- Save answers automatically to lead profile

\- Stop follow-ups when lead replies

\- Stop AI when agent manually replies

\- Log all AI \+ lead messages

\- Update lead tags/status automatically

Final Flow:

Lead Reply

→ Intent Detection

→ Set Lead Type

→ Start Correct Qualification Flow

→ Save Responses

→ Trigger Booking

