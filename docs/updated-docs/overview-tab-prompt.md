# EXACT build spec — Admin ▸ **Overview** tab (self-contained)

Reproduce the **Overview** panel of the WarmChats Admin page pixel-for-pixel. This is the React component the host mounts as `window.RepOverviewTab` (source name `OverviewTab`). Everything below — layout, every card, all sizes/colors/shadows, the data, the components, and the CSS — is literal. Do not rename classes or change any number, color, or string.

> Top-to-bottom the tab is: **(1)** a row of 4 KPI cards → **(2)** a 2-column grid with a *bar chart* card on the left and a *"By type" horizontal-bar breakdown* on the right → **(3)** an *Upcoming appointments* list card → **(4)** a 2-column grid with a *Closed-deals 2×2 stat grid* on the left and a *Recent closings* card on the right.

---

## 1. Environment

- Inline JSX (Babel in browser), no imports/exports. `const { useState: useRepS } = React;`.
- Host globals used: `React`, `Icon` (`<Icon name size/>`), `TONES` (tone→`{fg,bg}`).
- Numbers use class `.wc-mono` (JetBrains Mono, tabular). Accent is orange `--accent:#F97316`.
- Component is exported via `window.RepOverviewTab = OverviewTab;` (host renders it for the Overview tab).

### TONES values referenced by this tab
```jsx
const TONES = {
  green:   { fg:'#16A34A', bg:'#E8F8ED' },  // Pipeline Value, Volume Closed
  indigo:  { fg:'#4F46E5', bg:'#ECEDFD' },  // Appointments, Avg Deal Size
  teal:    { fg:'#0D9488', bg:'#E3F6F2' },  // Lead → Appt, Est. Commission
  emerald: { fg:'#059669', bg:'#E6F7EF' },  // Closed Deals
};
```

---

## 2. Section 1 — the 4 KPI cards

Container `div.wc-rep-kpis` → maps `REP_KPIS` through `<RepKpi/>`. **Always exactly 4 equal columns spanning full width** (`repeat(4,1fr)`), 14px gap.

**Each card** (`RepKpi`): horizontal — a large tinted square icon chip on the left, then a label, then a baseline-aligned row of the big value + a colored delta.

```jsx
const REP_KPIS = [
  { icon: 'dollar',        label: 'Pipeline Value', value: '$4.2M', delta: '+12% MoM', up: true, tone: 'green'   },
  { icon: 'calendarCheck', label: 'Appointments',   value: '18',    delta: 'this month',          tone: 'indigo'  },
  { icon: 'trending',      label: 'Lead → Appt',    value: '14.8%', delta: '+2.1%',  up: true, tone: 'teal'    },
  { icon: 'trophy',        label: 'Closed Deals',   value: '4',     delta: '+1 MoM', up: true, tone: 'emerald' },
];

function RepKpi({ k }) {
  const t = TONES[k.tone];
  return (
    <div className="wc-kpi">
      <span className="wc-kpi-icon" style={{ color: t.fg, background: t.bg }}><Icon name={k.icon} size={17} /></span>
      <div className="wc-kpi-body">
        <div className="wc-kpi-label">{k.label}</div>
        <div className="wc-kpi-row"><span className="wc-kpi-val wc-mono">{k.value}</span><span className={'wc-kpi-delta' + (k.up ? ' is-up' : '')}>{k.delta}</span></div>
      </div>
    </div>
  );
}
```

