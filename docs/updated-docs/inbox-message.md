# WarmChats — Inbox "Messages" Tab — Complete Build Prompt

Build a real-estate CRM **Inbox / Messages** screen as a single React component (`Inbox`) rendered into a full-height app shell. It is an AI-assisted conversation cockpit laid out as a **3-column workspace** (conversation list · message thread · lead-intelligence panel) sitting under a 2-item tab bar (**Messages** / **Calls**). Reproduce every detail below exactly.

---

## 0. Global foundation (design tokens)

Load these fonts (Google Fonts):
- **Plus Jakarta Sans** (400/500/600/700/800) — UI/body font (`body` default).
- **Newsreader** (400/500/600) — serif accent (`.wc-serif`).
- **JetBrains Mono** (400/500) — monospace, tabular numbers (`.wc-mono`, clock, scores).

CSS custom properties on `:root`:
```css
:root{
  /* Primary — orange */
  --accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
  /* Secondary — light blue (sky) */
  --secondary:#0EA5E9; --secondary-strong:#0284C7; --secondary-soft:#E7F6FD;
  /* Neutrals — clean cool gray */
  --bg:#FFFFFF; --panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
  --ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --muted:#A8AEBD;
  --radius:14px;
  --shadow-sm:0 1px 2px rgba(20,24,38,.05);
  --shadow:0 4px 16px rgba(20,24,38,.07);
  --shadow-lg:0 18px 50px rgba(20,24,38,.15);
  /* Harmonized semantic accents */
  --green:#0E9F6E; --green-bg:#E4F7EF; --blue:#0EA5E9; --blue-bg:#E7F6FD;
  --violet:#7C5CFC; --violet-bg:#EEEAFE; --amber:#E08600; --amber-bg:#FCF0DC;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
#root{height:100%}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
```

Shared button primitives used inside this screen:
```css
.wc-primary{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:11px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 16px rgba(249,115,22,.28)}
.wc-primary:hover{background:var(--accent-strong)}
.wc-ghostbtn{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-size:14px;font-weight:600;color:var(--ink-2)}
.wc-ghostbtn:hover{border-color:#D9D5CE;color:var(--ink);box-shadow:var(--shadow-sm)}
```

Icons: a single `<Icon name size>` component rendering 24×24 stroke SVGs (stroke="currentColor", stroke-width ~2, no fill). Names used on this screen: `message, phone, sparkles, mail, paperclip, image, calendar, chevronDown, arrowUpRight, arrowRight, check, x, clock, checkDouble, eye, playCircle, bot, trending, flame, home, users, file, pin, video, bell, plus, inbound`.

---

## 1. App shell & outer layout

The whole screen is a flex column filling 100% height:
```css
.wc-inboxwrap{display:flex;flex-direction:column;height:100%;min-height:0}
```

### 1.1 Tab bar (Messages / Calls)
Left-aligned, sits on top, 1px bottom divider. Active tab = orange text + 2px orange underline.
```css
.wc-inbox-tabs{display:flex;justify-content:flex-start;gap:4px;padding:8px 16px 0;border-bottom:1px solid var(--line);background:var(--panel);flex:none}
.wc-inbox-tab{display:inline-flex;align-items:center;gap:7px;padding:11px 16px;margin-bottom:-1px;font-size:14px;font-weight:600;color:var(--ink-3);border-bottom:2px solid transparent}
.wc-inbox-tab .wc-icon{color:var(--ink-3)}
.wc-inbox-tab.is-on{color:var(--accent-strong);border-bottom-color:var(--accent)}
.wc-inbox-tab.is-on .wc-icon{color:var(--accent)}
```
Markup: two buttons — `Messages` (icon `message`, size 16) and `Calls` (icon `phone`, size 16). State `pane` ∈ `'messages' | 'calls'`, default `'messages'`. When `pane==='calls'` render a separate `CallsView`; otherwise render the 3-column `.wc-inbox` below.

### 1.2 The 3-column row
```css
.wc-inboxwrap .wc-inbox{display:flex;height:auto;flex:1;min-height:0;background:var(--panel)}
```
Children in order: **`.wc-ibx-list`** (fixed 330px) · **`.wc-ibx-thread`** (flex:1) · then the collapse **`.wc-intel-handle`** (20px) · **`.wc-ibx-intel`** (fixed 320px, conditionally rendered).

---

## 2. LEFT COLUMN — Conversation list (width 330px)

