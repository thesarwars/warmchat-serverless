# Create New Workflow — Step 2 "Craft Your Message" — Component Spec

Self-contained spec to rebuild **Step 2 (Craft Your Message)** of the *Create New Workflow* wizard in WarmChats (an AI real-estate CRM). This step lets the user (a) choose **who to enroll** — by hand-picking leads or by filter — and (b) write the **opening message** plus an optional **follow-up sequence**, choosing SMS/Email and exact send timing.

Stack: **React 18 (inline JSX / Babel)**. Styling is mostly **inline `style={{}}` objects** (the wizard is inline-styled), with a few shared `wc-` classes. Icons via `<Icon name size />`. State hooks aliased `const { useState: useAS, useEffect: useAE } = React;`.

This is the middle step of a 3-step modal wizard. The modal shell, header (icon + "Create New Workflow" + ✕ + 3-segment progress bar), and sticky footer (Back / Continue) are shared chrome — summarized at the end. This doc covers the **step-2 body only**.

---

## Design tokens

```css
--accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
--ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --ink-faint:#B4BAC6;
--line:#E8EAF0; --line-soft:#F3F4F8; --panel:#FFFFFF;
--blue:#0EA5E9; --blue-bg:#E7F6FD; --violet:#7C5CFC; --violet-bg:#EEEAFE; --green:#0E9F6E;
```
**Selected pill/chip pattern (used everywhere on this step):** `1.5px solid var(--accent-strong)` border + `#FFF1E8` background + `--accent-strong` text, usually with a leading `check` icon. Unselected: `1.5px solid var(--line)` border + `var(--panel)` bg + `var(--ink-2)` text.

---

## Step 2 layout (top → bottom)

```jsx
{workflowStep === 2 && (
  <div>
    <h2 style={{ fontSize:'28px', fontWeight:800, letterSpacing:'-.02em', color:'var(--ink)', margin:0 }}>Craft Your Message</h2>
    <p style={{ fontSize:'15px', color:'var(--ink-3)', marginTop:'6px' }}>Write the message and follow-up sequence</p>
    {/* "Step 2 of 3" lives top-right of the header band */}

    {/* (A) Who to enroll card  — workflow mode only */}
    {/* (B) Channel & Enrollment summary card */}
    {/* (C) Initial Message card (+ FollowUpSequence) */}
  </div>
)}
```
A "**Step 2 of 3**" label sits at the top-right, aligned with the title (`fontSize:14px; color:var(--ink-3)`).

---

## (A) "Who to enroll" card

White card, `border:1px solid var(--line)`, `border-radius:16px`, `padding:20px`, `margin-top:24px`.

### Header row
Flex space-between:
- **Left:** `users` icon (18px, `--accent-strong`) + **"Who to enroll"** (16px/700) on one line; sub-line **"Pick specific leads, or enroll everyone matching a filter."** (13px, `--ink-3`).
- **Right:** a count pill — `padding:5px 12px; border-radius:999px; background:var(--accent-soft); color:var(--accent-strong); font-size:12.5px; font-weight:700`. Text = `{audMode==='filter' ? audMatch.length+' match' : sel.size+' selected'}` → e.g. **"0 selected"**.

### Mode toggle — segmented control
A 2-button inline-flex on `background:var(--line-soft)`, `border-radius:10px`, `padding:4px`, `margin:16px 0`. Active button: white bg, `--accent-strong` text, `box-shadow:var(--shadow-sm)`. Two options:
- **Select leads** — `check` icon (default, `audMode='select'`)
- **Use filters** — `filter` icon (`audMode='filter'`)

```jsx
const [audMode, setAudMode] = useAS('select');
```

