# AI Agent Page — Full Component Spec

Complete implementation spec for the **AI Agent** page of WarmChats (an AI-run real-estate CRM). This is the control center where an agent configures their AI across three sub-tabs: **Inbound**, **Outbound**, and **AI Settings**. Single source file: `agents.jsx`, exporting `window.AgentPage`. Rendered when the route is the `ai` agent; `<AgentPage agentId="ai" go={…} />`.

Stack: **React 18 (inline JSX / Babel)**, all styling via a shared global `<style>` block (class prefix `wc-`) **plus** heavy use of inline `style={{}}` objects (modals/wizard especially). Icons via `<Icon name size />`. State via `const { useState: useAS, useEffect: useAE } = React;`.

---

## 0. Design tokens (CSS variables on `:root`)

```css
/* Primary — orange */
--accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
/* Secondary — sky blue */
--secondary:#0EA5E9; --secondary-strong:#0284C7; --secondary-soft:#E7F6FD;
/* Neutrals — cool gray */
--bg:#FFFFFF; --panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
--ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --muted:#A8AEBD; --ink-faint:#B4BAC6;
--line-strong:#D8D4CD; --mono:ui-monospace,"JetBrains Mono","SF Mono",Menlo,monospace;
--radius:14px;
--shadow-sm:0 1px 2px rgba(20,24,38,.05);
--shadow:0 4px 16px rgba(20,24,38,.07);
--shadow-lg:0 18px 50px rgba(20,24,38,.15);
/* Semantic accents */
--green:#0E9F6E; --green-bg:#E4F7EF; --blue:#0EA5E9; --blue-bg:#E7F6FD;
--violet:#7C5CFC; --violet-bg:#EEEAFE; --amber:#E08600; --amber-bg:#FCF0DC;
```

**Tone maps used in code:**
```js
const AGENT_TONE = { violet:{fg:'var(--violet)',bg:'var(--violet-bg)'}, blue:{fg:'var(--blue)',bg:'var(--blue-bg)'}, orange:{fg:'var(--accent-strong)',bg:'var(--accent-soft)'} };
const WF_TONES   = { orange:{bg:'var(--accent-soft)',fg:'var(--accent-strong)'}, blue:{bg:'var(--blue-bg)',fg:'var(--blue)'}, violet:{bg:'var(--violet-bg)',fg:'var(--violet)'}, green:{bg:'var(--green-bg)',fg:'var(--green)'} };
const TEMPLATE_CH= { sms:{label:'SMS',icon:'message',bg:'#5BB4E3',fg:'#fff'}, email:{label:'Email',icon:'mail',bg:'var(--accent)',fg:'#fff'} };
```

---

## 1. Page shell & layout

`AgentPage` root is `<div className="wc-page wc-agent wc-fade" key={agentId}>`. Three regions in order:

1. **Sub-tab bar** (`.wc-ai-subtabs`) — only when `agentId === 'ai'`.
2. **Stat strip** (`.wc-stats`) — hidden on the Settings sub-tab.
3. **Body** — switches on `subTab` (`inbound` | `outbound` | `settings`).

### 1a. Sub-tabs — `.wc-ai-subtabs`
Bottom-bordered row of 3 buttons (`.wc-ai-subtab`): **Inbound**, **Outbound**, **AI Settings** (settings has a `settings` icon). Active tab (`.is-on`) is **blue** (`--blue`) text + blue bottom-border (2px). Default `subTab` is `'inbound'`.

```css
.wc-ai-subtabs{display:flex;border-bottom:1px solid var(--line);margin-bottom:20px}
.wc-ai-subtab{padding:12px 16px;font-size:14px;font-weight:600;color:var(--ink-3);border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer}
.wc-ai-subtab.is-on{color:var(--blue);border-bottom-color:var(--blue)}
```

### 1b. Stat strip — `.wc-stats`
Flex row. On the `ai` agent it leads with a **status card** then the active sub-agent's stat cards (`NurtureStat`). The status card (`.wc-stat-status`) is a 140px fixed card with a 2px colored border — **blue** tint on Inbound (`.is-blue`), **orange** tint on Outbound (`.is-orange`) — containing label "Status", an ON/OFF row with a pulsing colored dot, and a `Toggle`.

