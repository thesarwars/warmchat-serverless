# Automations - Frontend Integration Guide

This document tells the frontend exactly what to build to render the new
**Automations** page (the renamed Campaigns page) and how to wire it to the
backend endpoints that were just shipped.

The spec source is `docs/Automations.pdf`.

---

## 0. Naming + routing

- Rename the page from **Campaigns** -> **Automations** in the nav, page title,
  and any breadcrumbs. Backend URL prefix stays at `/campaigns/*` to avoid
  breaking existing integrations - only the UI label changes.
- The page must visually match the Warmchats UI shown in the spec: tabs on the
  **left corner** (`All`, `SMS`, `Email`), and the Sort dropdown on the **right
  corner**. Status is no longer in the toolbar - it has moved into the table
  row and the `Status` filter dropdown.

---

## 1. Page layout (5 blocks)

```
┌─ [Top KPI Row] Appointments booked · Conversations · Responses · Pipeline value ┐
│                                                                                  │
│ ┌─ [Filters + Tabs row]  All | SMS | Email                       Sort: Newest ▼┐ │
│ │                                                                              │ │
│ │ [Campaign table - see §3]                                                    │ │
│ │                                                                              │ │
│ │ [Bottom Dynamic Card - best campaign OR launch-first empty state - see §5]   │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
                                                          [+ New Campaign] (top right)
```

---

## 2. Top KPI row

**Endpoint:** `GET /campaigns/org/<org_id>/summary`

**Response:**
```json
{
  "appointments_booked": 12,
  "conversations": 87,
  "responses": 134,
  "pipeline_value": 2340000.00,
  "total_campaigns": 4,
  "has_campaigns": true
}
```

Render four cards in the order shown in the spec. Reuse the same formatters
the Dashboard already uses (currency for `pipeline_value`, integer for the
rest). Refetch when:
- the page mounts,
- the user creates / pauses / resumes / archives / launches a campaign.

Also use `has_campaigns` to decide which version of the bottom card to show
(see §5).

---

## 3. Campaign list / filters / sort

**Endpoint:** `GET /campaigns/org/<org_id>?channel=<all|sms|email>&status=<all|running|paused|draft>&type=<all|sms|email|sequence>&sort=<newest|reply_rate|contacts_sent>&include_archived=<0|1>`

All query params are optional. Defaults: `channel=all`, `status=all`,
`type=all`, `sort=newest`, `include_archived=0`.

**Each row in the response now includes:**

| field              | type          | notes                                                               |
| ------------------ | ------------- | ------------------------------------------------------------------- |
| `id`               | int           |                                                                     |
| `name`             | string        |                                                                     |
| `type`             | string        | derived: `"SMS"`, `"Email"`, or `"Sequence"` (= SMS + Email)        |
| `status`           | string        | `Running` / `Paused` / `Draft`                                      |
| `contacts_sent`    | int           | `len(campaign_leads)` - render directly                             |
| `reply_rate`       | float (0..1)  | already rounded to 4 dp; format as percent (e.g. `0.182` -> `18%`)   |
| `conversion_rate`  | float (0..1)  | format as percent                                                   |
| `delivered_count`  | int           |                                                                     |
| `opened_count`     | int           |                                                                     |
| `created` / `created_at` | ISO-8601 |                                                                     |
| `is_archived`      | bool          |                                                                     |
| `archived_at`      | ISO-8601/null |                                                                     |
| `channels`         | array         | raw values, e.g. `["Email","SMS"]`                                  |
| `timezone`         | string/null   | the campaign's saved tz                                             |

### Filters -> query params

| Toolbar control              | Query param | Values                                                |
| ---------------------------- | ----------- | ----------------------------------------------------- |
| Tabs (left corner)           | `channel`   | `all`, `sms`, `email`                                 |
| Type dropdown                | `type`      | `all`, `sms`, `email`, `sequence`                     |
| Status dropdown              | `status`    | `all`, `running`, `paused`, `draft`                   |
| Sort dropdown (right corner) | `sort`      | `newest`, `reply_rate`, `contacts_sent`               |
| "Show archived" toggle       | `include_archived` | `1` / `0`                                       |

### Row actions

