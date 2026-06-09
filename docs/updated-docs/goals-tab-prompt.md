# EXACT build spec — Admin ▸ **Goals** tab (self-contained)

Reproduce the **Goals** panel of the WarmChats Admin page pixel-for-pixel. This is the React component the host mounts as `window.GoalsPage`, rendered **embedded** inside Admin: `<window.GoalsPage embedded go={go} />`. Everything below — layout, every card, all sizes/colors/shadows, data, components, and the complete CSS — is literal. Do not rename classes or change any number, color, or string.

> Structure (embedded mode): **(1)** an **embed bar** — "JOV Realty · 4 team members" on the left, a **year selector** dropdown on the right → **(2)** a **4-up KPI row** → **(3)** a 2-column grid: an **agent goal table** (left) + an **AI Goal Coach** card (right) → **(4)** a full-width **Pipeline Toward Goal** card (3 cells).

This component owns **all its own CSS** (a `wg-*` namespace emitted by `<GoalsStyles/>`), so it only depends on a few global tokens/classes — it does not reuse the `wc-rep-*`/`wc-kpi` styles from the other tabs.

---

## 1. Environment

- Inline JSX (Babel in browser), no imports/exports. `const { useState: useGoalS } = React;`.
- Host globals used: `React`, `Icon` (`<Icon name size/>`). Shared classes/tokens it leans on: `.wc-mono`, `.wc-fade`, `.wc-panel-card`, `.wc-pagehead`, `.wc-rangescrim`, `.wc-rangemenu`, `.wc-rangeitem`, and the CSS custom props (`--accent`, `--ink`, `--line`, `--panel`, shadows…).
- Exported via `window.GoalsPage = GoalsPage;`.
- **Props:** `embedded` (boolean — Admin passes `true`, which swaps the page `<h1>` header for a slim embed bar and wraps in `.wg-embed` instead of `.wc-page`), and `go` (router fn — the coach button calls `go('tasks')`).

---

## 2. Component — `GoalsPage({ go, embedded })`

```jsx
function GoalsPage({ go, embedded }) {
  const [year, setYear] = useGoalS(2026);
  const [yopen, setYopen] = useGoalS(false);

  const yearSel = (
    <div className="wg-yearwrap">
      <button className="wg-yearsel" onClick={() => setYopen(o => !o)}>
        <Icon name="calendar" size={16} /><span className="wc-mono">{year}</span><Icon name="chevronDown" size={15} />
      </button>
      {yopen && (
        <>
          <div className="wc-rangescrim" onClick={() => setYopen(false)} />
          <div className="wc-rangemenu" style={{ minWidth: 130 }}>
            {[2026, 2025, 2024].map(y => (
              <button key={y} className={'wc-rangeitem' + (y === year ? ' is-on' : '')} onClick={() => { setYear(y); setYopen(false); }}>
                <span className="wc-mono">{y}</span>{y === year && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const body = (
    <>
      <GoalsStyles />

      {embedded ? (
        <div className="wg-embedbar">
          <p className="wg-sub"><Icon name="users" size={15} />JOV Realty <span className="wg-dot">·</span> 4 team members</p>
          {yearSel}
        </div>
      ) : (
        <div className="wc-pagehead">
          <div>
            <h1>{year} Goals</h1>
            <p className="wg-sub"><Icon name="users" size={15} />JOV Realty <span className="wg-dot">·</span> 4 team members</p>
          </div>
          {yearSel}
        </div>
      )}

      {/* (3) KPI row, (4) main grid, (5) pipeline — see below */}
    </>
  );

  if (embedded) return <div className="wg-embed wc-fade">{body}</div>;
  return <div className="wc-page wg-page wc-fade">{body}</div>;
}
```

- **Year selector** (`.wg-yearsel`): a 42px-tall bordered pill — calendar icon + mono year + chevron; opens a `.wc-rangemenu` (min-width 130) listing 2026 / 2025 / 2024 with a check on the active one, dismissed by a full-screen `.wc-rangescrim`.
- **Embed bar** (`.wg-embedbar`): space-between row — the "JOV Realty · 4 team members" subline (users icon + grey dot separator) on the left, the year selector on the right. (Non-embedded mode shows a `.wc-pagehead` with `<h1>{year} Goals</h1>` instead.)

---

## 3. KPI row (4 cards)