```css
.wc-ibx-list{width:330px;flex:none;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.wc-ibx-listhead{padding:14px 14px 10px;border-bottom:1px solid var(--line-soft)}
.wc-ibx-filters{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.wc-ibx-fchip{font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:99px;border:1px solid var(--line);background:var(--panel);color:var(--ink-2)}
.wc-ibx-fchip:hover{border-color:#D9D5CE;color:var(--ink)}
.wc-ibx-fchip.is-on{background:var(--accent);border-color:var(--accent);color:#fff}
.wc-ibx-convos{flex:1;overflow-y:auto;min-height:0}
```
- **Header** = just a row of filter chips (no search bar). Filters: `All, Needs Reply, Hot Leads, Buyers, Sellers`. Active chip = solid orange. `filter` state defaults to `'All'`.
- Filtering logic: `Needs Reply` → has `reply` badge; `Hot Leads` → has `hot` badge; `Buyers`/`Sellers` → `type` match; `All` → everything.

### 2.1 Conversation row (button)
```css
.wc-convo{display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;padding:13px 14px;border-bottom:1px solid var(--line-soft);position:relative;transition:.1s}
.wc-convo:hover{background:var(--line-soft)}
.wc-convo.is-active{background:var(--accent-soft)}
.wc-convo.is-active::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent)}
.wc-convo-av{width:38px;height:38px;border-radius:50%;background:#EEECE8;color:#9A938A;display:grid;place-items:center;font-size:13px;font-weight:700;flex:none}
.wc-convo-body{flex:1;min-width:0}
.wc-convo-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.wc-convo-name{font-size:14px;font-weight:700}
.wc-convo.is-unread .wc-convo-name{font-weight:800}
.wc-convo-time{font-size:11px;color:var(--ink-3);flex:none}
.wc-convo-badges{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:5px 0}
.wc-convo-stage{font-size:10px;font-weight:700;color:var(--ink-3);background:var(--line-soft);padding:2px 7px;border-radius:6px}
.wc-convo-last{font-size:12.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wc-convo.is-unread .wc-convo-last{color:var(--ink);font-weight:600}
.wc-convo-unread{flex:none;min-width:20px;height:20px;padding:0 6px;border-radius:99px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;align-self:center}
```
Each row: circular **initials avatar** (38px) · body (name + time on top line; mini badges + stage chip; truncated last message) · orange **unread count pill** (right, only if `unread>0`). Active row = soft-orange bg + 3px orange left rail. Empty state: `<div class="wc-task-empty">No conversations match.</div>`.

### 2.2 Badges
```css
.wc-cbadge{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px}
.wc-cbadge.mini{padding:2px 6px;gap:3px}   /* mini = icon only, no label */
```
Badge dictionary (icon / label / fg / bg):
- `hot` — flame / "Hot Lead" / #DC2626 on #FEE2E2
- `reply` — message / "Needs Reply" / #D97706 on #FEF3C7
- `appt` — calendar / "Appt Requested" / #4F46E5 on #ECEDFD
- `ai` — bot / "AI Handling" / #0D9488 on #E3F6F2
- `intent` — trending / "High Intent" / #7C3AED on #F2ECFE
- `overdue` — clock / "Overdue" / #DC2626 on #FEE2E2

In the list rows badges render `mini` (icon only); in the thread header they render full (icon + label).

---

## 3. CENTER COLUMN — Message thread (flex:1)

```css
.wc-ibx-thread{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;position:relative}
```
Three stacked regions: **head** (fixed) · **body** (scrolls) · **composer** (fixed).

### 3.1 Thread header
```css
.wc-thread-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line)}
.wc-thread-name{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:800;letter-spacing:-.01em}
.wc-thread-sub{display:flex;gap:6px;margin-top:6px;align-items:center}
.wc-thread-actions{display:flex;align-items:center;gap:14px}
```
- **Left block**: name + inline stage chip (`.wc-convo-stage`) on the name line; below it `.wc-thread-sub` containing the **AI On/Off toggle** (see 3.2) followed by any non-reply/non-hot/non-ai badges.
- **Right block** (`.wc-thread-actions`): the **AI-recommends card stack** (3.3) and a live **Clock** (3.4).

### 3.2 AI On/Off toggle (per-lead)
A small pill switch showing each lead's current AI status; click toggles it. Orange when on.
```css
.wc-ai-toggle{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;letter-spacing:.01em;color:var(--ink-3);transition:.15s}
.wc-ai-toggle.is-on{color:var(--accent-strong)}
.wc-ai-toggle-track{width:30px;height:17px;border-radius:99px;background:var(--line);position:relative;transition:.18s;flex:none}
.wc-ai-toggle.is-on .wc-ai-toggle-track{background:var(--accent)}
.wc-ai-toggle-knob{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(20,24,38,.3);transition:.18s}
.wc-ai-toggle.is-on .wc-ai-toggle-knob{transform:translateX(13px)}
```
Label reads `AI On` / `AI Off`. `role="switch"`, `aria-checked` bound to state. Initial per-lead state = whether the lead has the `ai` badge. Kept in an `aiState` map keyed by conversation id.

