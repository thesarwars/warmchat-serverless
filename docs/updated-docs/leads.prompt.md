# Leads Page — Component Spec

The **Leads** pipeline view of WarmChats: an AI-run real-estate CRM. It assembles an app shell (sidebar + top bar), a **page header** with Import/Add actions, a **stat-card strip (KPIs)**, an optional **AI banner**, a **toolbar** (view toggle + filters + search), the **board** (Kanban *or* Table), a slide-in **side panel** (lead detail), and two modals (**Import Leads wizard**, **Add Lead**).

Stack: React 18 (inline JSX / Babel), one big `<style>` block. Visual language: clean cool-gray neutrals, **orange accent** (`#F97316`), 14px base radius, soft shadows. Icons via `<Icon name size />`.

---

## 1. File / component map

| File | Exports | Role |
|------|---------|------|
| `data.jsx` | `STAGES, STAGE_MAP, LEADS, KPIS, TONES, QUICK_FILTERS, NAV_*, activityFor, L()` | All data + the `L()` lead factory. |
| `board.jsx` | `Kanban, TableView, DetailPanel, Avatar, LeadCard` | Board views + the side panel. |
| `app.jsx` | `App` (root) | Shell, `Sidebar`, `TopBar`, `KpiStrip`, `AiBanner`, `Toolbar`, `ComingSoon`, `NimbusAlert`, routing, all lead state + handlers, Tweaks. |
| `addlead.jsx` | `AddLeadModal` | "Add Lead" modal. |
| `import.jsx` | `ImportWizard` | "Import Leads" multi-step wizard. |

`board.jsx`, `data.jsx` etc. each end with `Object.assign(window, {...})` so components are shared across the separately-transpiled Babel scripts. Load order in `index.html`: React → Babel → `icons.jsx` → `data.jsx` → `board.jsx` → other tabs → `app.jsx` last.

### Composition (the `nav === 'leads'` branch in `App`)
```jsx
<div className="wc-page">
  <div className="wc-pagehead">
    <div><h1>Leads</h1></div>
    <div className="wc-pagehead-actions">
      <button className="wc-ghostbtn" onClick={openImport}><Icon name="upload"/>Import Leads</button>
      <button className="wc-primary"  onClick={openAdd}><Icon name="plus"/>Add Lead</button>
    </div>
  </div>
  {t.showKpis  && <KpiStrip />}
  {t.showBanner && <AiBanner show={bannerOpen} onClose={…} />}
  <Toolbar view={view} setView={…} active={filters} toggle={…} search={…} setSearch={…} />
  {view === 'kanban'
    ? <Kanban    leads={filtered} onOpen={setActiveLead} activeId={…} onMove={moveLead} />
    : <TableView leads={filtered} onOpen={setActiveLead} activeId={…} onDelete onStar onUpdate />}
</div>
// rendered at App root level, outside .wc-page:
<DetailPanel lead={activeLead} onClose onMove onUpdate />
{importOpen && <ImportWizard … />}
{addOpen    && <AddLeadModal … />}
```

### App state (`useState` in `App`)
`nav` (current page, default `'dashboard'`), `view` (`'table'` | `'kanban'`, default `'table'`), `leads` (= `LEADS`), `activeLead` (object | null → drives side panel), `filters` (`Set` of quick-filter keys), `search` (string), `bannerOpen`, `importOpen`, `addOpen`.
Handlers: `moveLead(id, stageKey)`, `deleteLead(id)`, `toggleStar(id)`, `updateLead(id, patch)`, `toggle(filterKey)`. `filtered` is a `useMemo` applying the active quick-filters + search across name/email/area/source.

---

## 2. App shell — layout & dimensions

| Element | Class | Spec |
|---------|-------|------|
| Root | `.wc-app` | `display:flex; height:100vh; overflow:hidden`. Class also carries `density-{compact\|regular\|comfy}` and optional `nocolor`. Inline style sets `--accent`. |
| **Sidebar** | `.wc-side` | **width 248px**, fixed, white, right border, `padding:18px 14px 14px`, scrollable column. Holds brand, 3 nav groups (Main / AI / Workspace), user footer pinned bottom (`margin-top:auto`). |
| Nav item | `.wc-nav` | 9px/11px padding, radius 10px, 14px/600. Active = accent-soft bg + accent text + 3px left accent bar (`::before`). Optional count `.wc-nav-badge` (pill) or AI tile `.wc-nav-tile` (28×28) + status dot. |
| Main column | `.wc-main` | `flex:1; flex-direction:column; min-width:0`. |
| **Top bar** | `.wc-top` | **height 68px**, white, bottom border, `padding:0 26px`, flex w/ 18px gap. Left title, centered search (`.wc-search` width 480px / max 42vw, height 42px), right bell + user. |
| Scroll region | `.wc-scroll` | `flex:1; overflow:auto` — the page scrolls here. |
| **Page** | `.wc-page` | `padding:24px 26px 60px; max-width:1640px`. |
| Page header | `.wc-pagehead` | flex, `align-items:flex-end`, space-between, 20px gap, 20px bottom margin. `h1` = 28px/800/`-.02em`. |
| Header actions | `.wc-pagehead-actions` | flex, 10px gap. **Ghost button** `.wc-ghostbtn` (height 42px→40px in toolbar, 1px border) and **primary** `.wc-primary` (height 42px, orange, white, glow shadow). |

---

## 3. Stat cards — `KpiStrip`

Grid of KPI cards. **`.wc-kpis` = `grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:14px`.**