`div.wg-kpis` → **4 equal columns** (→ 2×2 ≤1180px), 14px gap. Each card: a round tinted icon, a big mono value, a label, and a colored footnote.

```jsx
const G_KPIS = [
  { icon: 'dollar',    fg: '#EA580C', bg: '#FEEBDD', value: '$231,000', label: 'Commission Earned', foot: <span className="wg-up"><Icon name="trending" size={13} />18% from last month</span> },
  { icon: 'briefcase', fg: '#0E9F6E', bg: '#E4F7EF', value: '10',       label: 'Deals Closed',      foot: <span className="wg-up"><Icon name="trending" size={13} />2 from last month</span> },
  { icon: 'calendar',  fg: '#7C5CFC', bg: '#EEEAFE', value: '6',        label: 'Upcoming Deals',    foot: <span className="wg-foot-violet">$215,000 potential</span> },
  { icon: 'target',    fg: '#0EA5E9', bg: '#E7F6FD', value: '73%',      label: 'Goal Progress',     foot: <span className="wg-foot-green">On track</span> },
];

<div className="wg-kpis">
  {G_KPIS.map(k => (
    <div className="wg-kpi" key={k.label}>
      <span className="wg-kpi-ic" style={{ color: k.fg, background: k.bg }}><Icon name={k.icon} size={22} /></span>
      <div className="wg-kpi-body">
        <div className="wg-kpi-val wc-mono">{k.value}</div>
        <div className="wg-kpi-label">{k.label}</div>
        <div className="wg-kpi-foot">{k.foot}</div>
      </div>
    </div>
  ))}
</div>
```
- Card: white, radius **16**, padding `18px 18px 16px`, `--shadow-sm`; lifts on hover. Icon is a **48×48 round** (`border-radius:50%`) tinted chip, glyph 22px. Value **27px/800** mono; label 14px/600 grey; footnote 12.5px — green (`.wg-up` / `.wg-foot-green` = `#0E9F6E`) or violet (`.wg-foot-violet` = `#7C5CFC`).

---

## 4. Main grid — agent table (left) + AI coach (right)

`div.wg-grid` = **`1fr 360px`**, 16px gap, → 1 col ≤1180px.

### 4a. Agent goal table
A `.wc-panel-card.wg-tablecard` wrapping `table.wg-table`. Columns: **Agent · Progress · Earned · Goal · (status)**.

```jsx
const G_AGENTS = [
  { id: 'jv', name: 'Joseph Velasquez', role: 'Owner', earned: 95000, goal: 120000, pct: 79, status: 'On Track' },
  { id: 'sc', name: 'Sarah Chen',       role: 'Agent', earned: 72000, goal: 100000, pct: 72, status: 'On Track' },
  { id: 'mr', name: 'Michael Ross',     role: 'Agent', earned: 48000, goal: 90000,  pct: 53, status: 'Behind' },
  { id: 'dw', name: 'Dana Whitfield',   role: 'Agent', earned: 16000, goal: 0,      pct: 15, status: 'At Risk' },
];
const G_STATUS = {
  'On Track': { fg: '#0E9F6E', bg: '#E4F7EF' },
  'Behind':   { fg: '#B45309', bg: '#FEF3C7' },
  'At Risk':  { fg: '#DC2626', bg: '#FEE2E2' },
};
const gInitials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const fmtUSD0 = n => '$' + n.toLocaleString('en-US');

<div className="wc-panel-card wg-tablecard">
  <table className="wg-table">
    <thead>
      <tr><th>Agent</th><th>Progress</th><th>Earned</th><th>Goal</th><th className="wg-status-col"></th></tr>
    </thead>
    <tbody>
      {G_AGENTS.map(a => {
        const st = G_STATUS[a.status];
        return (
          <tr key={a.id}>
            <td>
              <div className="wg-agent">
                <span className="wg-av">{gInitials(a.name)}</span>
                <div><div className="wg-agent-name">{a.name}</div><div className="wg-agent-role">{a.role}</div></div>
              </div>
            </td>
            <td className="wg-prog-cell">
              <div className="wg-prog-pct wc-mono">{a.pct}%</div>
              <div className="wg-prog-bar"><div style={{ width: a.pct + '%' }} /></div>
            </td>
            <td className="wg-money wc-mono">{fmtUSD0(a.earned)}</td>
            <td className="wg-money wc-mono">{a.goal ? fmtUSD0(a.goal) : <span className="wg-setgoal">Set goal</span>}</td>
            <td className="wg-status-col"><span className="wg-badge" style={{ color: st.fg, background: st.bg }}>{a.status}</span></td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>
```
- Header cells: uppercase 11px grey, left-aligned. Rows separated by hairline top borders, 16px cell padding.
- **Agent cell:** a **42×42 round** initials avatar (`#EFEDE8` bg, `#8C857B` text) + name (15px/700) and role (12.5px grey).
- **Progress cell:** fixed 210px wide — a mono `pct%` (15px/700) above a **7px** rounded track (`#EBE8E2`, max-width 160px) filled to `pct%` in orange `--accent`.
- **Earned / Goal:** 15px/700 mono, nowrap. When `goal === 0`, show "Set goal" in grey instead.
- **Status badge:** right-aligned pill (12px/700, padding `5px 11px`, fully rounded) tinted per `G_STATUS` — On Track green `#0E9F6E`/`#E4F7EF`, Behind amber `#B45309`/`#FEF3C7`, At Risk red `#DC2626`/`#FEE2E2`.

