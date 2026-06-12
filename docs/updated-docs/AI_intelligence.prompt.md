# Build Prompt — "AI Intelligence / Specific recommendations for your deals" card (`Dashboard.jsx`)

Reproduce the **AI Intelligence** card exactly as it appears in the WarmChats dashboard. It is a left-column `<Card>` with a standard `CardHeader` and a responsive 2-column grid of color-coded insight tiles (`IntelCard`), each surfacing one AI-detected signal about a specific lead plus a recommended next action. Everything is inline-styled React (React 18 + Babel).

It relies on existing CSS variables: `--orange-50 #fef3ea`, `--orange-600 #e25a09`, `--violet #6849cf`, `--violet-bg #efebf9`, `--blue #2f6ad0`, `--blue-bg #e9eef8`, `--amber #a87400`, `--amber-bg #f8efd9`, `--ink-900 #211a14`, `--ink-700 #463b31`, `--ink-500 #8c7d6f`, `--ink-100 #f4efe8`, `--line #ece6dd`; plus the shared `Card`, `CardHeader`, and the `I` icon object.

---

## 1. Data (inside `DashboardPage`)

```jsx
// AI Deal Intelligence — specific lead insights
const intel = [
  { tone:'orange', icon:'sparkle', tag:'Buying signal', lead:'Brandon Kowalski',
    insight:'Asked about closing costs and financing in last 3 messages — buyer is ready.',
    action:'Call now' },
  { tone:'violet', icon:'bolt',    tag:'Motivation',    lead:'C. Hernandez',
    insight:'Mentioned "relocating for work in July" — likely motivated seller.',
    action:'Send listing prep' },
  { tone:'blue',   icon:'message', tag:'Comparing',     lead:'Devon S.',
    insight:'Opened your last 3 messages but viewed 2 competitor sites. Send a stand-out reply.',
    action:'Draft reply' },
  { tone:'amber',  icon:'refresh', tag:'Cooling',       lead:'J. Ortiz',
    insight:'Was Hot 3 days ago, no reply since. Outbound AI suggests a re-engagement.',
    action:'Launch sequence' },
];
```