```jsx
<div className={'wc-stat-status' + (subTab==='outbound'?' is-orange':' is-blue')}>
  <div className="wc-stat-status-label">Status</div>
  <div className="wc-stat-status-on" style={{color: subTab==='outbound'?'var(--accent-strong)':'var(--blue)'}}>
    <span className="wc-stat-status-dot" style={{background: …}} />{statusOn?'ON':'OFF'}
  </div>
  <Toggle on={statusOn} onChange={setStatusOn} />
</div>
```

`NurtureStat` card (`.wc-nstat`): label (uppercase 12px) → big value (`.wc-nstat-v`, 36px/800) → description (13px). Inbound shows 3 stats, Outbound shows 4 (see §6 data).

---

## 2. Shared primitives

| Component | Description |
|---|---|
| `Icon({name,size,className,style})` | the global icon set. Names used here: `bot, inbox, send, sparkles, layers, trending, edit, zap, home, refresh, star, route, arrowRight, chevronRight, chevronDown, more, copy, trash, check, minus, x, flame, bell, share, clock, calendar, calendarCheck, message, mail, plus, pencil, search, users, filter, settings, checkCircle, pause, play, file, pin, building, clipboard, user, alert, target, outbound`. |
| `Toggle({on,onChange})` | `.wc-toggle` pill switch, 40×22, knob slides 2→20px. `.is-on` = orange (`--accent`); inside a status card it's blue/orange-strong. Stops click propagation. |
| `PulseDot({on,color})` | `.wc-pdot` — solid core + animated expanding ring when `on`. Default green. |
| `Stat`, `NurtureStat` | stat cards (see §1b). |
| `ChannelPill({channel,size})` | rounded pill, `TEMPLATE_CH` colors (SMS=blue `#5BB4E3`, Email=orange), icon+label. `size="sm"` is smaller. |
| `ChannelToggle({value,onChange})` | segmented SMS/Email switch (`.wc-tpl-chtoggle`), active button takes the channel's bg/fg. |
| `VarText({text})` | renders `{{variable}}` tokens wrapped in `.wc-tpl-var` (highlighted chips); plain text otherwise. |
| `MsgBody({text})` | splits on `\n`; lines starting with `•` get `.wc-tpl-bullet`. |

---

## 3. INBOUND sub-tab

Body: `<div className="wc-agent-body">`.

### 3a. Header row
Left: a `.wc-tabs` bar with a single active tab **"Workflows"** + count badge (`.wc-tab-c`). Right: an orange primary button **"+ Create auto-response"** (opens the Auto-Response modal). Active tab underline is `--accent`.

### 3b. Auto-routing panel — `AutoRoutePanel` / `.wc-autoroute`
A gradient card (`linear-gradient(180deg,var(--line-soft),var(--panel))`) explaining leads self-route. Header: 38px accent-soft tile w/ `route` icon + title **"Leads route themselves"** + description. Below: a flex-wrap grid of pill rows (`.wc-autoroute-row`) — each `from` → `arrowRight` → `to` pill (accent-soft). Data:

```js
const AUTO_ROUTES = [
  {from:'Buyer', to:'Buyer Nurture', icon:'leaf', tone:'green'},
  {from:'Seller', to:'Seller Nurture', icon:'home', tone:'orange'},
  {from:'No Response', to:'Re-Engagement', icon:'refresh', tone:'blue'},
  {from:'Appointment Intent', to:'Booking Flow', icon:'calendarCheck', tone:'indigo'},
  {from:'Agent Requested', to:'Human Takeover', icon:'user', tone:'rose'},
];
```

### 3c. Workflow list — `WorkflowRow` (`.wc-wf-list` → `.wc-wf`)
Each row (`.wc-wf-row`, grid `1fr auto auto`):
- **Main button** (`.wc-wf-main`): a caret (`chevronRight`, rotates 90° when open), a colored icon tile (`.wc-wf-ic`, blue tone for inbound), the name, a green **Live** pill (`.wc-pill-live` with `PulseDot`), and a right-aligned "View flow"/"Hide flow" pill (`.wc-wf-view`).
- A `Toggle` for live on/off.
- A **"⋯" menu** (32px square button) → popover with **Duplicate** (copy icon) and **Delete** (red, trash icon). Delete opens a confirm modal.

