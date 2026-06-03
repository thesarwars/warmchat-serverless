## **Phase 1: Leads Page Architecture (AI Command Center)**

**Goal:** Shift from a static spreadsheet to a reactive, queue-based AI workspace.

### **1\. Table Columns (Data Schema)**

The leads table state must map exactly to these columns.

| Column Name | Allowed Values / Logic |
| :---- | :---- |
| **Name** | Lead contact info / Avatar. |
| **Lead Type** | Buyer, Seller, Unknown, Both, Investor, Renter, Agent Referral |
| **Lead Status** | *(Renamed from Intent/Temperature)* Cold, Warm, Hot, Appointment, Active Client, Closed, Lost |
| **AI Status** | AI Active, AI Paused, Awaiting Reply, Human Takeover, Appointment Booked, AI Complete |
| **Source** | Zillow, Realtor.com, Open House, Cold Calling, Website, Google Ads, Facebook Ads, Instagram, Referral, Imported, Inbound SMS, Manual, CRM Import, Other |
| **Team** | Maps to assigned brokerage team. |
| **Assigned Agent** | Maps to user ID. |
| **Area** | Pulled from lead data. |
| **Budget** | \<$300k, $300k-$500k, $500k-$750k, $750k-$1M, $1M+ (Editable but defaults provided). |
| **Last Activity** | Human-readable timestamp calculation. |

### **2\. Filter System Engine**

Filters must be built to auto-update based on DB state changes. **Zero manual admin configuration.** \* **Static Filters:** System-defined dropdowns.  
\* *Lead Type, Lead Status, AI Status.*

* **Dynamic Filters:** Auto-populate based on database values.  
  * *Team / Assigned Agent / Office:* Fetch active lists. If a team is deleted or an agent is deactivated, they disappear from the filter.  
  * *Area:* Auto-generated and normalized from lead metadata. Cloudflare backend must deduplicate these (e.g., if 50 leads are in "Beverly Hills", it dynamically becomes an option).  
  * *Source:* Inherits static list, but dynamically appends custom string values (e.g., "TikTok Ads" or "Ylopo") if a lead is imported with them.  
* **Last Activity Filter Logic:** Frontend options that trigger backend queries against specific timestamps.  
  * *Created Today:* Matches created\_at to current day.  
  * *Created This Week:* Matches created\_at to last 7 days.  
  * *Last Reply / Last Activity:* Sorts/Filters by last\_reply\_at or last\_message\_at / updated\_at.  
  * *Uncontacted:* last\_reply\_at is null.  
  * *Inactive \> 7 Days:* last\_message\_at is older than 7 days.

### **3\. Quick AI Smart Buttons (The Differentiator)**

These must be multi-select toggle buttons that sit above the table. Clicking them updates the table's state instantly (combining with dropdown filters).

* Note: Remember to replace emojis with nice colorful icons

| Button | Color Logic | Backend Calculation Logic |
| :---- | :---- | :---- |
| **🔥 Hot Leads** | Red | lead\_status \=== 'Hot' OR high engagement/response speed. |
| **🚨 High Intent** | Red | Strong buying/selling intent flagged by AI parser. |
| **⚡ Needs Reply** | Yellow/Orange | Unread inbound messages && pending agent reply. |
| **🤖 AI Active** | Green | ai\_status \=== 'AI Active' |
| **❄️ No Response** | Blue | No reply after X follow-ups / timeframe. |
| **📅 Appointment Set** | Purple | lead\_status \=== 'Appointment' |
| **⏰ Follow-Up Due** | Neutral | follow\_up\_date \<= now() based on workflows. |
| **📞 Missed Calls** | Blue | Flagged missed inbound calls needing callback. |
| **🟣 AI Recommended** | Purple | AI predictive score (likely to convert/seller/high engagement). |

**Future-Proofing Note:** The frontend state management (like Redux or Zustand) needs to handle these combined filter states cleanly to eventually support saving them as "Smart Views" (e.g., saving a preset for *Luxury buyers in Beverly Hills \+ Inactive \> 5 days*).

## **Phase 2: Brokerage Architecture (Teams & Organization)**

Based on the provided wireframes, here is the structure required for the new Brokerage management pages.

### **1\. Teams Page**

* **Top KPIs:** Total Teams, Active Conversations, Appointments Booked, Pipeline Value, Conversion Rate.  
* **All Teams Table:**  
  * Columns: Team Name, Members (Stack UI), Active Leads, Appointments, Pipeline Value, Conv. Rate, Actions (...).  
* **Side Panel (Team Overview):**  
  * Selected Team Leader Profile.  
  * Team Stats (Active Leads, Conversations, Appointments, Pipeline Value, Conv. Rate, Avg Response Time).  
  * Recent Activity Feed (Event log for that specific team).  
* **Bottom Section:** Team Performance Overview (Line chart comparing conversion rates of different teams over time).

### **2\. Offices Page**

* **Top KPIs:** Total Offices, Total Agents, Active Conversations, Appointments Booked, Pipeline Value.  
* **All Offices Table:**  
  * Columns: Office Name/Image, Location, Teams (count), Agents (count), Active Leads, Pipeline Value, Conv. Rate.  
* **Side Panel (Office Overview):**  
  * Office Details (Address, Phone, Email, Time Zone).  
  * Office Performance (Month-to-date stats).  
  * Top Teams Leaderboard.  
* **Bottom Section:** Pipeline Overview (Area chart) and Active Leads by Office (Donut chart).

### **3\. Lead Routing (Workflow Page)**

1. **Top KPIs:** Total Leads Routed, Successfully Routed (%), Avg Routing Time, Active Rules, Leads Escalated.  
2. **Routing Workflow (React Flow / Node UI):**  
   * Visual if/then logic. Example: IF Source \= Zillow ➔ Route to Buyers Team (Round Robin).  
   * IF Property Price \>= $1M ➔ Route to Luxury Team.  
   * IF Current Time \= After 6PM ➔ Route to After Hours Team (ISA).  
3. **Routing Settings (Side Panel):** Assignment Method (Round Robin), Re-Route if No Response (Toggle \+ Timer), Max Re-Routes, Lead Cooldown periods.

### **4\. Users Page**

* **Top KPIs:** Total Agents, Active Conversations, Appointments, Avg Response Time, Pipeline Value, Conv. Rate.  
* **All Users Table:**  
  * Columns: User, Role (Admin, Team Leader, Agent, ISA), Team, Leads, Response Time, Status (Active, Away).

## **Backend Serverless Logic (Cloudflare Functions)**

To ensure the frontend stays fast and reactive, structure your Cloudflare worker functions as follows:

1. **Aggregated Metadata Endpoints:** Create a single lightweight endpoint that returns the deduplicated lists for Dynamic Filters (Areas, Teams, Users, Custom Sources). Do not make the frontend calculate this from 10,000 raw leads.  
2. **Filter Query Builder:** The endpoint needs to accept complex JSON payloads containing multiple filter states simultaneously (e.g., ai\_active: true, budget: '\>1M', last\_activity: 'created\_today').  
3. **Real-time Activity Calculations:** Timestamps (last\_reply\_at, last\_message\_at) must be indexed in your database so the "System Generated Filters" (like Needs Reply or No Response) resolve instantly without full table scans.

