# Message Composer — Component Spec

The reply composer at the bottom of the WarmChats inbox thread: a **channel switch (SMS / Email)** strip above the message stream, plus a two-row composer — a **toolbar row** (Attach file · Add image · AI Assist ▾ · Book Appointment) and an **input row** (textarea + Send button, with an extra Subject line in Email mode). Lives inside the `Inbox` component in `inbox.jsx`; not a standalone component but a self-contained block of JSX + state.

Visual language: clean cool-gray neutrals, **orange accent** (`#F97316`), pill buttons with peach borders for AI affordances. Icons via `<Icon name size />`.

---

## 1. Structure (JSX)

The channel switch sits between the message thread and the composer; the composer is the `.wc-composer` block.

```jsx
{/* channel switch — directly under the thread header */}
<div className="wc-thread-channels">
  <button className={chan === 'SMS'   ? 'is-on' : ''} onClick={() => setChan('SMS')}><Icon name="message" size={14}/>SMS</button>
  <button className={chan === 'Email' ? 'is-on' : ''} onClick={() => setChan('Email')}><Icon name="mail" size={14}/>Email</button>
</div>

{/* …message thread (.wc-thread-body)… */}

<div className="wc-composer">
  {/* row 1 — toolbar */}
  <div className="wc-composer-tabs">
    <button className="wc-bookbtn"><Icon name="paperclip" size={14}/>Attach file</button>
    <button className="wc-bookbtn"><Icon name="image" size={14}/>Add image</button>
    <div className="wc-assistwrap">
      <button className="wc-assistbtn" onClick={() => { setAssistOpen(o => !o); setApptOpen(false); }}>
        <Icon name="sparkles" size={14}/>AI Assist<Icon name="chevronDown" size={13}/>
      </button>
      {assistOpen && (
        <div className="wc-assistmenu" onMouseLeave={() => setAssistOpen(false)}>
          {AI_ASSIST.map(o => (
            <button key={o} onClick={() => applyAssist(o)}><Icon name="sparkles" size={13}/>{o}</button>
          ))}
        </div>
      )}
    </div>
    <div className="wc-assistwrap">
      <button className="wc-bookbtn" onClick={() => { setApptOpen(true); setAssistOpen(false); }}>
        <Icon name="calendar" size={14}/>Book Appointment
      </button>
    </div>
    <div className="wc-composer-spacer"/>
  </div>

  {/* row 2 — input */}
  <div className="wc-composer-input">
    {chan === 'Email' && <input className="wc-email-subj" placeholder={`Subject — to ${active.email}`}/>}
    <textarea
      placeholder={chan === 'Email' ? `Write an email to ${active.name}…` : `Message ${active.name}…`}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
    />
    <button className="wc-primary" onClick={send} disabled={!draft.trim()}>
      <Icon name="arrowUpRight" size={15}/>Send {chan}
    </button>
  </div>
</div>
```

---

## 2. Behavior & state

The composer reads/writes state owned by the parent `Inbox` component:

| State | Default | Role |
|-------|---------|------|
| `chan` | `'SMS'` | Active channel — `'SMS'` or `'Email'`. Drives placeholders, the Subject field, and the Send button label ("Send SMS" / "Send Email"). |
| `draft` | `''` | Textarea contents. Send is disabled while `!draft.trim()`. |
| `assistOpen` | `false` | AI Assist dropdown open. Opening it closes the appointment modal (`setApptOpen(false)`); the menu closes on `mouseleave` or after a pick. |
| `apptOpen` | `false` | Book Appointment modal open (renders `BookApptModal`). Opening it closes the assist menu. |
| `convos` / `activeId` | — | The conversation list + which thread is active (`active` = current convo). |

### Send flow (`send()`)
1. No-op if draft is empty.
2. Appends an `agent` message with `status:'sending'`, channel `email`/`sms`, a unique `_id`; updates the convo's `last` preview and clears `unread`; clears `draft`.
3. Simulates delivery by bumping status on timers: **sent** @600ms → **delivered** @1600ms → **read** (SMS) / **seen** (Email, with a `readTime`) @3400ms. These statuses render in each bubble's footer via `MsgStatus` / `MSG_STATUS`.
- **Keyboard:** ⌘/Ctrl + Enter sends. (Plain Enter inserts a newline.)

### AI Assist (`applyAssist(opt)`)
Picks from `AI_ASSIST = ['Make professional', 'Make shorter', 'Make friendlier', 'Appointment push', 'Follow-up suggestion']`; each maps to a rewritten draft string that **replaces** the textarea contents, then closes the menu. (In the prototype the rewrites are canned for the active lead.)