### 3.3 "AI recommends" action stack (in header, right)
```css
.wc-aiactions{display:flex;flex-direction:column;align-items:flex-end;gap:6px;padding:0;border:none;background:transparent}
.wc-aiactions-h{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--accent-strong)}
.wc-aiactions-row{display:flex;gap:9px}
.wc-aiaction{display:inline-flex;align-items:center;gap:9px;flex:0 0 auto;width:max-content;max-width:320px;padding:9px 13px;border-radius:12px;border:1px solid #FBE0CC;background:var(--panel);text-align:left;box-shadow:0 10px 26px -8px rgba(234,88,12,.34),0 2px 6px rgba(0,0,0,.06)}
.wc-aiaction:hover{box-shadow:0 8px 22px -6px rgba(234,88,12,.34),0 2px 4px rgba(0,0,0,.05);border-color:var(--accent)}
.wc-aiaction:hover .wc-aiaction-t{color:var(--accent-strong)}
.wc-aiaction-ic{width:30px;height:30px;border-radius:8px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
.wc-aiaction-t{font-size:13px;font-weight:700}
.wc-aiaction-r{font-size:11.5px;color:var(--ink-3);margin-top:1px}
```
Header `AI recommends` (sparkles icon). Then a row of floating, orange-shadowed action cards from the lead's `actions[]` — each = soft-orange icon tile + title + one-line reason. Clicking a `calendar` action opens the Book Appointment modal.

### 3.4 Clock
```css
.wc-clock{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--ink-2);background:var(--line-soft);border-radius:9px;padding:7px 12px;white-space:nowrap}
```
Live PST time, e.g. `1:26 PM PST`, updates every 15s; the time number uses `.wc-mono`.

### 3.5 Thread body (scroll area)
```css
.wc-thread-body{flex:1;overflow-y:auto;min-height:0;padding:20px;display:flex;flex-direction:column;gap:14px;background:#FBFAF8}
```
Auto-scrolls to bottom on conversation change / new message.

**(a) AI-created task banner** (optional, top of body):
```css
.wc-thread-task{display:flex;align-items:center;gap:11px;background:var(--panel);border:1px solid #FBE0CC;border-radius:12px;padding:11px 13px;box-shadow:var(--shadow-sm)}
.wc-thread-task-ic{width:32px;height:32px;border-radius:9px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
.wc-thread-task-b{flex:1;min-width:0}
.wc-thread-task-t{font-size:13px;font-weight:700}
.wc-thread-task-r{font-size:11.5px;color:var(--ink-3);margin-top:1px}
.wc-tbtn{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);display:grid;place-items:center;color:var(--ink-3);flex:none}
```
Sparkles tile + "AI created task · {title}" + reason, then a complete (✓) button and dismiss (✕) button.

**(b) Message bubbles.** Three special row types + normal bubbles:
```css
/* system pill (centered) */
.wc-msg-sys{display:flex;align-items:center;gap:10px;justify-content:center;color:var(--ink-3);font-size:11.5px;margin:4px 0}
.wc-msg-sys span{background:var(--line-soft);padding:4px 12px;border-radius:99px;font-weight:600}
.wc-msg-sys time{font-size:11px}
/* voicemail / call card */
.wc-msg-call{display:flex;align-items:center;gap:11px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px 13px;max-width:76%}
.wc-msg-call-ic{color:var(--accent-strong);flex:none}      /* playCircle, size 20 */
.wc-msg-call-b{font-size:13px;color:var(--ink)}
.wc-msg-call-b time{display:block;font-size:11px;color:var(--ink-3);margin-top:3px}
/* chat bubble */
.wc-msg{display:flex;flex-direction:column;max-width:74%}
.wc-msg.in{align-self:flex-start;align-items:flex-start}
.wc-msg.out{align-self:flex-end;align-items:flex-end}
.wc-msg-tag{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--accent-strong);margin-bottom:4px}  /* "AI Assistant" w/ sparkles */
.wc-msg-bub{font-size:13.5px;line-height:1.45;padding:10px 13px;border-radius:14px}
.wc-msg.in .wc-msg-bub{background:var(--panel);border:1px solid var(--line);border-bottom-left-radius:4px}
.wc-msg.agent .wc-msg-bub{background:var(--accent);color:#fff;border-bottom-right-radius:4px}
.wc-msg.ai .wc-msg-bub{background:rgb(193,238,255);color:rgb(62,58,76);border:1px solid #B4DEF5;border-bottom-right-radius:4px}
.wc-msg time{font-size:10.5px;color:var(--ink-3);margin-top:4px}
.wc-msg-foot{display:flex;align-items:center;gap:7px;margin-top:4px}
.wc-msg-foot time{margin-top:0}
.wc-msg-status{display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:600;color:var(--ink-3)}
.wc-msg-status .wc-icon{opacity:.85}
.wc-msg-status.is-lit{color:var(--accent-strong)}
```
Bubble sides: `who ∈ {lead}` → incoming (left, white); `who ∈ {agent}` → outgoing orange (right); `who ∈ {ai}` → outgoing **light-blue** (right) with an "AI Assistant" tag above. `system` → centered grey pill; `call` → bordered card with play icon. Outgoing agent/ai bubbles show a delivery-status footer.