Each card `.wc-kpi`: white, 1px border, radius 14px, `padding:14px`, flex w/ 11px gap, `align-items:flex-start`, soft shadow; hover lifts 1px. Contents:
- `.wc-kpi-icon` — **38×38**, radius 11px, colored by the KPI's `tone` (fg/bg from `TONES`).
- `.wc-kpi-body` → `.wc-kpi-label` (11.5px/600 muted, ellipsis) + `.wc-kpi-row` (value + delta).
- `.wc-kpi-val` — **22px/800**, tabular nums. `.wc-kpi-delta` 11px/700; `.is-up`→green `#16A34A`; `.is-alert`→accent.
- Cards with a `ranges` object get a top-right segmented range switch `.wc-kpi-range` (`7d/14d/30d`, default `30d`); `KpiStrip` holds `ranges` state per-key.
- `alert` KPIs add `.is-alert` (peach border + subtle gradient).

**`KPIS` data:**
```js
[ { key:'total', icon:'users',    label:'Total Leads', value:'142', delta:'in pipeline', tone:'indigo' },
  { key:'new',   icon:'sparkles', label:'New Leads',   value:'18',  delta:'+6 today', up:true, tone:'blue',
    ranges:{ '7d':{value:'18',delta:'+6 today'}, '14d':{value:'34',delta:'+12 vs prev'}, '30d':{value:'61',delta:'+22 vs prev'} } },
  { key:'hot',   icon:'flame',    label:'Hot Leads',   value:'7',   delta:'+4 today', up:true, tone:'orange',
    ranges:{ '7d':{value:'7',delta:'+4 today'}, '14d':{value:'13',delta:'+5 vs prev'}, '30d':{value:'24',delta:'+9 vs prev'} } },
  { key:'reply', icon:'message',  label:'Needs Reply', value:'5',   delta:'now', tone:'amber', alert:true } ]
```
**`TONES`** (fg / bg): orange `#EA580C`/`#FFF3EA`, amber `#D97706`/`#FEF5E5`, indigo `#4F46E5`/`#ECEDFD`, blue `#0EA5E9`/`#E7F6FD`, green `#16A34A`/`#E8F8ED`, teal `#0D9488`/`#E3F6F2`, violet `#7C3AED`/`#F2ECFE`, emerald `#059669`/`#E6F7EF`, aiblue `#3A93C9`/`#E3F4FC`.

---

## 4. AI banner — `AiBanner` (optional, off by default)

`.wc-aibanner` — dark gradient (`#1F2430→#2C3242`), white text, radius 14px, `padding:13px 16px`. Sparkle tile `.wc-aibanner-icon` (34×34 orange gradient) + message + right-side stat block `.wc-aibanner-stats` (e.g. "17 auto-moved today", "38s avg reply") + dismiss `×`. Toggled by Tweak `showBanner`.

---

## 5. Toolbar — `Toolbar`

`.wc-toolbar` (16px bottom margin) → `.wc-toolbar-row` (flex, 10px gap, wrap, 12px bottom margin):
- **View toggle** `.wc-viewtoggle` — segmented pill on `--line-soft`, two buttons (Pipeline/Kanban, Table), active = white chip + accent text + shadow. 34px tall.
- **Mini search** `.wc-minisearch` — width 260px, height 40px, search icon + input + clear `×`.
- `.wc-toolbar-spacer` (flex:1) then a ghost **Export** button.

Second row `.wc-chips` (flex wrap, 8px gap) of quick-filter pills `.wc-qchip` (height 34px, pill, 1px border); active `.is-on` = solid accent bg, white, glow.
**`QUICK_FILTERS`:** Hot Leads (flame), Needs Reply (message), Buyers (home), Sellers (building2), AI Active (playCircle), AI Recommended (sparkles), Appointment Set (calendar).

---

## 6. Kanban board — `Kanban` / `Column` / `LeadCard`

`.wc-board` — `display:flex; gap:14px; overflow-x:auto; align-items:flex-start`. One `Column` per stage.

**Column** `.wc-col` — **width 288px**, fixed, bg `--line-soft`, radius 16px, `max-height:calc(100vh - 360px)`. Drag-over state `.is-over` = accent-soft bg + dashed accent outline.
- Head `.wc-col-head`: dot (`--stage` color) + stage `label` + count pill `.wc-col-count` + close-probability `.wc-col-prob` (`{prob}%`, stage-colored).
- Body `.wc-col-body`: padding 10px, column flex, 9px gap, scrolls. Empty → `.wc-col-empty` "No leads". If `stage.count > shown`, a `.wc-col-more` "+ N more" dashed row.

**Lead card** `.wc-card` — white, radius 13px, `padding:12px`, **3px left border = `--stage` color** (removed when `.wc-app.nocolor`). Hover lifts 2px; `.is-active` = accent border + ring. Draggable (HTML5 DnD; drop on a column calls `onMove`). Contents:
- Top: 32px grey avatar (`.wc-avatar-grey`, initials) + name (14px/700) + source sub + optional needs-reply badge `.wc-needsreply` (24×24 accent-soft).
- Optional last-message quote `.wc-card-msg` (line-clamp 2, bg `--line-soft`).
- Meta row `.wc-card-meta`: `TypeChip` + tags (budget, timeline) + `Pre-approved` ok-tag.
- Foot `.wc-card-foot`: age (clock) + either AI pill `.wc-ai-pill` (green, pulsing dot) **or** `ScoreBar`. If AI *and* score, a second `ScoreBar` renders below.

**TypeChip** `.wc-chip` variants: buyer `#E7F6FD`/`#0EA5E9` (home), seller `#FFF3EA`/`#EA580C` (building2), renter `#E3F6F2`/`#0D9488` (building). **ScoreBar** `.wc-score`: 54px track + fill colored by score (`≥80` green, `≥55` orange, else grey) + number.