**KPI sizing/shape/color (CSS):**
```css
/* base card */
.wc-kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;gap:11px;align-items:flex-start;box-shadow:var(--shadow-sm);transition:.14s;position:relative}
.wc-kpi:hover{box-shadow:var(--shadow);transform:translateY(-1px)}
.wc-kpi-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:none}
.wc-kpi-body{min-width:0}
.wc-kpi-label{font-size:11.5px;font-weight:600;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wc-kpi-row{display:flex;align-items:baseline;gap:7px;margin-top:3px}
.wc-kpi-val{font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.wc-kpi-delta{font-size:11px;font-weight:700;color:var(--ink-3)}
.wc-kpi-delta.is-up{color:#16A34A}            /* green for positive deltas */

/* Overview makes them BIGGER + forces a full-width 4-up grid */
.wc-rep-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}
.wc-rep-kpis .wc-kpi{padding:22px;gap:15px;align-items:center}
.wc-rep-kpis .wc-kpi-icon{width:50px;height:50px;border-radius:14px}
.wc-rep-kpis .wc-kpi-icon .wc-icon{width:22px;height:22px}
.wc-rep-kpis .wc-kpi-label{font-size:13.5px}
.wc-rep-kpis .wc-kpi-val{font-size:30px}
.wc-rep-kpis .wc-kpi-delta{font-size:12.5px}
```
- Card: white, 1px `--line` border, **radius 14**, padding **22px**, shadow `--shadow-sm` (lifts to `--shadow` + `translateY(-1px)` on hover).
- Icon chip: **50×50**, radius 14, tinted per tone (e.g. green fg `#16A34A` on bg `#E8F8ED`); glyph 22px.
- Value: **30px / 800**, tabular mono. Delta: 12.5px / 700, **green `#16A34A`** when `up`, else grey `--ink-3`.

---

## 3. Section 2 — bar chart (left) + "By type" breakdown (right)

Wrapper `div.wc-admin-grid` (2 columns **1.15fr / 1fr**, 18px gap, collapses to 1 col ≤1040px).

### 3a. Left — vertical **bar chart** card "Appointments booked · last 14 days"
`div.wc-panel-card.pad.wc-chartcard`. Header is the standard card header (`.wc-admincard-h` with a 30×30 orange-soft icon chip + `calendarCheck`). Below it, a flexible row of 14 bars; each bar height = `value / max(APPT_CHART) * 100%`, with the value printed above the bar.

```jsx
const APPT_CHART = [2, 4, 1, 3, 5, 2, 4, 3, 6, 2, 5, 3, 7, 4];   // 14 days
// inside OverviewTab: const apptMax = Math.max(...APPT_CHART);

<div className="wc-panel-card pad wc-chartcard">
  <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="calendarCheck" size={17} /></span>Appointments booked · last 14 days</div>
  <div className="wc-chart">
    {APPT_CHART.map((v, i) => (
      <div className="wc-chart-col" key={i}>
        <div className="wc-chart-bar" style={{ height: (v / apptMax * 100) + '%' }}><span>{v}</span></div>
      </div>
    ))}
  </div>
</div>
```
```css
.wc-chart{display:flex;align-items:flex-end;gap:8px;height:200px;padding-top:18px}
.wc-chart-col{flex:1;height:100%;display:flex;align-items:flex-end}
.wc-chart-bar{width:100%;background:linear-gradient(180deg,var(--accent),#FBA968);border-radius:7px 7px 0 0;position:relative;min-height:4px;transition:.2s}
.wc-chart-bar span{position:absolute;top:-18px;left:0;right:0;text-align:center;font-size:10.5px;font-weight:700;color:var(--ink-3);font-variant-numeric:tabular-nums}
.wc-chart-bar:hover{filter:brightness(1.05)}
```
- Plot area **200px tall**, bars `flex:1` so they fill the width evenly, **8px** gaps.
- Bars use a vertical **orange gradient** `#F97316 → #FBA968`, top corners rounded **7px**, min-height 4px; brighten slightly on hover. Value label sits 18px above each bar in 10.5px grey mono.

### 3b. Right — "By type" **horizontal-bar breakdown** card
`div.wc-panel-card.pad`, header icon `layers`. One row per appointment type: a colored dot + label, a right-aligned `%` + count, and a thin track-bar whose fill width = share of total and color = the type color.