**Expanded detail** (`.wc-wf-detail`): a "How This Flow Works" 3-box row — **Step 1: Trigger** (gray, joined `triggers`), → **Step 2: AI Action** (blue-tinted, `actions[0]`), → **Step 3: Result** (gray, `outcomes[0].label`). Boxes have a 3px left border accent.

**Delete confirm** (`.wc-modal-scrim` → `.wc-confirm`): trash icon tile, "Delete workflow?" title, "{name} will be removed. This can't be undone.", Cancel + red Delete (`.wc-confirm-del`).

### 3d. Create Auto-Response modal (inline-styled, 600px)
Fields, top→bottom:
1. **Goal** — radio list: `Qualify Lead`, `Book Appointment`, `Re-Engage Lead`, `Human Takeover`.
2. **Trigger** — `<select>`: New Lead / Website Form / Facebook Lead / Zillow Lead / Missed Call / Custom…. Choosing **Custom…** reveals a text input ("e.g. Lead texts the word TOUR") + helper + a **custom response message** textarea.
3. **AI Will** — 2-column checkbox grid, all checked: `Reply instantly, Qualify the lead, Build lead profile` / `Detect appointment intent, Book appointments, Notify agent when needed`.
4. **Advanced Settings** — Response Delay select (Immediately/5/15/30 min/1 hr), Channels select (SMS/Email/Both), Business Hours select (Any time / Custom hours → two `time` inputs).
Footer: Cancel + orange **Create**. On create, prepends a new workflow to `inboundList` and resets the form.

---

## 4. OUTBOUND sub-tab

Body `<div className="wc-agent-body">`. Header: `.wc-tabs` with two tabs — **Workflows** (count) and **Templates** — plus, on the Workflows tab, an orange **"+ Add workflow ▼"** split button.

### 4a. Add-workflow dropdown
Popover (320px) with two big options:
- **Start from scratch** (gray `+` tile) → opens the 3-step Create-Workflow wizard (`workflowMode='workflow'`).
- **Browse templates** (orange `layers` tile) → opens `BrowseTemplatesModal`.

### 4b. Workflows view — `OutboundCampaigns` → `CampaignCard` (`.wc-cmp`)
A list of campaign cards. Card anatomy:
- **Top** (`.wc-cmp-top`): icon tile (orange) + name + **Live** pill or **Draft** pill, subtitle `"{channel} · {steps}-step sequence · Enrolled {updated}"`. Right side: **View flow / Hide flow** text button, a **big pill toggle** (60×32, orange when live), and a **"•••" menu** (Duplicate / Delete-in-red).
- **Body** (`.wc-cmp-body`): a 3-box flow — **Trigger** box (`trigger.title`/`trigger.sub`) → **AI Follow-Up** box (clickable, toggles the flow drawer; turns orange when active) → **Outcome** box (a checklist `.wc-cmp-outcomes` of green-checked outcome labels). Then a stats group (`.wc-cmp-stats`, left-bordered): **Leads**, **Reply Rate**, **Appts**, a Live/Draft **status** w/ `PulseDot`, and **Last Updated**.
- **Flow drawer** (`.wc-cmp-flow`, shown when "View flow" active): header "Send sequence · N messages" + "Times in the lead's timezone", then a vertical timeline (`.wc-tpl-steps` → `.wc-tpl-step`): each step has a numbered node colored by channel, a meta line (`day` · instant-or-time · `ChannelPill`), and the message text via `VarText`. Messages come from `flowMessages(w)` which uses `w.messages` or synthesizes from `w.channels`/`FLOW_FALLBACK_SMS`/`FLOW_FALLBACK_EMAIL`/`FLOW_DAY_NUMS=[0,1,3,5,7,10,14,21]`; message 1 is "Send instantly", rest at `SEND_TIME='10:00 AM'`.