### Book Appointment
Opens `BookApptModal` (separate component). On confirm, `book({kind,date,time,loc})` appends a `system` message — e.g. *"Showing booked — Sat, Jun 14 at 2:00 PM · In Person · added to Calendar, Tasks & lead profile"* — and closes the modal.

---

## 3. Layout & dimensions

| Element | Class | Spec |
|---------|-------|------|
| **Channel switch** | `.wc-thread-channels` | Flex row, 4px gap, `padding:7px 20px`, bottom border. Each button: pill, `8px 13px`, 13px/600, icon+label. Active `.is-on` = accent-soft bg + accent-strong text; hover = `--line-soft`. |
| **Composer shell** | `.wc-composer` | Top border, `padding:12px 16px 14px`, white bg. |
| **Toolbar row** | `.wc-composer-tabs` | Flex, 4px gap, `align-items:center`, 10px bottom margin. Ends with `.wc-composer-spacer` (`flex:1`) so buttons stay left-aligned. |
| Attach / Image / Book buttons | `.wc-bookbtn` | Pill, `7px 11px`, 12.5px/600, 1px `--line` border, white bg, `--ink-2` text; hover adds `shadow-sm`. |
| **AI Assist** button | `.wc-assistbtn` | Same shape but **accent-strong text, `#FBE0CC` border, accent-soft bg** — the one highlighted control. Trailing chevron. |
| AI Assist wrapper | `.wc-assistwrap` | `position:relative` anchor for the dropdown. |
| AI Assist menu | `.wc-assistmenu` | Absolute, **bottom:42px** (opens upward), left:0, **width 210px**, white, radius 12px, `--shadow-lg`, 6px padding, z-20. `.right` variant flips to `right:0`. Items: flex row, 9px gap, `9px 10px`, radius 8px, sparkle icon in accent; hover `--line-soft`. |
| **Input row** | `.wc-composer-input` | Flex, `flex-wrap:wrap`, `align-items:flex-end`, 10px gap. |
| Email subject | `.wc-email-subj` | Full-width (forces wrap above textarea), **height 38px**, 1px border, radius 9px, `0 12px`; focus = accent border + 3px accent-soft ring. Only in Email mode. |
| **Textarea** | `.wc-composer-input textarea` | `flex:1`, **min-height 44px / max-height 120px**, 1px border, radius 11px, `11px 13px`, 13.5px, `resize:none`; focus ring as above. |
| **Send button** | `.wc-primary` | **Height 44px**, `flex:none`, orange bg, white, radius 11px, glow shadow, `arrowUpRight` icon + "Send {chan}". `:disabled` = 45% opacity, no shadow. |

---

## 4. Related thread elements (context)

These sit just above the composer in the thread column and share its vocabulary:

- **AI task banner** `.wc-thread-task` — peach-bordered card (`#FBE0CC`), 32px accent-soft sparkle tile + title/reason + two 36px `.wc-tbtn` actions (complete = green hover, dismiss). Shown when `active.task` exists.
- **Message bubbles** `.wc-msg` (`max-width:74%`): `.in` left / `.out` right. Variants — `.agent` (orange bg, white), `.ai` (light-blue `rgb(193,238,255)` bg + `#B4DEF5` border, with an "AI Assistant" sparkle tag `.wc-msg-tag`), inbound `.in` (white card). Footer `.wc-msg-foot` shows time + `MsgStatus` (`MSG_STATUS`: sending/sent/delivered/read/seen, the lit state in accent).
- **System lines** `.wc-msg-sys` (centered pill) and **call rows** `.wc-msg-call` (bordered card, accent phone icon).

---

## 5. Design tokens

```css
:root{
  --accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
  --panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
  --ink:#191D29; --ink-2:#586173; --ink-3:#878FA0;
  --shadow-sm:0 1px 2px rgba(20,24,38,.05); --shadow-lg:0 18px 50px rgba(20,24,38,.15);
}
```
AI accent border: `#FBE0CC`. AI-bubble palette: bg `rgb(193,238,255)`, text `rgb(62,58,76)`, border `#B4DEF5`. Success green: `#16A34A` / `#E8F8ED`.

---

## 6. Full CSS