| Action      | Endpoint                                                |
| ----------- | ------------------------------------------------------- |
| View details| `GET /campaigns/<id>/details` -> opens drawer (§4)       |
| Pause       | `POST /campaigns/pause/<id>`                            |
| Resume      | `POST /campaigns/resume/<id>`                           |
| Duplicate   | `POST /campaigns/duplicate/<id>`                        |
| Archive     | `POST /campaigns/<id>/archive` (or `PATCH`)             |
| Unarchive   | `POST /campaigns/<id>/unarchive` (or `PATCH`)           |

After any mutating action, refetch the list and the summary.

---

## 4. View Details drawer (right-side, ~450px wide)

When the user clicks **View Details**, open a right-side drawer **(not a new
page)**, ~450px wide and scrollable. Fetch:

**Endpoint:** `GET /campaigns/<id>/details`

**Response shape:**
```json
{
  "id": 42,
  "header": {
    "name": "Spring Buyer Leads",
    "status": "Running",
    "type": "Sequence",
    "is_archived": false,
    "created_at": "2026-04-22T15:01:00"
  },
  "stats": {
    "sent": 124,
    "delivered": 122,
    "opened": 96,
    "replied": 28,
    "replies_total": 41,
    "converted": 7
  },
  "rates": {
    "delivered_rate": 0.9839,
    "open_rate": 0.7742,
    "reply_rate": 0.2258,
    "conversion_rate": 0.0565
  },
  "message_preview": {
    "subject": "Are you still looking in Austin?",
    "body": "Hey {firstname}, ...",
    "channels": ["Email"],
    "attachments": []
  },
  "replies": [
    {
      "lead_id": 99,
      "name": "Sara Lee",
      "email": "sara@x.com",
      "last_reply_at": "2026-05-06T09:12:00",
      "last_reply_preview": "Yes - please call Friday afternoon",
      "thread_id": 17
    }
  ],
  "recipients": [
    { "id": 99, "name": "Sara Lee", "email": "sara@x.com",
      "status": "Buyer", "replies": 3,
      "last_activity": "2026-05-06T09:12:00" }
  ],
  "followups": [...]
}
```

### Drawer sections (top to bottom)

1. **Header** - `header.name` + Pause/Resume/Archive icons.
2. **Stats row** - render `stats.sent`, `stats.delivered`, `stats.opened`,
   `stats.replied` (4 cards).
3. **Performance rates** - render `rates.*` as percentages.
4. **Message preview** - show `subject` + `body`. If `channels` includes both
   `Email` and `SMS`, render a small toggle and re-use the same body for the
   SMS preview.
5. **Replies section** - list `replies[]`. Each row gets a **"Quick reply"**
   button. The button should open the inbox thread (`thread_id`) so the agent
   can reply inline.
6. **Recipients table** - `name | status | last_activity` (formatted as
   "2 days ago" or absolute date). Show `replies` as a badge on the row.

---

## 5. Bottom dynamic card

Driven by the `has_campaigns` flag returned by the summary endpoint (§2).

### Case 1 - `has_campaigns: true`
- Use `POST /campaigns/duplicate-best/<org_id>` for the **"Duplicate Best
  Campaign"** CTA. The endpoint returns the new (paused) duplicate's id and
  name; navigate to it (or refetch).
- Show stats from the campaign returned by `duplicate-best` (the response
  already includes id + name). For richer "best campaign" stats, frontend can
  compute the highest `reply_rate` row from the list response or call
  `GET /campaigns/<id>/details` for that campaign id.

### Case 2 - `has_campaigns: false`
- Headline: **"Launch your first campaign"**.
- One CTA: **"Create campaign"** -> opens the create wizard (§6).

### Top-right
- A persistent **`+ New Campaign`** button always visible - also opens §6.

---

## 6. Create Campaign wizard

A modal / multi-step flow with **4 screens**.

### Screen 1 - Name + Channel

UI:
- Text input: `Campaign Name`
- Channel toggles: `SMS 📱` and `Email 📧` - **both selectable**.
- CTA: `Continue ->`.

State (kept in the wizard, not yet sent to backend):
```ts
{ name: string, channels: ("SMS" | "Email")[] }
```

### Screen 2 - Select Audience (with **live counter**)