**Message status dictionary** (icon / label / lit):
`sending` clock "Sending…" (off) · `sent` check "Sent" (off) · `delivered` checkDouble "Delivered" (off) · `read` checkDouble "Read" (lit, appends "· {readTime}") · `seen` eye "Seen" (lit).

### 3.6 Composer (fixed bottom)
```css
.wc-composer{border-top:1px solid var(--line);padding:12px 16px 14px;background:var(--panel)}
.wc-composer-tabs{display:flex;align-items:center;gap:4px;margin-bottom:10px}
.wc-composer-tabs>button{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink-2)}
.wc-composer-tabs>button:hover{background:var(--line-soft)}
.wc-composer-tabs>button.is-on{background:var(--accent-soft);color:var(--accent-strong)}
.wc-composer-spacer{flex:1}
.wc-assistwrap{position:relative}
.wc-assistbtn,.wc-bookbtn{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:9px;font-size:12.5px;font-weight:600;border:1px solid var(--line);background:var(--panel);color:var(--ink-2)}
.wc-assistbtn{color:var(--accent-strong);border-color:#FBE0CC;background:var(--accent-soft)}
.wc-assistbtn:hover,.wc-bookbtn:hover{box-shadow:var(--shadow-sm)}
.wc-assistmenu{position:absolute;bottom:42px;left:0;width:210px;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-lg);padding:6px;z-index:20}
.wc-assistmenu button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:9px 10px;border-radius:8px;font-size:13px;font-weight:600;color:var(--ink-2)}
.wc-assistmenu button:hover{background:var(--line-soft);color:var(--ink)}
.wc-assistmenu button .wc-icon{color:var(--accent-strong)}
.wc-composer-input{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px}
.wc-email-subj{width:100%;height:38px;border:1px solid var(--line);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;color:var(--ink);outline:none}
.wc-email-subj:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-composer-input textarea{flex:1;min-height:44px;max-height:120px;border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:13.5px;font-family:inherit;resize:none;outline:none;color:var(--ink)}
.wc-composer-input textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-composer-input .wc-primary{height:44px;flex:none}
```
**Toolbar row** (`.wc-composer-tabs`), left→right:
1. **SMS** button (icon `message`) — channel toggle, soft-orange when active.
2. **Email** button (icon `mail`) — channel toggle.
3. `.wc-composer-spacer` (pushes the rest right).
4. **Attach file** (`.wc-bookbtn`, icon `paperclip`).
5. **Add image** (`.wc-bookbtn`, icon `image`).
6. **AI Assist** (`.wc-assistbtn`, sparkles + chevronDown) — opens an upward popup menu of rewrite options: `Make professional, Make shorter, Make friendlier, Appointment push, Follow-up suggestion`. Selecting one replaces the draft text.
7. **Book Appointment** (`.wc-bookbtn`, icon `calendar`) — opens the modal (section 5).

**Input row** (`.wc-composer-input`):
- If channel = Email, a full-width **subject** input appears first (`Subject — to {email}`).
- A growing **textarea** (placeholder `Message {name}…` or `Write an email to {name}…`). Cmd/Ctrl+Enter sends.
- **Send {channel}** primary button (icon `arrowUpRight`), disabled when draft empty.

**Send behavior:** append an outgoing bubble with status `sending`, then transition `sent` (600ms) → `delivered` (1600ms) → `read`/`seen` (3400ms) via timeouts; clear the draft.

---

## 4. RIGHT COLUMN — Lead intelligence panel (width 320px, collapsible)