```jsx
const APPT_TYPES = [
  { label: 'Property Showing',    value: 16, color: '#8B5CF6' },
  { label: 'Buyer Consultation',  value: 11, color: '#6366F1' },
  { label: 'Listing Appointment', value: 8,  color: '#0EA5E9' },
  { label: 'Phone Call',          value: 4,  color: '#F59E0B' },
  { label: 'Zoom Meeting',        value: 2,  color: '#14B8A6' },
];
// const apptTotalType = APPT_TYPES.reduce((s, t) => s + t.value, 0);

<div className="wc-panel-card pad">
  <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="layers" size={17} /></span>By type</div>
  {APPT_TYPES.map(t => (
    <div className="wc-pipe-row" key={t.label}>
      <div className="wc-pipe-top">
        <span className="wc-pipe-name"><span className="wc-col-dot" style={{ '--stage': t.color }} />{t.label}</span>
        <span className="wc-pipe-meta"><span className="wc-pipe-count">{Math.round(t.value / apptTotalType * 100)}%</span><b className="wc-mono">{t.value}</b></span>
      </div>
      <div className="wc-pipe-bar"><div style={{ width: (t.value / apptTotalType * 100) + '%', background: t.color }} /></div>
    </div>
  ))}
</div>
```
```css
.wc-pipe-row{margin-bottom:16px}
.wc-pipe-row:last-child{margin-bottom:0}
.wc-pipe-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.wc-pipe-name{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700}
.wc-pipe-meta{display:flex;align-items:center;gap:12px}
.wc-pipe-count{font-size:12px;color:var(--ink-3);font-weight:600}
.wc-pipe-meta b{font-size:14.5px}
.wc-pipe-bar{height:9px;border-radius:99px;background:var(--line-soft);overflow:hidden}
.wc-pipe-bar>div{height:100%;border-radius:99px}
.wc-col-dot{width:9px;height:9px;border-radius:50%;background:var(--stage);flex:none}
```
- Track: **9px tall**, fully rounded, `--line-soft` background; fill is the type color. Dot 9×9, color via the `--stage` custom prop. Label 14px/700, percent 12px grey, count 14.5px bold mono.

### Shared card + header chrome (used by 3a/3b and below)
```css
.wc-admin-grid{display:grid;grid-template-columns:1.15fr 1fr;gap:18px;align-items:start}
@media(max-width:1040px){.wc-admin-grid{grid-template-columns:1fr}}
.wc-panel-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-sm);overflow:hidden}
.wc-panel-card.pad{padding:16px}
.wc-admincard-h{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:800;letter-spacing:-.01em;margin-bottom:14px}
.wc-admincard-ic{width:30px;height:30px;border-radius:9px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
```
- Cards: white, radius **16**, `--shadow-sm`, 16px padding. Header title 16px/800 with a **30×30 / radius-9** orange-soft icon chip.

---

## 4. Section 3 — Upcoming appointments card

A full-width `div.wc-panel-card` (note: **no `.pad`** — it uses a bordered head + padded list rows), `marginTop:16, marginBottom:16`. Head shows a 17px title and a right-aligned grey count; then up to 3 rows from `APPT_UPCOMING`.