`.wc-cmp` card CSS highlights:
```css
.wc-cmp{border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:var(--shadow-sm)}
.wc-cmp-ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center}
.wc-cmp-name{font-size:16px;font-weight:800;letter-spacing:-.01em}
.wc-cmp-box{flex:1 1 130px;border:1px solid var(--line);border-radius:11px;padding:9px 12px}
.wc-cmp-box-l{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.wc-cmp-stats{display:flex;gap:24px;padding-left:20px;border-left:1px solid var(--line-soft)}
.wc-cmp-stat-v{font-size:21px;font-weight:800;font-variant-numeric:tabular-nums}
```

### 4c. Templates view — `TemplatesTab` → `TemplateCard` (`.wc-tpl-card`)
Header: "{N} templates · variables like {{first_name}} fill in automatically" + orange **"+ New template"**. Grid of cards. Each `TemplateCard`:
- **Top**: `ChannelToggle` (if the template has both SMS+email flows) or a `ChannelPill`; plus Edit (pencil) and Delete (red trash) icon buttons.
- Title, a meta line `"{stage} · {sent} SENT · {N} MSGS"`.
- A **first-message preview** block (subject+body for email, text for SMS, via `VarText`/`MsgBody`).
- **"View template / Hide template"** button → expands `TemplateFlow` (same timeline as the campaign drawer; email steps render Subject + body).
- **Edit** opens `TemplateEditModal`; **Delete** opens `ConfirmDelete`.

**Data:** `OUTBOUND_TEMPLATES` (t1–t9): Buyer Follow-Up, Buyer Appointment Push, Seller Follow-Up, Seller Appointment Push, Re-engagement Campaign, Open House Follow-Up, Cold Lead Nurture, Past Client, Long-Term Nurture. Each has `{id, channel, name, stage, sent, message, flow[], emailSent, emailFlow[]}`. `flow`/`emailFlow` items: `{day:'Day N', instant?:true, channel, text}` (SMS) or `{day, channel:'email', subject, body}`. Variables: `{{first_name}}`, `{{area}}`, `{{agent_name}}`.

### 4d. Template create/edit modals
- `TemplateCreateModal` — Channel toggle, Name, Category, a `Messages` list (`.wc-tpl-msgedit`): per message a numbered node, a "Send instantly" checkbox or Day + `time` input, an **AI assist** button (`tplAiDraft`), and subject(email)/text fields. "+ Add message", Cancel + **Create template** (disabled until valid).
- `TemplateEditModal` — same shape, pre-filled from the active flow; includes timezone select (PST/EST/CST/MST) per step via `tplParseHHMM`/`tplParseTZ`/`tplFmtTime` helpers. Save + Cancel.
- `ConfirmDelete` — trash tile, "Delete template?", bold name, Cancel + red Delete.

### 4e. Browse Templates modal — `BrowseTemplatesModal` → `WfTemplateCard`
Overlay modal: eyebrow "Create Workflow From Template", title "Choose a Template", a `ChannelToggle` to preview SMS vs Email, then a grid of `WfTemplateCard`s. Each card: tone-colored tile (per `WF_TEMPLATE_META`), name + `ChannelPill`, meta `"{N} steps · {runsLabel} · Stops on reply"`, **"Use template"** button, and a "View steps / Hide steps" expander showing each step with computed real dates (`stepDate(dayOffset(day))`, `SEND_TIME`). Using a template seeds the wizard (name, channel, opening message, follow-ups) and opens it at step 1.

---

## 5. Create-Workflow wizard (Outbound modal)

Full-screen scrim → centered 900px modal, max-height 90vh. Header: icon (`outbound` or `layers`) + title ("Create New Workflow" or "Create New Template"), close ✕, and a **progress bar** of segments (2 for template mode, 3 for workflow mode), filled in `--accent-strong`. State: `workflowStep`, `workflowMode`, `workflowName`, `workflowChannels`, `msgChannel`, `workflowMessage`, `emailSubject`, `workflowTiming`, `tplFollowUps`, plus audience state.