### 4.1 Collapse handle (20px rail, always visible)
```css
.wc-intel-handle{width:20px;flex:none;border-left:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:var(--ink-3);cursor:pointer;transition:.12s}
.wc-intel-handle:hover{background:var(--line-soft);color:var(--accent-strong)}
.wc-intel-grip{width:3px;height:30px;border-radius:3px;background:#DAD6CF}
```
Contains a grip bar + `arrowRight` icon (rotated 180° when collapsed). Toggles `intelOpen`.

### 4.2 Panel
```css
.wc-ibx-intel{width:320px;flex:none;border-left:1px solid var(--line);overflow-y:auto;min-height:0;padding:18px 16px 40px}
.wc-intel-id{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.wc-intel-av{width:46px;height:46px;border-radius:50%;background:#EEECE8;color:#9A938A;display:grid;place-items:center;font-size:16px;font-weight:700;flex:none}
.wc-intel-name{font-size:17px;font-weight:800;letter-spacing:-.01em}
.wc-intel-last{font-size:12px;color:var(--ink-3);margin-top:2px}
.wc-intel-sec{margin-bottom:18px}
.wc-intel-sech{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3);margin-bottom:9px}
.wc-irow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line-soft);font-size:13px}
.wc-irow:last-child{border-bottom:none}
.wc-irow span{color:var(--ink-3)}
.wc-irow b{font-weight:700;text-align:right}
.wc-irow b.ok{color:#16A34A}
.wc-intel-add{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--accent-strong);margin-top:6px}
.wc-notes-ta{width:100%;min-height:80px;border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:13.5px;font-family:inherit;line-height:1.5;color:var(--ink);resize:vertical;outline:none}
.wc-notes-ta:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
```
Stacked sections (each `.wc-intel-sec` with an uppercase `.wc-intel-sech` heading and `.wc-irow` label/value rows):

1. **Identity header** — 46px avatar + name + "Last contact {lastComm}".
2. **Lead Information** — Phone, Email, optional Address (with inline "＋ Add address" editor that commits on Enter/blur, cancels on Esc), Source, Stage.
3. **Buyer Information** *(if type Buyer)* — Budget, Area, Timeline, Pre-Approved (value turns green when "Yes"). **Seller Information** *(else)* — Address, Est. Value, Timeline.
4. **Notes** — a full-width textarea (`.wc-notes-ta`).
5. **Call history** — list of call cards:
```css
.wc-cc-calls{display:flex;flex-direction:column;gap:9px}
.wc-cc-call{display:flex;align-items:center;gap:11px;border:1px solid var(--line);border-radius:12px;padding:11px 13px}
.wc-cc-call-ic{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none}
.wc-cc-call-ic.is-out{color:#EA580C;background:#FFF3EA}   /* outbound — orange */
.wc-cc-call-ic.is-in{color:#EA580C;background:#FFF3EA}    /* inbound  — orange */
.wc-cc-call-b{min-width:0}
.wc-cc-call-t{font-size:13.5px;font-weight:700;color:var(--ink)}
.wc-cc-call-st{font-weight:500;color:var(--ink-3)}
.wc-cc-call-s{font-size:12px;color:var(--ink-3);margin-top:2px}
```
Each: square icon tile (outbound icon `arrowUpRight`, inbound icon `inbound`, both orange) + "{Direction} · {status}" + "{timestamp} · {duration}". Sample data: Outbound/completed 6/9/2026 1:26:41 PM 0:00; Inbound/completed 6/6/2026 12:44:46 PM; Outbound/completed 6/6/2026 12:41:42 PM; Outbound/initiated 6/6/2026 11:25:42 AM.
6. **Per-Contact Notifications** — two clickable rows, each toggles its channel on/off:
```css
.wc-cc-notif{display:flex;flex-direction:column;gap:10px}
.wc-cc-notifrow{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:12px;padding:13px 15px;width:100%;text-align:left;cursor:pointer;transition:.12s}
.wc-cc-notifrow:hover{border-color:var(--ink-faint)}
.wc-cc-notif-t{font-size:14px;font-weight:700;color:var(--ink)}
.wc-cc-notif-s{font-size:12px;color:var(--ink-3);margin-top:2px}
.wc-cc-bell{} .wc-cc-bell.is-on{color:var(--accent)} .wc-cc-bell.is-off{color:var(--muted)}
```
Row 1 "Email Notifications" / "0 unread emails" (or "Notifications off"); Row 2 "SMS Notifications" / "0 unread SMSs". Trailing `bell` icon (size 18): orange when on, muted when off.

---

## 5. Book Appointment modal