**Notes — do not miss:**
- Exactly **4 items**, in this order. Each has: `tone` (palette key), `icon` (key into `I`), `tag` (short category label), `lead` (person's name), `insight` (the AI observation sentence), `action` (CTA verb phrase).
- The four tones map to the four semantic palettes (orange/violet/blue/amber) — one of each, so the grid reads as four distinct signal types.
- Tag→tone→icon pairing is intentional: **Buying signal/orange/sparkle**, **Motivation/violet/bolt**, **Comparing/blue/message**, **Cooling/amber/refresh**.
- Copy is specific and real-estate-grounded (closing costs, relocating seller, competitor sites, re-engagement). Keep the em-dashes and the quoted phrase `"relocating for work in July"` exactly.

---

## 2. Card markup (inside the left column of the main grid)

```jsx
<Card>
  <CardHeader
    eyebrow="AI Intelligence"
    title="Specific recommendations for your deals"
    right={<span style={{ fontSize:11, color:'var(--ink-500)' }}>Updated 3m ago</span>} />

  <div className="intel-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
    <style>{`@media (max-width: 720px){ .intel-grid{ grid-template-columns:1fr !important; } }`}</style>
    {intel.map((it, i) => <IntelCard key={i} item={it} />)}
  </div>
</Card>
```

**Header / grid behaviors:**
- Uses the shared `CardHeader`: eyebrow `"AI Intelligence"` (11px/600 uppercase `--orange-600`, letter-spaced), title `"Specific recommendations for your deals"` (`.display`, 21px), and a right slot reading `"Updated 3m ago"` (11px, `--ink-500`).
- The grid is **2 columns** (`1fr 1fr`, `gap:10`) and collapses to **1 column at ≤720px** via a scoped `<style>` injecting `.intel-grid { grid-template-columns:1fr !important }`. The `<style>` lives inside the grid div — keep it there so the rule ships with the component.
- With 4 items, the 2-col grid renders as a 2×2 block.

---

## 3. The `IntelCard` component (sibling of `DashboardPage`)

```jsx
function IntelCard({ item }) {
  const palette = {
    orange: { bg:'var(--orange-50)', fg:'var(--orange-600)', border:'#f7d5b8' },
    violet: { bg:'var(--violet-bg)', fg:'var(--violet)',     border:'#dccdf3' },
    blue:   { bg:'var(--blue-bg)',   fg:'var(--blue)',       border:'#cadcf4' },
    amber:  { bg:'var(--amber-bg)',  fg:'var(--amber)',      border:'#f0e0b3' },
  }[item.tone] || { bg:'var(--ink-100)', fg:'var(--ink-700)', border:'var(--line)' };
  const Icon = I[item.icon];

  return (
    <div style={{
      background:'white', border:'1px solid var(--line)', borderRadius:13, padding:14,
      display:'flex', flexDirection:'column', gap:8, position:'relative', overflow:'hidden'
    }}>
      {/* colored left accent bar */}
      <div style={{ position:'absolute', top:0, left:0, width:3, height:'100%',
                    background:palette.fg }} />

      {/* tag pill + lead name */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{
          display:'inline-flex', alignItems:'center', gap:5, fontSize:10.5, fontWeight:700,
          padding:'2px 8px', borderRadius:5, background:palette.bg, color:palette.fg,
          letterSpacing:0.3
        }}>
          <Icon width="11" height="11" /> {item.tag.toUpperCase()}
        </span>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--ink-900)' }}>{item.lead}</div>
      </div>

      {/* insight sentence */}
      <div style={{ fontSize:13, color:'var(--ink-700)', lineHeight:1.45 }}>{item.insight}</div>

      {/* action button */}
      <button style={{
        marginTop:2, alignSelf:'flex-start', padding:'6px 11px', borderRadius:8,
        background:palette.bg, color:palette.fg, border:'1px solid '+palette.border,
        fontSize:12.5, fontWeight:600, cursor:'pointer'
      }}>{item.action} →</button>
    </div>
  );
}
```

**IntelCard anatomy — do not miss:**
- **Palette resolution:** `item.tone` indexes a map of `{bg, fg, border}` triples. Each tone pairs a tinted background var, a saturated foreground var, and a hand-tuned hairline `border` hex:
  - orange → `--orange-50` / `--orange-600` / `#f7d5b8`
  - violet → `--violet-bg` / `--violet` / `#dccdf3`
  - blue → `--blue-bg` / `--blue` / `#cadcf4`
  - amber → `--amber-bg` / `--amber` / `#f0e0b3`
  - Fallback (unknown tone) → `--ink-100` / `--ink-700` / `--line`.
- **Container:** white, `1px var(--line)` border, `border-radius:13`, `padding:14`, vertical flex with `gap:8`, `position:relative`, `overflow:hidden` (so the accent bar clips to the rounded corners).
- **Left accent bar:** absolutely positioned, `width:3`, full height, colored with `palette.fg`. This is the per-tone color stripe.
- **Tag pill:** inline-flex, `gap:5`, the tone icon at 11×11 followed by `item.tag.toUpperCase()`. 10.5px/700, `letter-spacing:0.3`, `padding:2px 8px`, `border-radius:5`, `background:palette.bg`, `color:palette.fg`. (e.g. "⚡ MOTIVATION".)
- **Lead name:** 13px/600 `--ink-900`, sits to the right of the pill in the same centered row (`gap:8`).
- **Insight text:** 13px `--ink-700`, `line-height:1.45` — the AI observation sentence.
- **Action button:** `align-self:flex-start` (hugs content width), `margin-top:2`, `padding:6px 11px`, `border-radius:8`, filled with `palette.bg`, text `palette.fg`, `1px solid palette.border`. Label is `{item.action} →` (literal trailing arrow), 12.5px/600, pointer cursor. So each card's CTA is tinted to match its own tone.
- **Icon** comes from `I[item.icon]` and renders in the pill at 11×11, inheriting `palette.fg` via `currentColor` (the pill sets `color:palette.fg`).

---

## 4. Placement & responsiveness
- Lives in the dashboard's **left column** (`minmax(0,1.6fr)`), below "Hot leads" and above the bottom of the column, inside the main `display:grid; gridTemplateColumns:'minmax(0,1.6fr) minmax(0,1fr)'; gap:18` grid (collapses to one column under 1100px via `.dash-grid`).
- Internally the tile grid is 2-up, collapsing to 1-up at ≤720px.
- No fixed heights anywhere — cards size to their content; the 2×2 grid rows align to the tallest tile in each row (grid default `stretch`), so the colored accent bars run full height regardless of text length.

---

## 5. Acceptance checklist
- [ ] Exactly 4 insight tiles, tones orange/violet/blue/amber in that order with the exact tag/icon/lead/insight/action copy from §1.
- [ ] `CardHeader` shows eyebrow "AI Intelligence", title "Specific recommendations for your deals", right meta "Updated 3m ago".
- [ ] Tile grid 2-col (`gap:10`), collapses to 1-col at ≤720px via the scoped `.intel-grid` style.
- [ ] Each tile: white bg, `--line` border, radius 13, padding 14, with a 3px full-height left accent bar in `palette.fg`, `overflow:hidden`.
- [ ] Tag pill = tone icon (11px) + UPPERCASE tag, tinted `palette.bg`/`palette.fg`, 10.5px/700, radius 5.
- [ ] Lead name 13/600 ink-900 beside the pill; insight 13/ink-700/lh 1.45.
- [ ] Action button hugs left, tinted bg/fg with `palette.border` hairline, label `"{action} →"` with trailing arrow.
- [ ] Palette hexes for borders exactly: orange `#f7d5b8`, violet `#dccdf3`, blue `#cadcf4`, amber `#f0e0b3`; unknown tone falls back to ink-100/ink-700/line.
