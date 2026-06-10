# Import Leads Wizard — Component Spec

A full-screen modal **4-step wizard** (+ success screen) for bulk-importing real-estate leads from CSV/XLSX into WarmChats. Steps: **Upload File → Map Columns → Import Settings → Review & Import**, then a **Import Complete** confirmation. Built with React (inline JSX / Babel). Component: `ImportWizard` in `import.jsx`, mounted from `App` when `importOpen` is true (opened by the "Import Leads" ghost button on the Leads page).

Visual language: clean cool-gray neutrals, **orange accent** (`#F97316`), per-card colored icon tiles, soft shadows. Icons via `<Icon name size />`.

---

## 1. Props & shell

```jsx
<ImportWizard onClose={() => setImportOpen(false)} go={setNav} onImport={() => {}} />
```
| Prop | Type | Description |
|------|------|-------------|
| `onClose` | `() => void` | Dismiss the wizard (backdrop click, ✕, or after navigating). |
| `go` | `(navKey) => void` | App router — used by the success screen ("View Leads" → `'leads'`, "Open Workflow" → `'agents'`). |
| `onImport` | `() => void` | Hook for committing the import (no-op in the prototype). |

**Backdrop** `.wc-modal-scrim` (fixed, `rgba(24,28,40,.34)` + blur, z-60, top-aligned, scrollable).
**Shell** `.wc-wz.wc-imp-wz` — **width 1040px**, `max-width:100%`, `max-height:92vh`, white, radius 18px, `--shadow-lg`, `padding:0`, `overflow:hidden`, flex column (`fadeUp .25s` entrance). Three stacked regions: a fixed **top bar**, a scrolling **body**, and a fixed **summary/footer bar**.

---

## 2. State (all `useState`, aliased `useImpS`)

| State | Default | Purpose |
|-------|---------|---------|
| `step` | `1` | Current step 1–4. |
| `file` | `null` | `{ name, size }` once picked. |
| `drag` | `false` | Drop-zone drag-over highlight. |
| `mapOpen` | `false` | Step 2 mapped-columns disclosure. |
| `extraMap` | `'notes'` | Field chosen for the unmapped "Comments" column. |
| `dupe` | `'ignore'` | `'ignore'` \| `'update'` — duplicate handling. |
| `aiReply` | `true` | AI responds when lead replies. |
| `aiQual` | `true` | AI qualification. |
| `humanOnly` | `false` | Disables AI (dims the two AI checkboxes). |
| `workflow` | `'Buyer Follow-Up'` | One of `IMP_WORKFLOWS`. |
| `stage` | `'New Lead'` | One of `IMP_STAGES`. |
| `tags` | `['Imported {today}', 'Zillow Leads']` | Tag chips. |
| `tagInput` | `''` | Tag entry field. |
| `consent` | `'optin'` | `'optin'` \| `'unknown'` \| `'dns'`. |
| `done` | `false` | Switches to the success screen. |
| `saveTpl`, `tplName` | `false`, `''` | "Save as template" (referenced in review note). |

**Derived:** `aiActive = (aiReply || aiQual) && !humanOnly`. `canNext = step===1 ? !!file : true`. Detected counts mock: `{ found: 1404, valid: 1350, dupes: 54 }`.
**Helpers:** `pickFile()` sets a mock `zillow-leads-june.csv / 418 KB`; `applyPreset(name)` regex-matches Zillow/Open House/Past Client to preset workflow+stage+consent+dupe; `addTag()`, `next()`, `back()`, `runImport()` (→ `done=true`), `reset()`.

**Data constants:**
```js
IMP_WORKFLOWS = ['None','Buyer Follow-Up','Seller Follow-Up','Open House','Cold Lead Nurture','Past Client','Long-Term Nurture'];
IMP_STAGES    = ['New Lead','Contacted','Engaged','Qualified','Appointment Set'];
IMP_STEPS     = ['Upload File','Map Columns','Import Settings','Review & Import'];
IMP_MAPPED    = [['First Name','first_name'],['Last Name','last_name'],['Phone','phone'],['Email','email'],
                 ['Source','source'],['Property Interest','area'],['Budget','budget'],['Created Date','created']];
IMP_FIELDS    = ['name','phone','email','source','area','budget','stage','notes','consent','— Do not import —'];
// per-card icon tile color pairs [fg, bg]:
T_BLUE=['#2563EB','#EAF1FF']  T_GREEN=['#16A34A','#E8F8ED']  T_ROSE=['#E11D48','#FFE8EE']  T_ORANGE=['#EA580C','#FFEDE3']
```

