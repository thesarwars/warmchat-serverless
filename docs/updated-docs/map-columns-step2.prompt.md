# Import Leads — Step 2 "Map Columns" — Component Spec

Self-contained spec to rebuild **Step 2 (Map Columns)** of the WarmChats *Import Leads* wizard. After auto-mapping the uploaded file's columns, this screen lets the user (a) review/expand the auto-mapped fields and (b) pick exactly which detected leads get **enrolled in automation** (vs. just imported). It is one step inside a full-screen modal wizard; this doc covers only step 2's body — the modal shell, stepper header, and sticky footer are shared chrome (summarized at the end).

Stack: **React 18 (inline JSX / Babel)**, one global `<style>` block, icons via `<Icon name size />`. Class prefix `wc-imp-`. Visual language: cool-gray neutrals, **orange accent** (`#F97316`), ~13px radius, soft borders.

---

## Layout (top → bottom)

The whole step body is wrapped in `.wc-imp-narrow` (a centered, max-width column, ~620px).

1. **Lead-in line** — `<p class="wc-imp-lead">` → "We mapped your columns automatically. Fix only what needs attention."
2. **Mapping summary disclosure** (collapsed by default).
3. **Mapped-fields list** (only when expanded).
4. **"Leads to import" section** — the selectable lead table. This is the primary interaction.

---

## 1. Mapping summary disclosure — `.wc-imp-mapsummary`

A full-width green-tint button that toggles the mapped-field list.

```jsx
<button className="wc-imp-mapsummary" onClick={() => setMapOpen(o => !o)}>
  <span className="wc-imp-mapok"><Icon name="checkCircle" size={16} />8 fields mapped automatically</span>
  <Icon name="chevronDown" size={16} style={mapOpen ? { transform: 'rotate(180deg)' } : {}} />
</button>
```

- State: `const [mapOpen, setMapOpen] = useState(false)`.
- The count ("8") = `IMP_MAPPED.length`.
- Chevron rotates 180° when open.

## 2. Mapped-fields list — `.wc-imp-maplist` (conditional on `mapOpen`)

One `.wc-imp-maprow` per mapping. Each row: **source column name** → `arrowRight` icon → **mono target field** → a green check tile.

```jsx
{mapOpen && (
  <div className="wc-imp-maplist">
    {IMP_MAPPED.map(([col, field]) => (
      <div className="wc-imp-maprow" key={col}>
        <span className="wc-imp-mapcol">{col}</span><Icon name="arrowRight" size={14} />
        <span className="wc-imp-mapfield">{field}</span>
        <span className="wc-imp-mapcheck"><Icon name="check" size={13} /></span>
      </div>
    ))}
  </div>
)}
```

`IMP_MAPPED` (source label → snake_case field):
```js
const IMP_MAPPED = [
  ['First Name', 'first_name'], ['Last Name', 'last_name'],
  ['Phone', 'phone'], ['Email', 'email'], ['Source', 'source'],
  ['Property Interest', 'area'], ['Budget', 'budget'], ['Created Date', 'created'],
];
```

---

## 3. "Leads to import" section — `.wc-imp-leadsec`

Top-bordered block (`border-top` + `padding-top`). Contains a header, a search input, a selectable table, and a footer count.

### 3a. Header — `.wc-imp-leadhead`

Flex row, title block left + count pill right.
- Title `.wc-imp-leadhead-t`: **"Leads to import"**
- Sub `.wc-band-d`: "Uncheck anyone you don't want enrolled in the automation — they're still imported, just not contacted automatically."
- Count pill `.wc-imp-leadcount` (accent-soft, rounded): `{sel.size} selected` → e.g. "12 selected".

### 3b. Search — `.wc-imp-leadsearch`

Bordered 40px-tall field: `search` icon + `<input placeholder="Search leads…">`. Filters `IMP_LEADS` by name + contact + source (case-insensitive).

### 3c. Table — `.wc-imp-leadtable`

Bordered, rounded, `overflow:hidden` container. All rows share grid `grid-template-columns: 24px 1fr 116px 74px` (checkbox / lead info / source / type).

**Header row** `.wc-imp-leadrow.head` (sticky, gray, clickable → `toggleAll`):
- A tri-state checkbox `.wc-imp-check2` showing `check` when all selected, `minus` when some, empty when none.
- Cell label that reads **"Select all"** normally, **"Deselect all"** when all are selected.
- "Source" header cell, "Type" header cell (uppercase, `.wc-imp-leadhcell`).

**Scroll body** `.wc-imp-leadscroll` (`max-height:296px; overflow-y:auto`) — one button row per shown lead:

