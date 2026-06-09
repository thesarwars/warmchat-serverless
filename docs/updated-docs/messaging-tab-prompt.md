# EXACT build spec — Admin ▸ **Messaging** tab (self-contained)

Reproduce the **Messaging** panel of the WarmChats Admin page pixel-for-pixel. This is the React component the host mounts as `window.RepMessagingTab` (source name `MessagingTab`). Everything below — layout, every card, all sizes/colors/shadows, data, components, and CSS — is literal. Do not rename classes or change any number, color, or string.

> Structure: **(1)** a **segmented SMS / Email toggle** at the top → **(2)** a reusable channel report (`ChannelReportTab`) that renders, for the selected channel: a row of **5 KPI stat cards** → a 2-column grid with a **bar chart** card (left) and a **"By … type" horizontal-bar breakdown** (right). Switching the toggle swaps all the data (SMS ↔ Email); the layout is identical.

---

## 1. Environment

- Inline JSX (Babel in browser), no imports/exports. `const { useState: useRepS } = React;`.
- Host globals used: `React`, `Icon` (`<Icon name size/>`), `TONES` (tone→`{fg,bg}`).
- Numbers use `.wc-mono`. Accent is orange `--accent:#F97316`.
- Exported via `window.RepMessagingTab = MessagingTab;` (host renders it for the Messaging tab).

### TONES values referenced by this tab
```jsx
const TONES = {
  violet:  { fg:'#7C3AED', bg:'#F2ECFE' },   // SMS Sent
  green:   { fg:'#16A34A', bg:'#E8F8ED' },   // Delivered
  teal:    { fg:'#0D9488', bg:'#E3F6F2' },   // Replies / Open Rate
  amber:   { fg:'#D97706', bg:'#FEF5E5' },   // Avg Reply Time / Email Sent
  orange:  { fg:'#EA580C', bg:'#FFF3EA' },   // Opt-outs / Bounces
  indigo:  { fg:'#4F46E5', bg:'#ECEDFD' },   // Click Rate
};
```

---

## 2. The tab shell — `MessagingTab`

A small **segmented control** (max-width 360, SMS + Email, each with an icon), then the channel report for the active sub. Default sub = `'sms'`.

```jsx
function MessagingTab() {
  const [sub, setSub] = useRepS('sms');
  const SUBS = [
    { k: 'sms',   label: 'SMS',   icon: 'message' },
    { k: 'email', label: 'Email', icon: 'mail' },
  ];
  return (
    <div>
      <div className="wc-seg" style={{ marginBottom: 16, maxWidth: 360 }}>
        {SUBS.map(s => (
          <button key={s.k} className={sub === s.k ? 'is-on' : ''} onClick={() => setSub(s.k)}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 14px', fontSize: 13.5, fontWeight: 700 }}>
            <Icon name={s.icon} size={15} />{s.label}
          </button>
        ))}
      </div>
      {sub === 'sms'   && <ChannelReportTab icon="message" metrics={SMS_METRICS}   chart={SMS_CHART}   chartLabel="Texts sent · last 14 days"  types={SMS_TYPES}   typesLabel="By message type" />}
      {sub === 'email' && <ChannelReportTab icon="mail"    metrics={EMAIL_METRICS} chart={EMAIL_CHART} chartLabel="Emails sent · last 14 days" types={EMAIL_TYPES} typesLabel="By email type" />}
    </div>
  );
}
```

**Segmented control CSS** (a pill-track with equal buttons; active pill is white with a soft shadow + orange text):
```css
.wc-seg{display:flex;gap:6px;background:var(--line-soft);padding:4px;border-radius:11px;margin:10px 0 16px}
.wc-seg button{flex:1;padding:8px;border-radius:8px;font-size:12.5px;font-weight:600;color:var(--ink-2)}
.wc-seg button.is-on{background:var(--panel);color:var(--accent-strong);box-shadow:var(--shadow-sm)}
```
- Track: `--line-soft` background, **radius 11**, 4px padding, 6px gap. Buttons share the width equally (`flex:1`); the inline style here bumps them to **9px 14px / 13.5px / 700** with an icon. Active button = white panel, **orange `--accent-strong`** text, `--shadow-sm`. (The whole control is capped at **360px** wide.)

