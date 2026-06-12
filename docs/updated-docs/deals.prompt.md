# Deals Page — Component Spec

The **Deals** view of WarmChats (an AI-run real-estate CRM): three drag-and-drop **pipeline boards** — one each for **Buyers**, **Sellers**, and **Renters** — switched by a tab strip. Above the boards sit a **page header** (title + Add Deal), a **KPI strip** (4 stat cards), and a dismissible **AI suggestion toast**. Each board is a horizontal **Kanban of stage columns** holding draggable **deal cards**; cards can carry an inline **"AI suggests → stage"** accept button. The orange **Add Deal** button (header, column `+`, or empty-state) opens the **Add Deal modal**.

Stack: React 18 (inline JSX / Babel), one shared `<style>` block in `index.html`. Visual language: clean cool-gray neutrals, **orange accent** (`#F97316`), 14px base radius, soft shadows, monospaced figures for money. Icons via `<Icon name size />`. Lives in `deals.jsx`; exports `window.Deals`.

---

## 1. File / component map

| Component | Role |
|-----------|------|
| `Deals({ go })` | **Root.** Owns all state (current tab, deals array, modal target, toast visibility), the move/add/create handlers, and renders header → KPIs → AI toast → tab strip → `DealBoard` → `AddDealModal`. Exported as `window.Deals`. |
| `DealBoard({ type, deals, onMove, onAdd })` | One pipeline. Maps the type's `STAGE_SETS` to `DealColumn`s, owns the **drag** (`drag`) and **drag-over** (`over`) state. |
| `DealColumn({ stage, deals, … })` | A single stage column: header (name · count · summed value · `+`) + body of `DealCard`s, with HTML5 drop-zone handlers. |
| `DealCard({ deal, onMove, onDragStart })` | One draggable deal: name, type chip, price, commission, agent, next task, optional AI-suggestion button. |
| `AddDealModal({ type, stage, onClose, onCreate })` | Centered modal to create a deal — name, stage, price, optional close-date / commission / description, people & team. |

Data lives at the top of the same file: `STAGE_SETS`, `TYPE_META`, `DEALS`, `DEAL_KPIS`, plus helpers `fmt$`, `fmtK`, `D()` (deal factory), `stageName()`. The shared `TONES` map (KPI colors) and `<Icon>` come from `data.jsx` / `icons.jsx`. File ends with `window.Deals = Deals;`. Load order in `index.html`: React → Babel → `icons.jsx` → `data.jsx` → `deals.jsx` → … → `app.jsx` last.

### Composition (inside `Deals`)
```jsx
<div className="wc-page wc-fade">
  <div className="wc-pagehead">
    <div><h1>Deals</h1><p>{deals.length} transactions · {aiCount} AI stage suggestions</p></div>
    <div className="wc-pagehead-actions">
      <button className="wc-primary" onClick={() => onAdd(tab, STAGE_SETS[tab][0].key)}><Icon name="plus"/>Add Deal</button>
    </div>
  </div>

  <div className="wc-kpis">{DEAL_KPIS.map(/* KPI card */)}</div>

  {aiCount > 0 && aiToast && <div className="wc-aitoast">/* AI suggestion toast */</div>}

  <div className="wc-deals-tabs">{tabs.map(/* Buyers / Sellers / Renters */)}</div>

  <DealBoard type={tab} deals={deals} onMove={onMove} onAdd={onAdd} />

  {addOpen && <AddDealModal type={addOpen.type} stage={addOpen.stage} onClose={…} onCreate={onCreate} />}
</div>
```

### Root state (`useDealS` = `React.useState`)
| State | Default | Role |
|-------|---------|------|
| `tab` | `'Buyer'` | Active pipeline — `'Buyer' \| 'Seller' \| 'Renter'`. Drives the visible board + which tab is lit. |
| `deals` | `DEALS` | The full deal list (all three types live in one array, filtered per board/column). |
| `addOpen` | `null` | `{type, stage}` when the Add Deal modal is open, else `null`. |
| `aiToast` | `true` | Whether the AI suggestion toast is shown (dismissible). |