Triggered from the composer's **Book Appointment** button (or any `calendar` AI-action). Centered, scrim-dimmed, scrollable.
```css
.wc-modal-scrim{position:fixed;inset:0;background:rgba(24,28,40,.34);backdrop-filter:blur(2px);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:56px 20px;overflow-y:auto}
.wc-modal{width:560px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-lg);padding:24px 26px 20px;position:relative;animation:fadeUp .25s}
.wc-bookmodal{width:600px}
.wc-modal-x{position:absolute;top:18px;right:18px;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:var(--ink-3)}
.wc-modal-x:hover{background:var(--line-soft);color:var(--ink)}
.wc-book-h{font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.wc-book-sub{font-size:13px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin:2px 0 18px;padding-bottom:16px;border-bottom:1px solid var(--line-soft)}
.wc-book-lbl{font-size:14px;font-weight:800;color:var(--ink);margin:16px 0 9px}
.wc-book-opt-sub{font-weight:500;color:var(--ink-3)}
.wc-book-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.wc-book-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.wc-book-opt{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px 8px;border:1.5px solid var(--line);border-radius:12px;font-size:13px;font-weight:700;color:var(--ink-2);transition:.12s}
.wc-book-opt .wc-icon{color:var(--ink-3)}
.wc-book-opt:hover{border-color:var(--ink-faint)}
.wc-book-opt.is-on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-strong)}
.wc-book-opt.is-on .wc-icon{color:var(--accent)}
.wc-book-opt-row{flex-direction:row;gap:8px;padding:13px 8px}
.wc-book-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.wc-book-notehead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:16px 0 9px}
.wc-book-count{font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.wc-book-confirm{display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;border:1.5px solid var(--line);border-radius:12px;padding:13px 15px;transition:.12s}
.wc-book-confirm.is-on{border-color:var(--accent);background:var(--accent-soft)}
.wc-book-check{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--line);display:grid;place-items:center;color:#fff;flex:none;margin-top:1px}
.wc-book-confirm.is-on .wc-book-check{background:var(--accent);border-color:var(--accent)}
.wc-book-confirm-t{font-size:13.5px;font-weight:700;color:var(--ink)}
.wc-book-confirm-s{font-size:12px;color:var(--ink-3);margin-top:2px}
.wc-book-foot{display:flex;gap:12px;margin-top:22px;padding-top:18px;border-top:1px solid var(--line-soft)}
.wc-book-cancel{flex:1;justify-content:center}
.wc-book-submit{flex:2;justify-content:center}
.wc-modal-input{width:100%;height:40px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font-size:14px;font-family:inherit;color:var(--ink);background:var(--panel);outline:none}
.wc-modal-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-modal-textarea{width:100%;min-height:72px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px;font-family:inherit;color:var(--ink);resize:vertical;outline:none}
```
Contents, top→bottom:
- Title **Book Appointment** + subtitle **for {name}**, X close (top-right).
- **Appointment Type** — 4-up grid of vertical cards (icon + label): `Showing` (home), `Call` (phone), `Buyer Consult` (users), `Listing Appt.` (file). Default `Showing`.
- **Date** + **Time** — two inputs side by side (`type=date`, `type=time`; time default `14:00`).
- **Location / Meeting Type** — 3-up grid of horizontal cards: `In Person` (pin), `Phone Call` (phone), `Google Meet` (video). Default `In Person`.
- **Address / Meeting link / Phone number** — single input whose label + placeholder change with the chosen location (In Person→Address "123 Main St"; Google Meet→Meeting link "Auto-generated on booking"; Phone Call→Phone number "(555) 000-0000").
- **Notes (optional)** — textarea, maxlength 250, with a live `n/250` counter in the heading row.
- **Confirmation** — a toggle card "Send confirmation to {name}" / "Text & email the appointment details automatically." with a square check that fills orange when on (default on).
- **Footer** — ghost **Cancel** (flex 1) + primary **Book Appointment** (flex 2, icon `calendar`).
- Selecting any option highlights it orange (`.is-on`). Submitting appends a system message to the thread, e.g. `Showing booked — Sun, Jun 14 at 2:00 PM · In Person · added to Calendar, Tasks & lead profile`, and closes the modal. Clicking the scrim, Cancel, or X closes without booking.

---

## 6. Data model

```js
// Conversation
{ id, name, type:'Buyer'|'Seller', stage, source, phone, email,
  last, time, unread, badges:[...keys], lastComm,
  // buyer: budget, area, timeline, preApproved, score
  // seller: address, estValue, timeline
  summary, suggested,
  actions:[{ icon, title, reason, prio }],
  task:{ title, reason } | null,
  messages:[ M(who, text, time, opts) ] }

// Message  who ∈ 'system'|'ai'|'lead'|'agent'|'call'
// opts: { ch:'sms'|'email', status, readTime, vm, _id }
```
Seed ~5 conversations (e.g. John Smith — Buyer/Qualified/Zillow, hot+reply; Sarah Jones — Buyer/New Lead/Open House, reply; Mike Johnson — Buyer/Engaged, ai+intent; Emily Davis — Seller/Engaged, reply+intent; Marcus Reed — Seller/New Lead, overdue voicemail). Default `activeId` = first.

