# Plan: Leads Page + Teams/Offices/Lead Routing/Users Pages

## Context
Executing the plan defined in `docs/leads-teams-pages-plans/Leads + Teams pages.md`, based on the specs in `Leads page.md` and `Broker Push.md`.

**Goal:** Transform the existing Leads page into a brokerage-grade AI command center, and add four new brokerage management pages (Teams, Offices, Lead Routing, Users) under a new "Team" sidebar section. Mockup color schemes are **ignored** - keep WarmChats branding (orange/purple gradient).

---

## Codebase Context

| File | Role |
|---|---|
| `src/components/leads/constants.ts` | All dropdown/filter constants |
| `src/components/leads/types.ts` | TypeScript types incl. QuickFilterId |
| `src/components/leads/utils/leadDisplay.ts` | Display helpers (getIntent, getLeadType, pill classes, etc.) |
| `src/components/leads/utils/leadFilters.ts` | Client-side filter matchers |
| `src/components/leads/Leads.tsx` | Main Leads page component (2034 lines) |
| `src/App.tsx` | Route definitions |
| `src/components/SideBar.tsx` | Sidebar navigation |

---

## Phase 1: Leads Page Changes

### 1a. `src/components/leads/constants.ts`

**Expand existing constants:**

```ts
// Lead Type - add 4 new values
LEAD_TYPE_OPTIONS = ["Buyer", "Seller", "Unknown", "Both", "Investor", "Renter", "Agent Referral"]

// Lead Status (was INTENT_OPTIONS) - rename export alias, expand values
INTENT_OPTIONS = ["Hot", "Warm", "Cold", "Appointment", "Active Client", "Closed", "Lost"]

// AI Status - replace Completed with correct labels
AI_STATUS_OPTIONS = ["AI Active", "AI Paused", "Awaiting Reply", "Human Takeover", "Appointment Booked", "AI Complete"]

// Source - full list per spec
SOURCE_OPTIONS = [
  "Zillow", "Realtor.com", "Open House", "Cold Calling", "Website",
  "Google Ads", "Facebook Ads", "Instagram", "Referral",
  "Imported", "Inbound SMS", "Manual", "CRM Import", "Other"
]

// Quick Filters - expand from 4 to 9
QUICK_FILTERS = [
  { id: "hot",              label: "Hot Leads" },
  { id: "high_intent",     label: "High Intent" },
  { id: "needs_reply",     label: "Needs Reply" },
  { id: "ai_active",       label: "AI Active" },
  { id: "no_response",     label: "No Response" },
  { id: "appointment_set", label: "Appointment Set" },
  { id: "follow_up_due",   label: "Follow-Up Due" },
  { id: "missed_calls",    label: "Missed Calls" },
  { id: "ai_recommended",  label: "AI Recommended" },
]
```

### 1b. `src/components/leads/types.ts`

```ts
export type QuickFilterId =
  | "hot" | "needs_reply" | "ai_active" | "no_response"
  | "high_intent" | "appointment_set" | "follow_up_due"
  | "missed_calls" | "ai_recommended";
```

### 1c. `src/components/leads/utils/leadDisplay.ts`

- **`getLeadType`** - handle "both", "investor", "renter", "agent referral", "agent_referral"
- **`leadTypePillClass`** - add pill colours for new types (Both=indigo, Investor=emerald, Renter=cyan, Agent Referral=rose)
- **`getIntent`** - handle new lead status values: "appointment", "active client", "closed", "lost"
- **`intentPillClass`** - add pill colours (Appointment=purple, Active Client=emerald, Closed=teal, Lost=gray-200)
- **`getAiStatus`** - handle "awaiting reply", "human takeover", "appointment booked", "ai complete"
- **`aiStatusPillClass`** - add colours for new AI statuses

### 1d. `src/components/leads/Leads.tsx` - Major Updates

