# Build Prompt — `Dashboard.jsx` (WarmChats AI Agents)

Build a single-file React dashboard for **WarmChats**, an AI-powered CRM for solo real-estate agents. It is rendered with React 18 + Babel standalone inside one HTML file (`<div id="root">`, `ReactDOM.createRoot`). All styling is inline-style objects on `style={{}}` plus a small global `<style>` block of CSS variables, font imports, and keyframes. No CSS framework, no Tailwind. Icons are inline stroke SVGs. The whole thing is warm, paper-toned, confident, and dense-but-calm — a "morning command center" for a busy realtor named **Joseph Velasquez** (JOV Realty).

---

## 1. Global setup

**Fonts** (Google Fonts):
- `Plus Jakarta Sans` (400/500/600/700/800) — UI default body font.
- `Montserrat` (600/700/800) — the big hero greeting only.
- `Newsreader` (400/500/600) — available for editorial accents.
- `JetBrains Mono` (400/500) — timestamps, numeric/`.mono` text, `font-feature-settings:'tnum'`.

**Global CSS** in one `<style>` block:
```css
:root {
  /* Orange — primary brand accent (warm, saturated) */
  --orange-50:#fef3ea; --orange-100:#fde0c9; --orange-200:#fbc193;
  --orange-400:#f7973f; --orange-500:#f4731e; --orange-600:#e25a09; --orange-700:#b9450a;
  /* Ink — warm brown-grey neutral ramp (NOT pure grey) */
  --ink-900:#211a14; --ink-800:#2f261e; --ink-700:#463b31; --ink-600:#6a5d50;
  --ink-500:#8c7d6f; --ink-400:#b1a496; --ink-300:#d6ccc0; --ink-200:#e9e2d8;
  --ink-100:#f4efe8; --ink-50:#faf7f2;
  /* Surfaces & lines */
  --bg:#ffffff; --card:#ffffff; --line:#ece6dd; --line-strong:#ddd4c7;
  /* Semantic accent pairs (fg + tinted bg) */
  --green:#1f7a52;  --green-bg:#e8f1ea;
  --blue:#2f6ad0;   --blue-bg:#e9eef8;
  --violet:#6849cf; --violet-bg:#efebf9;
  --amber:#a87400;  --amber-bg:#f8efd9;
  /* Soft, low-opacity warm shadows */
  --shadow-sm:0 1px 2px rgba(50,35,20,.03),0 1px 3px rgba(50,35,20,.025);
  --shadow:0 2px 4px rgba(50,35,20,.03),0 8px 24px rgba(50,35,20,.05);
  --shadow-lg:0 1px 3px rgba(50,35,20,.04),0 30px 70px rgba(50,35,20,.10);
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink-900);
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-feature-settings:'tnum'}
.display{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;letter-spacing:-.02em}
.num{font-variant-numeric:tabular-nums}
@keyframes pulseDot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:.25}}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.fade-in{animation:fadeUp .45s cubic-bezier(.2,.7,.3,1) both}
```

**Color rules:**
- Orange is the ONE brand accent — used for primary buttons, active nav, AI/urgency emphasis, progress fills, KPI icon tiles.
- Neutrals are the warm "ink" ramp, never cold greys. Backgrounds are white on `--ink-50`/`--ink-100` washes.
- The three AI agents each own a semantic color: **Assistant = violet**, **Inbound = blue**, **Outbound = orange**. A `COLOR_MAP` resolves `{bg, fg}` per agent.
- Channel chips: SMS = green pair, Email/Call = blue pair.
- Lead-score tiers: ≥90 deep orange (`#fde0d3`/`--orange-700`), 75–89 light orange, <75 ink-grey.

---

## 2. Icon system

One object `const I = { name: (props) => <svg .../> }`. All are `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth≈1.7`, round caps/joins, and spread `{...p}` so callers pass `width/height/style`. Needed icons: `dashboard, leads, inbox, agents, assistant, templates, calendar, tasks, deals, reporting, bell, search, chev, back, plus, bolt, arrowIn, arrowOut, dot, message, phone, mail, sparkle, more, play, pause, settings, refresh, home, check`. Color is driven entirely by the parent's `color`.

