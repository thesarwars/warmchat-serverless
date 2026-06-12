# Build Prompt — "Pipeline conversion" card (`Dashboard.jsx`)

Reproduce the **Pipeline conversion** card exactly as it appears in the WarmChats dashboard. It is a right-column `<Card>` containing a custom header (range label, title, live close-rate, and a 30/60/90-day segmented toggle) and a horizontal-bar **conversion funnel**. Everything is inline-styled React (React 18 + Babel). It relies on these existing CSS variables: `--ink-900 #211a14`, `--ink-700 #463b31`, `--ink-600 #6a5d50`, `--ink-500 #8c7d6f`, `--ink-100 #f4efe8`, `--ink-50 #faf7f2`, `--line #ece6dd`, `--green #1f7a52`, and the `Card`/`CardHeader` primitives. No new colors beyond the funnel's hardcoded orange ramp below.

---

## 1. State & derived data (inside `DashboardPage`)

```jsx
const funnelData = {
  30: [
    { label: 'New Leads',      value: 412, color: '#fff5ed' },
    { label: 'Engaged Leads',  value: 308, color: '#ffe6d0' },
    { label: 'Appointments',   value: 64,  color: '#ffc89a' },
    { label: 'Active Clients', value: 22,  color: '#fb8d3a' },
    { label: 'Closed Deals',   value: 6,   color: '#e25a09' },
  ],
  60: [
    { label: 'New Leads',      value: 847, color: '#fff5ed' },
    { label: 'Engaged Leads',  value: 621, color: '#ffe6d0' },
    { label: 'Appointments',   value: 138, color: '#ffc89a' },
    { label: 'Active Clients', value: 48,  color: '#fb8d3a' },
    { label: 'Closed Deals',   value: 14,  color: '#e25a09' },
  ],
  90: [
    { label: 'New Leads',      value: 1284, color: '#fff5ed' },
    { label: 'Engaged Leads',  value: 942,  color: '#ffe6d0' },
    { label: 'Appointments',   value: 204,  color: '#ffc89a' },
    { label: 'Active Clients', value: 71,   color: '#fb8d3a' },
    { label: 'Closed Deals',   value: 23,   color: '#e25a09' },
  ],
};
const [funnelRange, setFunnelRange] = useState(30);   // default 30
const funnel = funnelData[funnelRange];
const closeRate = (funnel[funnel.length - 1].value / funnel[0].value * 100).toFixed(1);
```

**Notes:**
- Five fixed stages, always in this order: **New Leads → Engaged Leads → Appointments → Active Clients → Closed Deals.**
- The `color` ramp goes light→dark orange so the bars darken as the funnel narrows: `#fff5ed`, `#ffe6d0`, `#ffc89a`, `#fb8d3a`, `#e25a09`.
- `closeRate` = Closed Deals ÷ New Leads × 100, one decimal. (30d → "1.5", 60d → "1.7", 90d → "1.8".)
- Funnel values are **not** monotonic-proportional across ranges — they're hand-authored per range. Use these exact numbers.

---

## 2. The card markup

Wrap in the shared `<Card>` (white, `border:1px var(--line)`, `border-radius:20`, `padding:20`, `--shadow-sm`). Do **not** use `CardHeader` here — the header is custom because it carries the toggle.

```jsx
<Card>
  {/* CUSTOM HEADER */}
  <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between',
                gap:10, marginBottom:12, flexWrap:'wrap' }}>
    <div>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5,
                    color:'var(--ink-500)', textTransform:'uppercase' }}>
        Last {funnelRange} days
      </div>
      <div style={{ fontSize:16, fontWeight:700, letterSpacing:-0.3, marginTop:3,
                    color:'var(--ink-900)' }}>
        Pipeline conversion
      </div>
    </div>

    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ fontSize:11.5, color:'var(--green)', fontWeight:600,
                     whiteSpace:'nowrap' }}>
        {closeRate}% close rate
      </span>

      {/* SEGMENTED 30 / 60 / 90 TOGGLE */}
      <div style={{ display:'flex', gap:2, background:'var(--ink-100)',
                    padding:3, borderRadius:8 }}>
        {[30, 60, 90].map((r) => (
          <button key={r} onClick={() => setFunnelRange(r)} style={{
            padding:'4px 9px', borderRadius:5, border:'none',
            background: funnelRange === r ? 'white' : 'transparent',
            color:      funnelRange === r ? 'var(--ink-900)' : 'var(--ink-600)',
            fontWeight: funnelRange === r ? 600 : 500,
            fontSize:11.5, cursor:'pointer',
            boxShadow:  funnelRange === r ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
          }}>{r}d</button>
        ))}
      </div>
    </div>
  </div>

  <Funnel steps={funnel} />
</Card>
```