---

## 3. Top bar — `.wc-imp-top`

`display:flex; align-items:center; gap:24px; padding:18px 26px`, bottom border, fixed (`flex:none`). Three parts:
- **Brand** `.wc-imp-brand`: 44×44 accent-soft tile w/ `file` icon + title "Import Leads" (19px/800) + sub "Step {n} of 4 — {label}".
- **Stepper** `ImpStepper` `.wc-imp-stepper` (centered, max 620px): 4 nodes `.wc-imp-snode` (width 108px) each a 32px circle `.wc-imp-scirc` (number, or `check` when done) + label, joined by 2px connector lines `.wc-imp-sline`. Current node = solid accent circle + 4px accent-soft ring + dark bold label; done = solid accent circle; future = grey outline.
- **Close** `.wc-imp-close` (34×34, top-right).

---

## 4. Body — `.wc-imp-bodywrap` (`flex:1; overflow-y:auto; padding:24px 26px`)

Steps 1, 2, 4 use a centered `.wc-imp-narrow` (max 620px); step 3 is full-width two-column. Lead-in text uses `.wc-imp-lead` (14.5px, muted).

### Step 1 — Upload File
- Empty: drop zone `.wc-imp-drop` — 2px dashed, radius 16px, `padding:44px 24px`, `--line-soft` bg; hover/`.is-drag` → accent border + accent-soft bg. Contains a 60px accent-soft icon tile (`upload`), "Drag & drop your file here", a "browse — CSV or XLSX, up to 50MB" hint (`browse` in accent), and a small primary **Browse files** button (`.wc-primary.wc-sm`, 36px). Click or drop calls `pickFile()`.
- Filled: a file row `.wc-imp-file` (file icon tile + name + size + remove ✕). Then a 3-up stat grid `.wc-imp-stats` of `ImpStat` cards — **Leads found** (`found`/accent), **Valid & ready** (`ok`/green), **Duplicates** (`warn`/amber). Then `.wc-imp-saved` 1-click preset chips `.wc-imp-chip` (Zillow Import, Open House Import, Past Client Import; `zap` icon; hover fills accent).

### Step 2 — Map Columns
- Disclosure button `.wc-imp-mapsummary` (green tint) "8 fields mapped automatically" w/ chevron; expands `.wc-imp-maplist` of `.wc-imp-maprow` (column name → mono field name → green check) from `IMP_MAPPED`.
- "Needs your attention" header `.wc-imp-attn-h` with a count badge `.wc-imp-attn-n` (1). One attention card `.wc-imp-attn` (amber tint): the unmapped **"Comments"** column + sample text → a `<select>` `.wc-imp-attn-sel` (width 200px) bound to `extraMap`, options = `IMP_FIELDS`.

### Step 3 — Import Settings (`.wc-imp-cols`, 2-col grid, 18px gap)
Each setting is an `ImpCard` (1px border, radius 14px, `padding:18px`) with a 30px colored icon tile, numbered title, optional sub.
**Left column:**
1. **Duplicate Handling** (`users`/blue) — two radio buttons `.wc-imp-radio` (Ignore Duplicates *(Recommended)*, Update Existing). Selected = accent border + accent-soft bg, custom `.wc-radio` dot.
2. **AI & Automation Settings** (`sparkles`/green) — three checkbox rows `.wc-imp-check`: "AI Responds When Lead Replies" *(Recommended pill)*, "AI Qualification", "Human Only". Checking Human Only dims (`.is-dim`) and disables the two AI checkboxes.
3. **Pipeline Stage** (`flag`/rose) — `<select>` of `IMP_STAGES`.
**Right column:**
4. **Workflow / Automation** (`zap`/orange) — `<select>` of `IMP_WORKFLOWS`; if not "None", a `.wc-imp-next` info panel ("What happens next?").
5. **Tags** *(Optional)* (`tag`/blue) — tag box `.wc-imp-tagbox` of removable `.wc-imp-tag` chips + free `.wc-imp-taginput` (Enter to add).
6. **SMS Consent Status** (`message`/green) — three plain radios `.wc-imp-radio.plain`: Opted In *(Recommended)*, Unknown / Prior Relationship, Do Not SMS.