### 4b. AI Goal Coach card
A 360px `.wc-panel-card.wg-coach` — header, an "on track" status line, a divider, the personal-goal callout, a checklist, and a full-width outlined action button.

```jsx
const G_COACH = [
  { icon: 'calendarCheck', fg: '#0E9F6E', bg: '#E4F7EF', text: 'Close 2 more deals' },
  { icon: 'calendar',      fg: '#EA580C', bg: '#FEEBDD', text: 'Book 4 listing appointments' },
  { icon: 'message',       fg: '#0EA5E9', bg: '#E7F6FD', text: 'Follow up with 18 warm leads' },
];

<div className="wc-panel-card wg-coach">
  <div className="wg-coach-head">
    <span className="wg-coach-spark"><Icon name="sparkles" size={18} /></span>
    <span className="wg-coach-title">AI Goal Coach</span>
    <button className="wg-info" title="How this is calculated"><Icon name="info" size={15} /></button>
  </div>
  <div className="wg-coach-status">
    <span className="wg-coach-check"><Icon name="checkCircle" size={22} /></span>
    <div>
      <div className="wg-coach-h">You're on track!</div>
      <div className="wg-coach-p">Keep up the momentum.</div>
    </div>
  </div>
  <div className="wg-coach-div" />
  <div className="wg-coach-goal">To hit your <b>$180,000</b> personal goal:</div>
  <div className="wg-coach-list">
    {G_COACH.map((c, i) => (
      <div className="wg-coach-item" key={i}>
        <span className="wg-coach-iic" style={{ color: c.fg, background: c.bg }}><Icon name={c.icon} size={16} /></span>
        <span className="wg-coach-itxt">{c.text}</span>
      </div>
    ))}
  </div>
  <button className="wg-action" onClick={() => go && go('tasks')}>View Action Plan<Icon name="arrowRight" size={17} /></button>
</div>
```
- Header: a **30×30 / radius-9** violet chip (`#7C5CFC` on `#EEEAFE`) + "AI Goal Coach" (16px/800) + a round 24px info button.
- Status line: green `checkCircle` (22px) + "You're on track!" (16px/800) and "Keep up the momentum." (13.5px grey).
- Full-bleed 1px divider (`.wg-coach-div`, negative -20px margins). Callout "To hit your **$180,000** personal goal:" (14px, bold figure).
- Checklist rows: **34×34 / radius-10** tinted icon chip + 14px/600 text, 14px gaps.
- Action button: full-width **48px**, **1.5px orange outline**, orange text, radius 12; hover fills `--accent-soft`. Right arrow icon. Calls `go('tasks')`.

---

## 5. Pipeline Toward Goal (full-width, 3 cells)