**`STAGES`** (key · name · count · prob% · color · soft):
```
new       New Lead        45   5%  #F97316 #FFF3EA
contacted Contacted       32   8%  #F59E0B #FEF5E5
engaged   Engaged         18  10%  #38BDF8 #E7F6FD
qualified Qualified       11  25%  #8B5CF6 #F2ECFE
appt      Appointment Set  6  50%  #6366F1 #ECEDFD
active    Active Client    4  70%  #14B8A6 #E3F6F2
contract  Under Contract   2  90%  #0EA5E9 #E4F4FD
closed    Closed           1 100%  #22C55E #E8F8ED
```

---

## 7. Table view — `TableView`

`.wc-table-wrap` (white card, radius 16px, overflow auto) → `.wc-table` (full width, 13.5px). Sticky-styled header `th` (11.5px uppercase, `--line-soft` bg). Columns: **Name · Type · Stage · AI · Source · Budget · Area · Score · Last Activity · Actions**. Row hover = `--line-soft`; `.is-active` = accent-soft. Row click → `onOpen`.

Inline editors (all stop click propagation):
- **`InlineSelect`** `.wc-inlsel` — click-to-open dropdown `.wc-inlsel-menu` (min-width 180px, shadow-lg). Used for Type, Stage (renders `.wc-stage-pill`), AI status, Source.
- **`InlineText`** `.wc-inledit` / `.wc-inltext` — click to edit budget/area; Enter saves, Esc cancels, blur saves.
- **Stage pill** `.wc-stage-pill` — pill, stage color text on `soft` bg + dot.
- **AI status pill** `.wc-ai-pill` — colored by `AI_TONE` (AI Active green, Automation Only blue, AI Paused amber, Awaiting Reply violet, Human Takeover red, Appointment Booked indigo, AI Complete teal, AI Off grey).
- **Row actions** `.wc-rowacts` — 2×2 grid of 28px buttons (peach border): edit, delete, message, star (filled-on = solid accent).

---

## 8. Side panel — `DetailPanel`

Rendered at App root whenever `activeLead` is set. A backdrop `.wc-scrim` (fixed, `rgba(24,28,40,.28)` + blur, z-40) + right drawer `.wc-panel`.

**`.wc-panel` = `position:fixed; top:0; right:0; height:100vh; width:438px; max-width:94vw`**, white, left border, `--shadow-lg`, z-41, `overflow-y:auto`, `padding:18px 22px 40px`, slides in (`slidein .26s`).

Sections, top→bottom:
1. **Head** `.wc-panel-head` — close `×` + current stage pill (`{name} · {prob}%`).
2. **Identity** `.wc-panel-id` — 56px avatar + `EditableName` (22px/800, click to rename) + `InlineSelect` type + source text.
3. **AI Lead Score card** `.wc-score-card` (only if `score != null`) — "AI Lead Score" label + big number `.wc-score-big` (28px, color-graded) + wide track.
4. **Actions** `.wc-actions` — 2-col grid of 44px buttons: Call, **Message** (primary/orange), Book, **Move Stage** (opens `.wc-move-menu` of stages).
5. **Contact** — `EditableContactRow` for phone & email (click to edit; rows `.wc-contact-row` on `--line-soft`).
6. **Qualification** — `.wc-fields` 2-col grid of `EditableField` (Budget, Area, Timeline) + a Pre-Approved toggle field. Then **Notes** `textarea` `.wc-notes-ta`.
7. **Scheduled messages** — empty-state line `.wc-cc-empty`.
8. **Per-Contact Notifications** — note + two rows `.wc-cc-notifrow` (Email blue bell, SMS green bell).
9. **Call history** — list of `.wc-cc-call` rows from `CALL_HISTORY` (direction icon, status, time, duration).
10. **AI Activity** — vertical timeline `.wc-timeline` (`.wc-tl-item` w/ check node + connecting line) built dynamically by `activityFor(lead)` from stage progression (e.g. "AI responded instantly" → "Budget captured — $800k" → "Qualified automatically" → "Appointment booked").

Section header `.wc-panel-h` = 11.5px uppercase muted w/ optional leading icon. All editable controls reveal a pencil on hover (`.wc-field-pen`, opacity 0→1) and save on Enter/blur.

---

## 9. Import Leads — `ImportWizard` (reference)

Opened by the header "Import Leads" ghost button (`importOpen`). Multi-step modal wizard (`useImpS` step state): upload file → map columns → review → done. Brand color pair `T_ORANGE = ['#EA580C','#FFEDE3']`. Lives in `import.jsx`; uses the shared modal/button classes. (Full internal spec out of scope here — open `import.jsx` for field-by-field detail.)

## 10. Add Lead — `AddLeadModal` (reference)

Opened by the orange "Add Lead" button (`addOpen`). Form modal collecting name, email, phone, type, source, etc.; on submit prepends to `leads`, sets it active, and navigates to Leads. Lives in `addlead.jsx`.

---

## 11. Lead data model

`L({...})` factory fills defaults:
```
id           'L'+n (auto)
initials     from name
color        from AV_COLORS palette (by name char codes)
phone/email  generated if absent
status       'Hot' | 'Warm' | 'Cold'        (default 'Warm')
type         'Buyer' | 'Seller' | 'Renter' | 'Investor'
source       e.g. 'Zillow', 'Open House', 'Referral', 'Website', 'Meta Lead Ads'…
stage        one of STAGES keys
aiActive     true unless explicitly false
aiStatus     optional, one of AI_OPTS
needsReply   bool
score        0–100 | null
budget/area/timeline/preApproved/lastMsg/age/appt  optional
notes        optional
```

---