### Step 4 — Review & Import
A summary table `.wc-imp-review` of `.wc-imp-revrow` (icon+label → value): Leads `1,404`, Duplicate Handling, AI (Active/Off + which features), Workflow, Stage, SMS consent, Tags. Optional `.wc-imp-tplnote` if saving a template. A green `.wc-imp-ready` banner "Ready to import. AI begins working new leads immediately."

---

## 5. Footer — `SummaryBar` / `.wc-imp-sumbar`

Fixed bottom strip (`flex:none; padding:14px 26px`, top border). **Back** ghost button (disabled on step 1; chevron rotated 90°) · flexible spacer · a right-aligned CTA cluster `.wc-imp-cta`: a tall (46px) **primary** button + a `.wc-imp-stepnote` caption.
- Steps 1–2: CTA "Continue" (`arrowRight`), disabled until `canNext`.
- Step 3: CTA "Continue to Review".
- Step 4: CTA "Import Leads" (`upload`) → `runImport()`.

---

## 6. Success screen (`done === true`)

Replaces the wizard with the same `.wc-wz.wc-imp-wz` shell containing `.wc-imp-done` (centered, `padding:36px 26px 40px`): a 74px green circle `.wc-imp-done-ic` (`checkCircle`), title "Import Complete", subtitle, then a 4-up `.wc-imp-donegrid` of stat tiles — **1,404 Imported** (ok), **54 Duplicates skipped** (muted), **AI status** Active/Off (ai/blue), **Workflow applied** (wf/accent). Actions `.wc-imp-doneacts`: primary **View Leads** (→ `go('leads')`), ghost **Open Workflow** (disabled if workflow "None", → `go('agents')`), ghost **Import Another File** (→ `reset()`).

---

## 7. Design tokens

```css
:root{
  --accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
  --panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8; --line-strong:#D8D4CD;
  --ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --muted:#A8AEBD; --ink-faint:#B4BAC6;
  --mono:ui-monospace,"JetBrains Mono","SF Mono",Menlo,monospace;
  --shadow-sm:0 1px 2px rgba(20,24,38,.05); --shadow-lg:0 18px 50px rgba(20,24,38,.15);
}
@keyframes fadeUp{from{transform:translateY(8px)}to{transform:none}}
```
Semantic tints used: green `#16A34A`/`#E8F8ED` (+ `#15803D`, `#BFE6CC`, `#EFFAF2` for map summary), amber `#C2740B`/`#FEF6E7` (+ `#F4D9A6`/`#FFFBF3` attention card), blue `#2563EB`/`#EAF4FF`, rose `#E11D48`/`#FFE8EE`.

---

## 8. Full CSS