```jsx
const G_PIPELINE = [
  { icon: 'checkCircle', fg: '#0E9F6E', bg: '#E4F7EF', label: 'Closed Revenue',  value: '$231,000' },
  { icon: 'handshake',   fg: '#0EA5E9', bg: '#E7F6FD', label: 'Under Contract',  value: '$92,000' },
  { icon: 'filter',      fg: '#7C5CFC', bg: '#EEEAFE', label: 'Active Pipeline', value: '$420,000' },
];

<div className="wc-panel-card wg-pipe">
  <div className="wg-pipe-head">Pipeline Toward Goal<button className="wg-info" title="Pipeline contributing toward your annual goal"><Icon name="info" size={14} /></button></div>
  <div className="wg-pipe-row">
    {G_PIPELINE.map((p, i) => (
      <div className="wg-pipe-cell" key={i}>
        <span className="wg-pipe-ic" style={{ color: p.fg, background: p.bg }}><Icon name={p.icon} size={20} /></span>
        <div><div className="wg-pipe-label">{p.label}</div><div className="wg-pipe-val wc-mono">{p.value}</div></div>
      </div>
    ))}
  </div>
</div>
```
- Card padding `20px 24px 22px`; head 17px/800 + small info button. Three equal cells (`repeat(3,1fr)`), each a **44×44 / radius-12** tinted icon chip + label (13.5px grey) and **23px/800** mono value. Cells after the first carry a **1px left divider** (`--line-soft`).

---

## 6. Complete CSS — `GoalsStyles` (verbatim, all sizes/shapes/positions)

