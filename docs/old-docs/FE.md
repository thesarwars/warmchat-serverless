# WarmChats Phase 1 - Frontend Integration Guide

This document covers everything a frontend developer needs to wire up the WarmChats AI follow-up features end-to-end.

**Base URL**: `https://<your-backend>` (e.g., `http://localhost:5001` in dev)

**Auth**: All endpoints below require a valid JWT in the `Authorization: Bearer <token>` header (except Telnyx webhooks, which Telnyx hits directly - frontend never calls those).

---

## Contents

1. [Lead types reference](#lead-types-reference)
2. [Create a lead (with manual-add gate)](#1-create-a-lead)
3. [Update a lead](#2-update-a-lead)
4. [Send a manual SMS (agent takeover)](#3-send-manual-sms-from-inbox)
5. [Send a booking message](#4-send-a-booking-message)
6. [Auto-response settings (including missed call)](#5-auto-response-settings)
7. [Lead fields available in the inbox](#6-lead-fields-reference)
8. [UI requirements per spec](#7-ui-requirements)
9. [End-to-end conversation example](#8-end-to-end-example)

---

## Lead types reference

The `lead_type` field on a Lead can be one of:

| Value        | When to use                                                      |
| ------------ | ---------------------------------------------------------------- |
| `buyer`      | Lead wants to buy a home                                         |
| `seller`     | Lead wants to sell                                               |
| `open_house` | Walked into / RSVP'd to an open house                            |
| `unknown`    | No clear signal yet - system will detect intent from first reply |

Each type triggers a different qualification flow and template. Send `null` or omit the field -> backend treats as `unknown`.

---

## 1. Create a lead

```
POST /leads/
```

### Request body

```json
{
  "first_name": "Sarah",
  "last_name": "Johnson",
  "phone": "+15558883344",
  "email": "sarah@example.com",
  "lead_type": "buyer",
  "source": "Form",
  "auto_followup_action": "send_now"
}
```

### Field reference

| Field                  | Type   | Required  | Notes                                                                      |
| ---------------------- | ------ | --------- | -------------------------------------------------------------------------- |
| `first_name`           | string | ✓         | Used in `{{first_name}}` template variable                                 |
| `last_name`            | string |           |                                                                            |
| `phone`                | string | ✓ for SMS | E.164 format preferred (`+15551234567`)                                    |
| `email`                | string |           |                                                                            |
| `lead_type`            | string |           | `buyer` / `seller` / `open_house` / `unknown`. Default = `unknown`         |
| `source`               | string |           | Free text. **Important:** value `manual` triggers manual-add gate behavior |
| `auto_followup_action` | string |           | See below - controls instant-reply behavior                                |

### The manual-add gate (key behavior)

When an agent **manually** adds an old lead, you must NOT auto-text them. Show a modal first:

```
Start AI Follow-Up?
[ Send now ]   [ Schedule ]   [ Don't send ]
```

Then pass the user's choice as `auto_followup_action`:

| User clicked | Send as `auto_followup_action`                                           |
| ------------ | ------------------------------------------------------------------------ |
| Send now     | `"send_now"`                                                             |
| Schedule     | `"schedule"` (also pass `scheduled_at` ISO 8601 - _deferred, see notes_) |
| Don't send   | `"dont_send"`                                                            |

### Defaults (when `auto_followup_action` omitted)

| Source                                                    | Default action |
| --------------------------------------------------------- | -------------- |
| `manual` / `Manual`                                       | `dont_send`    |
| Anything else (`Form`, `Inbound SMS`, integration names...) | `send_now`     |

So: **form-submitted leads auto-text without UI intervention. Manual-added leads require the modal.**

### Response - 201

```json
{
  "id": 42,
  "first_name": "Sarah",
  "lead_type": "buyer",
  "status": "New",
  "source": "Form",
  "phone": "+15558883344"
}
```

---

## 2. Update a lead

```
PUT /leads/<lead_id>
```

### Request body (any subset)

```json
{
  "first_name": "Sarah",
  "lead_type": "seller",
  "timeline": "next_month",
  "price_range": "650000",
  "area": "downtown",
  "notes": "Met at open house Saturday"
}
```

Use this when the agent edits the lead profile. Most fields are normally auto-filled by the qualification engine - manual edits are for corrections.

---

## 3. Send manual SMS from inbox

```
POST /messages/send
```

This is the endpoint behind the inbox compose box. **The backend automatically pauses qualification AI when this fires** (agent takeover rule).

### Request body

```json
{
  "to": "+15558883344",
  "body": "Hey Sarah, can you call me back when you have a chance?",
  "client_request_id": "unique-uuid-from-frontend",
  "lead_id": 42,
  "attachments": []
}
```

### Field reference

| Field               | Required           | Notes                                                                                    |
| ------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `to`                | ✓                  | Destination phone, E.164                                                                 |
| `body`              | ✓ (or attachments) | Message text                                                                             |
| `client_request_id` | ✓                  | Frontend-generated UUID for idempotency. Re-sending the same id returns the same message |
| `lead_id`           |                    | Optional but recommended - enables auto-pause of qualification                           |
| `attachments`       |                    | List of `{url, content_type}` for MMS (max 10)                                           |

### Response - 200

```json
{
  "id": "msg_abc123",
  "conversation_id": "conv_xyz",
  "status": "sending",
  "body": "Hey Sarah...",
  "direction": "outbound"
}
```

---

## 4. Send a booking message

```
POST /leads/<lead_id>/booking-message
```

The "Send Booking Message" button in the inbox calls this. **Also pauses qualification** automatically.

### Request body

```json
{
  "variation": "default",
  "body": "Optional custom message - overrides variation if present"
}
```

### Variations

The dropdown should show these 4 options:

| Key       | Label in UI  | Message text                                                                                                                                                 |
| --------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default` | Default      | Based on what you're looking for, it probably makes sense to connect for a few minutes. I can walk you through your options. When are you available to call? |
| `soft`    | Soft         | Makes sense to hop on a quick call. I can walk you through what's available. Are you available today or tomorrow at 1 or 2pm?                                |
| `value`   | Value-driven | I can walk you through your options and next steps. What day/time works best for a quick call?                                                               |
| `direct`  | Direct       | Let's do a quick call. I'll walk you through everything. What time works for you?                                                                            |

**Editable before send:** Render the selected variation in a textarea. When the agent hits Send, pass their edited text as `body` - that overrides `variation`.

### Response - 200

```json
{
  "ok": true,
  "variation": "default",
  "message": "Based on what you're looking for...",
  "lead_id": 42
}
```

### Errors

- `400` - Unknown variation key (response includes `valid_variations`)
- `403` - Lead is not in your org
- `404` - Lead not found
- `502` - Telnyx send failed (response includes `details`)

---

## 5. Auto-response settings

Each user has an `AutoResponseSettings` row controlling their AI follow-up behavior. Frontend needs to expose:

### Toggle: AI Follow-Up On/Off

Field: `enabled` (boolean)

### Toggle: Missed Call Auto-Response

Field: `missed_call_enabled` (boolean, default `true`)

**Subtext under the toggle (per spec):**

> Never miss a lead. Automatically follow up by text when you miss a call.

### Editable templates

| Setting field                 | Default value                                                                  | Used when                          |
| ----------------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| `instant_message`             | (configurable)                                                                 | Fallback instant reply             |
| `buyer_messages.instant`      | (configurable)                                                                 | Buyer lead instant reply           |
| `seller_messages.instant`     | (configurable)                                                                 | Seller lead instant reply          |
| `general_messages.instant`    | (configurable)                                                                 | Unknown/general lead instant reply |
| `open_house_messages.instant` | (configurable)                                                                 | Open house lead instant reply      |
| `missed_call_message`         | "Currently in an appointment. I will call you back shortly or text me please." | Missed call auto-reply             |

Each `*_messages` field is a JSON object with `instant`, `day1`, and `day3` keys.

**Edit-template UI:** standard edit modal with template text + variable hints (`{{first_name}}`, `{{agent_name}}`). Show a live preview.

_(Note: The CRUD endpoint for settings exists in the codebase - confirm path with backend or use whatever existing settings form already uses to read/write `AutoResponseSettings`.)_

---

## 6. Lead fields reference

These fields appear on every Lead and are surfaced in the inbox/profile view. Fields with ⚙️ are auto-filled by the qualification engine from inbound replies.

### Profile

| Field                     | Type   | Description                                                                                      |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `id`                      | int    |                                                                                                  |
| `first_name`, `last_name` | string |                                                                                                  |
| `phone`, `email`          | string |                                                                                                  |
| `lead_type`               | string | buyer/seller/open_house/unknown                                                                  |
| `source`                  | string | Form / Inbound SMS / manual / etc                                                                |
| `status`                  | string | New / Engaged / Cold (set automatically)                                                         |
| `timezone`                | string | E.g. `America/Los_Angeles` for PST, `America/New_York` for EST. Show as dropdown in lead profile |

### Captured from replies ⚙️

| Field              | Type                      | Filled by                                                                                                            |
| ------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `price_range`      | string (number-as-string) | Buyer Q1 - extracted from "650k", "$1.2m", "750,000"                                                                 |
| `timeline`         | string token              | Buyer Q2 / OH Q1 - `asap`/`next_week`/`this_month`/`next_month`/`next_few_months`/`6_months`/`next_year`/`exploring` |
| `pre_approved`     | boolean                   | Buyer Q3                                                                                                             |
| `area`             | string                    | Buyer free response                                                                                                  |
| `property_address` | string                    | Seller Q1                                                                                                            |
| `occupancy_status` | string                    | Seller Q2 - `owner_occupied`/`rented`/`vacant`                                                                       |
| `motivation`       | string                    | Seller Q3                                                                                                            |
| `financing_status` | string                    | Open House Q2                                                                                                        |
| `interest_level`   | string                    | Open House Q3                                                                                                        |

### Qualification state ⚙️

| Field                  | Type     | Values                                                         |
| ---------------------- | -------- | -------------------------------------------------------------- |
| `qualification_step`   | int      | 0 = not started, 1+ = current step                             |
| `qualification_status` | string   | `awaiting_reply` / `complete` / `paused_agent_takeover` / null |
| `last_reply_at`        | datetime | Set every inbound reply                                        |

**UI hint:** Show a "Qualified ✓" badge on the lead card when `qualification_status === 'complete'`. Show "AI Paused (agent active)" when `'paused_agent_takeover'`.

### Tags

`lead.tags` is an array of `{id, name}` objects. The system auto-attaches:

| Tag              | When                                                |
| ---------------- | --------------------------------------------------- |
| `Warm`           | Lead expressed buyer/seller intent or wants to book |
| `Cold`           | Lead said not interested / stop / just browsing     |
| `Booking Intent` | Lead wants to schedule a call                       |
| `hot_seller`     | Seller + Booking Intent combined                    |
| `Inbound SMS`    | Lead was auto-created from a text-in                |

Use these to drive segmentation filters in the inbox.

---

## 7. UI requirements per spec

### 7.1 Lead creation form

- `lead_type` selector: 4 options (Buyer / Seller / Open House / Unknown)
- **Manual add** button -> shows modal:
  - Title: "Start AI Follow-Up?"
  - 3 buttons: `Send now` / `Schedule` / `Don't send`
  - Selected -> pass `auto_followup_action` accordingly

### 7.2 Inbox conversation view

For each lead conversation, show:

- **Header**: lead name, lead_type badge, status badge, tags
- **Qualification badge** if `qualification_status === 'complete'`
- **"AI Paused" badge** if `qualification_status === 'paused_agent_takeover'`
- **Captured fields panel** (collapsible): price_range, timeline, pre_approved, etc. - anything non-null
- **"Send Booking Message" button**:
  - Click -> opens variation picker dropdown (4 options)
  - Selected -> preview text in editable textarea
  - Send -> `POST /leads/<id>/booking-message`

### 7.3 Settings page - AI Follow-Up section

- Toggle: AI Follow-Up On/Off
- Sub-section: Instant reply templates (one per lead_type)
- Sub-section: Follow-up templates (day1, day3) per lead_type
- Each template has Edit -> modal with text + preview

### 7.4 Settings page - Missed Call section

- Heading: "Missed Call Auto-Response"
- Subtext: "Never miss a lead. Automatically follow up by text when you miss a call."
- Toggle (default ON)
- Single editable message field
- Preview pane showing the current template

### 7.5 Calendly setup-call CTA

Below the AI follow-up settings section, render:

```
Need help setting this up?
[ Book setup call ]   ->   https://calendly.com/velasquezjojo7/30min
```

The button opens the Calendly link in a new tab.

### 7.6 Timezone selector

In lead profile, dropdown:

- Pacific Time (PT) -> `America/Los_Angeles`
- Eastern Time (ET) -> `America/New_York`

(More options can be added; spec lists PST/EST minimum.)

---

## 8. End-to-end example

**Scenario:** A buyer fills out the website form.

### Step 1 - Frontend submits form

```http
POST /leads/
{
  "first_name": "Marcus",
  "phone": "+15558881234",
  "lead_type": "buyer",
  "source": "Form"
}
```

Backend creates lead, schedules instant SMS for 30 seconds later, schedules follow-ups for +1h and next-day 10am.

### Step 2 - Lead replies 5 minutes later

Marcus texts back: "around 650k"

Inbox auto-refreshes. The lead now shows:

- `qualification_step: 2` (system asked Q1, now waiting for Q2 reply)
- `price_range: "650000"` (extracted from "650k")
- `tags: ["Warm"]`
- `status: "Engaged"`

### Step 3 - Conversation continues

Each reply auto-saves into a field, advances the step, sends the next question. After Q3 reply (`pre_approved` answered), the system sends the booking line and sets `qualification_status: "complete"`.

### Step 4 - Agent jumps in

If at any point the agent types a manual reply in the inbox, the AI stops automatically. Lead shows `qualification_status: "paused_agent_takeover"`. Agent owns the conversation from here.

### Step 5 - Manual booking message

Agent clicks "Send Booking Message", picks the `soft` variation, edits the text, hits send. SMS goes out, message logged in conversation.

---

## Common gotchas

1. **30-second delay on instant reply** - when frontend creates a lead, no SMS is visible in the inbox for ~30s. Show "AI scheduled to text..." status during that window.
2. **Phone format** - backend normalizes E.164 internally, but pass `+1...` style for safety.
3. **`client_request_id`** on `/messages/send` - must be unique per send attempt. Generate a UUID per Send button click.
4. **The 3-button modal is the frontend's job** - backend just honors whichever string you pass. Default to `dont_send` for manual sources to avoid accidents.
5. **Qualification state is on the Lead row** - to know where a conversation is, read `lead.qualification_step` and `lead.qualification_status`.

---

## Questions / unclear cases

- **What if a lead's intent is `unclear`?** System asks one clarifying General question. After that, if still unclear, the conversation stays in General flow. Agent can manually re-classify by editing `lead_type`.
- **Can agent resume AI after takeover?** Currently no UI for it (Phase 10 if needed). Manual approach: update lead to clear `qualification_status` via PUT.
- **What happens when a lead replies after `complete`?** System logs the reply but doesn't auto-respond. Agent handles manually.