```css
/* shell + shared */
.wc-modal-scrim{position:fixed;inset:0;background:rgba(24,28,40,.34);backdrop-filter:blur(2px);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:56px 20px;overflow-y:auto}
.wc-wz{width:920px;max-width:100%;max-height:88vh;overflow-y:auto;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-lg);padding:24px 26px 0;position:relative;animation:fadeUp .25s cubic-bezier(.2,.7,.3,1) both}
.wc-wz-title{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0}
.wc-wz-sub{font-size:14px;color:var(--ink-2);margin:4px 0 0}
.wc-modal-x{position:absolute;top:18px;right:18px;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:var(--ink-3)}
.wc-band-d{font-size:12px;color:var(--ink-3);line-height:1.45;margin-top:2px}
.wc-accent-text{color:var(--accent-strong);font-weight:600}
.wc-sm{height:36px!important;padding:0 14px!important;font-size:13px!important}
.wc-iconbtn-sm{width:32px;height:32px;border-radius:8px;border:1px solid var(--line);display:grid;place-items:center;color:var(--ink-3)}
.wc-iconbtn-sm:hover{background:var(--line-soft)}
.wc-modal-input{width:100%;height:40px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font-size:14px;font-family:inherit;color:var(--ink);background:var(--panel);outline:none}
.wc-modal-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}

/* import wizard shell */
.wc-imp-wz{width:1040px;max-width:100%;padding:0;overflow:hidden;display:flex;flex-direction:column;max-height:92vh}
.wc-imp-top{display:flex;align-items:center;gap:24px;padding:18px 26px;border-bottom:1px solid var(--line);flex:none}
.wc-imp-brand{display:flex;align-items:center;gap:12px;flex:none}
.wc-imp-brand-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-strong);flex:none}
.wc-imp-brand-t{font-size:19px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.wc-imp-brand-s{font-size:13px;color:var(--ink-3);margin-top:1px}
.wc-imp-close{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:var(--ink-3);flex:none}
.wc-imp-close:hover{background:var(--line-soft);color:var(--ink)}

/* stepper */
.wc-imp-stepper{flex:1;display:flex;align-items:flex-start;justify-content:center;gap:0;max-width:620px;margin:0 auto}
.wc-imp-snode{display:flex;flex-direction:column;align-items:center;gap:7px;flex:none;width:108px}
.wc-imp-scirc{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:13.5px;font-weight:800;background:var(--panel);border:2px solid var(--line-strong,#D8D4CD);color:var(--ink-3);transition:.18s}
.wc-imp-snode.is-cur .wc-imp-scirc{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 0 0 4px var(--accent-soft)}
.wc-imp-snode.is-done .wc-imp-scirc{background:var(--accent);border-color:var(--accent);color:#fff}
.wc-imp-slabel{font-size:12px;font-weight:600;color:var(--ink-3);text-align:center;line-height:1.25}
.wc-imp-snode.is-cur .wc-imp-slabel,.wc-imp-snode.is-done .wc-imp-slabel{color:var(--ink);font-weight:700}
.wc-imp-sline{flex:1;height:2px;min-width:18px;background:var(--line);margin-top:16px;border-radius:2px}
.wc-imp-sline.is-done{background:var(--accent)}

/* body */
.wc-imp-bodywrap{flex:1;overflow-y:auto;padding:24px 26px}
.wc-imp-narrow{max-width:620px;margin:0 auto}
.wc-imp-lead{font-size:14.5px;color:var(--ink-2);margin:0 0 18px}
.wc-imp-s3head{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:18px}

/* step 1 — upload */
.wc-imp-drop{border:2px dashed var(--line-strong,#D8D4CD);border-radius:16px;padding:44px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;cursor:pointer;transition:.15s;background:var(--line-soft)}
.wc-imp-drop:hover,.wc-imp-drop.is-drag{border-color:var(--accent);background:var(--accent-soft)}
.wc-imp-drop-ic{width:60px;height:60px;border-radius:16px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-strong);margin-bottom:14px}
.wc-imp-drop-t{font-size:17px;font-weight:800;letter-spacing:-.01em;color:var(--ink)}
.wc-imp-file{display:flex;align-items:center;gap:13px;border:1px solid var(--line);border-radius:13px;padding:14px 16px;margin-bottom:16px}
.wc-imp-file-ic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-strong);flex:none}
.wc-imp-file-b{flex:1;min-width:0}
.wc-imp-file-n{font-size:14.5px;font-weight:700;color:var(--ink)}
.wc-imp-stats,.wc-imp-donegrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.wc-imp-donegrid{grid-template-columns:repeat(4,1fr);margin:22px 0}
.wc-imp-stat{border:1px solid var(--line);border-radius:13px;padding:16px 14px;text-align:center}
.wc-imp-stat-n{font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--ink);line-height:1}
.wc-imp-stat-l{font-size:12px;font-weight:600;color:var(--ink-3);margin-top:6px}
.wc-imp-stat.found{background:var(--accent-soft);border-color:transparent}.wc-imp-stat.found .wc-imp-stat-n{color:var(--accent-strong)}
.wc-imp-stat.ok{background:#E8F8ED;border-color:transparent}.wc-imp-stat.ok .wc-imp-stat-n{color:#16A34A}
.wc-imp-stat.warn{background:#FEF6E7;border-color:transparent}.wc-imp-stat.warn .wc-imp-stat-n{color:#C2740B}
.wc-imp-stat.muted .wc-imp-stat-n{color:var(--ink-3)}
.wc-imp-stat.ai{background:#EAF4FF;border-color:transparent}.wc-imp-stat.ai .wc-imp-stat-n{color:#2563EB}
.wc-imp-stat.wf{background:var(--accent-soft);border-color:transparent}.wc-imp-stat.wf .wc-imp-stat-n{color:var(--accent-strong)}
.wc-imp-saved{display:flex;align-items:center;flex-wrap:wrap;gap:9px;margin-top:18px}
.wc-imp-chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--accent-strong);background:var(--accent-soft);border-radius:99px;padding:7px 13px;transition:.12s}
.wc-imp-chip:hover{background:var(--accent);color:#fff}
.wc-imp-chip:hover .wc-icon{color:#fff}

/* step 2 — map columns */
.wc-imp-mapsummary{width:100%;display:flex;align-items:center;justify-content:space-between;border:1px solid #BFE6CC;background:#EFFAF2;border-radius:13px;padding:15px 17px;margin-bottom:8px}
.wc-imp-mapok{display:inline-flex;align-items:center;gap:9px;font-size:14.5px;font-weight:800;color:#15803D}
.wc-imp-mapsummary .wc-icon{color:#15803D}
.wc-imp-maplist{display:flex;flex-direction:column;gap:6px;margin-bottom:18px;padding:4px 2px}
.wc-imp-maprow{display:flex;align-items:center;gap:11px;padding:9px 13px;border:1px solid var(--line);border-radius:10px;font-size:13.5px}
.wc-imp-maprow .wc-icon{color:var(--ink-faint);flex:none}
.wc-imp-mapcol{font-weight:700;color:var(--ink);min-width:130px}
.wc-imp-mapfield{flex:1;font-family:var(--mono);font-size:12.5px;color:var(--ink-2)}
.wc-imp-mapcheck{width:22px;height:22px;border-radius:7px;background:#E8F8ED;color:#16A34A;display:grid;place-items:center;flex:none}
.wc-imp-attn-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:var(--ink);margin:18px 0 10px}
.wc-imp-attn-h .wc-icon{color:#C2740B}
.wc-imp-attn-n{margin-left:2px;width:20px;height:20px;border-radius:6px;background:#FEF6E7;color:#C2740B;font-size:12px;display:grid;place-items:center}
.wc-imp-attn{display:flex;align-items:center;gap:13px;border:1.5px solid #F4D9A6;background:#FFFBF3;border-radius:13px;padding:14px 16px}
.wc-imp-attn .wc-icon{color:var(--ink-faint);flex:none}
.wc-imp-attn-col{flex:1;min-width:0}
.wc-imp-attn-name{font-size:14px;font-weight:800;color:var(--ink)}
.wc-imp-attn-sel{width:200px;flex:none}

/* step 3 — settings */
.wc-imp-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.wc-imp-col{display:flex;flex-direction:column;gap:18px}
.wc-imp-card{border:1px solid var(--line);border-radius:14px;padding:18px;background:var(--panel)}
.wc-imp-card-h{display:flex;align-items:flex-start;gap:11px;margin-bottom:14px}
.wc-imp-card-ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none}
.wc-imp-card-t{font-size:15px;font-weight:800;letter-spacing:-.01em;color:var(--ink)}
.wc-imp-card-sub{font-size:12.5px;color:var(--ink-3);margin-top:2px}
.wc-imp-opt{font-weight:500;color:var(--ink-3)}
.wc-imp-radio{display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;border:1.5px solid var(--line);border-radius:12px;padding:13px 15px;margin-bottom:10px;transition:.12s}
.wc-imp-radio:last-child{margin-bottom:0}
.wc-imp-radio:hover{border-color:var(--ink-faint)}
.wc-imp-radio.is-on{border-color:var(--accent);background:var(--accent-soft)}
.wc-imp-radio.plain{border-color:transparent;padding:10px 6px;margin-bottom:2px}
.wc-imp-radio.plain:hover{border-color:transparent;background:var(--line-soft)}
.wc-imp-radio.plain.is-on{border-color:transparent;background:transparent}
.wc-imp-radio-t{font-size:14px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:8px}
.wc-imp-recsm{font-size:12.5px;font-weight:600;color:var(--ink-3)}
.wc-imp-recpill{font-size:11px;font-weight:700;color:#15803D;background:#E8F8ED;border-radius:99px;padding:2px 8px}
.wc-radio{width:19px;height:19px;border-radius:50%;border:2px solid var(--line-strong,#CFCAC2);flex:none;margin-top:1px;position:relative;transition:.12s}
.wc-radio.is-on{border-color:var(--accent)}
.wc-radio.is-on::after{content:'';position:absolute;inset:3px;border-radius:50%;background:var(--accent)}
.wc-imp-check{display:flex;align-items:flex-start;gap:11px;padding:10px 0;cursor:pointer;border-bottom:1px solid var(--line-soft)}
.wc-imp-check:last-child{border-bottom:none}
.wc-imp-check input{width:19px;height:19px;accent-color:var(--accent);flex:none;margin-top:1px}
.wc-imp-check.is-dim{opacity:.5}
.wc-imp-check-b{flex:1;min-width:0}
.wc-imp-check-t{font-size:14px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:8px}
.wc-imp-recpill{font-size:11px;font-weight:700;color:#15803D;background:#E8F8ED;border-radius:99px;padding:2px 8px}
.wc-imp-next{display:flex;align-items:flex-start;gap:10px;background:var(--accent-soft);border-radius:11px;padding:12px 14px;margin-top:13px}
.wc-imp-next .wc-icon{color:var(--accent-strong);flex:none;margin-top:1px}
.wc-imp-next strong{font-size:13.5px;color:var(--ink)}
.wc-imp-next p{font-size:12.5px;color:var(--ink-2);line-height:1.5;margin:3px 0 0}
.wc-imp-tagbox{display:flex;flex-wrap:wrap;align-items:center;gap:8px;border:1px solid var(--line);border-radius:11px;padding:9px 11px}
.wc-imp-tag{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--ink);background:var(--line-soft);border-radius:8px;padding:5px 9px}
.wc-imp-tag button{display:grid;place-items:center;color:var(--ink-3)}
.wc-imp-tag button:hover{color:var(--ink)}
.wc-imp-taginput{flex:1;min-width:120px;border:none;outline:none;background:none;font-size:13px;color:var(--ink);padding:4px}

/* step 4 — review */
.wc-imp-review{border:1px solid var(--line);border-radius:14px;overflow:hidden}
.wc-imp-revrow{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 18px;border-bottom:1px solid var(--line-soft)}
.wc-imp-revrow:last-child{border-bottom:none}
.wc-imp-revk{display:inline-flex;align-items:center;gap:9px;font-size:13.5px;font-weight:600;color:var(--ink-3)}
.wc-imp-revk .wc-icon{color:var(--ink-faint)}
.wc-imp-revv{font-size:14.5px;font-weight:700;color:var(--ink);text-align:right}
.wc-imp-tplnote,.wc-imp-ready{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600;border-radius:11px;padding:12px 15px;margin-top:14px}
.wc-imp-tplnote{background:var(--accent-soft);color:var(--accent-strong)}
.wc-imp-ready{background:#E8F8ED;color:#15803D}
.wc-imp-tplnote .wc-icon,.wc-imp-ready .wc-icon{flex:none}

/* footer / summary bar */
.wc-imp-sumbar{flex:none;display:flex;align-items:center;gap:18px;padding:14px 26px;border-top:1px solid var(--line);background:var(--panel)}
.wc-imp-sum{flex:1;min-width:0}
.wc-imp-cta{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.wc-imp-cta .wc-primary{height:46px;padding:0 22px;font-size:15px}
.wc-imp-stepnote{font-size:12px;color:var(--ink-3);font-weight:600}

/* success */
.wc-imp-done{display:flex;flex-direction:column;align-items:center;text-align:center;padding:36px 26px 40px}
.wc-imp-done-ic{width:74px;height:74px;border-radius:50%;background:#E8F8ED;color:#16A34A;display:grid;place-items:center;margin-bottom:18px}
.wc-imp-done .wc-wz-title{margin:0}
.wc-imp-doneacts{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
.wc-imp-doneacts .wc-primary,.wc-imp-doneacts .wc-ghostbtn{justify-content:center}

/* buttons (shared) */
.wc-ghostbtn{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-size:14px;font-weight:600;color:var(--ink-2);transition:.12s}
.wc-ghostbtn:hover{border-color:#D9D5CE;color:var(--ink);box-shadow:var(--shadow-sm)}
.wc-ghostbtn:disabled{opacity:.45;cursor:not-allowed}
.wc-primary{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:11px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 16px rgba(249,115,22,.28);transition:.12s}
.wc-primary:hover{background:var(--accent-strong)}
.wc-primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
```

---

## 9. External dependencies

- **React 18** (`useState`).
- **`<Icon name size [style] />`** — inline SVG icons. Names used: `file, check, x, upload, zap, checkCircle, chevronDown, arrowRight, users, sparkles, flag, tag, message, info, copy, outbound`.
- Shared CSS classes `wc-modal-scrim`, `wc-wz*`, `wc-ghostbtn`, `wc-primary`, `wc-modal-input`, `wc-iconbtn-sm`, `wc-band-d`, `wc-mono`.
- Exposed via `window.ImportWizard`. See `import.jsx` for authoritative source.