---

## 3. App shell & layout

`App()` holds `route` state (`{view, id}`) and `agents` state (seeded from an `AGENTS` array). Layout:
```
<div flex minHeight:100vh bg:var(--bg)>
  <Sidebar/>                 // 248px, sticky, white, right border
  <main flex:1 column>
    <TopBar/>                // sticky, white, bottom border
    <div data-screen-label="Dashboard"><DashboardPage/></div>
  </main>
  <TweaksPanel/>             // optional, gated on window.TweaksPanel
</div>
```
Routes: `dashboard`, `agent-detail`, `templates-page`, `ai-settings`. Top-bar breadcrumb title derives from route. Each route wraps its page in a `<div data-screen-label="…">`.

**Sidebar** (`width:248, sticky, top:0, height:100vh, borderRight:1px var(--line)`):
- `<Logo/>` — 32px rounded-9 tile, `linear-gradient(135deg,#fb8d3a,#e25a09)`, white "W"-like SVG, soft orange shadow; wordmark "WarmChats" 18px/700.
- Nav groups: primary (`Dashboard, Leads[142], Inbox[7], Tasks[5], Calendar`), then an **AI** group label with a tiny orange `NEW` pill listing the three agents via `AgentNavItem`, then a `WORKSPACE` group (`Deals, Reporting, Admin`).
- `NavItem`: full-width flex button, gap 12, radius 10; active = `--orange-50` bg + `--orange-700` text + a 3px orange rail at `left:-12`; hover = `--ink-100`. Optional count `badge` pill, optional `indent`.
- `AgentNavItem`: shows the agent's colored 22px icon tile + name + a `StatusDot` (live = agent color, off = ink-400).
- Footer: avatar circle "JV" (`linear-gradient(135deg,#f6741b,#b54607)`) + "Joseph Velasquez / Admin".

**TopBar** (`sticky, top:0, z:10, padding:14px 28px, borderBottom:1px var(--line)`):
- Breadcrumb: home icon › chevron › bold current title.
- Center search input (max 560px) with leading search icon, `--ink-50` fill, radius 10.
- Two green `StatusPill`s — "Email Connected" / "SMS Connected" (green pair, check icon, radius 999, 1px `#c7e0ce` border).
- Bell button (36px, radius 10) with an orange unread dot.
- User cluster: "JV" gradient avatar + "Joseph Velasquez / Owner · JOV Realty".

---

## 4. Reusable primitives

- **`Card({children, pad=20})`** — `background:var(--card); border:1px var(--line); border-radius:20; padding:pad; box-shadow:var(--shadow-sm)`. Give it `className="print-card"` for print.
- **`CardHeader({eyebrow, title, right})`** — flex row, `align-items:flex-end, justify:space-between, margin-bottom:14`. Eyebrow = 11px/600 uppercase `--orange-600` letter-spaced; title = `.display` 21px; `right` slot for a button/meta.
- **`StatusDot({on, color})`** — 8px dot; when `on`, a second dot pulses via `pulseDot 2s infinite`.
- **`StatusPill({label})`** — green "connected" pill described above.
- **`Toggle({on,onChange,size})`** — pill switch; on = agent/green, off = ink-300.
- **`LiveClock()`** — `useState(new Date())` + `setInterval` 1s; renders "Tue, Jun 10 · 3:42 PM".

---

## 5. DashboardPage — the main screen

Outer wrapper: `<div className="fade-in" style={{padding:'24px 32px 80px', maxWidth:1360, margin:'0 auto'}}>`. Computes `greeting` from the current hour ("Good morning/afternoon/evening"), `today` (long date), `monthLabel`, and `monthEnd` (reset date).