UI options (mutually-cumulative, mirror the spec's checkboxes):
- ☑ All Leads
- ☐ Buyer Leads
- ☐ Seller Leads
- ☐ New Leads
- ☐ Tags (multi-select dropdown)

**Live counter** above the CTA: `"X leads selected"` - must update in real
time as the user toggles options.

Counter endpoint: `POST /campaigns/org/<org_id>/audience/preview`

Body:
```json
{
  "all_leads": false,
  "buckets": ["buyer", "seller", "new"],
  "tag_ids": [3, 7],
  "lead_ids": []
}
```

Response:
```json
{ "count": 124, "lead_ids": [11, 12, 13, ...] }
```

`lead_ids` is capped at 1000 - use it to pass into the create payload on the
final screen so the backend has the exact selected list. If the user picked
"All Leads", you can omit `lead_ids` (the create payload accepts the same
`leads` shape it does today).

Debounce the call by ~250ms. Cancel in-flight requests when the user toggles
again.

### Screen 3 - Message + Templates **(most important)**

Top section - **Templates list** (existing endpoint
`GET /ai/templates` or whatever the codebase already exposes; reuse, do not
add a new one). Clicking a template auto-fills the message editor below.

Bottom section - **Message editor**:
- Insert button: `{firstname}` (inserts the literal token at the cursor).
- For SMS, show a live **character count** (reuse the existing SMS-segment
  helper on the frontend, or just count `body.length` and show a warning at
  160 chars).

**Follow-up blocks.** Each follow-up has the layout below - render the
actions in the **header row above the textarea**, aligned right, as small
secondary buttons (outline) except `⚡ AI Write` which is the soft-highlight
button.

```
Follow-Up #1                                    [⇅ move] [✕ delete]
Send after: [1] [Day]
─────────────────────────────────────────────────────────────────
 Message                Use Template │ ⚡ AI Write │ Personalize
 ┌───────────────────────────────────────────────────────────────┐
 │ <textarea>                                                    │
 └───────────────────────────────────────────────────────────────┘
```

**Reorder a follow-up block** (after the user drags or clicks the move
icons):
- `PATCH /campaigns/<id>/followups/reorder` with body
  `{ "order": [2, 0, 1] }` - must be a permutation of all current indexes.
  Note: this only applies once a campaign exists; **inside the wizard**,
  reorder client-side and submit the final `followups` array on Continue.

**Delete a follow-up** (post-create only):
- `DELETE /campaigns/<id>/followups/<index>`. Inside the wizard, delete
  client-side.

The campaign supports **both SMS and Email follow-ups** in the same
campaign. When `channels` includes both, render a per-block channel toggle.

### Screen 4 - Schedule + Time Zones

UI:
- Send-time picker per follow-up: `Send after [N] [Day|Hour|Minute]` and
  optional `at HH:MM`.
- **Workspace time zone** dropdown - populate from
  `GET /orgs/<org_id>/timezone` (returns `{ timezone, options[] }`).
- A "Use a different time zone for this campaign" override -> store in the
  wizard state and include as `timezone` in the create payload.

When the user changes the workspace time zone:
- `PUT /orgs/<org_id>/timezone` with body `{ "timezone": "America/Los_Angeles" }`
  (also accepts `PST`/`EST` shortcuts).
- Persist the workspace tz once and reuse for every following campaign
  until the user changes it again.

**Timezone auto-detect on signup**:
- On the signup page, detect the browser tz with
  `Intl.DateTimeFormat().resolvedOptions().timeZone` and submit it as the
  initial workspace tz the first time the user creates an org. Always allow
  a manual override.

### Submit (final CTA)

`POST /campaigns/`

Body shape (existing endpoint, plus the new optional `timezone` field):

```json
{
  "name": "Spring Buyer Leads",
  "channels": ["Email", "SMS"],
  "message": "Hey {firstname}...",
  "email_subject": "Quick question",
  "attachments": [],
  "sources": ["Buyer"],
  "leads": [{"id": 99, "email": "sara@x.com"}],
  "followups": [
    {
      "delay_days": 1,
      "message": "Following up...",
      "send_at": "09:00",
      "timezone": "America/Los_Angeles"
    }
  ],
  "email_sender_type": "personal",
  "timezone": "America/Los_Angeles"
}
```

Response: `{ "success": true, "id": <int> }`. Navigate to the new row in
the Automations table and refetch summary + list.

### Save as draft (optional)

If the user closes the wizard without finishing, offer **Save as draft**:
`POST /campaigns/draft` (same body shape - only `name` is required). The
campaign is created with `status = "Draft"` and won't send. To launch
later: `POST /campaigns/<id>/launch`.

---

## 7. Workspace timezone settings page

Add a `Timezone` row to the workspace settings UI:
- `GET /orgs/<org_id>/timezone` - read current value + render the option
  list returned by the backend.
- `PUT /orgs/<org_id>/timezone` with `{ "timezone": "<IANA name>" }`.

Show the current value formatted like `Eastern (EST/EDT)` using the
`label` from the `options[]` array.

---

## 8. Per-contact timezone

The backend now infers a contact's timezone from the area code on lead
create (US/Canada NANP only). Frontend changes:

- On the **Lead detail / edit** page, render the inferred `lead.timezone`
  next to the phone number (e.g. `(212) 555-1234 · Eastern`). Allow manual
  override by sending `timezone` in the lead-update payload.
- Inside the campaign wizard's audience preview, you may surface a small
  "12 of 124 contacts have unknown timezone - they'll use the workspace
  default" hint. (No new endpoint needed; check `lead.timezone` against the
  list you already have.)