### Mode = "Select leads"
1. **Search field** — bordered, 40px tall, `search` icon + input `placeholder="Search leads…"`. Filters `WF_AUD_LEADS` by name+contact+source (case-insensitive). Bound to `audSearch`.
2. **Lead table** — `border:1px solid var(--line)`, `border-radius:12px`, `overflow:hidden`.
   - **Header row** (`background:var(--line-soft)`, sticky): a tri-state **Select all** checkbox + uppercase label "SELECT ALL", then "SOURCE" and "TYPE" column headers (11px/700, `--ink-3`). Grid: `28px 1fr 116px 74px`.
   - **Body** (`max-height:~268px; overflow-y:auto`): one clickable row per shown lead — checkbox, avatar (34px circle, `#EEECE8` bg, `#9A938A` 2-letter initials via `wfInitials`), name (bold 13.5px) over contact (12px `--ink-3`), source text, and a **Type badge**.
   - **Type badge** colors: `Buyer` & `Renter` & `Investor` → blue (`--blue-bg`/`--blue`); `Seller` → orange (`--accent-soft`/`--accent-strong`). (Screenshot shows Buyer/Renter in blue, Seller in orange.)
   - Selected rows tint `--accent-soft`; checkbox fills `--accent`.
   - Empty state when search matches nothing: centered "No leads match "{audSearch}"." (13px, `--ink-3`).
3. **Footer count** — `<strong>{sel.size}</strong> of {WF_AUD_LEADS.length} leads selected for enrollment.` (13px, `--ink-3`, `margin-top:12px`). → e.g. **"0 of 9 leads selected for enrollment."**

```jsx
const [sel, setSel] = useAS(() => new Set());           // none selected by default
const toggleLead = id => setSel(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
const allSel  = sel.size === WF_AUD_LEADS.length;
const someSel = sel.size > 0 && !allSel;
const toggleAll = () => setSel(allSel ? new Set() : new Set(WF_AUD_LEADS.map(l=>l.id)));
const wfInitials = n => n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
```

### Mode = "Use filters"
Three chip groups, each: a 12px/700 uppercase label (`--ink-3`, `letter-spacing:.05em`, `margin-bottom:10px`) over a `display:flex; flex-wrap:wrap; gap:8px` chip row. All chips use the selected/unselected pill pattern above (`padding:8px 14px; border-radius:999px; font-size:13px; font-weight:700`).

1. **LEAD TYPE** — `WF_AUD_TYPES = ['Buyer','Seller','Investor','Renter']`. Selected chip shows a leading `check` (13px).
2. **STAGE** — `WF_AUD_STAGES = ['New Lead','Contacted','Engaged','Qualified','Appointment Set','Active Client','Under Contract','Closed','Lost']`. Each chip shows an 8px colored **status dot** until selected, then a `check`. Dot colors:
   ```js
   { 'New Lead':'#FF6A3D','Contacted':'#FFA630','Engaged':'#3DBFF2','Qualified':'#8B5CF6',
     'Appointment Set':'#0EA5E9','Active Client':'#10B981','Under Contract':'#F59E0B','Closed':'#16A34A','Lost':'#94A3B8' }
   ```
3. **FILTERS** — `WF_AUD_FILTERS = ['Hot Leads','Needs Reply','Appointment Ready','Human Takeover','No Response 7 Days']`. Checkbox-style chips: a 16px rounded-square box (filled `--accent` with white `check` when on, else `1.5px solid var(--line)`) + the label.
4. **Summary banner** — `display:flex; gap:12px; padding:14px 16px; background:#fff8f5; border:1px solid #ffd9c2; border-radius:12px`. A `filter` icon (`--accent-strong`) + text: **"{audMatch.length} lead(s)** currently match these filters" (or "(no filter — everyone)" when all three sets are empty) + " New leads that match will be enrolled automatically as they come in."

State + matching:
```jsx
const [audSource,setAudSource] = useAS(()=>new Set());   // (kept; not surfaced in UI)
const [audType,setAudType]     = useAS(()=>new Set());
const [audStage,setAudStage]   = useAS(()=>new Set());
const [audFilter,setAudFilter] = useAS(()=>new Set());
const toggleAudTyp = v => setAudType(s=>{const n=new Set(s);n.has(v)?n.delete(v):n.add(v);return n;});
const toggleAudStg = v => setAudStage(s=>{const n=new Set(s);n.has(v)?n.delete(v):n.add(v);return n;});
const toggleAudFlt = v => setAudFilter(s=>{const n=new Set(s);n.has(v)?n.delete(v):n.add(v);return n;});

const audMatch = WF_AUD_LEADS.filter(l =>
  (audSource.size===0 || audSource.has(l.source)) &&
  (audType.size===0   || audType.has(l.type)) &&
  (audStage.size===0  || audStage.has(l.stage)) &&
  (audFilter.size===0 || [...audFilter].every(f => (l.flags||[]).includes(f))));
const audCount = audMode==='filter' ? audMatch.length : sel.size;
```