### Step 1 — Name & Channel
Big title + "Step 1 of N". A **Name** input (2px accent border, 80-char counter, helper text until non-empty). **Choose Channel**: two big selectable cards — **SMS** ("Fast replies", `message` icon, orange) and **Email** ("Rich content", `mail` icon, sky). Multi-select (`workflowChannels` array; always ≥1). Selected card gets a 2px accent border + a check badge. Below: two checkmark notes ("SMS – higher reply rate", "Email – better for long messages").

### Step 2 — Craft Your Message
Title "Craft Your Message" + "Step 2 of N". Single column of cards:

**(a) Who to enroll** (workflow mode only) — card with header ("Who to enroll" + `users` icon) and a right-side count pill showing `{audCount} selected` or `{audCount} leads match`. A segmented **mode toggle**: `Select leads` (check icon) | `Use filters` (filter icon).
- **Select leads** mode: a search input + a table (header row with tri-state select-all checkbox, "Source", "Type"; scrollable body of lead rows with avatar/initials, name, contact, source, and a Type badge — Seller=orange, others=sky). Footer "{n} of {total} leads selected for enrollment."
- **Use filters** mode: three chip groups —
  - **Lead type**: `WF_AUD_TYPES = ['Buyer','Seller','Investor','Renter']` (check chip when on).
  - **Stage**: `WF_AUD_STAGES = ['New Lead','Contacted','Engaged','Qualified','Appointment Set','Active Client','Under Contract','Closed','Lost']` — each chip shows a colored status dot (map in code) until selected, then a check.
  - **Filters**: `WF_AUD_FILTERS = ['Hot Leads','Needs Reply','Appointment Ready','Human Takeover','No Response 7 Days']` — checkbox-style chips.
  - A summary banner: "**{N} leads** currently match these filters (or '(no filter — everyone)'). New leads that match will be enrolled automatically as they come in."

Matching logic:
```js
const audMatch = WF_AUD_LEADS.filter(l =>
  (audSource.size===0 || audSource.has(l.source)) &&
  (audType.size===0   || audType.has(l.type)) &&
  (audStage.size===0  || audStage.has(l.stage)) &&
  (audFilter.size===0 || [...audFilter].every(f => (l.flags||[]).includes(f))));
```
Selected-chip style: `1.5px solid var(--accent-strong)` border + `#FFF1E8` bg + `--accent-strong` text. Unselected: `1.5px solid var(--line)` + panel bg + `--ink-2`.

**(b) Channel & Enrollment** summary card (2-col): "Channel" = joined channels, "Enrollment" = opt-in / N selected / N match.

**(c) Message card** — header "Initial Message" + live PST clock (`pstNow`, updates every second). A **Message Type** SMS/Email segmented toggle, **Add files** button, and an **AI Write** menu (`AIWriteMenu`). Email mode reveals a **Subject** input. A large textarea (2px accent border) + char/segment counter (`{len} chars · ⌈len/160⌉/5 segments`). **When to send the opening**: Instant | At a time toggle; "At a time" reveals date + time + timezone(PST/EST/CST/MST) controls. Then the **`FollowUpSequence`** component.

`AIWriteMenu` options (`AI_TONES`): Make professional, Make shorter, Make friendlier, Appointment push, Follow-up suggestion → fills message (and subject for email) via `aiToneText(tone)`.

`FollowUpSequence` — "Follow-Up Sequence (Optional)" + "Add Follow-Up". Empty state is a dashed box. Each follow-up card: "Follow-up {i+1}", a **date** input, a **time** input, a **timezone** select, a delete (trash) button; a **Message Type** SMS/Email toggle, **Add files**, **AI Write**; an email **Subject** (email only); and a message **textarea** (2px accent border). Plus a dashed "+ Add another follow-up" button. Follow-up shape: `{id, delay, unit, timing, time:'09:00', timezone:'PST', channel:'sms', message:'', date?, subject?}`.