## 12. Tweaks (in the Tweaks panel)

```
Brand  → Accent color    options: #F97316 #EA580C #0EA5E9 #7C3AED #0D9488   (sets --accent)
Layout → Density          radio: compact | regular | comfy
         KPI strip        toggle (showKpis,  default ON)
         AI banner        toggle (showBanner, default OFF)
         Color-coded cards toggle (colorCards, default ON → toggles .nocolor)
```
Density rules: `compact` shrinks card padding to 9px, hides card message, 7px column gap; `comfy` = 15px card padding, 12px column gap.

---

## 13. Design tokens

```css
:root{
  --accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
  --secondary:#0EA5E9; --secondary-strong:#0284C7; --secondary-soft:#E7F6FD;
  --bg:#FFFFFF; --panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
  --ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --muted:#A8AEBD; --ink-faint:#B4BAC6;
  --radius:14px;
  --shadow-sm:0 1px 2px rgba(20,24,38,.05);
  --shadow:0 4px 16px rgba(20,24,38,.07);
  --shadow-lg:0 18px 50px rgba(20,24,38,.15);
  --green:#0E9F6E; --green-bg:#E4F7EF; --blue:#0EA5E9; --blue-bg:#E7F6FD;
}
@keyframes fadeUp{from{transform:translateY(8px)}to{transform:none}}
/* slidein / fade / pulse keyframes drive the panel, scrim, and AI dot */
```

---

## 14. Full CSS (leads page)