---

## 3. The channel report — `ChannelReportTab`

Same component for both channels. Renders: a **5-up stat row**, then a **2-column grid** (bar chart + breakdown). The percentages in the breakdown are computed from the type totals.

```jsx
function ChannelReportTab({ icon, metrics, chart, chartLabel, types, typesLabel }) {
  const max = Math.max(...chart);
  const totalType = types.reduce((s, t) => s + t.value, 0);
  return (
    <div>
      <div className="wc-rep-stats">{metrics.map(m => <StatCard key={m.label} m={m} />)}</div>
      <div className="wc-admin-grid">
        <div className="wc-panel-card pad wc-chartcard">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name={icon} size={17} /></span>{chartLabel}</div>
          <div className="wc-chart">
            {chart.map((v, i) => (
              <div className="wc-chart-col" key={i}>
                <div className="wc-chart-bar" style={{ height: (v / max * 100) + '%' }}><span>{v}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="layers" size={17} /></span>{typesLabel}</div>
          {types.map(t => (
            <div className="wc-pipe-row" key={t.label}>
              <div className="wc-pipe-top">
                <span className="wc-pipe-name"><span className="wc-col-dot" style={{ '--stage': t.color }} />{t.label}</span>
                <span className="wc-pipe-meta"><span className="wc-pipe-count">{Math.round(t.value / totalType * 100)}%</span><b className="wc-mono">{t.value}</b></span>
              </div>
              <div className="wc-pipe-bar"><div style={{ width: (t.value / totalType * 100) + '%', background: t.color }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 3a. The 5 KPI stat cards (`StatCard`)
Container `div.wc-rep-stats` — **auto-fit** `minmax(180px,1fr)`, 12px gap, so the 5 cards lay out responsively (5-up on wide screens, wrapping below). Each card: a tinted icon chip, an uppercase label, a big mono value, and a sub-line.

```jsx
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
```
```css
.wc-rep-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}
.wc-stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 13px;box-shadow:var(--shadow-sm)}
.wc-repstat{position:relative}
.wc-repstat-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;margin-bottom:10px}
.wc-stat-label{font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)}
.wc-stat-val{font-size:20px;font-weight:700;letter-spacing:-.02em;margin-top:4px}
.wc-stat-sub{font-size:11px;font-weight:600;margin-top:3px}
```
- Tile: white, radius **14**, padding **12×13**, `--shadow-sm`. Icon chip **34×34 / radius-10**, tinted per tone. Label uppercase 10.5px grey; value **20px/700** mono; sub 11px. (Note: `StatCard` ignores the `up` flag — it only shows label/value/sub.)

### 3b. The bar chart card (left) + breakdown (right)
Identical chrome and chart/track styling to the Overview tab. Grid is `.wc-admin-grid` (**1.15fr / 1fr**, 18px gap, → 1 col ≤1040px).

```css
/* layout + card chrome */
.wc-admin-grid{display:grid;grid-template-columns:1.15fr 1fr;gap:18px;align-items:start}
@media(max-width:1040px){.wc-admin-grid{grid-template-columns:1fr}}
.wc-panel-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-sm);overflow:hidden}
.wc-panel-card.pad{padding:16px}
.wc-admincard-h{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:800;letter-spacing:-.01em;margin-bottom:14px}
.wc-admincard-ic{width:30px;height:30px;border-radius:9px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}