---

## (B) Channel & Enrollment summary card

White card, two columns (`display:flex; gap:40px`), `margin-top:16px`, `padding:18px 20px`. Each column: an 11px/700 uppercase label (`--ink-3`) over a 17px/800 value (`--ink`).
- **CHANNEL** → `workflowChannels.map(c=>c==='sms'?'SMS':'Email').join(' + ')` → e.g. **"SMS"**.
- **ENROLLMENT** → `audMode==='filter' ? audMatch.length+' leads match' : sel.size+' leads selected'` → e.g. **"0 leads selected"**.

---

## (C) Initial Message card (+ Follow-Up Sequence)

White card, `margin-top:16px`, `padding:20px`.

### Header
`sparkles` icon (`--accent-strong`) + **"Initial Message"** (16px/700), and a right-aligned **live PST clock**: `clock` icon + `{pstNow}` (e.g. "8:48 AM PST"), 12px `--ink-3`.
```jsx
const [pstNow,setPstNow] = useAS('');
useAE(()=>{ const t=()=>setPstNow(new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles'})+' PST'); t(); const id=setInterval(t,1000); return ()=>clearInterval(id); },[]);
```

### Controls
1. **Message Type** segmented toggle — **SMS** (`message` icon) | **Email** (`mail` icon). Bound to `msgChannel`. Active button takes accent style.
2. **Add files** ghost button (`paperclip`/`plus` icon) + **AI Write** menu button (`sparkles`) → `AIWriteMenu`.
3. **Subject** input (email mode only) — bordered, `placeholder="Subject line…"`, bound to `emailSubject`.
4. **Message textarea** — `2px solid var(--accent-strong)` border focus style, `min-height:120px`, `border-radius:12px`, `placeholder="Write your opening message… Use {{first_name}}, {{area}}, {{agent_name}}"`. Bound to `workflowMessage`.
5. **Counter** under textarea, right-aligned 12px `--ink-3`: `{len} chars · {Math.ceil(len/160)}/5 segments`.

`AIWriteMenu` — popover of tone options (`AI_TONES`): **Make professional, Make shorter, Make friendlier, Appointment push, Follow-up suggestion**. Selecting one fills `workflowMessage` (and `emailSubject` in email mode) via `aiToneText(tone)`. Closes on outside-click (fixed invisible backdrop).

### When to send the opening
Label "WHEN TO SEND" + a 2-button toggle: **Instant** | **At a time** (bound to `workflowTiming`: `'instant'` | `'scheduled'`). When `scheduled`, reveal a row of three controls:
- **date** input, **time** input (defaults `09:00`), **timezone** select (`PST` / `EST` / `CST` / `MST`).

### Follow-Up Sequence — `<FollowUpSequence value={tplFollowUps} onChange={setTplFollowUps} />`
Sub-section titled **"Follow-Up Sequence (Optional)"** + an **"Add Follow-Up"** button (`plus`).
- **Empty state:** dashed-border box, centered muted text inviting the user to add a follow-up.
- **Each follow-up card** (`border:1px solid var(--line); border-radius:12px; padding:16px`): header "Follow-up {i+1}" + a **delete** (trash) icon button; a row of **date** + **time** + **timezone** controls; a **Message Type** SMS/Email toggle; **Add files** + **AI Write**; a **Subject** input (email only); and a **message textarea** (`2px` accent border).
- A trailing dashed **"+ Add another follow-up"** button.

Follow-up item shape:
```js
{ id, delay, unit, timing, time:'09:00', timezone:'PST', channel:'sms', message:'', date?, subject? }
```

---

## Wizard state (relevant to step 2)
```jsx
const [workflowStep,    setWorkflowStep]    = useAS(1);
const [workflowName,    setWorkflowName]    = useAS('');
const [workflowChannels,setWorkflowChannels]= useAS(['sms']);   // multi-select from step 1
const [msgChannel,      setMsgChannel]      = useAS('sms');      // opening-message channel
const [workflowMessage, setWorkflowMessage] = useAS('');
const [emailSubject,    setEmailSubject]    = useAS('');
const [workflowTiming,  setWorkflowTiming]  = useAS('instant');
const [tplFollowUps,    setTplFollowUps]    = useAS([]);
// + audience state from §A
```