---

## 7. State & behavior summary
- `pane` (messages/calls), `filter`, `activeId`, `convos` (cloned seed), `draft`, `chan` (SMS/Email), `assistOpen`, `apptOpen`, `intelOpen` (default true), `notif {email,sms}`, `aiState` (per-lead bool map), `addrMap`/`addrEdit` (inline address editing).
- Selecting a list row sets `activeId` and the center/right columns react.
- Thread auto-scrolls to bottom on lead switch and on new messages.
- Sending simulates SMS/email delivery status progression.
- AI Assist rewrites the draft; Book Appointment posts a confirmation system message.
- The right panel collapses/expands via the 20px handle.

## 8. Responsive design (REQUIRED)

The screen is a 3-pane desktop workspace that must degrade gracefully to tablet and phone. Treat the panes as a **priority stack**: the **thread (center) is primary**, the **list (left) is secondary**, the **intel panel (right) is tertiary**. As width shrinks, drop tertiary first, then make secondary an overlay.

### 8.1 Breakpoints
| Token | Range | Layout |
|---|---|---|
| **Desktop XL** | ≥ 1280px | All three panes visible side by side (list 330 · thread flex · intel 320). |
| **Desktop** | 1024–1279px | Intel panel **narrows to 280px**; if still tight it collapses to the 20px handle (off by default). List 300px. |
| **Tablet** | 768–1023px | **Two panes**: list (288px) + thread. Intel panel becomes a **right-side drawer** (slide-over) opened from a header button; the 20px rail is replaced by an avatar/info button in the thread header. |
| **Phone** | < 768px | **Single pane at a time.** Show the list as the root view; tapping a conversation slides the thread in full-screen with a back button; intel panel opens as a **bottom sheet** (or full-screen sub-view). Composer is sticky to the bottom. |

### 8.2 Core technique
Drive layout with container width, not just viewport. Use CSS (and optionally a `ResizeObserver`/`matchMedia` to set a `data-bp="xl|lg|md|sm"` attribute on `.wc-inboxwrap` for JS-controlled pane visibility). Base rules:

```css
/* default = desktop XL (already specified above) */

/* Desktop ≤1279 */
@media (max-width:1279px){
  .wc-ibx-list{width:300px}
  .wc-ibx-intel{width:280px}
}

/* Tablet ≤1023: intel becomes an off-canvas drawer */
@media (max-width:1023px){
  .wc-ibx-list{width:288px}
  .wc-intel-handle{display:none}
  .wc-ibx-intel{
    position:absolute;top:0;right:0;height:100%;width:340px;max-width:88vw;
    background:var(--panel);border-left:1px solid var(--line);
    box-shadow:var(--shadow-lg);transform:translateX(100%);
    transition:transform .26s cubic-bezier(.4,0,.2,1);z-index:40
  }
  .wc-inboxwrap[data-intel="open"] .wc-ibx-intel{transform:none}
  /* dim scrim behind the drawer */
  .wc-intel-scrim{position:absolute;inset:0;background:rgba(24,28,40,.34);
    backdrop-filter:blur(2px);z-index:35;opacity:0;pointer-events:none;transition:.2s}
  .wc-inboxwrap[data-intel="open"] .wc-intel-scrim{opacity:1;pointer-events:auto}
  /* show a "lead info" button in the thread header at this size */
  .wc-thread-infobtn{display:inline-flex}
}

/* Phone ≤767: one pane at a time */
@media (max-width:767px){
  .wc-inbox{position:relative}
  .wc-ibx-list{
    width:100%;border-right:none;
    position:absolute;inset:0;z-index:10;background:var(--panel)
  }
  .wc-ibx-thread{
    position:absolute;inset:0;z-index:20;background:var(--panel);
    transform:translateX(100%);transition:transform .26s cubic-bezier(.4,0,.2,1)
  }
  .wc-inboxwrap[data-view="thread"] .wc-ibx-thread{transform:none}
  /* back button + sticky composer */
  .wc-thread-back{display:inline-flex}
  .wc-composer{position:sticky;bottom:0}
  /* intel as bottom sheet */
  .wc-ibx-intel{
    position:absolute;left:0;right:0;bottom:0;top:auto;width:100%;max-width:none;
    height:80%;border-left:none;border-top:1px solid var(--line);
    border-radius:18px 18px 0 0;transform:translateY(100%)
  }
  .wc-inboxwrap[data-intel="open"] .wc-ibx-intel{transform:none}
}
```