**Header behaviors:**
- Eyebrow text is live — it reads "Last 30 days" / "Last 60 days" / "Last 90 days" and changes with the toggle.
- The close-rate pill is green (`--green`), 11.5px/600, `white-space:nowrap`, and recomputes on range change.
- The toggle is a pill-track segmented control: track is `--ink-100` with `padding:3, border-radius:8, gap:2`. The active segment is a white chip (`border-radius:5`, faint `0 1px 2px rgba(0,0,0,0.06)` shadow, ink-900 text, 600 weight); inactive segments are transparent with ink-600 text, 500 weight. Labels render as "30d / 60d / 90d".
- Header row uses `align-items:flex-end` and `flex-wrap:wrap` so the title baseline-aligns with the controls and wraps gracefully when narrow.

---

## 3. The `Funnel` component (sibling of `DashboardPage`)

```jsx
function Funnel({ steps }) {
  const max = Math.max(...steps.map((s) => s.value));   // = first stage's value
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
      {steps.map((s, i) => {
        const pct = s.value / max * 100;
        const dropPct = i > 0 ? Math.round(s.value / steps[i - 1].value * 100) : 100;
        return (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* STAGE LABEL */}
            <div style={{ minWidth:110, fontSize:12.5, fontWeight:500,
                          color:'var(--ink-700)' }}>{s.label}</div>

            {/* BAR TRACK */}
            <div style={{ flex:1, height:22, position:'relative',
                          background:'var(--ink-50)', borderRadius:6, overflow:'hidden' }}>
              {/* FILL */}
              <div style={{ position:'absolute', top:0, left:0, bottom:0,
                            width:`${pct}%`, background:s.color, transition:'width .3s' }} />
              {/* VALUE LABEL (overlaid) */}
              <div style={{ position:'absolute', inset:0, display:'flex',
                            alignItems:'center', padding:'0 8px',
                            fontSize:11.5, fontWeight:700,
                            color: pct > 40 ? (i >= 3 ? 'white' : 'var(--ink-900)')
                                            : 'var(--ink-900)' }}>
                {s.value.toLocaleString()}
              </div>
            </div>

            {/* RETENTION % vs previous stage */}
            <div style={{ minWidth:42, fontSize:11, color:'var(--ink-500)',
                          textAlign:'right' }}>
              {i === 0 ? '—' : `${dropPct}%`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Funnel mechanics — do not miss:**
- **Three-column row:** fixed 110px label · flex-1 bar track · fixed 42px right-aligned percentage. Rows stacked in a flex column with `gap:7`. Row items are vertically centered (`align-items:center`, `gap:10`).
- **Bar width** is `value / max × 100%`, where `max` is the largest value = always the first stage (New Leads). So New Leads is always a full-width bar and each subsequent stage is proportionally shorter. Fill animates with `transition: width .3s` when the range changes.
- **Bar track:** `height:22`, `background:var(--ink-50)`, `border-radius:6`, `overflow:hidden`. Fill is absolutely positioned from the left; its `background` is the stage's own `color`.
- **Value label** sits absolutely over the whole track (`inset:0`), left-padded 8px, 11.5px/700, formatted with `toLocaleString()` (thousands separators, e.g. "1,284"). **Text color logic:** if `pct > 40` AND the stage index `i >= 3` (the two darkest bars — Active Clients, Closed Deals) → white; otherwise → `--ink-900`. In practice only wide+dark bars get white text; narrow bars keep dark text sitting on the light track to its right.
- **Retention column:** the right number is `round(value / previousValue × 100)%` — i.e. the share of the *previous* stage retained at this stage (not the drop). The first row shows an em-dash "—". Example (30d): New Leads —, Engaged 75%, Appointments 21%, Active Clients 34%, Closed Deals 27%. Styled 11px, `--ink-500`, right-aligned, `min-width:42`.

---

## 4. Placement & responsiveness
- Lives in the dashboard's **right column** (`minmax(0,1fr)`), directly below the "AI Wins Today" panel and above the "Today / Schedule" card, inside the `display:grid; gridTemplateColumns:'minmax(0,1.6fr) minmax(0,1fr)'; gap:18` main grid that collapses to a single column under 1100px.
- The card has no fixed height — it sizes to its 5 funnel rows.
- Everything recomputes reactively from `funnelRange`: eyebrow text, close-rate pill, all five bar widths, value labels, and retention percentages.

---

## 5. Acceptance checklist
- [ ] Default range is 30d; toggling updates eyebrow, close rate, and all bars with a 0.3s width transition.
- [ ] Exact funnel numbers per range as listed in §1; values shown with thousands separators.
- [ ] Orange ramp `#fff5ed → #ffe6d0 → #ffc89a → #fb8d3a → #e25a09` across the five stages.
- [ ] Close rate = last÷first×100, 1 decimal, green, nowrap.
- [ ] Segmented toggle: ink-100 track, white active chip with subtle shadow + ink-900/600 text, inactive ink-600/500.
- [ ] First retention cell is "—"; others are `round(value/prev×100)%`.
- [ ] Only the wide dark bars (i≥3 with pct>40) get white value text; all others ink-900.
- [ ] Bar track ink-50, radius 6, height 22, overflow hidden; rows gap 7; label 110px; pct column 42px right-aligned.