## Sample audience data
```js
const WF_AUD_LEADS = [
  { id:1, name:'Marisol Gomez',    contact:'(555) 204-1180',        source:'Zillow',     type:'Buyer',    stage:'New Lead',        flags:['Hot Leads','Needs Reply'] },
  { id:2, name:'Devon Carter',     contact:'devon.c@email.com',     source:'Facebook',   type:'Buyer',    stage:'Contacted',       flags:['No Response 7 Days'] },
  { id:3, name:'Anna Lin',         contact:'(555) 661-0042',        source:'Open House', type:'Renter',   stage:'Appointment Set', flags:['Appointment Ready'] },
  { id:4, name:'Carlos Hernandez', contact:'c.hernandez@email.com', source:'Referral',   type:'Seller',   stage:'Active Client',   flags:['Hot Leads','Human Takeover'] },
  { id:5, name:'Priya Patel',      contact:'(555) 815-7723',        source:'Zillow',     type:'Investor', stage:'Engaged',         flags:['Needs Reply'] },
  { id:6, name:'Jordan Webb',      contact:'jordan.webb@email.com', source:'Realtor.com',type:'Seller',   stage:'Under Contract',  flags:[] },
  { id:7, name:'Sofia Romano',     contact:'(555) 332-9087',        source:'Facebook',   type:'Renter',   stage:'Qualified',       flags:['Appointment Ready','Needs Reply'] },
  { id:8, name:'Trevor Nash',      contact:'trevor.n@email.com',    source:'Referral',   type:'Investor', stage:'Closed',          flags:['Hot Leads'] },
  { id:9, name:'Bianca Flores',    contact:'(555) 770-3318',        source:'Open House', type:'Buyer',    stage:'Lost',            flags:['No Response 7 Days','Human Takeover'] },
];   // 9 leads → matches "0 of 9 leads selected"
const WF_AUD_TYPES   = ['Buyer','Seller','Investor','Renter'];
const WF_AUD_STAGES  = ['New Lead','Contacted','Engaged','Qualified','Appointment Set','Active Client','Under Contract','Closed','Lost'];
const WF_AUD_FILTERS = ['Hot Leads','Needs Reply','Appointment Ready','Human Takeover','No Response 7 Days'];
```

---

## Shared chrome (context — not part of the step body)
- **Modal:** full-screen scrim `rgba(0,0,0,.5)`; centered panel ~900px, `max-height:90vh`, `overflow-y:auto`, `border-radius:20px`.
- **Header:** small `outbound` icon + **"Create New Workflow"** title, a **✕** close, and a **3-segment progress bar** — segments 1 & 2 filled `--accent-strong`, segment 3 `--line` (on step 2).
- **Footer (sticky):** **Back** ghost button (returns to step 1) + primary **Continue →** (`arrowRight`) advancing to step 3. Continue is always enabled on step 2 (enrollment is optional — empty filter = everyone).

## Acceptance checklist
- [ ] Title "Craft Your Message" + "Step 2 of 3"; progress bar shows 2/3 filled.
- [ ] "Who to enroll" card: count pill reads "0 selected" on first render; segmented Select-leads / Use-filters toggle works.
- [ ] Select-leads: search filters; tri-state Select all; per-row toggle tints accent; footer "0 of 9 leads selected for enrollment."
- [ ] Type badges: Buyer/Renter/Investor = blue, Seller = orange.
- [ ] Use-filters: Lead type / Stage (9, colored dots) / Filters (checkbox) chip groups + live match banner.
- [ ] Channel/Enrollment summary reflects channel ("SMS") and live selection ("0 leads selected").
- [ ] Initial Message: live PST clock ticks; SMS/Email toggle; Email reveals Subject; textarea + char/segment counter; AI Write menu fills text; Instant/At-a-time timing with date/time/tz.
- [ ] Follow-Up Sequence: empty dashed state, add/remove cards, per-card channel + timing + message.