```jsx
<button className={'wc-imp-leadrow' + (on ? ' is-on' : '')} onClick={() => toggleLead(l.id)}>
  <span className={'wc-imp-check2' + (on ? ' is-on' : '')}>{on && <Icon name="check" size={13} />}</span>
  <span className="wc-imp-leadinfo">
    <span className="wc-imp-leadav">{impInitials(l.name)}</span>
    <span style={{ minWidth: 0 }}>
      <span className="wc-imp-leadname">{l.name}</span>
      <span className="wc-imp-leadcontact">{l.contact}</span>
    </span>
  </span>
  <span className="wc-imp-leadsrc">{l.source}</span>
  <span className={'wc-imp-leadtype ' + l.type.toLowerCase()}>{l.type}</span>
</button>
```

- Selected rows get `.is-on` (accent-soft bg, deeper on hover). Checkbox fills accent.
- Avatar `.wc-imp-leadav`: 34px circle, gray, 2-letter initials via `impInitials`.
- Lead name (bold) over contact (muted), both single-line ellipsis.
- Type badge `.wc-imp-leadtype` colored by type: `.buyer` = blue, `.seller` = orange/accent, `.renter` = teal.
- Empty state `.wc-imp-leadempty` when search matches nothing: `No leads match "{leadSearch}".`

### 3d. Footer count — `.wc-band-d`

`<strong>{sel.size}</strong> of {IMP_LEADS.length} preview leads will be enrolled in the automation.`

---

## State & helpers

```js
const [mapOpen, setMapOpen]       = useState(false);
const [leadSearch, setLeadSearch] = useState('');
const [sel, setSel]               = useState(() => new Set(IMP_LEADS.map(l => l.id))); // all on by default

const toggleLead = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
const allSel  = sel.size === IMP_LEADS.length;
const someSel = sel.size > 0 && !allSel;
const toggleAll = () => setSel(allSel ? new Set() : new Set(IMP_LEADS.map(l => l.id)));
const shownLeads = IMP_LEADS.filter(l => !leadSearch ||
  (l.name + l.contact + l.source).toLowerCase().includes(leadSearch.toLowerCase()));

const impInitials = (n) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
```

Sample data (preview leads detected in the file):
```js
const IMP_LEADS = [
  { id: 1, name: 'Marisol Gomez',    contact: '(555) 204-1180',       source: 'Zillow',     type: 'Buyer'  },
  { id: 2, name: 'Devon Carter',     contact: 'devon.c@email.com',    source: 'Facebook',   type: 'Buyer'  },
  { id: 3, name: 'Anna Lin',         contact: '(555) 661-0042',       source: 'Open House', type: 'Buyer'  },
  { id: 4, name: 'Carlos Hernandez', contact: 'c.hernandez@email.com',source: 'Referral',   type: 'Seller' },
  { id: 5, name: 'Priya Patel',      contact: '(555) 815-7723',       source: 'Zillow',     type: 'Buyer'  },
  // …up to id 12 (Marcus Bell). 12 total → matches "12 selected".
];
```

---

## CSS (step-2 specific)