### Step 3 — Review & Launch (workflow) / Review & Save (template)
Title + "Step 3 of 3". Sections:
1. **Stats grid** (4 cards): Enrollment="Opt-in" / Channel=joined / Follow-ups=count / Stop Rules="Reply + Appt".
2. **Message Flow — How This Workflow Runs** (`--line-soft` card): a vertical list of message cards — the **Opening message** then each **Follow-up N** — each with a channel-colored icon tile, a channel badge (SMS/Email), an optional **Subject** line, the quoted body (or italic "No message written yet"), and a **clock line** describing when it sends ("Sent immediately when the lead opts in" / "Sent at your scheduled opening time" / "{date} at {time} {tz}"). Cards joined by down-chevrons; the list ends with a green **"Workflow stops"** card ("when lead replies or when appointment booked"). *(Note: the "Lead opts in" trigger card and the TCPA card were intentionally removed.)*
3. **Send Timing**: a single selected radio card "Start Workflow — starts running immediately after you launch."
4. **Workflow Stop Rules**: two checked rows — "Stop follow-ups when lead replies", "Stop when appointment is booked".

**Footer**: Back (hidden on step 1) + a context CTA — **Continue →** (steps <last; disabled until name set on step 1), **Save Template** (template mode last step → prepends to `tplList`, switches to Templates tab), or **↳ Start Workflow** (workflow mode last step → closes wizard).

---

## 6. AI SETTINGS sub-tab — `AISettings`

Body `<div className="wc-agent-body wc-set">`.

### 6a. Head
Title "AI Settings" + subtitle "Configure how your AI assistant handles conversations and leads." Right: **Help** ghost button (checkCircle) + orange **Save Changes**.

### 6b. Master status — `.wc-set-status`
A banner: "AI Assistant" + an ON/PAUSED pill (`.wc-set-pill.is-on`), a status sentence, and a **Pause AI / Resume AI** button (pause/play icon). Controlled by `aiOn`.

### 6c. Settings grid — `.wc-set-grid` of `SetCard`s
`SetCard({title,desc,children})` = titled white card. Cards in order:

1. **Inbound AI** — split: left toggle panel (`SetToggleRow` ×4: Auto Reply, Lead Qualification, Appointment Booking, Human Takeover Detection); right side boxes: **Response Time** radios (Instant✓/30 Seconds/1 Minute/2 Minutes) and **Business Hours** (9:00 AM–7:00 PM, Mon–Sun, edit pencil).
2. **Outbound AI** — left toggles (Follow-Up AI, Lead Nurture, Re-engagement, Stop On Reply); right **Follow-Up Frequency** radios (Aggressive / Standard✓ "Recommended" / Light).
3. **AI Qualification** — two boxes: **Buyer Questions** (blue, checkbox list: Location, Price Range, Bedrooms, Timeline, Pre-Approved + "Edit Questions") and **Seller Questions** (orange: Property Address, Timeline, Reason For Selling, Expected Price, Already Listed).
4. **Appointment Rules** — box "Book Appointment When:" (Lead is qualified / asks to tour / requests pricing / requests consultation) + box "Calendar Connected" (Google Calendar, Connected ✓, Manage Calendars).
5. **Human Takeover** — a 2-col checkbox list (Lead requests human, AI confidence is low, legal question, Contract/agreement questions, Lead becomes frustrated, Urgent or sensitive issues) + a "Notification Method" select ("In-App + Email").
6. **Notifications** — `NotifRow` ×4 with tone-colored icon tiles + toggles: Hot Lead Alert (violet/flame), Appointment Ready (green/calendarCheck), Human Takeover Required (orange/user), Missed Appointment (blue/alert).
7. **AI Brain** — three boxes: **Tone** radios (Professional✓/Friendly/Casual), **Goals** checkboxes (Qualify Leads/Book Appointments/Nurture Relationships/Close Deals), **Custom Instructions** textarea (500-char max, char counter).
8. **Knowledge Base** — `KbRow` ×5: Agent Bio, Service Areas, Office Information, FAQ, Custom Documents — each with an icon, label, "Updated 2 days ago", and an edit pencil.

Sub-components: `SetToggleRow` (text + `Toggle`), `SetCheck` (checkbox; blue or accent `accent-color`), `SetRadioRow` (radio + label + optional desc), `NotifRow` (icon tile + text + `Toggle`), `KbRow`. Toggle state lives in one `tg` object: `{autoReply, leadQual, apptBook, humanDetect, followUp, nurture, reengage, stopReply, nHot, nAppt, nHuman, nMissed}` (all default true), updated via `set(key,val)`.