```css
/* channel switch */
.wc-thread-channels{display:flex;align-items:center;gap:4px;padding:7px 20px;border-bottom:1px solid var(--line)}
.wc-thread-channels>button{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:9px;font-size:13px;font-weight:600;color:var(--ink-2)}
.wc-thread-channels>button:hover{background:var(--line-soft)}
.wc-thread-channels>button.is-on{background:var(--accent-soft);color:var(--accent-strong)}

/* composer */
.wc-composer{border-top:1px solid var(--line);padding:12px 16px 14px;background:var(--panel)}
.wc-composer-tabs{display:flex;align-items:center;gap:4px;margin-bottom:10px}
.wc-composer-tabs>button{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink-2)}
.wc-composer-tabs>button:hover{background:var(--line-soft)}
.wc-composer-tabs>button.is-on{background:var(--accent-soft);color:var(--accent-strong)}
.wc-composer-spacer{flex:1}

/* toolbar buttons */
.wc-assistwrap{position:relative}
.wc-assistbtn,.wc-bookbtn{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:9px;font-size:12.5px;font-weight:600;border:1px solid var(--line);background:var(--panel);color:var(--ink-2)}
.wc-assistbtn{color:var(--accent-strong);border-color:#FBE0CC;background:var(--accent-soft)}
.wc-assistbtn:hover,.wc-bookbtn:hover{box-shadow:var(--shadow-sm)}

/* AI Assist dropdown */
.wc-assistmenu{position:absolute;bottom:42px;left:0;width:210px;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-lg);padding:6px;z-index:20}
.wc-assistmenu.right{left:auto;right:0}
.wc-assistmenu button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:9px 10px;border-radius:8px;font-size:13px;font-weight:600;color:var(--ink-2)}
.wc-assistmenu button:hover{background:var(--line-soft);color:var(--ink)}
.wc-assistmenu button .wc-icon{color:var(--accent-strong)}

/* input row */
.wc-composer-input{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px}
.wc-email-subj{width:100%;height:38px;border:1px solid var(--line);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;color:var(--ink);outline:none}
.wc-email-subj:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-composer-input textarea{flex:1;min-height:44px;max-height:120px;border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:13.5px;font-family:inherit;resize:none;outline:none;color:var(--ink)}
.wc-composer-input textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-composer-input .wc-primary{height:44px;flex:none}

/* shared primary button */
.wc-primary{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:11px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 16px rgba(249,115,22,.28);transition:.12s}
.wc-primary:hover{background:var(--accent-strong)}
.wc-primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}

/* AI task banner + bubbles (thread context) */
.wc-thread-task{display:flex;align-items:center;gap:11px;background:var(--panel);border:1px solid #FBE0CC;border-radius:12px;padding:11px 13px;box-shadow:var(--shadow-sm)}
.wc-thread-task-ic{width:32px;height:32px;border-radius:9px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
.wc-thread-task-b{flex:1;min-width:0}
.wc-thread-task-t{font-size:13px;font-weight:700}
.wc-thread-task-r{font-size:11.5px;color:var(--ink-3);margin-top:1px}
.wc-tbtn{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);display:grid;place-items:center;color:var(--ink-3);flex:none}
.wc-tbtn:hover{background:var(--line-soft);color:var(--ink)}
.wc-tbtn.is-done:hover{background:#E8F8ED;border-color:#16A34A;color:#16A34A}
.wc-msg{display:flex;flex-direction:column;max-width:74%}
.wc-msg.in{align-self:flex-start;align-items:flex-start}
.wc-msg.out{align-self:flex-end;align-items:flex-end}
.wc-msg-tag{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:var(--accent-strong);margin-bottom:4px}
.wc-msg-bub{font-size:13.5px;line-height:1.45;padding:10px 13px;border-radius:14px}
.wc-msg.in .wc-msg-bub{background:var(--panel);border:1px solid var(--line);border-bottom-left-radius:4px}
.wc-msg.agent .wc-msg-bub{background:var(--accent);color:#fff;border-bottom-right-radius:4px}
.wc-msg.ai .wc-msg-bub{background:rgb(193,238,255);color:rgb(62,58,76);border:1px solid #B4DEF5;border-bottom-right-radius:4px}
.wc-msg-foot{display:flex;align-items:center;gap:7px;margin-top:4px}
.wc-msg-foot time{margin-top:0;font-size:10.5px;color:var(--ink-3)}
.wc-msg-status{display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:600;color:var(--ink-3)}
.wc-msg-status.is-lit{color:var(--accent-strong)}
```

---

## 7. External dependencies

- **React 18** (`useState`, `useRef`, `useEffect`).
- **`<Icon name size [className] />`** — inline SVG icons. Names used: `message, mail, paperclip, image, sparkles, chevronDown, calendar, arrowUpRight, check, x, clock, checkDouble`.
- **`BookApptModal`** — the Book Appointment modal (separate component; see `BookApptModal.prompt.md`).
- Constants `AI_ASSIST`, `MSG_STATUS`, message factory `M()`, and the `Bubble` / `MsgStatus` renderers (all in `inbox.jsx`).

See `inbox.jsx` for the authoritative source.
