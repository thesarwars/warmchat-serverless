# **AI Agent Page Purpose**

**Remove activity feed page inside ai agent page** 

The AI Agent page is the control center for everything the AI does.

The goal is simple:

**AI handles conversations, qualification, follow-up, appointment booking, lead updates, and CRM maintenance automatically while keeping the agent informed.**

The AI should work like a virtual assistant, not a chatbot.

---

# **Overview Tab**

The Overview tab is the AI command center.

It should answer:

* What is the AI doing?  
* What did the AI do today?  
* Where does the agent need to step in?

## **Nimbus Card**

Shows:

* AI status (Live / Paused)  
* AI companion name  
* Quick summary of what AI is currently doing  
* On or Pause AI button  
* Open Inbox button

Example:

AI is monitoring leads, replying to conversations, qualifying prospects, booking appointments, updating CRM records, and surfacing urgent tasks.

---

## **AI Pipeline Intelligence**

Shows current AI performance.

Metrics:

* New Leads  
* Hot Leads  
* Qualified Leads  
* Appointments Set  
* Buyers  
* Sellers

These numbers update automatically as AI works.

---

## **Today’s Priority Queue**

Shows leads requiring attention.

Examples:

* Hot lead needs human response  
* Appointment confirmed  
* Showing requested  
* Seller requested CMA  
* Lead wants phone call

AI should automatically populate this section.

---

## **AI Daily Brief**

AI summarizes the day.

Example:

AI handled 27 conversations

Qualified 8 leads

Booked 3 appointments

Updated 18 CRM records

2 leads require agent review

This should be generated automatically.

---

## **Jump Back In**

Quick actions:

* Open Inbox  
* Review Hot Leads  
* Review Appointments

---

## **What AI Updated Today**

Shows CRM changes.

Examples:

* Updated lead timeline  
* Updated lead type  
* Updated budget  
* Updated area preference  
* Updated stage

Agent should always know what AI changed.

---

## **Live AI Activity Feed**

Real-time feed.

Examples:

* Message sent  
* Reply received  
* Lead qualified  
* Appointment booked  
* CRM updated  
* Task created

Uses websockets for live updates.

---

# **Inbound Tab**

Inbound controls all incoming lead automation.

If a lead messages, calls, submits a form, or replies:

Inbound AI handles it.

---

## **Master Inbound Toggle**

ON \= AI handles inbound conversations

OFF \= AI does nothing

---

## **Metrics**

Shows:

* AI Actions Today  
* Hot Leads Generated  
* Appointments Set  
* Qualified Leads

---

# **Workflows Tab**

Workflows are the actual automation engines.

These are NOT message templates.

These are business processes.

Examples:

### **New Lead → Instant Reply**

Trigger:

Lead enters CRM.

Action:

AI sends reply within 30-60 seconds.

Outcome:

Lead gets engaged immediately.

---

### **Lead Replies → Qualify**

Trigger:

Lead responds.

Action:

AI asks qualification questions.

Collects:

* Buyer/Seller  
* Timeline  
* Area  
* Budget  
* Financing  
* Motivation

Outcome:

Lead becomes qualified.

---

### **Missed Call → Auto Text**

Trigger:

Agent misses call.

Action:

AI sends missed-call text.

Outcome:

Conversation continues via SMS.

---

### **Booking Intent → Schedule Appointment**

Trigger:

Lead requests showing, consultation, or call.

Action:

AI checks availability.

Books appointment.

Updates CRM.

Creates calendar event.

Outcome:

Appointment scheduled.

---

### **Website Form → Create Lead \+ Respond**

Trigger:

Website form submitted.

Action:

Create lead.

Send instant response.

Start qualification.

Outcome:

Lead entered into pipeline automatically.

---

# **Templates Tab**

Templates are reusable messages.

These are NOT workflows.

Workflows decide WHEN messages send.

Templates decide WHAT gets sent.

Examples:

* Zillow Instant Reply  
* Buyer Qualification  
* Seller Qualification  
* Missed Call Text  
* Appointment Confirmation  
* Showing Reminder  
* Re-engagement Message

Variables:

* {{first\_name}}  
* {{property}}  
* {{city}}  
* {{agent\_name}}

should populate automatically.

---

# **Logs Tab**

Shows everything AI has done.

Purpose:

Transparency.

Agent should always see:

* Message sent  
* Message received  
* Lead updated  
* Appointment booked  
* Qualification completed  
* Task created

Each log should include:

* Timestamp  
* Lead  
* Action  
* AI reasoning

Example:

Lead replied asking about financing.

AI requested pre-approval status.

Lead marked as Buyer.

---

# **Availability Tab**

This controls when AI is allowed to schedule appointments.

AI uses this as the source of truth.

---

## **Agent Time Zone**

Every user has:

* Time Zone

Examples:

* PST  
* MST  
* CST  
* EST

AI schedules using the user’s timezone.

---

## **Default Availability**

If user never configures availability:

Automatically set:

* 8:00 AM  
* 8:00 PM

Every day

Based on user’s timezone.

Not PST for everyone.

PST only if their account timezone is PST.

---

## **Booking Rules**

AI can only offer times inside availability.

AI cannot:

* Double book  
* Book outside hours  
* Book during existing calendar events

---

Example:

Agent availability:

Monday-Friday

8:00 AM \- 8:00 PM

Lead asks:

Can we talk tomorrow?

AI checks:

* Calendar  
* Availability

Then offers:

* 10:00 AM  
* 2:00 PM  
* 5:00 PM

And books automatically.

---

# **AI Settings Tab (Future)**

This is where agents teach AI about themselves.

Examples:

* Agent name  
* Brokerage  
* Markets served  
* Areas served  
* Buyer process  
* Seller process  
* Calendar link  
* Preferred tone  
* Commission policies  
* Showing instructions  
* FAQ answers

The more information stored here, the better the AI performs.

---

# **Core Philosophy**

The AI Agent should do 5 things automatically:

1. Reply instantly  
2. Qualify leads  
3. Update CRM records  
4. Schedule appointments  
5. Tell the agent when human involvement is needed

Everything on the AI Agent page should support one of those five jobs.