### Handlers
- `onMove(deal, toStage)` → sets that deal's `stage` to `toStage` and clears its `ai` suggestion (`{...d, stage:toStage, ai:null}`). Called by both drag-drop and the card's AI accept button.
- `onAdd(type, stage)` → opens the modal targeting that column (`setAddOpen({type, stage})`).
- `onCreate(d)` → prepends a new deal (defaults agent `Joseph Velasquez` / `JV`, `ai:null`) and closes the modal.
- `aiCount` = `deals.filter(d => d.ai).length` — drives the header subtitle and toast.

---

## 2. Page header

Reuses the shared shell classes. `.wc-pagehead` is a flex row, `align-items:flex-end`, space-between, 20px gap, 20px bottom margin.
- **Title** `h1` — 28px/800/`-.02em` "Deals". Sub `p` — 14px `--ink-2`: `"{n} transactions · {aiCount} AI stage suggestions"`.
- **Action** — `.wc-primary` "Add Deal" (orange, height 42px, glow shadow), here bumped to `fontSize:15px; padding:12px 20px`. Opens the modal on the **current tab's first stage**.

---

## 3. KPI strip — `.wc-kpis`

`grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:14px`. Each `.wc-kpi`: white, 1px border, radius 14px, `padding:14px`, flex w/ 11px gap, soft shadow, hover lifts 1px. Contains a 38×38 `.wc-kpi-icon` (tinted by the KPI's `tone` via `TONES` fg/bg), a label (`.wc-kpi-label`, 11.5px/600 muted), a value (`.wc-kpi-val`, **22px/800**, mono/tabular), and a delta (`.wc-kpi-delta`, 11px/700; `.is-up` → green `#16A34A`).

**`DEAL_KPIS`:**
```js
[ { icon:'dollar',  label:'Pipeline Value',    value:'$348K', delta:'commission opportunity', tone:'green'   },
  { icon:'layers',  label:'Active Deals',      value:'24',    delta:'open transactions',       tone:'indigo'  },
  { icon:'file',    label:'Under Contract',    value:'2',     delta:'in progress',             tone:'blue'    },
  { icon:'trophy',  label:'Closed This Month', value:'4',     delta:'+1 vs last month', up:true, tone:'emerald' } ]
```
**`TONES`** used here (fg / bg): green `#16A34A`/`#E8F8ED`, indigo `#4F46E5`/`#ECEDFD`, blue `#0EA5E9`/`#E7F6FD`, emerald `#059669`/`#E6F7EF`. (Full `TONES` map lives in `data.jsx`.)

---

## 4. AI suggestion toast — `.wc-aitoast`

Rendered when `aiCount > 0 && aiToast`. **Fixed**, bottom-right (`right:26px; bottom:26px`), z-60, width 360px (`max-width:calc(100vw - 52px)`), white card, radius 16px, `padding:15px 16px`, `--shadow-lg`, slides up via `@keyframes aiToastIn` (`.4s` cubic-bezier).
- `.wc-aitoast-ic` — 34×34 orange-gradient sparkle tile (`linear-gradient(135deg,#FB923C,var(--accent))`), white icon, glow.
- `.wc-aitoast-body` → `.wc-aitoast-title` (14px/800 ink) + `.wc-aitoast-sub` (12.5px/1.45 `--ink-2`).
- `.wc-aitoast-x` — 26×26 dismiss button (`setAiToast(false)`); hover `--line-soft`.

Copy: title `"AI suggests {n} stage move(s)"`, sub *"WarmChats watched the conversations and is ready to advance these deals — accept on a card to move it."*

---

## 5. Tab strip — `.wc-deals-tabs`

Flex, 4px gap, **bottom border** (`1px var(--line)`), `margin:18px 0 16px`. Three tabs (`tabs` array):
```js
[ { key:'Buyer',  label:'Buyers',  icon:'home' },
  { key:'Seller', label:'Sellers', icon:'building2' },
  { key:'Renter', label:'Renters', icon:'home' } ]
```
Each `.wc-dtab`: inline-flex, 8px gap, `padding:11px 16px`, `margin-bottom:-1px` (so the active underline sits on the strip border), 13.5px/600 `--ink-3`, `border-bottom:2px solid transparent`; hover → `--ink`. Active `.is-on` → `--accent-strong` text + accent underline + accent icon. Trailing count pill `.wc-dtab-c` (`padding:1px 7px`, pill, `--line-soft`); when active → accent-soft bg. Count = deals of that type.

---

## 6. Board — `DealBoard` → `.wc-board`

`.wc-board`: `display:flex; gap:14px; overflow-x:auto; padding-bottom:14px; align-items:flex-start` — one `DealColumn` per stage in `STAGE_SETS[type]`, horizontally scrollable.

**Drag & drop (HTML5 DnD):**
- `DealCard` is `draggable`; `onDragStart` sets `dataTransfer.effectAllowed='move'` and calls up `setDrag(deal)`.
- A column fires `onDragOver` (`preventDefault` + `setOver(stage.key)`), `onDragLeave` (clears `over` if it was this column), and `onDrop` → if `drag.stage !== stage.key`, calls `onMove(drag, stage.key)`, then clears `drag`/`over`.
- The hovered column shows `.is-over` (accent-soft bg + 2px dashed accent outline, inherited from `.wc-col.is-over`).

---

## 7. Stage column — `DealColumn` → `.wc-col.wc-dcol`

Base `.wc-col`: `flex:none; width:288px; background:var(--line-soft); border-radius:16px; display:flex; flex-direction:column; max-height:calc(100vh - 360px)`. The deals variant `.wc-dcol` rounds the top tighter (`border-radius:14px 14px 16px 16px; overflow:hidden`). Each column gets an **inline `borderTop:3px solid {stage.color}`** as a stage accent.

**Header** `.wc-dhead` (`padding:13px 14px 11px`, white bg, bottom border):
- `.wc-dhead-title` — 13.5px/700 stage name.
- `.wc-dhead-meta` — row (8px gap, 11.5px/600 muted, `margin-top:5px`): `"{n} deal(s)"` · `.wc-dhead-val` (summed commission via `fmtK`, green `--green`) · `.wc-dadd` (the `+`).
- `.wc-dadd` — 24×24, radius 7px, accent on accent-soft; hover → solid accent + white. Calls `onAdd(stage.key)`.

**Body** `.wc-col-body` (`padding:10px; flex column; gap:9px; overflow-y:auto`): the `DealCard`s. When empty → `.wc-dempty` button (`"No deals · add deal"`, the *add deal* span in accent) that opens the modal for this stage.

The column's commission total = `deals.reduce((s,d) => s + d.comm, 0)`.

---

## 8. Deal card — `DealCard` → `.wc-card.wc-dcard`

Base `.wc-card` (white, 1px border, radius 13px, `padding:12px`, soft shadow). The `.wc-dcard` override removes the left accent bar, sets `cursor:grab` (`:active` → `grabbing`), and on hover just deepens the shadow (no lift). `draggable`.

Contents, top→bottom:
1. **Top row** `.wc-dcard-top` (flex, space-between, align-start, 8px gap):
   - `.wc-dcard-name` — 14px/700/`-.01em`, line-height 1.25 (the deal/person name).
   - **Type chip** `.wc-chip {meta.chip}` — 11px/700 pill: `wc-chip-buyer` `#E7F6FD`/`#0EA5E9` (home), `wc-chip-seller` `#FFF3EA`/`#EA580C` (building2), `wc-chip-renter` `#E3F6F2`/`#0D9488` (home). Icon + type label.
2. **Price** `.wc-dprice.wc-mono` — 18px/800/`-.02em`, `margin-top:9px`. Renters render `fmt$(price)+"/mo"`; Buyers/Sellers render `fmt$(price)`.
3. **Commission** `.wc-dcomm` — 12px/600 **green** row (`margin-top:3px`): dollar icon + `meta.feeLabel` + `<strong className="wc-mono">{fmt$(comm)}</strong>`. Labels: Buyer/Seller → "Est. commission", Renter → "Est. fee (1 mo.)".
4. **Agent** `.wc-dagent` — 12px/600 `--ink-2` row (`margin-top:11px`): `.wc-dagent-av` (20px grey initials circle) + agent name.
5. **Task** `.wc-dtask` — 12px `--ink-2` chip on `--line-soft` (radius 9px, `padding:8px 10px`, `margin-top:11px`): `calendarCheck` icon + next-action text.
6. **AI move button** (only if `deal.ai`) `.wc-aimove` — full-width peach-bordered gradient pill (`linear-gradient(100deg,var(--accent-soft),#fff)`, border `#FBE0CC`, accent-strong text): sparkles + `"AI suggests → {stageName(type, deal.ai)}"` + a 22×22 solid-accent check tile `.wc-aimove-go`. Clicking calls `onMove(deal, deal.ai)` — advancing the deal and clearing the suggestion.

> Note: cards render with `key={i}` (array index) inside the column map.

---

## 9. Add Deal modal — `AddDealModal` → `.wc-modal-scrim` / `.wc-modal`

Opened via header / column `+` / empty-state. Centered, top-aligned overlay.

**Scrim** `.wc-modal-scrim` — `position:fixed; inset:0; background:rgba(24,28,40,.34); backdrop-filter:blur(2px); z-60; flex; align-items:flex-start; justify-content:center; padding:56px 20px; overflow-y:auto`, fades in. Clicking the scrim closes; the dialog stops propagation.

**Dialog** `.wc-modal` — width 560px, white, 1px border, radius 18px, `--shadow-lg`, `padding:24px 26px 20px`, `fadeUp` entrance. Close `×` = `.wc-modal-x` (32px, top-right).

**Fields (top → bottom):**
1. **Title input** `.wc-modal-title` — borderless 22px/800 input with a 2px underline (accent on focus), placeholder "Deal name", `autoFocus`. **Enter submits.** This is the only required field (`can = name.trim()`).
2. **Breadcrumb** `.wc-modal-crumb` — `#{type}` tag (`.wc-crumb-tag`, accent-strong) → chevron → `.wc-crumb-stage` (a `.wc-col-dot` colored `--stage` + current stage name). Reflects the live stage selection.
3. **Grid** `.wc-modal-grid` (2-col, `gap:16px 28px`):
   - **Stage** — `.wc-modal-input.wc-modal-select` `<select>` of the type's stages (default = the column you opened from).
   - **Price / Monthly rent** — `.wc-modal-input.wc-mono` number input (label switches to "Monthly rent" for Renters).
   - **Close date** — reveal-on-click: `.wc-modal-link` "Add close date" → a `type="date"` input.
   - **Commission / Fee** — reveal-on-click link → number input (label "Fee" for Renters). If left blank, commission auto-computes as `price × meta.rate`.
4. **People & Team row** `.wc-modal-row` (2-col):
   - **People** — a `.wc-addcirc` (38px dashed circle `+`).
   - **Team** — a 32px accent "JV" `.wc-avatar` + `.wc-addcirc`.
5. **Description** `.wc-modal-fieldfull` — reveal-on-click link → `.wc-modal-textarea` (min-height 72px, vertical resize).
6. **Footer** `.wc-modal-foot` (right-aligned, top border): `.wc-ghostbtn` "Cancel" + `.wc-primary` "Create Deal" (disabled until name is non-empty).

Each labelled cell uses `.wc-modal-lbl` (11px/700 uppercase muted). On submit, `onCreate` builds `{type, stage, name, price, comm, task:'New deal'}` and prepends it.

---

## 10. Stage sets — `STAGE_SETS`

Each pipeline is an ordered array of `{ key, name, color }`. The `color` drives the column top-border, the breadcrumb dot, and the `--stage` var.

**Buyer:** Buyer Consultation `#F59E0B` · Home Search `#38BDF8` · Property Tours `#8B5CF6` · Offer Writing `#6366F1` · Offer Submitted `#0EA5E9` · Under Contract `#14B8A6` · Escrow `#F97316` · Closed Won `#22C55E`.

**Seller:** Listing Consultation `#F59E0B` · Agreement Signed `#38BDF8` · Prepping Property `#8B5CF6` · Active Listing `#6366F1` · Offer Received `#0EA5E9` · Under Contract `#14B8A6` · Escrow `#F97316` · Closed Won `#22C55E`.

**Renter:** Renter Consultation `#F59E0B` · Property Search `#38BDF8` · Showings `#8B5CF6` · Application Submitted `#6366F1` · Screening `#0EA5E9` · Approved `#14B8A6` · Lease Signed `#F97316` · Moved In `#22C55E`.

`stageName(type, key)` resolves a stage key → display name (falls back to the key).

---

## 11. Type metadata — `TYPE_META`

```js
'Buyer':  { icon:'home',      chip:'wc-chip-buyer',  monthly:false, rate:0.025, feeLabel:'Est. commission' },
'Seller': { icon:'building2', chip:'wc-chip-seller', monthly:false, rate:0.025, feeLabel:'Est. commission' },
'Renter': { icon:'home',      chip:'wc-chip-renter', monthly:true,  rate:1,     feeLabel:'Est. fee (1 mo.)' },
```
- `monthly` → price shows `/mo` and the commission label/field reads "Fee".
- `rate` → default commission = `price × rate` (2.5% for sale, 1 month for rent).

---

## 12. Deal data model — `D()` factory

```js
const D = (name, type, price, stage, task, opts = {}) => ({
  name, type, price, stage, task,
  comm: Math.round(price * TYPE_META[type].rate),
  agent: opts.agent || 'Joseph Velasquez',
  agentInit: (opts.agent || 'Joseph Velasquez').split(' ').map(w=>w[0]).join('').slice(0,2),
  ai: opts.ai || null,   // a stage key the AI suggests advancing to
});
```
| Field | Meaning |
|-------|---------|
| `name` | Deal / client name shown on the card. |
| `type` | `'Buyer' \| 'Seller' \| 'Renter'` — which board it lives on. |
| `price` | Sale price, or monthly rent for Renters. |
| `stage` | Stage `key` (must exist in that type's `STAGE_SETS`). |
| `task` | Next-action text in the card's task chip. |
| `comm` | Commission/fee (auto from `rate`, or overridden on create). |
| `agent` / `agentInit` | Assigned agent + initials for the avatar. |
| `ai` | Optional stage key → renders the "AI suggests →" accept button. |

`DEALS` seeds **27 deals** (11 Buyers, 9 Sellers, 8 Renters). Four carry an `ai` suggestion: John Smith → Offer Writing, Diane Foster → Agreement Signed, Sam Carter → Application Submitted (plus their pipelines). Money helpers: `fmt$(n)` → `"$620,000"`; `fmtK(n)` → compact `"$348K"` / `"$3.2K"` for column totals.

---

## 13. Design tokens

```css
:root{
  --accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
  --bg:#FFFFFF; --panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
  --ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --muted:#A8AEBD;
  --radius:14px;
  --shadow-sm:0 1px 2px rgba(20,24,38,.05);
  --shadow:0 4px 16px rgba(20,24,38,.07);
  --shadow-lg:0 18px 50px rgba(20,24,38,.15);
  --green:#0E9F6E; --green-bg:#E4F7EF;
}
.wc-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.wc-fade{animation:fadeUp .45s cubic-bezier(.2,.7,.3,1)}
@keyframes fadeUp{from{transform:translateY(8px)}to{transform:none}}
@keyframes aiToastIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
/* AI-affordance peach border: #FBE0CC.  Success green: #16A34A / #E8F8ED. */
```

---

## 14. Full CSS (Deals page)

```css
/* AI toast */
.wc-aitoast{position:fixed;right:26px;bottom:26px;z-index:60;display:flex;align-items:flex-start;gap:12px;width:360px;max-width:calc(100vw - 52px);background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px 16px;box-shadow:var(--shadow-lg);animation:aiToastIn .4s cubic-bezier(.2,.7,.3,1) both}
.wc-aitoast-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;flex:none;background:linear-gradient(135deg,#FB923C,var(--accent));box-shadow:0 4px 12px rgba(249,115,22,.3)}
.wc-aitoast-body{flex:1;min-width:0}
.wc-aitoast-title{font-size:14px;font-weight:800;color:var(--ink);letter-spacing:-.01em;margin-bottom:3px}
.wc-aitoast-sub{font-size:12.5px;line-height:1.45;color:var(--ink-2)}
.wc-aitoast-x{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;color:var(--ink-3);flex:none;transition:.12s}
.wc-aitoast-x:hover{background:var(--line-soft);color:var(--ink)}

/* board + base column (shared with Leads kanban) */
.wc-board{display:flex;gap:14px;overflow-x:auto;padding-bottom:14px;align-items:flex-start}
.wc-col{flex:none;width:288px;background:var(--line-soft);border-radius:16px;display:flex;flex-direction:column;max-height:calc(100vh - 360px);transition:.14s}
.wc-col.is-over{background:var(--accent-soft);outline:2px dashed var(--accent);outline-offset:-2px}
.wc-col-body{padding:10px;display:flex;flex-direction:column;gap:9px;overflow-y:auto}
.wc-col-dot{width:9px;height:9px;border-radius:50%;background:var(--stage);flex:none}

/* tab strip */
.wc-deals-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:18px 0 16px}
.wc-dtab{display:inline-flex;align-items:center;gap:8px;padding:11px 16px;margin-bottom:-1px;font-size:13.5px;font-weight:600;color:var(--ink-3);border-bottom:2px solid transparent}
.wc-dtab:hover{color:var(--ink)}
.wc-dtab.is-on{color:var(--accent-strong);border-bottom-color:var(--accent)}
.wc-dtab.is-on .wc-icon{color:var(--accent)}
.wc-dtab-c{padding:1px 7px;border-radius:99px;background:var(--line-soft);font-size:11px;color:var(--ink-2);font-weight:700}
.wc-dtab.is-on .wc-dtab-c{background:var(--accent-soft);color:var(--accent-strong)}

/* deal column */
.wc-dcol{border-radius:14px 14px 16px 16px;overflow:hidden}
.wc-dhead{padding:13px 14px 11px;background:var(--panel);border-bottom:1px solid var(--line)}
.wc-dhead-title{font-size:13.5px;font-weight:700;letter-spacing:-.01em}
.wc-dhead-meta{display:flex;align-items:center;gap:8px;margin-top:5px;font-size:11.5px;color:var(--ink-3);font-weight:600}
.wc-dhead-val{color:var(--green)}
.wc-dadd{margin-left:auto;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;color:var(--accent);background:var(--accent-soft)}
.wc-dadd:hover{background:var(--accent);color:#fff}

/* deal card */
.wc-dcard{border-left:none;cursor:grab}
.wc-dcard:active{cursor:grabbing}
.wc-dcard:hover{transform:none;box-shadow:var(--shadow)}
.wc-dcard-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.wc-dcard-name{font-size:14px;font-weight:700;letter-spacing:-.01em;line-height:1.25}
.wc-dprice{font-size:18px;font-weight:800;letter-spacing:-.02em;margin-top:9px}
.wc-dcomm{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--green);font-weight:600;margin-top:3px}
.wc-dcomm .wc-icon{color:var(--green)}
.wc-dcomm strong{font-weight:800}
.wc-dagent{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-2);font-weight:600;margin-top:11px}
.wc-dagent-av{width:20px;height:20px;border-radius:50%;background:#EEECE8;color:#9A938A;display:grid;place-items:center;font-size:9px;font-weight:700}
.wc-dtask{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-2);background:var(--line-soft);border-radius:9px;padding:8px 10px;margin-top:11px}
.wc-dtask .wc-icon{color:var(--ink-3);flex:none}

/* AI move accept button */
.wc-aimove{display:flex;align-items:center;gap:7px;width:100%;margin-top:9px;padding:8px 10px;border-radius:9px;background:linear-gradient(100deg,var(--accent-soft),#fff);border:1px solid #FBE0CC;font-size:12px;font-weight:600;color:var(--accent-strong);text-align:left}
.wc-aimove>span{flex:1}
.wc-aimove:hover{background:var(--accent-soft)}
.wc-aimove-go{flex:none!important;width:22px;height:22px;border-radius:6px;background:var(--accent);color:#fff;display:grid;place-items:center}

/* empty column */
.wc-dempty{width:100%;padding:16px;font-size:12.5px;color:var(--muted);text-align:center}
.wc-dempty span{color:var(--accent-strong);font-weight:600}

/* type chips (shared) */
.wc-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:7px}
.wc-chip-buyer{background:#E7F6FD;color:#0EA5E9}
.wc-chip-seller{background:#FFF3EA;color:#EA580C}
.wc-chip-renter{background:#E3F6F2;color:#0D9488}

/* base card (shared with Leads) */
.wc-card{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:12px;cursor:pointer;transition:.13s;box-shadow:var(--shadow-sm)}
.wc-card:hover{box-shadow:var(--shadow);transform:translateY(-2px);border-color:#DAD6CF}

/* Add Deal modal */
.wc-modal-scrim{position:fixed;inset:0;background:rgba(24,28,40,.34);backdrop-filter:blur(2px);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:56px 20px;overflow-y:auto;animation:fade .18s}
.wc-modal{width:560px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-lg);padding:24px 26px 20px;position:relative;animation:fadeUp .25s cubic-bezier(.2,.7,.3,1) both}
.wc-modal-x{position:absolute;top:18px;right:18px;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:var(--ink-3)}
.wc-modal-x:hover{background:var(--line-soft);color:var(--ink)}
.wc-modal-title{font-size:22px;font-weight:800;letter-spacing:-.02em;border:none;border-bottom:2px solid var(--line);outline:none;width:90%;padding:0 0 6px;color:var(--ink)}
.wc-modal-title:focus{border-bottom-color:var(--accent)}
.wc-modal-title::placeholder{color:var(--ink-3)}
.wc-modal-crumb{display:flex;align-items:center;gap:8px;margin:8px 0 22px;color:var(--ink-3)}
.wc-crumb-tag{font-size:13px;font-weight:700;color:var(--accent-strong)}
.wc-crumb-stage{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--ink-2)}
.wc-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;margin-bottom:20px}
.wc-modal-row{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:20px}
.wc-modal-fieldfull{margin-bottom:18px}
.wc-modal-lbl{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}
.wc-modal-input{width:100%;height:40px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font-size:14px;font-family:inherit;color:var(--ink);background:var(--panel);outline:none}
.wc-modal-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-modal-select{appearance:none;cursor:pointer}
.wc-modal-textarea{width:100%;min-height:72px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px;font-family:inherit;color:var(--ink);resize:vertical;outline:none}
.wc-modal-textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-modal-link{font-size:13.5px;font-weight:600;color:var(--accent-strong);padding:9px 0}
.wc-modal-link:hover{text-decoration:underline}
.wc-addcirc{width:38px;height:38px;border-radius:50%;border:1.5px dashed var(--line-strong,#DAD6CF);display:grid;place-items:center;color:var(--ink-3)}
.wc-addcirc:hover{border-color:var(--accent);color:var(--accent-strong)}
.wc-modal-team{display:flex;align-items:center;gap:8px}
.wc-modal-foot{display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--line-soft);padding-top:16px;margin-top:4px}

/* buttons (shared) */
.wc-primary{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:11px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 16px rgba(249,115,22,.28);transition:.12s}
.wc-primary:hover{background:var(--accent-strong)}
.wc-primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.wc-ghostbtn{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-size:14px;font-weight:600;color:var(--ink-2);transition:.12s}
.wc-ghostbtn:hover{border-color:#D9D5CE;color:var(--ink);box-shadow:var(--shadow-sm)}

/* KPI strip (shared with Leads) */
.wc-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
.wc-kpi{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;gap:11px;align-items:flex-start;box-shadow:var(--shadow-sm);transition:.14s}
.wc-kpi:hover{box-shadow:var(--shadow);transform:translateY(-1px)}
.wc-kpi-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:none}
.wc-kpi-body{min-width:0}
.wc-kpi-label{font-size:11.5px;font-weight:600;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc-kpi-row{display:flex;align-items:baseline;gap:7px;margin-top:3px}
.wc-kpi-val{font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.wc-kpi-delta{font-size:11px;font-weight:700;color:var(--ink-3)}
.wc-kpi-delta.is-up{color:#16A34A}
```

---

## 15. External dependencies

- **React 18** (`useState` only; aliased `useDealS`).
- **`<Icon name size />`** — inline SVG icons (`icons.jsx`). Names used: `plus` (header/column add), `dollar, layers, file, trophy` (KPIs), `sparkles` (toast + AI move), `x` (dismiss/close), `home, building2` (tabs + type chips), `calendarCheck` (card task), `check` (AI move accept), `chevronRight` (modal breadcrumb).
- **`TONES`** color map — from `data.jsx`.
- Shared shell/classes from `app.jsx` + `index.html`'s `<style>` (`.wc-page`, `.wc-pagehead`, `.wc-primary`, `.wc-ghostbtn`, `.wc-board`, `.wc-col`, `.wc-card`, `.wc-kpis`, modal classes).
- Routing: the app shell renders `<Deals go={go} />` when `nav === 'deals'`; `go(page)` navigates between tabs.

See `deals.jsx` for the authoritative source.