/* vertical bar chart (14 bars) */
.wc-chart{display:flex;align-items:flex-end;gap:8px;height:200px;padding-top:18px}
.wc-chart-col{flex:1;height:100%;display:flex;align-items:flex-end}
.wc-chart-bar{width:100%;background:linear-gradient(180deg,var(--accent),#FBA968);border-radius:7px 7px 0 0;position:relative;min-height:4px;transition:.2s}
.wc-chart-bar span{position:absolute;top:-18px;left:0;right:0;text-align:center;font-size:10.5px;font-weight:700;color:var(--ink-3);font-variant-numeric:tabular-nums}
.wc-chart-bar:hover{filter:brightness(1.05)}

/* horizontal "by type" breakdown */
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
- **Card:** white, radius **16**, `--shadow-sm`, 16px padding; header 16px/800 with a **30×30 / radius-9** orange-soft icon chip (uses the channel icon — `message`/`mail` for the chart card, `layers` for the breakdown).
- **Bar chart:** 200px-tall plot, 14 bars `flex:1` with 8px gaps; orange vertical gradient `#F97316 → #FBA968`, top corners **7px**, value label 18px above each bar in 10.5px grey mono; brighten on hover.
- **Breakdown rows:** colored 9×9 dot + label (14px/700), right-aligned `%` (12px grey) + count (14.5px bold mono), and a **9px** fully-rounded track on `--line-soft` whose fill width = share of total and color = the type color.

---

## 4. Data — SMS

```jsx
const SMS_METRICS = [
  { icon: 'message', label: 'Sent',           value: '1,204',   sub: 'this month',         tone: 'violet' },
  { icon: 'check',   label: 'Delivered',      value: '98.6%',   sub: '1,187 delivered', up: true, tone: 'green' },
  { icon: 'refresh', label: 'Replies',        value: '221',     sub: '18.4% reply rate', up: true, tone: 'teal' },
  { icon: 'zap',     label: 'Avg Reply Time', value: '6m 12s',  sub: 'first response',     tone: 'amber' },
  { icon: 'x',       label: 'Opt-outs',       value: '7',       sub: '0.6% of sent',       tone: 'orange' },
];
const SMS_CHART = [38, 52, 41, 64, 49, 72, 33, 68, 81, 57, 74, 45, 88, 96];   // 14 days
const SMS_TYPES = [
  { label: 'AI auto-reply',        value: 512, color: '#8B5CF6' },
  { label: 'Follow-up sequence',   value: 388, color: '#6366F1' },
  { label: 'Manual / 1-on-1',      value: 214, color: '#0EA5E9' },
  { label: 'Appointment reminder', value: 90,  color: '#14B8A6' },
];
```

## 5. Data — Email

```jsx
const EMAIL_METRICS = [
  { icon: 'mail',     label: 'Sent',      value: '486',   sub: 'this month',          tone: 'amber' },
  { icon: 'check',    label: 'Delivered', value: '96.2%', sub: '468 delivered',  up: true, tone: 'green' },
  { icon: 'trending', label: 'Open Rate', value: '42.8%', sub: '+3.1% vs last',  up: true, tone: 'teal' },
  { icon: 'target',   label: 'Click Rate',value: '11.4%', sub: 'of opened',      up: true, tone: 'indigo' },
  { icon: 'x',        label: 'Bounces',   value: '18',    sub: '3.7% of sent',        tone: 'orange' },
];
const EMAIL_CHART = [14, 22, 9, 31, 18, 27, 12, 24, 36, 19, 29, 16, 33, 41];  // 14 days
const EMAIL_TYPES = [
  { label: 'Batch campaign',  value: 214, color: '#D97706' },
  { label: 'AI follow-up',    value: 142, color: '#8B5CF6' },
  { label: 'Manual / 1-on-1', value: 88,  color: '#0EA5E9' },
  { label: 'Listing alert',   value: 42,  color: '#14B8A6' },
];
```

---

## 6. Token reference (colors/shadows)

```css
--accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
--panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
--ink:#191D29; --ink-2:#586173; --ink-3:#878FA0;
--shadow-sm:0 1px 2px rgba(20,24,38,.05);
--shadow:0 4px 16px rgba(20,24,38,.07);
/* bar-chart gradient: #F97316 → #FBA968 */
```

### Acceptance
- [ ] Segmented SMS / Email toggle (max-width 360); active pill white + orange text; defaults to SMS.
- [ ] 5 stat cards in a responsive auto-fit row (SMS: Sent/Delivered/Replies/Avg Reply Time/Opt-outs; Email: Sent/Delivered/Open Rate/Click Rate/Bounces) — 34×34 tinted chips, 20px mono values.
- [ ] Left bar chart "Texts/Emails sent · last 14 days" — 14 orange-gradient bars, 200px tall, value labels above.
- [ ] Right breakdown "By message/email type" — rows with colored 9px track bars, % + count.
- [ ] Switching the toggle swaps all data SMS↔Email with identical layout.
- [ ] All sizes/colors/shadows match §2–§5 exactly.
```