---

## 9. Endpoint reference (cheat sheet)

| Method | Path                                                | Purpose                                      |
| ------ | --------------------------------------------------- | -------------------------------------------- |
| GET    | `/campaigns/org/<org_id>/summary`                   | Top KPI row                                  |
| GET    | `/campaigns/org/<org_id>?...filters`                | Campaign table list (with filters/sort)      |
| GET    | `/campaigns/<id>`                                   | Light single-campaign fetch                  |
| GET    | `/campaigns/<id>/details`                           | Drawer payload                               |
| POST   | `/campaigns/`                                       | Create + launch                              |
| POST   | `/campaigns/draft`                                  | Save as draft                                |
| POST   | `/campaigns/<id>/launch`                            | Flip Draft/Paused -> Running                  |
| POST   | `/campaigns/pause/<id>`                             | Pause                                        |
| POST   | `/campaigns/resume/<id>`                            | Resume                                       |
| POST   | `/campaigns/duplicate/<id>`                         | Duplicate                                    |
| POST   | `/campaigns/duplicate-best/<org_id>`                | Bottom card "Duplicate Best Campaign"        |
| POST   | `/campaigns/<id>/archive`                           | Archive                                      |
| POST   | `/campaigns/<id>/unarchive`                         | Unarchive                                    |
| POST   | `/campaigns/org/<org_id>/audience/preview`          | Wizard live "X leads selected" counter       |
| PATCH  | `/campaigns/<id>/followups/reorder`                 | Reorder saved follow-ups                     |
| DELETE | `/campaigns/<id>/followups/<index>`                 | Delete a saved follow-up                     |
| GET    | `/orgs/<org_id>/timezone`                           | Workspace timezone + dropdown options        |
| PUT    | `/orgs/<org_id>/timezone`                           | Update workspace timezone                    |

All endpoints require a JWT bearer token. Roles: most endpoints accept
`Owner / Manager / Representative`. `PUT /orgs/<id>/timezone` and
`POST /campaigns/duplicate-best/<id>` are restricted to `Owner / Manager`.

---

## 10. QA checklist

- [ ] Tabs `All / SMS / Email` filter the list correctly (verify
      `channel=all|sms|email` round-trip).
- [ ] Sort dropdown re-fetches with `sort=newest|reply_rate|contacts_sent`.
- [ ] Status column shows `Running` / `Paused` / `Draft` correctly.
- [ ] Reply Rate and Conversion % render as percentages (not raw 0..1).
- [ ] View Details drawer is ~450px and scrollable; replies section has a
      working Quick Reply button.
- [ ] Archive removes the row from the default view; `include_archived=1`
      brings it back.
- [ ] Bottom card flips between "Best Campaign" and "Launch your first
      campaign" based on `has_campaigns`.
- [ ] Wizard live counter updates as audience checkboxes toggle.
- [ ] `{firstname}` insert button drops the literal token at the cursor.
- [ ] SMS character count is visible whenever `SMS` is in `channels`.
- [ ] Workspace tz auto-detected at signup; manual override saves and
      reloads correctly.
- [ ] Saved drafts appear in the table with `Status: Draft` and don't send.