```jsx
function GoalsStyles() {
  return <style>{`
    .wg-page{max-width:1640px}
    .wg-sub{display:flex;align-items:center;gap:7px}
    .wg-sub .wc-icon{color:var(--ink-3)}
    .wg-dot{color:var(--ink-3)}
    .wg-embedbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}

    .wg-yearwrap{position:relative}
    .wg-yearsel{display:inline-flex;align-items:center;gap:9px;height:42px;padding:0 14px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-size:14px;font-weight:600;color:var(--ink);box-shadow:var(--shadow-sm)}
    .wg-yearsel:hover{border-color:#D9D5CE}
    .wg-yearsel .wc-icon:first-child{color:var(--ink-3)}
    .wg-yearsel .wc-icon:last-child{color:var(--ink-3)}

    /* KPI row */
    .wg-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
    .wg-kpi{display:flex;gap:14px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px 18px 16px;box-shadow:var(--shadow-sm);transition:.14s}
    .wg-kpi:hover{box-shadow:var(--shadow);transform:translateY(-1px)}
    .wg-kpi-ic{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;flex:none}
    .wg-kpi-body{min-width:0}
    .wg-kpi-val{font-size:27px;font-weight:800;letter-spacing:-.02em;line-height:1.05;color:var(--ink)}
    .wg-kpi-label{font-size:14px;color:var(--ink-2);font-weight:600;margin-top:3px}
    .wg-kpi-foot{margin-top:10px;font-size:12.5px;font-weight:600}
    .wg-up{display:inline-flex;align-items:center;gap:5px;color:#0E9F6E}
    .wg-foot-violet{color:#7C5CFC;font-weight:700}
    .wg-foot-green{color:#0E9F6E;font-weight:700}

    /* main grid */
    .wg-grid{display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:start;margin-bottom:16px}
    .wg-tablecard{padding:8px 6px 6px}
    .wg-table{width:100%;border-collapse:collapse}
    .wg-table thead th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);padding:14px 16px 12px}
    .wg-table thead th:nth-child(3),.wg-table thead th:nth-child(4){padding-left:0}
    .wg-table tbody tr{border-top:1px solid var(--line-soft)}
    .wg-table tbody td{padding:16px;vertical-align:middle}
    .wg-agent{display:flex;align-items:center;gap:13px}
    .wg-av{width:42px;height:42px;border-radius:50%;background:#EFEDE8;color:#8C857B;display:grid;place-items:center;font-size:13px;font-weight:700;flex:none}
    .wg-agent-name{font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
    .wg-agent-role{font-size:12.5px;color:var(--ink-3);margin-top:2px}
    .wg-prog-cell{width:210px}
    .wg-prog-pct{font-size:15px;font-weight:700;color:var(--ink);margin-bottom:8px}
    .wg-prog-bar{height:7px;border-radius:99px;background:#EBE8E2;overflow:hidden;max-width:160px}
    .wg-prog-bar>div{height:100%;border-radius:99px;background:var(--accent)}
    .wg-money{font-size:15px;font-weight:700;color:var(--ink);white-space:nowrap}
    .wg-setgoal{font-size:13.5px;font-weight:600;color:var(--ink-3)}
    .wg-status-col{text-align:right;width:110px}
    .wg-badge{display:inline-flex;align-items:center;font-size:12px;font-weight:700;padding:5px 11px;border-radius:99px;white-space:nowrap}

    /* AI coach */
    .wg-coach{padding:20px}
    .wg-coach-head{display:flex;align-items:center;gap:10px;margin-bottom:18px}
    .wg-coach-spark{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#7C5CFC;background:#EEEAFE;flex:none}
    .wg-coach-title{font-size:16px;font-weight:800;letter-spacing:-.01em;flex:1}
    .wg-info{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;color:var(--ink-3);border:1px solid var(--line)}
    .wg-info:hover{background:var(--line-soft);color:var(--ink-2)}
    .wg-coach-status{display:flex;align-items:flex-start;gap:12px;margin-bottom:18px}
    .wg-coach-check{color:#0E9F6E;flex:none;margin-top:1px}
    .wg-coach-h{font-size:16px;font-weight:800;letter-spacing:-.01em;color:var(--ink)}
    .wg-coach-p{font-size:13.5px;color:var(--ink-2);margin-top:2px}
    .wg-coach-div{height:1px;background:var(--line);margin:0 -20px 18px}
    .wg-coach-goal{font-size:14px;color:var(--ink-2);margin-bottom:14px}
    .wg-coach-goal b{color:var(--ink);font-weight:800}
    .wg-coach-list{display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
    .wg-coach-item{display:flex;align-items:center;gap:12px}
    .wg-coach-iic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none}
    .wg-coach-itxt{font-size:14px;font-weight:600;color:var(--ink)}
    .wg-action{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:48px;border-radius:12px;border:1.5px solid var(--accent);background:var(--panel);color:var(--accent-strong);font-size:15px;font-weight:700;transition:.14s}
    .wg-action:hover{background:var(--accent-soft)}

    /* pipeline */
    .wg-pipe{padding:20px 24px 22px}
    .wg-pipe-head{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:800;letter-spacing:-.01em;margin-bottom:18px}
    .wg-pipe-row{display:grid;grid-template-columns:repeat(3,1fr)}
    .wg-pipe-cell{display:flex;align-items:center;gap:14px;padding:4px 28px}
    .wg-pipe-cell+.wg-pipe-cell{border-left:1px solid var(--line-soft)}
    .wg-pipe-cell:first-child{padding-left:0}
    .wg-pipe-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;flex:none}
    .wg-pipe-label{font-size:13.5px;color:var(--ink-2);font-weight:600}
    .wg-pipe-val{font-size:23px;font-weight:800;letter-spacing:-.02em;color:var(--ink);margin-top:2px}

    @media (max-width:1180px){
      .wg-kpis{grid-template-columns:repeat(2,1fr)}
      .wg-grid{grid-template-columns:1fr}
    }
  `}</style>;
}
```

---

## 7. Token reference (colors/shadows used)

```css
--accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
--panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
--ink:#191D29; --ink-2:#586173; --ink-3:#878FA0;
--shadow-sm:0 1px 2px rgba(20,24,38,.05);
--shadow:0 4px 16px rgba(20,24,38,.07);
/* status: green #0E9F6E/#E4F7EF · amber #B45309/#FEF3C7 · red #DC2626/#FEE2E2 · violet #7C5CFC/#EEEAFE */
```

### Acceptance
- [ ] Embedded mode: slim embed bar ("JOV Realty · 4 team members" + year dropdown), no big `<h1>`.
- [ ] Year selector opens 2026/2025/2024 menu with a check on the active year.
- [ ] 4 KPI cards (Commission Earned $231,000 / Deals Closed 10 / Upcoming Deals 6 / Goal Progress 73%) with round 48px tinted icons, 27px mono values, colored footnotes.
- [ ] Agent table: 4 rows with avatar, progress %+orange bar, earned, goal (or "Set goal"), and a status badge (On Track / Behind / At Risk).
- [ ] AI Goal Coach (360px): violet spark header, green "on track" line, divider, "$180,000 personal goal" callout, 3 checklist items, outlined "View Action Plan" button that routes to tasks.
- [ ] Pipeline Toward Goal: 3 divided cells (Closed Revenue / Under Contract / Active Pipeline) with 44px tinted icons + 23px mono values.
- [ ] Responsive: KPIs → 2×2 and grid → 1 col below 1180px. All sizes/colors/shadows match §6 exactly.
```