**Rename UI labels:**
- Filter dropdown label: `"Intent"` -> `"Lead Status"`
- Table column header: `"Intent"` -> `"Lead Status"`
- URL param: `status` stays (no breaking change)
- `intentToStatusParam` - extend to map "appointment", "active client", "closed", "lost" to same strings for API

**Add dynamic Team + Agent filter dropdowns:**
- New state: `teamFilters: string[]`, `agentFilters: string[]`
- New state: `showTeamMenu: boolean`, `showAgentMenu: boolean`
- New state: `dynamicTeams: string[]`, `dynamicAgents: {id:string, name:string}[]`
- Fetch teams from `GET /teams` (org-scoped), agents from `GET /auth/users` - both in a `useEffect` on mount; handle 404/error gracefully (empty list)
- Pass to `fetchLeads`: `params.set("teams", teamFilters.join(","))` and `params.set("agent_ids", agentFilters.join(","))`
- Sync to URL params: `teams`, `agents` keys
- Show in filter bar after existing dropdowns (before Area)

**Expand Quick Filter buttons to all 9 with Lucide icons:**

| id | Icon | Color when active |
|---|---|---|
| hot | Flame | red |
| high_intent | TrendingUp | red |
| needs_reply | Zap | orange |
| ai_active | Bot | emerald |
| no_response | Clock | slate |
| appointment_set | CalendarCheck | purple |
| follow_up_due | AlarmClock | gray |
| missed_calls | PhoneMissed | blue |
| ai_recommended | Sparkles | purple |

**Add Team + Assigned Agent table columns** (between AI Status and Source):
- `lead.team_name` or `lead.team` -> truncated text cell
- `lead.assigned_agent` or `lead.owner_name` -> avatar initials + name

**Icon helpers** - update the `leadTypeIcon`, `intentIcon`, `aiStatusIcon` JSX helpers to cover new values with coloured Lucide icons.

---

## Phase 2: New Brokerage Pages

### 2a. `src/components/team/TeamsPage.tsx` (new file)

Layout matching mockup structure with WarmChats branding:
- **Top KPI strip:** Total Teams | Active Conversations | Appointments | Pipeline Value | Conv. Rate
- **Main area (left 60%):** "All Teams" table - Team icon+name+desc, Members (avatar stack, max 3 + count), Active Leads, Appointments, Pipeline Value, Conv. Rate, `...` actions menu
- **Side panel (right 40%):** Selected team overview - team leader avatar+name+email, "Message" button, Team Stats grid (6 stats), Recent Activity feed (3 items)
- **Bottom:** "Team Performance Overview" - simple SVG/CSS multi-line sparkline comparing teams, using native CSS without recharts
- API: `GET /teams` with org_id; graceful empty state if not yet implemented

### 2b. `src/components/team/OfficesPage.tsx` (new file)

- **Top KPI strip:** Total Offices | Total Agents | Active Conversations | Appointments | Pipeline Value
- **Main area (left 60%):** Offices table - Office name/location, Teams count, Agents count, Active Leads, Pipeline Value, Conv. Rate, Actions
- **Side panel (right 40%):** Selected office details - address/phone/email/timezone, month KPIs (6 stats), Top Teams mini-leaderboard
- **Bottom (2 charts):** "Office Pipeline Overview" (line chart) + "Active Leads by Office" (donut) - rendered as simple CSS/SVG
- API: `GET /offices`; graceful empty state

### 2c. `src/components/team/UsersPage.tsx` (new file)

- **Top KPI strip:** Total Agents | Active Conversations | Appointments Booked | Avg Response Time | Pipeline Value | Conv. Rate
- **Users Table:** User avatar+name+email, Role badge (Admin/Team Leader/Agent/ISA), Team, Leads count, Response Time, Status (Active/Away dot)
- Subtabs: All Users | Agents | ISAs | Admins | Inactive
- API: `GET /auth/users` (already exists); filter by tab client-side
- Export button (CSV)

### 2d. `src/components/team/LeadRoutingPage.tsx` (new file)