```css
/* mapping summary + list */
.wc-imp-mapsummary{width:100%;display:flex;align-items:center;justify-content:space-between;border:1px solid #BFE6CC;background:#EFFAF2;border-radius:13px;padding:15px 17px;margin-bottom:8px}
.wc-imp-mapsummary .wc-icon{color:#15803D}
.wc-imp-mapok{display:inline-flex;align-items:center;gap:9px;font-size:14.5px;font-weight:800;color:#15803D}
.wc-imp-maplist{display:flex;flex-direction:column;gap:6px;margin-bottom:18px;padding:4px 2px}
.wc-imp-maprow{display:flex;align-items:center;gap:11px;padding:9px 13px;border:1px solid var(--line);border-radius:10px;font-size:13.5px}
.wc-imp-maprow .wc-icon{color:var(--ink-faint);flex:none}
.wc-imp-mapcol{font-weight:700;color:var(--ink);min-width:130px}
.wc-imp-mapfield{flex:1;font-family:var(--mono);font-size:12.5px;color:var(--ink-2)}
.wc-imp-mapcheck{width:22px;height:22px;border-radius:7px;background:#E8F8ED;color:#16A34A;display:grid;place-items:center;flex:none}

/* selectable lead list */
.wc-imp-leadsec{margin-top:22px;border-top:1px solid var(--line-soft);padding-top:18px}
.wc-imp-leadhead{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
.wc-imp-leadhead-t{font-size:15px;font-weight:800;letter-spacing:-.01em;color:var(--ink)}
.wc-imp-leadcount{flex:none;font-size:12.5px;font-weight:700;color:var(--accent-strong);background:var(--accent-soft);border-radius:99px;padding:5px 12px;font-variant-numeric:tabular-nums}
.wc-imp-leadsearch{display:flex;align-items:center;gap:9px;border:1px solid var(--line);border-radius:10px;height:40px;padding:0 12px;color:var(--ink-3);margin-bottom:12px}
.wc-imp-leadsearch input{flex:1;border:none;outline:none;background:none;font-size:13.5px;color:var(--ink);font-family:inherit}
.wc-imp-leadtable{border:1px solid var(--line);border-radius:13px;overflow:hidden}
.wc-imp-leadrow{display:grid;grid-template-columns:24px 1fr 116px 74px;align-items:center;gap:12px;width:100%;text-align:left;padding:11px 14px;border-bottom:1px solid var(--line-soft);transition:.1s}
.wc-imp-leadrow:last-child{border-bottom:none}
.wc-imp-leadrow.head{background:var(--line-soft);position:sticky;top:0;z-index:1}
.wc-imp-leadrow.head .wc-imp-leadhcell{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3)}
.wc-imp-leadrow:not(.head):hover{background:var(--line-soft)}
.wc-imp-leadrow.is-on{background:var(--accent-soft)}
.wc-imp-leadrow.is-on:hover{background:#FFE9D8}
.wc-imp-leadscroll{max-height:296px;overflow-y:auto}
.wc-imp-check2{width:20px;height:20px;border-radius:6px;border:1.5px solid #CFCAC2;display:grid;place-items:center;color:#fff;flex:none;transition:.1s}
.wc-imp-check2.is-on,.wc-imp-check2.is-some{background:var(--accent);border-color:var(--accent)}
.wc-imp-leadinfo{display:flex;align-items:center;gap:11px;min-width:0}
.wc-imp-leadav{width:34px;height:34px;border-radius:50%;background:#EEECE8;color:#9A938A;font-size:12px;font-weight:700;display:grid;place-items:center;flex:none}
.wc-imp-leadname{font-size:13.5px;font-weight:700;color:var(--ink);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc-imp-leadcontact{font-size:12px;color:var(--ink-3);display:block;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc-imp-leadsrc{font-size:12.5px;color:var(--ink-2);font-weight:600}
.wc-imp-leadtype{font-size:11px;font-weight:700;padding:3px 9px;border-radius:7px;justify-self:start;background:var(--line-soft);color:var(--ink-2)}
.wc-imp-leadtype.buyer{background:var(--blue-bg);color:var(--blue)}
.wc-imp-leadtype.seller{background:var(--accent-soft);color:var(--accent-strong)}
.wc-imp-leadtype.renter{background:#E3F6F2;color:#0D9488}
.wc-imp-leadempty{padding:26px 14px;text-align:center;font-size:13px;color:var(--ink-3)}
```

### Tokens referenced
`--ink` (near-black text), `--ink-2`/`--ink-3` (muted), `--ink-faint` (faintest), `--line`/`--line-soft`/`--line-strong` (borders), `--accent` `#F97316`, `--accent-strong` (deeper orange text), `--accent-soft` (orange tint bg), `--blue`/`--blue-bg` (buyer badge), `--mono` (monospace stack). `.wc-band-d` = the standard muted descriptive-text class.

---

## Shared chrome (context — not part of this step's body)

- **Modal shell** `.wc-imp-wz`: 1040px wide, `max-height:92vh`, column flex, `overflow:hidden`.
- **Header**: 44×44 accent tile + `file` icon, "Import Leads" title, sub "Step 2 of 4 — Map Columns", a centered 4-node stepper (`Upload File · Map Columns · Import Settings · Review & Import`, current = orange filled "2", earlier = green check), and a close ✕.
- **Sticky footer** `.wc-imp-sumbar`: left summary stats, right primary CTA **"Continue"** (`arrowRight` icon) + "Step 3 of 4" note. CTA advances `step` 2 → 3.

## Acceptance checklist
- [ ] Disclosure collapsed by default; chevron flips and reveals 8 mapped rows on click.
- [ ] All 12 leads selected on first render; count pill reads "12 selected"; footer "12 of 12".
- [ ] Header checkbox is tri-state (check / minus / empty) and toggles all.
- [ ] Per-row click toggles selection; row tints accent-soft when on.
- [ ] Search filters by name/contact/source; empty state appears with the typed query.
- [ ] Type badges colored: Buyer=blue, Seller=orange, Renter=teal.