```jsx
const APPT_UPCOMING = [
  { title: 'Buyer showing',      who: 'Anna L.',         loc: '1422 Maple St',  when: 'Today 2:00 PM', agent: 'Joseph Velasquez', kind: 'Showing' },
  { title: 'Listing consult',    who: 'C. Hernandez',    loc: '88 Hillcrest Ave', when: 'Today 4:30 PM', agent: 'Sarah Chen',      kind: 'Listing' },
  { title: 'Buyer consultation', who: 'Maria Lopez',     loc: 'Office',         when: 'Fri 1:00 PM',  agent: 'Joseph Velasquez', kind: 'Consult' },
  { title: 'Zoom walkthrough',   who: 'The Pham family', loc: 'Video call',     when: 'Fri 3:30 PM',  agent: 'Michael Ross',     kind: 'Zoom'    },
  { title: 'Final walkthrough',  who: 'Grace Holloway',  loc: '1180 Cedar Ln',  when: 'Mon 11:00 AM', agent: 'Sarah Chen',       kind: 'Showing' },
];

<div className="wc-panel-card" style={{ marginBottom: 16, marginTop: 16 }}>
  <div className="wc-card-head">
    <div><div className="wc-card-h2">Upcoming appointments</div></div>
    <span className="wc-band-d">{APPT_UPCOMING.length} scheduled this week</span>
  </div>
  <div className="wc-agoal-list">
    {APPT_UPCOMING.slice(0, 3).map((a, i) => (
      <div className="wc-agoal-row" key={i}>
        <span className="wc-closing-ic"><Icon name="calendarCheck" size={15} /></span>
        <div className="wc-agoal-row-b"><div className="wc-agoal-row-t">{a.title} · {a.who}</div><div className="wc-band-d">{a.loc} · {a.agent}</div></div>
        <span className="wc-hot-tag">{a.kind}</span>
        <span className="wc-band-d" style={{ minWidth: 96, textAlign: 'right' }}>{a.when}</span>
      </div>
    ))}
  </div>
</div>
```
```css
.wc-card-head{display:flex;align-items:flex-start;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line-soft)}
.wc-card-h2{font-size:17px;font-weight:700;letter-spacing:-.01em;margin-top:3px}
.wc-agoal-list{display:flex;flex-direction:column}
.wc-agoal-row{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--line-soft)}
.wc-agoal-row:last-child{border-bottom:none}
.wc-agoal-row-b{flex:1;min-width:0}
.wc-agoal-row-t{font-size:13.5px;font-weight:700}
.wc-band-d{font-size:12px;color:var(--ink-3);line-height:1.45;margin-top:2px}
.wc-hot-tag{font-size:10.5px;font-weight:600;color:var(--ink-2);background:var(--line-soft);padding:2px 7px;border-radius:6px}
.wc-closing-ic{width:34px;height:34px;border-radius:10px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
```
- Head padded **16×18**, hairline bottom border. Each row: a **34×34 / radius-10** orange-soft calendar chip, a flexible title (13.5px/700) + subtext (12px grey), a `kind` pill (`.wc-hot-tag`, 10.5px on `--line-soft`, radius 6), and a right-aligned 96px-min time.

---

## 5. Section 4 — Closed-deals stats (left) + Recent closings (right)

Wrapper `div.wc-admin-grid` (`marginTop:16`). Left column holds a **2×2 stat grid** (`.wc-rep-stats.two`); right is a "Recent closings" card.