### 8.3 Per-pane responsive behavior
- **Tab bar** (`.wc-inbox-tabs`): unchanged; stays left-aligned and full-width at all sizes. On phone keep the 11×16 hit area (≥44px tall touch target — bump `padding` to `13px 18px` under 767px).
- **List**: filter chips wrap (`flex-wrap:wrap`) so they never overflow; below 767px the list is the entry view. Conversation rows keep their 38px avatar; allow the name/last-message to truncate (already `text-overflow:ellipsis`).
- **Thread header**: the **AI-recommends card stack** is the first thing to shed at narrow widths — under 1023px collapse `.wc-aiactions-row` to a **single icon button** that opens the recommendations in a popover, and hide the `Clock` under 900px. Add a `.wc-thread-infobtn` (avatar/“ⓘ”) that opens the intel drawer, and on phone a `.wc-thread-back` chevron to return to the list.
  ```css
  .wc-thread-infobtn,.wc-thread-back{display:none;width:38px;height:38px;border-radius:10px;
    align-items:center;justify-content:center;color:var(--ink-2);border:1px solid var(--line)}
  @media (max-width:900px){.wc-clock{display:none}}
  @media (max-width:1023px){
    .wc-aiactions{flex-direction:row;align-items:center}
    .wc-aiactions-h span{display:none} /* keep only sparkles icon */
  }
  ```
- **Thread body**: bubble `max-width` should relax on small screens so text isn’t a sliver — `@media(max-width:767px){.wc-msg{max-width:86%}.wc-msg-call{max-width:90%}}`.
- **Composer**: the toolbar row wraps; under 600px hide the text labels on **Attach file / Add image** (icon-only) and let **AI Assist** / **Book Appointment** keep their labels. The send button stays full-height. The textarea grows; cap `max-height` lower on phone (`96px`).
  ```css
  @media (max-width:600px){
    .wc-bookbtn span,.wc-bookbtn-label{display:none}
    .wc-composer-input .wc-primary{padding:0 14px}
  }
  ```
- **Intel panel**: at desktop it’s inline; tablet → right slide-over drawer (340px) with scrim; phone → 80%-height bottom sheet with a drag-grip header and a close affordance. All inner sections (`.wc-intel-sec`) are unchanged and simply scroll.
- **Book Appointment modal**: already `max-width:100%` with side padding. Add:
  ```css
  @media (max-width:640px){
    .wc-modal-scrim{padding:0;align-items:flex-end}     /* dock to bottom on phone */
    .wc-modal,.wc-bookmodal{width:100%;border-radius:18px 18px 0 0}
    .wc-book-grid4{grid-template-columns:repeat(2,1fr)} /* 4-up → 2×2 */
    .wc-book-grid3{grid-template-columns:1fr}           /* 3-up → stacked */
    .wc-book-row2{grid-template-columns:1fr}            /* date/time stack */
    .wc-book-foot{flex-direction:column-reverse}        /* primary on top, full width */
    .wc-book-cancel,.wc-book-submit{flex:none;width:100%}
  }
  ```

### 8.4 Navigation state machine (small screens)
Maintain two extra UI flags so JS and CSS agree:
- `data-view = "list" | "thread"` on `.wc-inboxwrap` (phone only): selecting a conversation sets `thread`; the back button sets `list`.
- `data-intel = "open" | "closed"`: the info button opens the drawer/sheet; the scrim, a close button, or Esc closes it. Always reset `data-intel="closed"` when switching conversations on small screens.

### 8.5 Touch & accessibility
- All interactive controls ≥ **44×44px** touch targets on phone (chips, tabs, toggle, send, modal options).
- The AI On/Off toggle keeps `role="switch"` + `aria-checked`; drawer/sheet open buttons get `aria-expanded`.
- Respect `prefers-reduced-motion`: disable the slide/drawer transitions (`transition:none`) when set.
- Lock body scroll while the bottom sheet / modal is open.

### 8.6 Sizing recap
- Columns (XL): list **330** · thread **flex:1, min-width:0** · handle **20** · intel **320**.
- Every pane scrolls independently (`overflow-y:auto; min-height:0`) inside a non-scrolling outer flex.
- Below 1024px the intel pane leaves the flow (drawer); below 768px only one pane is on screen at a time.
- Target desktop ≥1280px for the full 3-pane experience; fully usable down to 360px wide.