---

## 7. Data: agents & workflows

```js
const AGENTS = {
  assistant: { name:'AI Assistant', role:'Your control center', color:'violet', icon:'bot', statusOn:true, stats:[…4…], capabilities:[…4…] },
  inbound:   { name:'Inbound AI', role:'Lead qualification & routing', color:'blue', icon:'inbox', statusOn:false,
               stats:[{Conversations Today:14},{Qualified Leads:5},{Appointments Booked:1}],
               workflows:[{ id:'ib1', name:'New lead → instant reply', icon:'zap', live:true, runs:8,
                            triggers:['New lead added','Form submission','Inbound message'],
                            actions:['Send instant welcome','Qualify with questions','Route to right flow'],
                            outcomes:[{label:'Qualified → Book Appointment',tone:'green',icon:'check'},…] }] },
  outbound:  { name:'Outbound AI', role:'Multi-channel nurture campaigns', color:'orange', icon:'send', statusOn:true,
               stats:[{AI Actions Today:0},{Hot Leads:4},{Appointments Set:1},{Qualified Leads:4}],
               workflows:[ out1 'Cold Follow-Up', out2 'Open House Follow-Up', out3 'Cold Lead Nurture',
                           out4 'AI Follow up 5 step sequence', out5 'Past Client' ] },
};
```
Outbound workflow shape: `{id, name, icon, live, leads, reply, appts, updated, trigger:{title,sub}, channel, steps, channels:[], messages?:[{step,date,day,channel,text}], outcomes:[{label,tone,icon}]}`.

`WF_AUD_LEADS` (9 sample leads for enrollment) — each `{id, name, contact, source, type, stage, flags[]}`. Sources: Zillow/Facebook/Open House/Referral/Realtor.com. `wfInitials(name)` → 2-letter avatar initials.

---

## 8. UX / interaction notes
- **Single source of truth per list**: workflow/template lists held in `useAS` state; toggling `live`, duplicating, and deleting mutate via `setList([...])`.
- **Popovers** use a fixed full-screen invisible backdrop (`position:fixed;inset:0`) under the menu to capture outside-clicks.
- **Modals**: scrim click closes; inner panel `stopPropagation`. Wizard scrim is `rgba(0,0,0,0.5)`.
- **Live clock** (`pstNow`) ticks every second via `useAE` interval (cleaned up on unmount).
- **Selected chip / card pattern** everywhere: 1.5–2px `--accent-strong` border + `#FFF1E8`/`#fff8f5` bg + `--accent-strong` text, often with a check badge.
- **Channel color language is consistent**: SMS = orange/`message`, Email = sky-blue/`mail` (with `TEMPLATE_CH` using `#5BB4E3` for the pill bg).
- Hover states: subtle bg → `--line-soft`, cards lift with `--shadow`. Destructive actions are always red (`#E11D48`/`#DC2626`/`#FF6B35`) with a confirm step.

## 9. Acceptance checklist
- [ ] Three sub-tabs switch body; Settings hides the stat strip; status card tints blue (inbound) / orange (outbound).
- [ ] Inbound: auto-route panel, expandable workflow rows w/ 3-step explainer, ⋯ menu (duplicate/delete+confirm), Create Auto-Response modal with Custom trigger reveal.
- [ ] Outbound Workflows: campaign cards with toggle, view-flow drawer (timeline w/ channel pills + timing), ⋯ menu; "+ Add workflow" → scratch wizard or browse templates.
- [ ] Outbound Templates: grid of template cards w/ SMS/Email toggle, first-message preview, view/edit/delete, "+ New template" wizard.
- [ ] Wizard: 3 steps (2 for template), name-gated Continue, channel multi-select, audience (select-leads table + use-filters chips with live match count), message card with AI Write + timing + follow-up sequence, Review flow showing every message with channel + send time, ending in a green "Workflow stops" card.
- [ ] AI Settings: master pause, 9 setting cards exactly as listed, all toggles/radios/checks functional.
