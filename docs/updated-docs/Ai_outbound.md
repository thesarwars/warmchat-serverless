# **Outbound AI Requirements**

The Outbound page controls all automated follow-up campaigns and nurture sequences.

## **How Outbound Works**

Agents create workflows that automatically send messages based on the schedule they configure.

Each workflow contains:

* Initial message  
* Follow-up messages  
* Message delays  
* Scheduled send times  
* Audience filters

The system automatically sends every message at the configured day and time until the lead replies or the workflow ends.

---

## **Workflow Editing**

Current behavior is incorrect.

Right now users can only edit the first message.

### **Required Behavior**

Users must be able to:

* Edit every message in the workflow  
* Add new messages anywhere in the sequence  
* Delete messages  
* Reorder messages  
* Change delays between messages  
* Change send times for each message  
* Edit the full template

Example:

Day 0 → Initial Message

Day 2 → Follow-up \#1

Day 5 → Follow-up \#2

Day 10 → Follow-up \#3

User should be able to edit all 4 messages.

---

## **Pre-Made Templates**

WarmChats provides ready-made templates.

Examples:

* New Lead Welcome  
* Speed to Lead  
* Seller Nurture  
* Buyer Nurture  
* Cold Re-Engagement

Users can:

* Use template as-is  
* Edit template  
* Add messages  
* Remove messages  
* Customize timing

Templates are starting points, not locked sequences.

---

## **Initial Message Scheduling**

For the first message:

Users can choose:

### **Instant**

Send immediately when lead enters workflow.

### **Scheduled**

Send at a specific date/time chosen by the user.

Example:

Lead enters today.

First message scheduled:

Tomorrow at 9:00 AM.

---

## **Follow-Up Scheduling**

Every follow-up message should support:

* Delay in days  
* Send time  
* Time zone

Example:

Message 1:  
 Instant

Message 2:  
 2 days later at 9:00 AM

Message 3:  
 5 days later at 1:00 PM

Message 4:  
 10 days later at 4:00 PM

All messages should send automatically according to the configured schedule.

---

## **Logs**

Logs show every outbound action.

Examples:

* Message sent  
* Lead enrolled  
* Workflow completed  
* Lead replied  
* Workflow stopped

Purpose:

Full visibility into what the automation is doing.

---

# **How WarmChats AI Works**

WarmChats AI should automatically:

* Respond to inbound messages  
* Qualify leads  
* Nurture cold leads  
* Detect intent  
* Update CRM records  
* Book appointments

AI responses should send approximately **30 seconds after a message is received** to feel natural.

The AI should continue conversations until it determines:

* Lead is qualified  
* Lead is cold  
* Lead is appointment ready  
* Human intervention is required

---

## **Human Escalation**

AI should automatically notify the agent when:

* Lead requests a phone call  
* Lead wants an appointment  
* Lead requests something AI cannot confidently answer  
* Lead requires urgent attention

AI handles routine conversations.

Agents handle high-value conversations.

---

## **Core Goal**

WarmChats should function like an AI sales assistant that:

1. Instantly responds  
2. Qualifies leads  
3. Nurtures cold leads  
4. Books appointments  
5. Updates the CRM  
6. Escalates important opportunities to the agent

The AI should handle the majority of conversations while keeping the agent focused on appointments and closings.