### 5a. Hero brief
Flex row, `align-items:flex-end, justify:space-between`:
- Left: uppercase date eyebrow (12px/600 `--ink-500`); **`<h1>` greeting in Montserrat 700, 42px, `letter-spacing:-.5`, `line-height:1.02`** → "Good afternoon, Joseph."; then a 15.5px summary line: *"Your AI handled **12 conversations** overnight and booked **1 showing**. **3 need you** today."* (the "N need you" in `--orange-700`/600).
- Right: a flex slot (kept empty / reserved for future actions).

### 5b. WaitingBanner (urgency strip)
Full-width, `linear-gradient(90deg,#fff2e3,#fff 60%)`, `border:1px #f7c9a8`, **4px orange left border**, radius 12. White rounded message-icon tile, then bold "**N leads waiting for your reply**" (+ a red "· 1 has gone cold (Nh+)" when an item's `minsAgo>60`), a sub-line naming the oldest lead and quoting their preview, and a solid-orange **"Open inbox"** button (bolt icon, orange shadow). Pulls from a `waiting[]` array (`{name, minsAgo, hot, preview}`).

### 5c. Goals header + KPI strip
A small control row above the KPIs:
- Left: "THIS MONTH'S GOALS" eyebrow · "Resets {monthEnd}" with a refresh icon.
- Right: a `‹` button, centered `{monthLabel}`, a disabled `›` button (can't go to future), then a small bordered **"Set goals"** button (text only, no icon).

Then `display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12`. Four **`KPI`** cards:
| label | value | delta | tone | icon | goal | progress |
|---|---|---|---|---|---|---|
| Pipeline value | $1.1M | +12% this month | up | bolt | $1.5M goal | 73 |
| Hot leads | 12 | 2 new since yesterday | up | sparkle | 20 goal | 60 |
| Appointments | 18 | 6 booked by AI | info | calendar | 25 goal | 72 |
| Deals closed | 3 | this month | up | bolt | 5 goal | 60 |

**`KPI`** card: radius 18, `--shadow-sm`. Row = 40px rounded-12 `--orange-50` icon tile + label (uppercase 11.5px) + value (`.display .num` 30px) + delta (green if `up`, red `#c0392b` if `down`, ink if `info`). Below: a 5px `--ink-100` track with an orange fill at `{progress}%`, and a footer row "`{progress}% of goal`" / "`{goal}`".

### 5d. Main two-column grid
`display:grid; grid-template-columns:minmax(0,1.6fr) minmax(0,1fr); gap:18`, with an inline `<style>` collapsing to one column under 1100px (`.dash-grid`).

**LEFT column** (flex column, gap 18):
1. **Needs reply** card — custom header: "NEEDS REPLY" eyebrow, then big count `.display .num` 24px + "people waiting" + a red "● N urgent" tag; right = bordered "View all {N}" button. Sub-label "MOST IMPORTANT RIGHT NOW", then the top 3 of a `needsReply[]` rendered as **`QueueRow`**. Each item: `{id,name,score,icon,title,sub,meta,channel,cta,kind}` where `kind:'urgent'|'normal'`.
   - **`QueueRow`**: 36px rounded-10 icon tile (urgent = orange-50/orange-600 with a tiny orange corner dot; else ink). Name (14/600) + an "**AI {score}**" pill (tiered colors) + optional "URGENT" pill. Title line, then `sub · meta`. Right CTA button: urgent = solid orange w/ shadow, else white bordered. Rows divided by `1px var(--line)` top borders (first row none).
2. **Hot leads** card — `CardHeader eyebrow="Hot leads" title="Sorted by AI score"` + "View all leads". Rows = **`HotLeadRow`** from `hotLeads[]` (`{name,score,src,intent,last,channel}`).
   - **`HotLeadRow`**: a 40px **SVG score ring** (`circle` track `--ink-100` + arc `strokeDasharray="{score} 100"`, rotated −90°, color tiered by score) with the number centered; name + source chip + channel chip; `intent · last`; two 34px icon buttons (message, phone) + a solid-orange **"Book"** button.
3. **AI Intelligence** card — `eyebrow="AI Intelligence" title="Specific recommendations for your deals"`, right meta "Updated 3m ago". A 2-col grid (1-col under 720px) of **`IntelCard`** from `intel[]` (`{tone,icon,tag,lead,insight,action}`). Tone ∈ orange/violet/blue/amber, each mapping to a `{bg,fg,border}` palette.
   - **`IntelCard`**: white, radius 13, with a 3px colored left bar; a tinted tag pill (`{ICON} {TAG}`) + lead name; the insight sentence; a tinted "{action} →" button.

**RIGHT column** (flex column, gap 18):
1. **AI Wins Today** — NOT a plain Card. A `linear-gradient(135deg,#fff7ee,#fff 70%)` panel, `border:1px var(--orange-100)`, radius 16, with a soft radial glow blob absolutely positioned top-right. Header: sparkle + "AI WINS TODAY" (orange-700) and "Saved you ~3h". A 2-col grid of **`WinTile`** from `wins[]` (`{value,label,icon}`: e.g. "9 / Leads qualified", "68% / Reply rate after AI", "34 / AI follow-ups sent", "42s / Avg response"). Footer above a dashed orange divider: a one-line stat insight ("…book at **2.4×** the rate…").
   - **`WinTile`**: 32px white rounded icon tile (orange-100 border) + value (`.display .num` 24px) + label.
2. **Pipeline conversion** card — custom header: "LAST {range} DAYS" eyebrow + "Pipeline conversion" title; right = green "{closeRate}% close rate" + a segmented `30 / 60 / 90` toggle (state `funnelRange`). Body = **`Funnel`** over `funnelData[range]` (5 steps: New Leads → Engaged → Appointments → Active Clients → Closed Deals, each `{label,value,color}` with progressively darker orange fills).
   - **`Funnel`**: per step a 110px label + a 22px track (`--ink-50`) with a colored fill at `value/max%` and the value text inside, + a right "drop %" vs previous step.
3. **Today / Schedule** card — `eyebrow="Today" title="Schedule"` + "Open calendar". Rows from `schedule[]` (`{time,title,who,note,tone,booked}`): mono time, a colored 3px vertical accent bar, title (+ orange "BY AI" pill when `booked==='ai'`), and `who · note`.
4. **Quick actions** card — `eyebrow="Quick actions" title="Common tasks"`, 2-col grid of **`QuickAction`** (icon tile + label) — Add lead, New message, Schedule showing, Launch sequence. Hover lifts to `--ink-50`.

---

## 6. Data model (seed arrays inside DashboardPage)

- `waiting[]` — leads awaiting a human reply (drives the banner).
- `needsReply[]` — 7 AI-prioritized items; `needsReplyTop = slice(0,3)`. `score` 0–100 is the **AI lead-priority score** (hotness/urgency); used for sorting + the "AI {n}" pill tiers.
- `intel[]` — 4 deal-intelligence insights.
- `hotLeads[]` — 4 leads with score rings.
- `wins[]` — 4 "today" stats.
- `funnelData{30,60,90}` — funnels per range; `closeRate = closed/new*100`.
- `schedule[]` — 3 calendar items.
- (App level) `AGENTS[]` — 3 agents (`assistant`/violet, `inbound`/blue, `outbound`/orange) each with `metric`, `chips`, `workflows`/`capabilities`, `activity`, `statusOn`.

Keep all copy in Joseph's voice: warm, real-estate-specific, casual but sharp. No emoji. No filler stats — every number means something.

---

## 7. Tweaks (optional panel)
If `window.TweaksPanel` exists, render a "Tweaks" panel with a "Layout" section: `Card layout` radio (stack/grid), `Density` radio (comfortable/compact), `Activity rail` toggle. Defaults live in a `TWEAK_DEFAULTS` object; read via `window.useTweaks`.

---

## 8. Print
Add an `@media print` block: A4 landscape, hide `aside` (sidebar) and the top bar, force colors with `print-color-adjust:exact`, freeze entrance animations to their end-state, and `break-inside:avoid` on `.print-card`.