```css
.wc-muted{color:var(--muted)}
.wc-fade{animation:fadeUp .45s cubic-bezier(.2,.7,.3,1)}

/* shell */
.wc-app{display:flex;height:100vh;overflow:hidden}
.wc-main{flex:1;display:flex;flex-direction:column;min-width:0}
.wc-scroll{flex:1;overflow:auto}
.wc-side{width:248px;flex:none;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:18px 14px 14px;overflow:auto}
.wc-brand{display:flex;align-items:center;gap:10px;padding:4px 8px 18px}
.wc-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-weight:800;color:#fff;font-size:18px;background:linear-gradient(135deg,#FB923C,var(--accent));box-shadow:0 4px 12px rgba(249,115,22,.32)}
.wc-wordmark{font-weight:800;font-size:20px;letter-spacing:-.02em}
.wc-logo-img{height:30px;width:auto;display:block;flex:none}
.wc-navgroup{display:flex;flex-direction:column;gap:2px}
.wc-navlabel{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);padding:18px 10px 8px;display:flex;align-items:center;gap:8px}
.wc-nav{position:relative;display:flex;align-items:center;gap:12px;padding:9px 11px;border-radius:10px;color:var(--ink-2);font-size:14px;font-weight:600;width:100%;text-align:left;transition:.12s}
.wc-nav:hover{background:var(--line-soft);color:var(--ink)}
.wc-nav.is-active{background:var(--accent-soft);color:var(--accent-strong)}
.wc-nav.is-active .wc-icon{color:var(--accent)}
.wc-nav.is-active::before{content:"";position:absolute;left:-14px;top:7px;bottom:7px;width:3px;border-radius:0 3px 3px 0;background:var(--accent)}
.wc-nav span{flex:none}
.wc-nav .wc-nav-label{flex:1;min-width:0}
.wc-nav-badge{flex:none;min-width:22px;height:22px;padding:0 7px;border-radius:99px;background:#EDEAE4;color:var(--ink-2);font-size:11.5px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums}
.wc-nav.is-active .wc-nav-badge{background:#FBE0CC;color:var(--accent-strong)}
.wc-nav-ai{gap:11px}
.wc-nav-ai .wc-nav-tile{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex:none}
.wc-nav-ai.is-active{background:var(--line-soft)}
.wc-nav-ai.is-active::before{display:none}
.wc-nav-statusdot{flex:none;width:8px;height:8px;border-radius:50%}
.wc-side-foot{margin-top:auto;padding-top:14px}
.wc-user{display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;width:100%;text-align:left}
.wc-user:hover{background:var(--line-soft)}
.wc-user-id{display:flex;flex-direction:column;flex:1;min-width:0}
.wc-user-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc-user-role{font-size:11px;color:var(--ink-3)}
.wc-user-out{color:var(--muted)}
.wc-avatar{border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;flex:none}
.wc-avatar-grey{background:#EEECE8;color:#9A938A;font-weight:600;box-shadow:inset 0 0 0 1px rgba(0,0,0,.03)}

/* top bar */
.wc-top{height:68px;flex:none;background:var(--panel);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:18px;padding:0 26px}
.wc-top-left{flex:1;min-width:0;display:flex;align-items:center}
.wc-top-title{font-size:18px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.wc-search{flex:none;width:480px;max-width:42vw;display:flex;align-items:center;gap:10px;background:var(--line-soft);border:1px solid var(--line);border-radius:11px;padding:0 14px;height:42px;color:var(--ink-3)}
.wc-search input{border:none;background:none;outline:none;flex:1;font-size:14px;color:var(--ink)}
.wc-top-right{flex:1;justify-content:flex-end;display:flex;align-items:center;gap:14px}
.wc-iconbtn{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:var(--ink-2);transition:.12s}
.wc-iconbtn:hover{background:var(--line-soft);color:var(--ink)}
.wc-bell{position:relative}
.wc-bell-dot{position:absolute;top:9px;right:10px;width:8px;height:8px;border-radius:50%;background:var(--accent);border:2px solid var(--panel)}
.wc-top-user{display:flex;align-items:center;gap:10px;padding:5px 8px 5px 6px;border-radius:12px;cursor:pointer}
.wc-top-user:hover{background:var(--line-soft)}

/* page header + buttons */
.wc-page{padding:24px 26px 60px;max-width:1640px}
.wc-pagehead{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px}
.wc-pagehead h1{margin:0;font-size:28px;font-weight:800;letter-spacing:-.02em}
.wc-pagehead p{margin:5px 0 0;font-size:14px;color:var(--ink-2)}
.wc-pagehead-actions{display:flex;gap:10px}
.wc-ghostbtn{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-size:14px;font-weight:600;color:var(--ink-2);transition:.12s}
.wc-ghostbtn:hover{border-color:#D9D5CE;color:var(--ink);box-shadow:var(--shadow-sm)}
.wc-primary{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:11px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 16px rgba(249,115,22,.28);transition:.12s}
.wc-primary:hover{background:var(--accent-strong)}
.wc-primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}

/* KPI stat cards */
.wc-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
.wc-kpi{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;gap:11px;align-items:flex-start;box-shadow:var(--shadow-sm);transition:.14s}
.wc-kpi:hover{box-shadow:var(--shadow);transform:translateY(-1px)}
.wc-kpi.is-alert{border-color:#FBD9BE;background:linear-gradient(180deg,#FFF8F2,#fff)}
.wc-kpi-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:none}
.wc-kpi-body{min-width:0}
.wc-kpi-label{font-size:11.5px;font-weight:600;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc-kpi-row{display:flex;align-items:baseline;gap:7px;margin-top:3px}
.wc-kpi-val{font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.wc-kpi-delta{font-size:11px;font-weight:700;color:var(--ink-3)}
.wc-kpi-delta.is-up{color:#16A34A}
.wc-kpi-delta.is-alert{color:var(--accent-strong)}
.wc-kpi-range{position:absolute;top:10px;right:10px;display:flex;gap:2px;background:var(--line-soft);border-radius:7px;padding:2px}
.wc-kpi-range button{font-size:9.5px;font-weight:700;color:var(--ink-3);padding:2px 5px;border-radius:5px;line-height:1}
.wc-kpi-range button.is-on{background:var(--panel);color:var(--accent-strong);box-shadow:var(--shadow-sm)}

/* AI banner */
.wc-aibanner{display:flex;align-items:center;gap:14px;background:linear-gradient(100deg,#1F2430,#2C3242);color:#fff;border-radius:14px;padding:13px 16px;margin-bottom:16px;box-shadow:var(--shadow)}
.wc-aibanner-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,#FB923C,var(--accent));flex:none}
.wc-aibanner-text{font-size:13.5px;line-height:1.45;color:#D7DBE4;flex:1}
.wc-aibanner-text strong{color:#fff;font-weight:700}
.wc-aibanner-stats{display:flex;gap:18px;padding:0 6px}
.wc-aibanner-stats span{font-size:11.5px;color:#9AA1B2;white-space:nowrap}
.wc-aibanner-stats b{display:block;font-size:18px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums}
.wc-aibanner .wc-iconbtn{color:#9AA1B2}
.wc-aibanner .wc-iconbtn:hover{background:rgba(255,255,255,.1);color:#fff}

/* toolbar */
.wc-toolbar{margin-bottom:16px}
.wc-toolbar-row{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.wc-viewtoggle{display:flex;background:var(--line-soft);border-radius:11px;padding:3px;gap:2px}
.wc-viewtoggle button{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border-radius:9px;font-size:13px;font-weight:600;color:var(--ink-2)}
.wc-viewtoggle button.is-on{background:var(--panel);color:var(--accent-strong);box-shadow:var(--shadow-sm)}
.wc-minisearch{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:10px;height:40px;padding:0 12px;width:260px;color:var(--ink-3)}
.wc-minisearch input{border:none;outline:none;background:none;flex:1;font-size:13.5px;color:var(--ink)}
.wc-minisearch button{display:grid;place-items:center;color:var(--muted)}
.wc-toolbar-spacer{flex:1}
.wc-toolbar .wc-ghostbtn{height:40px}
.wc-chips{display:flex;flex-wrap:wrap;gap:8px}
.wc-qchip{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border-radius:99px;border:1px solid var(--line);background:var(--panel);font-size:13px;font-weight:600;color:var(--ink-2);transition:.12s}
.wc-qchip:hover{border-color:#D9D5CE;color:var(--ink)}
.wc-qchip.is-on{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 4px 12px rgba(249,115,22,.25)}

/* kanban */
.wc-board{display:flex;gap:14px;overflow-x:auto;padding-bottom:14px;align-items:flex-start}
.wc-col{flex:none;width:288px;background:var(--line-soft);border-radius:16px;display:flex;flex-direction:column;max-height:calc(100vh - 360px);transition:.14s}
.wc-col.is-over{background:var(--accent-soft);outline:2px dashed var(--accent);outline-offset:-2px}
.wc-col-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 10px;border-bottom:1px solid var(--line)}
.wc-col-title{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700}
.wc-col-dot{width:9px;height:9px;border-radius:50%;background:var(--stage);flex:none}
.wc-col-count{background:var(--panel);color:var(--ink-2);font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:99px;border:1px solid var(--line)}
.wc-col-prob{font-size:11px;font-weight:700;color:var(--stage);background:var(--panel);padding:3px 8px;border-radius:8px}
.wc-col-body{padding:10px;display:flex;flex-direction:column;gap:9px;overflow-y:auto}
.wc-col-empty{font-size:12.5px;color:var(--muted);text-align:center;padding:18px 0}
.wc-col-more{font-size:12px;font-weight:600;color:var(--ink-3);text-align:center;padding:8px;border-radius:9px;border:1px dashed var(--line);cursor:pointer}
.wc-col-more:hover{background:var(--panel);color:var(--accent-strong)}
.wc-card{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:12px;cursor:pointer;transition:.13s;box-shadow:var(--shadow-sm);border-left:3px solid var(--stage)}
.wc-app.nocolor .wc-card{border-left:1px solid var(--line)}
.wc-card:hover{box-shadow:var(--shadow);transform:translateY(-2px);border-color:#DAD6CF}
.wc-card.is-active{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft),var(--shadow)}
.wc-card-top{display:flex;align-items:center;gap:10px}
.wc-card-id{flex:1;min-width:0}
.wc-card-name{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;letter-spacing:-.01em}
.wc-card-sub{font-size:11.5px;color:var(--ink-3);margin-top:1px}
.wc-needsreply{width:24px;height:24px;border-radius:8px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
.wc-card-msg{font-size:12.5px;color:var(--ink-2);margin-top:9px;line-height:1.4;background:var(--line-soft);border-radius:9px;padding:7px 9px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.wc-card-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.wc-card-foot{display:flex;align-items:center;justify-content:space-between;margin-top:11px}
.wc-card-age{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-3)}

/* chips, tags, score, ai pill */
.wc-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:7px}
.wc-chip-buyer{background:#E7F6FD;color:#0EA5E9}
.wc-chip-seller{background:#FFF3EA;color:#EA580C}
.wc-chip-renter{background:#E3F6F2;color:#0D9488}
.wc-tag{font-size:11px;font-weight:600;color:var(--ink-2);background:var(--line-soft);padding:3px 8px;border-radius:7px}
.wc-tag-ok{background:#E8F8ED;color:#16A34A}
.wc-statusdot{width:8px;height:8px;border-radius:50%;flex:none}
.wc-ai-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#16A34A;background:#E8F8ED;padding:3px 9px;border-radius:99px}
.wc-ai-dot{width:6px;height:6px;border-radius:50%;background:#16A34A;animation:pulse 1.8s infinite}
.wc-score{display:flex;align-items:center;gap:7px}
.wc-card-foot+.wc-score{margin-top:9px}
.wc-score-track{width:54px;height:5px;border-radius:99px;background:var(--line);overflow:hidden}
.wc-score-track.wide{flex:1;height:7px}
.wc-score-fill{height:100%;border-radius:99px}
.wc-score-num{font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}

/* table */
.wc-table-wrap{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:auto;box-shadow:var(--shadow-sm)}
.wc-table{width:100%;border-collapse:collapse;font-size:13.5px}
.wc-table th{text-align:left;font-size:11.5px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;padding:13px 16px;border-bottom:1px solid var(--line);white-space:nowrap;background:var(--line-soft)}
.wc-table td{padding:11px 16px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
.wc-table tbody tr{cursor:pointer;transition:.1s}
.wc-table tbody tr:hover{background:var(--line-soft)}
.wc-table tbody tr.is-active{background:var(--accent-soft)}
.wc-table tbody tr:last-child td{border-bottom:none}
.wc-tname{display:flex;align-items:center;gap:11px}
.wc-tname-main{display:flex;align-items:center;gap:6px;font-weight:700}
.wc-tname-sub{font-size:11.5px;color:var(--ink-3)}
.wc-stage-pill{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px}
.wc-th-acts{text-align:center;width:84px}
.wc-td-acts{width:84px}
.wc-rowacts{display:grid;grid-template-columns:repeat(2,28px);grid-auto-rows:28px;gap:6px;width:max-content;margin:0 auto}
.wc-rowact{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;border:1.5px solid #FBD9BE;background:var(--panel);color:var(--accent);transition:.12s}
.wc-rowact:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm);background:var(--accent-soft);border-color:var(--accent)}
.wc-rowact.is-star.is-on{background:var(--accent);border-color:var(--accent);color:#fff}

/* inline editors */
.wc-inlsel{position:relative;display:inline-block}
.wc-inlsel-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid transparent;border-radius:8px;padding:3px 6px 3px 4px;cursor:pointer;max-width:100%}
.wc-inlsel-btn:hover{border-color:var(--line);background:var(--line-soft)}
.wc-inlsel-btn .wc-icon{color:var(--ink-3);flex:none}
.wc-inlsel-txt{font-size:13px;color:var(--ink-2);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc-inlsel-menu{position:absolute;top:30px;left:0;min-width:180px;max-height:280px;overflow-y:auto;background:var(--panel);border:1px solid var(--line);border-radius:11px;box-shadow:var(--shadow-lg);padding:6px;z-index:40}
.wc-inlsel-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:8px 9px;border-radius:8px;font-size:13px;font-weight:600;color:var(--ink-2)}
.wc-inlsel-item:hover{background:var(--line-soft)}
.wc-inlsel-item.is-on{background:var(--accent-soft)}
.wc-inlsel-check{margin-left:auto;color:var(--accent-strong)}
.wc-inledit{display:inline-flex;align-items:center;gap:6px;border:1px solid transparent;border-radius:8px;padding:3px 8px;font-size:13px;color:var(--ink);cursor:pointer}
.wc-inledit:hover{border-color:var(--line);background:var(--line-soft)}
.wc-inledit-pen{color:var(--muted);opacity:0;transition:.1s}
.wc-inledit:hover .wc-inledit-pen{opacity:1}
.wc-inltext{width:110px;height:30px;border:1px solid var(--accent);border-radius:8px;padding:0 9px;font-size:13px;font-family:inherit;color:var(--ink);outline:none;box-shadow:0 0 0 3px var(--accent-soft)}

/* side panel */
.wc-scrim{position:fixed;inset:0;background:rgba(24,28,40,.28);backdrop-filter:blur(2px);z-index:40;animation:fade .2s}
.wc-panel{position:fixed;top:0;right:0;height:100vh;width:438px;max-width:94vw;background:var(--panel);border-left:1px solid var(--line);box-shadow:var(--shadow-lg);z-index:41;display:flex;flex-direction:column;overflow-y:auto;padding:18px 22px 40px;animation:slidein .26s cubic-bezier(.22,.8,.3,1)}
.wc-panel-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.wc-panel-head .wc-iconbtn{margin-left:-8px}
.wc-panel-id{display:flex;align-items:center;gap:14px;margin-bottom:18px}
.wc-panel-name{display:flex;align-items:center;gap:8px;font-size:22px;font-weight:800;letter-spacing:-.02em}
.wc-panel-typesrc{display:flex;flex-direction:column;align-items:flex-start;gap:5px;margin-top:6px}
.wc-panel-src{font-size:12.5px}
.wc-panel-name.wc-editable{display:inline-flex;align-items:center;gap:8px;cursor:pointer;border-radius:8px}
.wc-panel-name-input{font-size:22px;font-weight:800;letter-spacing:-.02em;border:none;border-bottom:2px solid var(--accent);outline:none;font-family:inherit;color:var(--ink);width:100%;padding:0 0 2px;background:none}
.wc-score-card{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--line-soft);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:18px}
.wc-score-card-l{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--ink-2)}
.wc-score-card-r{flex:1;max-width:200px}
.wc-score-big{font-size:28px;font-weight:800;letter-spacing:-.02em;line-height:1;text-align:right;font-variant-numeric:tabular-nums}
.wc-score-big span{font-size:14px;font-weight:600;color:var(--muted)}
.wc-score-card-r .wc-score-track{margin-top:8px}
.wc-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:22px;position:relative}
.wc-act{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:700;color:var(--ink);transition:.12s}
.wc-act:hover{border-color:#D9D5CE;box-shadow:var(--shadow-sm)}
.wc-act.is-primary{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 6px 16px rgba(249,115,22,.28)}
.wc-act.is-primary:hover{background:var(--accent-strong)}
.wc-move-wrap{position:relative}
.wc-move-menu{position:absolute;top:50px;right:0;width:230px;background:var(--panel);border:1px solid var(--line);border-radius:13px;box-shadow:var(--shadow-lg);padding:6px;z-index:5}
.wc-move-item{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:9px 10px;border-radius:9px;font-size:13px;font-weight:600;color:var(--ink-2)}
.wc-move-item:hover{background:var(--line-soft);color:var(--ink)}
.wc-move-item.is-current{color:var(--accent-strong)}
.wc-move-item .wc-icon{margin-left:auto}
.wc-panel-section{margin-bottom:22px}
.wc-panel-h{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:11px}
.wc-contact{display:flex;flex-direction:column;gap:8px}
.wc-contact-row{display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:600;color:var(--ink);background:var(--line-soft);border:1px solid var(--line);border-radius:11px;padding:11px 13px;transition:.12s}
.wc-contact-row:hover{border-color:var(--accent);color:var(--accent-strong)}
.wc-contact-row .wc-icon{color:var(--ink-3)}
.wc-contact-row.wc-editable{cursor:pointer}
.wc-contact-val{flex:1}
.wc-contact-input{flex:1;border:none;outline:none;background:none;font-size:13.5px;font-weight:600;font-family:inherit;color:var(--ink)}
.wc-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.wc-field{background:var(--line-soft);border:1px solid var(--line);border-radius:11px;padding:11px 13px}
.wc-field-l{font-size:11px;font-weight:600;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em}
.wc-field-v{font-size:14.5px;font-weight:700;margin-top:3px}
.wc-field-v.is-ok{color:#16A34A}
.wc-field-btn{width:100%;text-align:left;border:1px solid var(--line);cursor:pointer;transition:.12s}
.wc-field-btn:hover{border-color:var(--accent);background:var(--accent-soft)}
.wc-field-btn .wc-field-v{display:flex;align-items:center;gap:6px}
.wc-field-pen{color:var(--muted);margin-left:auto;opacity:0;transition:.12s}
.wc-field-btn:hover .wc-field-pen,.wc-editable:hover .wc-field-pen{opacity:1}
.wc-field-empty{color:var(--muted);font-weight:600}
.wc-field-input{width:100%;border:none;outline:none;background:none;font-size:14.5px;font-weight:700;font-family:inherit;color:var(--ink);margin-top:3px;padding:0}
.wc-field.is-editing{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-notes{margin-top:14px}
.wc-notes-ta{width:100%;min-height:80px;border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:13.5px;font-family:inherit;line-height:1.5;color:var(--ink);resize:vertical;outline:none}
.wc-notes-ta:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-cc-empty{font-size:13px;color:var(--ink-3);line-height:1.5}
.wc-cc-note{font-size:12.5px;color:var(--ink-3);line-height:1.55;margin:0 0 12px}
.wc-cc-notif{display:flex;flex-direction:column;gap:10px}
.wc-cc-notifrow{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:12px;padding:13px 15px;width:100%;text-align:left;cursor:pointer;transition:.12s}
.wc-cc-notifrow:hover{border-color:var(--ink-faint)}
.wc-cc-notif-t{font-size:14px;font-weight:700;color:var(--ink)}
.wc-cc-notif-s{font-size:12px;color:var(--ink-3);margin-top:2px}
.wc-cc-bell-blue{color:#2563EB}
.wc-cc-bell-green{color:#0E9F6E}
.wc-cc-calls{display:flex;flex-direction:column;gap:9px}
.wc-cc-call{display:flex;align-items:center;gap:11px;border:1px solid var(--line);border-radius:12px;padding:11px 13px}
.wc-cc-call-ic{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none;color:#EA580C;background:#FFF3EA}
.wc-cc-call-b{min-width:0}
.wc-cc-call-t{font-size:13.5px;font-weight:700;color:var(--ink)}
.wc-cc-call-st{font-weight:500;color:var(--ink-3)}
.wc-cc-call-s{font-size:12px;color:var(--ink-3);margin-top:2px}
.wc-timeline{position:relative;padding-left:6px}
.wc-tl-item{display:flex;align-items:flex-start;gap:11px;padding-bottom:14px;position:relative}
.wc-tl-item:not(:last-child)::before{content:"";position:absolute;left:9px;top:20px;bottom:0;width:2px;background:var(--line)}
.wc-tl-check{width:20px;height:20px;border-radius:50%;background:#E8F8ED;color:#16A34A;display:grid;place-items:center;flex:none;z-index:1}
.wc-tl-text{font-size:13px;color:var(--ink);padding-top:1px}

/* empty page (non-leads nav) */
.wc-empty-page{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;color:var(--ink-2);padding:40px}
.wc-empty-icon{width:72px;height:72px;border-radius:20px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;margin-bottom:18px}
.wc-empty-page h2{margin:0 0 8px;font-size:24px;font-weight:800;color:var(--ink)}
.wc-empty-page p{margin:0;max-width:380px;font-size:14px;line-height:1.5}

/* density tweaks */
.density-compact .wc-card{padding:9px}
.density-compact .wc-card-msg{display:none}
.density-compact .wc-col-body{gap:7px}
.density-comfy .wc-card{padding:15px}
.density-comfy .wc-col-body{gap:12px}
```