- **Top KPI strip:** Total Leads Routed | Successfully Routed % | Avg Routing Time | Active Rules | Leads Escalated
- **Routing Workflow (left 60%):** Visual card-based if/then chain (no React Flow dependency - pure CSS/HTML):
  - Numbered rule cards with condition + arrow + destination team badge
  - "Active / Paused" toggle + "Edit Workflow" button
  - "+ Add New Rule" button at bottom
- **Routing Settings (right 40%):** Assignment Method dropdown | Re-Route toggle+timer | Max Re-Routes | Lead Cooldown | Notify Agent toggle | Real-time Activity feed
- API: `GET /lead-routing`; graceful empty state showing empty workflow + prompt to add first rule

---

## Phase 3: Routing + Navigation

### 3a. `src/App.tsx`

Add 4 lazy imports + 4 routes (Admin+Manager roles):

```tsx
const TeamsPage     = lazy(() => import("./components/team/TeamsPage"));
const OfficesPage   = lazy(() => import("./components/team/OfficesPage"));
const UsersPage     = lazy(() => import("./components/team/UsersPage"));
const LeadRoutingPage = lazy(() => import("./components/team/LeadRoutingPage"));

// Routes:
/team/users        -> UsersPage      (ADMIN, MANAGER)
/team/teams        -> TeamsPage      (ADMIN, MANAGER)
/team/offices      -> OfficesPage    (ADMIN, MANAGER)
/team/lead-routing -> LeadRoutingPage (ADMIN, MANAGER)
```

### 3b. `src/components/SideBar.tsx`

Add `"Team"` section (shown for ADMIN + MANAGER only) between main nav and settings:
```
TEAM
  Users          -> /team/users
  Teams          -> /team/teams
  Offices        -> /team/offices
  Lead Routing   -> /team/lead-routing
```

Icons: `Users2`, `UsersRound`, `Building2`, `GitFork` from lucide-react.

---

## File Change Summary

| File | Change Type |
|---|---|
| `src/components/leads/constants.ts` | Update |
| `src/components/leads/types.ts` | Update |
| `src/components/leads/utils/leadDisplay.ts` | Update |
| `src/components/leads/Leads.tsx` | Major Update |
| `src/components/team/TeamsPage.tsx` | **New** |
| `src/components/team/OfficesPage.tsx` | **New** |
| `src/components/team/UsersPage.tsx` | **New** |
| `src/components/team/LeadRoutingPage.tsx` | **New** |
| `src/App.tsx` | Update (4 routes) |
| `src/components/SideBar.tsx` | Update (Team section) |

---

## Design Constraints

- **No emoji in buttons** - use Lucide icons only
- **WarmChats branding** - orange-to-purple gradient (`from-orange-500 to-purple-500`), orange active states (`bg-orange-50`, `text-orange-600`)
- **No recharts/React Flow** - use CSS/SVG for charts; styled HTML cards for routing workflow
- **Graceful degradation** - if new API endpoints 404, show empty states with a "coming soon" or "no data yet" message, not errors
- **Backward compatibility** - URL param names remain unchanged (`status`, `ai_statuses`, etc.); new params added (`teams`, `agents`)

## Verification

1. Run `pnpm dev` and navigate to `/leads` - verify:
   - All 9 quick filter buttons visible with icons
   - Lead Status dropdown has 7 options (Hot -> Lost)
   - AI Status dropdown has 6 options (incl. Awaiting Reply, Human Takeover, etc.)
   - Source dropdown has 14 options
   - Lead Type has 7 options
   - Team + Assigned Agent filter dropdowns present (may be empty if API not ready)
   - Table shows Lead Status column header (not "Intent")
   - Team and Assigned Agent columns in table
2. Navigate to `/team/users` - Users page renders (empty state if no API data)
3. Navigate to `/team/teams` - Teams page renders
4. Navigate to `/team/offices` - Offices page renders
5. Navigate to `/team/lead-routing` - Lead Routing page renders
6. Sidebar shows "TEAM" section (visible when logged in as Admin/Manager)
7. Check TypeScript compiles: `pnpm lint-frontend`