```jsx
const CLOSED_METRICS = [
  { icon: 'trophy',   label: 'Closed Deals',    value: '4',     sub: 'this month',      tone: 'emerald' },
  { icon: 'dollar',   label: 'Volume Closed',   value: '$3.8M', sub: 'gross sales',     tone: 'green'   },
  { icon: 'dollar',   label: 'Est. Commission', value: '$95K',  sub: '2.5% avg',        tone: 'teal'    },
  { icon: 'trending', label: 'Avg Deal Size',   value: '$950K', sub: 'per transaction', tone: 'indigo'  },
];
const CLOSINGS = [
  { addr: '123 Main St',     city: 'Burbank',  price: '$1.2M' },
  { addr: '456 Oak Ave',     city: 'Glendale', price: '$850K' },
  { addr: '789 Sunset Blvd', city: 'Pasadena', price: '$950K' },
  { addr: '1422 Maple St',   city: 'Burbank',  price: '$805K' },
];

function StatCard({ m }) {
  const t = TONES[m.tone];
  return (
    <div className="wc-stat wc-repstat">
      <span className="wc-repstat-ic" style={{ color: t.fg, background: t.bg }}><Icon name={m.icon} size={17} /></span>
      <div className="wc-stat-label">{m.label}</div>
      <div className="wc-stat-val wc-mono">{m.value}</div>
      <div className="wc-stat-sub">{m.sub}</div>
    </div>
  );
}

<div className="wc-admin-grid" style={{ marginTop: 16 }}>
  <div className="wc-admin-col">
    <div className="wc-rep-stats two">{CLOSED_METRICS.map(m => <StatCard key={m.label} m={m} />)}</div>
  </div>
  <div className="wc-panel-card pad">
    <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="trophy" size={17} /></span>Recent closings</div>
    <div className="wc-closings">
      {CLOSINGS.map(c => (
        <div className="wc-closing" key={c.addr}>
          <span className="wc-closing-ic"><Icon name="home" size={15} /></span>
          <div><div className="wc-closing-addr">{c.addr}</div><div className="wc-band-d">{c.city}</div></div>
          <span className="wc-mono wc-closing-price">{c.price}</span>
        </div>
      ))}
    </div>
  </div>
</div>
```
```css
/* stat tiles */
.wc-rep-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}
.wc-rep-stats.two{grid-template-columns:1fr 1fr}                 /* 2×2 here */
.wc-stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 13px;box-shadow:var(--shadow-sm)}
.wc-repstat{position:relative}
.wc-repstat-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;margin-bottom:10px}
.wc-stat-label{font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)}
.wc-stat-val{font-size:20px;font-weight:700;letter-spacing:-.02em;margin-top:4px}
.wc-stat-sub{font-size:11px;font-weight:600;margin-top:3px}
.wc-admin-col{display:flex;flex-direction:column;gap:18px;min-width:0}
/* recent closings */
.wc-closings{display:flex;flex-direction:column}
.wc-closing{display:flex;align-items:center;gap:13px;padding:12px 0;border-bottom:1px solid var(--line-soft)}
.wc-closing:last-child{border-bottom:none}
.wc-closing-ic{width:34px;height:34px;border-radius:10px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
.wc-closing-addr{font-size:14px;font-weight:700}
.wc-closing>div:nth-child(2){flex:1}
.wc-closing-price{font-size:15px;font-weight:800}
```
- Stat tile: white, radius **14**, padding **12×13**, `--shadow-sm`; a **34×34 / radius-10** tinted icon chip, an uppercase 10.5px label, a **20px/700** mono value, and an 11px sub-line. Grid is forced to **two equal columns** (2×2).
- Recent closings: rows with a 34×34 orange-soft `home` chip, address (14px/700) + city (12px grey), and a right-aligned **15px/800** mono price; hairline dividers between rows.

---

## 6. The full `OverviewTab` (assembled)

```jsx
function OverviewTab() {
  const apptMax = Math.max(...APPT_CHART);
  const apptTotalType = APPT_TYPES.reduce((s, t) => s + t.value, 0);
  return (
    <div>
      <div className="wc-rep-kpis">{REP_KPIS.map(k => <RepKpi key={k.label} k={k} />)}</div>

      <div className="wc-admin-grid">
        {/* 3a bar chart */}
        {/* 3b By type */}
      </div>

      <div className="wc-panel-card" style={{ marginBottom: 16, marginTop: 16 }}>
        {/* Upcoming appointments */}
      </div>

      <div className="wc-admin-grid" style={{ marginTop: 16 }}>
        {/* Closed-deals 2×2 stats + Recent closings */}
      </div>
    </div>
  );
}
```

---

## 7. Token reference (colors/shadows used above)

```css
--accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
--panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
--ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --muted:#A8AEBD;
--shadow-sm:0 1px 2px rgba(20,24,38,.05);
--shadow:0 4px 16px rgba(20,24,38,.07);
/* positive delta / connected green: #16A34A. Bar-chart gradient: #F97316 → #FBA968. */
```

### Acceptance
- [ ] 4 equal KPI cards full-width (Pipeline Value, Appointments, Lead → Appt, Closed Deals), 30px mono values, green up-deltas.
- [ ] Left bar chart "Appointments booked · last 14 days" — 14 orange-gradient bars, 200px tall, value labels above.
- [ ] Right "By type" — 5 rows, 9px rounded track bars colored per type, % + count on the right.
- [ ] Upcoming appointments — bordered head + 3 rows with calendar chip, kind pill, right-aligned time.
- [ ] Closed deals — 2×2 stat tiles + Recent closings list with right-aligned bold prices.
- [ ] All sizes/colors/shadows match §2–§5 exactly.
