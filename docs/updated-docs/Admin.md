**Admin Page \- View admin page in this link to view how its supposed to look like and follow the admin page how it looks and implement the ui and pages into live warmchats**

[https://618a04db-9a20-4092-a5fb-bb79a9a2fcb5.claudeusercontent.com/v1/design/projects/618a04db-9a20-4092-a5fb-bb79a9a2fcb5/serve/leads/index-print.html?t=728dbd6999c4a43b386b68aae23181b0b20aa5014e3b34f96713bf88436adf8c.4b19b9da-0047-49fa-8a3e-6c7a8ef1c177.83534f39-f59e-4dab-a5a2-be7cd4a5922e.1780632473\&direct=1](https://618a04db-9a20-4092-a5fb-bb79a9a2fcb5.claudeusercontent.com/v1/design/projects/618a04db-9a20-4092-a5fb-bb79a9a2fcb5/serve/leads/index-print.html?t=728dbd6999c4a43b386b68aae23181b0b20aa5014e3b34f96713bf88436adf8c.4b19b9da-0047-49fa-8a3e-6c7a8ef1c177.83534f39-f59e-4dab-a5a2-be7cd4a5922e.1780632473&direct=1)

# **Admin Page Requirements**

The Admin section controls workspace setup, users, integrations, automations, billing, notifications, and account settings.

Only admins/owners should access this page.

---

## **Admin Tab**

Purpose: manage the workspace.

Users should be able to:

* Invite users  
* Assign roles  
* Assign team/office  
* See user status  
* Manage notification settings  
* Change workspace timezone  
* Set quiet hours  
* Change password

Notification settings should include:

* SMS lead messages  
* Email lead messages  
* Calls  
* Appointments  
* Billing  
* System alerts  
* In-app toasts  
* Sound  
* Mobile push  
* Email digest

Quiet hours control when messages are allowed to send. Messages outside allowed hours should be queued for the next available time.

---

## **Integrations Tab**

Purpose: connect WarmChats to lead sources, calendars, CRMs, and tools.

Show:

* Connected integrations  
* Needs setup  
* Sync errors

Integrations should include:

* Zillow  
* Follow Up Boss  
* Meta Lead Ads  
* Google Calendar  
* Outlook Calendar  
* Calendly  
* Website forms  
* Other CRMs later

Each integration should have:

* Connect button  
* Disconnect button  
* Status  
* Last synced time  
* Error status

When connected, leads/events should sync automatically into WarmChats.

---

## **Action Plans Tab**

Purpose: manage automated follow-up playbooks.

Action Plans are multi-step automations triggered by lead events.

Examples:

* New Zillow Lead  
* Speed-to-Lead  
* Seller Valuation Nurture  
* Buyer Nurture  
* Cold Re-Engagement

Each action plan should show:

* Name  
* Channels: SMS / Email  
* Trigger  
* Number of steps  
* Leads enrolled  
* On/off toggle  
* Edit button

Action plans should automatically stop when a lead replies, books, opts out, or is manually paused.

---

## **Billing & Usage Tab**

Purpose: manage plan, subscription, payment, usage, and invoices.

Should include:

* Current plan  
* Plan status  
* Subscription renewal date  
* Upgrade/downgrade options  
* Cancel plan  
* Payment method  
* Usage this cycle  
* Invoices

Usage should track:

* Emails used  
* SMS used  
* Calling minutes used  
* AI actions used

If usage gets close to limit, show warning.

---

# **Main Goal**

Admin should let owners control the full workspace:

1. Who has access  
2. What integrations are connected  
3. What automations are running  
4. What plan they are on  
5. How much usage they have  
6. How notifications and quiet hours work

Everything should be simple enough for a solo agent but strong enough for teams and brokerages.