---

## 15. External dependencies

- **React 18** (`useState`, `useRef`, `useEffect`, `useMemo`).
- **`<Icon name size [fill] [className] />`** — inline SVG icons. Names used here: `grid, user, inbox, tasks, calendar, bot, tag, settings, users, search, bell, chevronDown, logout, upload, plus, download, columns, list, x, flame, message, home, building, building2, playCircle, sparkles, clock, phone, mail, pencil, trash, star, check, refresh, arrowUpRight, inbound`.
- **Tweaks panel** helpers (`useTweaks`, `TweakColor/Radio/Toggle/Section`).
- Sibling components `Kanban / TableView / DetailPanel` (board.jsx), `AddLeadModal` (addlead.jsx), `ImportWizard` (import.jsx), and the `data.jsx` exports — all attached to `window`.

See `app.jsx`, `board.jsx`, and `data.jsx` for the authoritative source.

---

## 16. Icon set — full source (`icons.jsx`)

A single Lucide-style line-icon component. 24×24 viewBox, `currentColor` stroke (2px, round caps/joins), `fill="none"` by default; pass `fill` to render a solid glyph (used for the filled star). Inherits color from the surrounding text/`.wc-icon` rules.

```jsx
function Icon({ name, size = 18, stroke = 2, fill = false, className = '', style = {} }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={'wc-icon ' + className}
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={style}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}
window.Icon = Icon;
```

### Complete `ICON_PATHS` (inner SVG markup, per name)

```js
const ICON_PATHS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.94.36 1.86.7 2.74a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.34-1.34a2 2 0 0 1 2.11-.45c.88.34 1.8.57 2.74.7A2 2 0 0 1 22 16.92z"/>',
  sparkles: '<path d="M12 3l1.6 4.3L18 9l-4.4 1.7L12 15l-1.6-4.3L6 9l4.4-1.7z"/><path d="M19 14l.7 1.9L21.5 17l-1.8.7L19 19.5l-.7-1.8L16.5 17l1.8-.6z"/><path d="M5 14l.7 1.9L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.6z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  settings: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  alert: '<path d="m10.29 3.86-8.18 14a2 2 0 0 0 1.71 3h16.36a2 2 0 0 0 1.71-3l-8.18-14a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  dollar: '<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trending: '<path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/>',
  bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><path d="M8 16h.01"/><path d="M16 16h.01"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkDouble: '<path d="m18 7-8 8-2-2"/><path d="m22 7-8 8-2.5-2.5"/><path d="M7 13 4 16"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 21"/>',
  video: '<path d="m23 7-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  playCircle: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M12 10h.01"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  calendarCheck: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  building2: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>',
  tasks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  inbound: '<path d="M18 4v16"/><path d="M3 12h11"/><path d="m10 8 4 4-4 4"/>',
  outbound: '<path d="M6 4v16"/><path d="M10 12h11"/><path d="m17 8 4 4-4 4"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.41 2.41 0 0 0 3.408 0l6.58-6.58a2.41 2.41 0 0 0 0-3.408z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  barChart: '<path d="M6 20V10"/><path d="M12 20V4"/><path d="M18 20v-7"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  star: '<path d="M12 2.5l2.95 6.3 6.55.62-4.95 4.46 1.42 6.62L12 17.6 6.03 20.5l1.42-6.62L2.5 9.42l6.55-.62z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  form: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h4"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
};
```

**Icons used on the Leads page specifically:** `grid, user, inbox, tasks, calendar, bot, tag, settings, users` (sidebar nav) · `search, bell, chevronDown, logout` (top bar / user) · `upload, plus` (page header) · `columns, list, search, x, download` (toolbar) · `flame, message, home, building2, playCircle, sparkles` (quick filters) · `clock, message, home, building, building2` (lead cards / type chips) · `pencil, trash, message, star, check` (row actions / inline selects) · `phone, calendar, arrowUpRight, mail, refresh, sparkles, bell, inbound` (side panel).
