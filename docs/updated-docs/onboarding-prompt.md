# Build Prompt — `Onboarding.html` (WarmChats · Get started)

Build a single-file React onboarding wizard for **WarmChats**, an AI-powered CRM for solo real-estate agents and brokers. It is a **3-step guided setup** that ends in a celebratory "all set" summary and routes the user to `Dashboard.html`. Rendered with React 18 + Babel standalone inside one HTML file (`<div id="root">`, `ReactDOM.createRoot`). All styling is inline-style objects on `style={{}}` plus one global `<style>` block of CSS variables, font imports, keyframes, and a handful of utility classes. No CSS framework, no Tailwind. Icons are inline stroke SVGs. The whole thing is warm, paper-toned, friendly, and reassuring — a low-pressure "takes about 2 minutes" flow. The whole experience persists to `localStorage` so a refresh never loses progress.

---

## 1. Global setup

**Document head:**
- `<title>WarmChats · Get started</title>`, `<meta viewport width=device-width,initial-scale=1>`.
- React 18.3.1 + ReactDOM 18.3.1 + Babel standalone 7.29.0 via the pinned unpkg `<script>` tags with integrity hashes.
- The app script is `<script type="text/babel" data-presets="react">`.

**Fonts** (Google Fonts, one `<link>`):
- `Plus Jakarta Sans` (400/500/600/700/800) — UI default body font.
- `Montserrat` (600/700/800) — loaded, available for headings (the build leans on `.display` = Plus Jakarta).
- `Newsreader` (opsz 6..72, 400/500/600) — editorial accent, loaded for parity with the rest of the product.
- `JetBrains Mono` (400/500) — `.mono` for DNS records and tabular numerals, `font-feature-settings:'tnum'`.

**Global CSS** in one `<style>` block:
```css
:root {
  /* Orange — primary brand accent */
  --orange-50:#fef3ea; --orange-100:#fde0c9; --orange-200:#fbc193;
  --orange-400:#f7973f; --orange-500:#f4731e; --orange-600:#e25a09; --orange-700:#b9450a;
  /* Ink — warm brown-grey neutral ramp (NOT cold grey) */
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
html,body{margin:0;padding:0;background:var(--ink-50);color:var(--ink-900);
  font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
body{min-height:100vh}
button{font-family:inherit;cursor:pointer}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-feature-settings:'tnum'}
.display{font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-weight:700;letter-spacing:-.02em}
.num{font-variant-numeric:tabular-nums}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.step-anim{animation:fadeUp .4s cubic-bezier(.2,.7,.3,1) both}

/* Input primitive */
.fld{width:100%;font-family:inherit;font-size:14.5px;color:var(--ink-900);background:var(--ink-50);
  border:1px solid var(--line);border-radius:11px;padding:12px 13px;outline:none;
  transition:border-color .15s,box-shadow .15s,background .15s}
.fld::placeholder{color:var(--ink-400)}
.fld:focus{border-color:var(--orange-400);background:#fff;box-shadow:0 0 0 3px rgba(244,115,30,.12)}
.fld.has-prefix{padding-left:30px}   /* leaves room for a leading "$" glyph */

/* Page background — warm radial washes over ink-50 */
.bg-grain{background:
  radial-gradient(900px 500px at 12% -8%, #fff3e6 0%, rgba(255,243,230,0) 60%),
  radial-gradient(800px 600px at 100% 0%, #fdeede 0%, rgba(253,238,222,0) 55%),
  var(--ink-50)}
```

**Color rules:**
- Orange is the ONE brand accent — primary buttons, active step circle, focus rings, "recommended" badges, sparkle/calc emphasis, the logo gradient.
- Neutrals are the warm "ink" ramp, never cold grey. Inputs sit on `--ink-50`, go white on focus.
- Semantic pairs: **green = connected/success**, **blue = domain/deliverability option**, **violet = WarmChats Inbox option**. Each is a `{fg,bg}` (and sometimes `border`) pair.
- No emoji. No filler stats.

---

## 2. Icon system

One object `const I = { name: (p) => <svg .../> }`. All `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, round caps/joins, spread `{...p}` so callers pass `width/height/style`. `check` uses a heavier `strokeWidth=2.6`; most others `1.7`; chevrons/back/arrow `2`.

Needed icons: `check, building, pin, funnel, target, phone, mail, calendar, chev, back, bolt, sparkle, trend, dollar, chat, arrow`.

---

## 3. App shell & state

`App()` is the root. Layout is a single centered column on the `.bg-grain` page (`minHeight:100vh; display:flex; flex-direction:column; align-items:center; padding:'32px 20px 56px'`). Everything is constrained to `maxWidth:640`.

### 3a. Persistent state (localStorage)
Three keys, all read lazily on mount and written via `useEffect`:
- `wc_ob_step` → current step number (`1`–`3`). `useState(() => Number(localStorage.getItem('wc_ob_step')) || 1)`.
- `wc_ob_data` → the `data` form object (JSON). Merged over `DEFAULTS` on load, inside try/catch.
- `wc_ob_conn` → the `conn` connection flags `{phone, email, calendar}` (JSON), merged over defaults.

```js
const DEFAULTS = {
  brokerage:'', market:'', role:'agent', avgCommission:'',
  avgHomePrice:'', goalDeals:'', goalAppts:'',
  phone:'', email:'', emailMethod:'',
};
```
`done` is plain `useState(false)` (NOT persisted) — controls the final screen.

### 3b. Mutators
- `set(k, v)` → `setData(d => ({...d, [k]:v}))`.
- `toggleConn(k)` → flips a boolean in `conn`.
- `connectEmail(method)` → toggles `conn.email` AND records `data.emailMethod`. If the same method is already connected it disconnects (sets `email:false`, `emailMethod:''`); otherwise connects and stores the method (`'gmail' | 'domain' | 'inbox'`).

### 3c. Derived values
- `calc = useMemo(...)` over `data` → `{ deals, pipeline, commission }`:
  - `deals = Number(goalDeals) || 0`
  - `pipeline = deals * (Number(avgHomePrice)||0)`  ← projected annual GMV
  - `commission = deals * (Number(avgCommission)||0)`  ← projected annual commission
- `canNext` per step — gates the Continue button:
  - Step 1: `brokerage.trim() && market.trim() && Number(avgCommission) > 0`
  - Step 2: `Number(goalDeals) > 0 && Number(goalAppts) > 0`
  - Step 3: `conn.email` (email is the only **required** connection)
- `next()` → if `step < 3` advance; else `setDone(true)`.
- `back()` → decrement when `step > 1`.
- `h = HEADERS[step-1]` selects the eyebrow/title/sub for the card header.

```js
const HEADERS = [
  { eyebrow:'Welcome to WarmChats', title:'Tell us about your business', sub:"We'll tailor your AI agents to how you work." },
  { eyebrow:'Lead & pipeline setup', title:"Let's size up your pipeline", sub:'We calculate your projected revenue automatically.' },
  { eyebrow:'Almost there', title:'Connect your tools', sub:'Plug in the channels your AI will work across.' },
];
```

### 3d. Chrome (always visible above the card)
- **Top bar** (`maxWidth:640`, flex space-between): `<Logo/>` left, "Step {step} of 3" (12.5px `--ink-500`) right.
- **Progress** (`maxWidth:640`): `<StepProgress step={step}/>`.
- **Card** (`maxWidth:640`, white, `border:1px var(--line)`, `border-radius:22`, `box-shadow:var(--shadow-lg)`, `overflow:hidden`): either `<Finished/>` (when `done`) or the header + active step panel + footer.
- **Footer help** under the card, centered: "Need help? **Talk to onboarding**" (orange link text) and a `mailto:support@warmchats.com` link.

---

## 4. Logo

`<Logo/>` — flex row, gap 10:
- 32px rounded-9 tile, `linear-gradient(135deg,#fb8d3a,#e25a09)`, soft orange shadow `0 4px 10px rgba(226,90,9,.25)`, centering an 18px white SVG (a stylized "W" made of two zig-zag strokes: `M3 7l3 11 3-8 3 8 3-11` + `M15 7l3 11`).
- Wordmark "WarmChats" 18px/700, `letter-spacing:-.2`.

---

## 5. StepProgress (the 3-step rail)

Driven by:
```js
const STEPS = [
  { n:1, label:'Business profile', icon:'building' },
  { n:2, label:'Lead & pipeline',  icon:'funnel'   },
  { n:3, label:'Connect tools',    icon:'bolt'     },
];
```
Flex row. For each step compute `done = step > s.n` and `active = step === s.n`:
- **Circle** 34px, radius 999: `done` → solid `--orange-500` bg + white check icon (16px); `active` → `--orange-50` bg, `1.5px solid var(--orange-400)` border, `--orange-700` number; else → `--ink-100` bg, `--ink-400` number. `transition:all .25s`.
- **Label stack** beside it: tiny uppercase "Step {n}" (9.5px/700, letter-spaced) colored orange when active/done else ink-400; then `s.label` (12.5px/600) — `--ink-900` active, `--ink-700` done, `--ink-400` upcoming.
- **Connector** between steps (`i < STEPS.length-1`): `flex:1; height:2; margin:0 14px`, colored `--orange-200` once `step > s.n` else `--ink-200`, `transition:.25s`.

---

## 6. Field primitives

- **`Field({label, optional, hint, icon, children})`** — a `<label>` column (gap 7). Title row: optional leading `I[icon]` (14px, `--ink-500`) + label (13px/600 `--ink-800`) + an optional muted "· optional" (12px `--ink-400`). Then `children` (the control), then an optional `hint` line (11.5px `--ink-500`).
- **`TextField({value,onChange,placeholder})`** — `<input class="fld">`, `onChange` passes the raw string.
- **`MoneyField`** — relative wrapper with an absolutely-positioned leading "$" glyph (`--ink-400`, `pointer-events:none`); input is `.fld.has-prefix.num`, `inputMode="numeric"`. **Display value is formatted** with `Number(value).toLocaleString('en-US')` (thousands separators) but the stored value is digits only — `onChange` strips `/[^0-9]/g`.
- **`NumField`** — `.fld.num`, `inputMode="numeric"`, also strips non-digits. Plain integer entry.
- **`Segmented({value,onChange,options})`** — a `grid` of equal columns (`repeat(n,1fr)`, gap 8). Each option is a button card with `{id,label,sub}`: left-aligned, label (14/600) over sub (11.5 `--ink-500`). Selected → `--orange-50` bg, `1.5px var(--orange-400)` border, `0 0 0 3px rgba(244,115,30,.10)` ring, orange-700 label. Unselected → white, `1.5px var(--line)`.

---

## 7. Money/number formatting helpers

```js
const fmtMoney = (n) => {        // compact: $1.2M / $850K / $1,250
  if (!isFinite(n) || n<=0) return '$0';
  if (n>=1e6) return '$' + (n/1e6).toFixed(n>=1e7?1:2).replace(/\.0$/,'') + 'M';
  if (n>=1e3) return '$' + Math.round(n/1e3) + 'K';
  return '$' + Math.round(n).toLocaleString();
};
const fmtFull = (n) => '$' + Math.round(n).toLocaleString();  // full grouped
```
`fmtMoney` is used everywhere a value is shown compactly (calc panel, summary). `fmtFull` is available for full figures.

---

## 8. Step 1 — Business profile (`Step1`)

Column, gap 18. Wrapped in `.step-anim`. Four fields:
1. **Brokerage name** (`building` icon) → `TextField` → `data.brokerage`, placeholder "e.g. JOV Realty".
2. **Market / City** (`pin`) → `TextField` → `data.market`, placeholder "e.g. San Francisco, CA".
3. **Your role** → `Segmented` → `data.role`, two options: `{agent: "Agent" / "I sell my own deals"}`, `{broker: "Broker" / "I run a team / office"}`. Default `agent`.
4. **Average commission** (`dollar`, hint "Your typical commission per closed deal.") → `MoneyField` → `data.avgCommission`, placeholder "12,000".

---

## 9. Step 2 — Lead & pipeline + the auto-calc panel (`Step2`)

Column, gap 18. `hasPrice = Number(avgHomePrice) > 0`, `hasDeals = Number(goalDeals) > 0`.

**Fields:**
- A 2-col grid (gap 14):
  - **Average home price** *(optional)* (`dollar`) → `MoneyField` → `data.avgHomePrice`, placeholder "850,000".
  - **Goal appointments per month** (`target`) → `NumField` → `data.goalAppts`, placeholder "20".
- **Goal deals closed this year** (`funnel`, hint "How many deals you aim to close this year — we use this to project your revenue.") → `NumField` → `data.goalDeals`, placeholder "24".

**Calculated-for-you panel** — the centerpiece. A rounded-16 card, `padding:16`, `linear-gradient(135deg,#fff7ee,#fff 72%)`, `border:1px var(--orange-100)`, `overflow:hidden`, with a soft radial glow blob absolutely positioned top-right (`160×160` circle, `radial-gradient(rgba(247,151,63,.16)…)`, `pointer-events:none`). Header row: `sparkle` icon (orange-600) + "CALCULATED FOR YOU" eyebrow (10.5px/700 uppercase orange-700).

Body branches on `hasDeals`:
- **If `hasDeals` is false** → a single muted line: "Enter your goal deals closed this year to see your projected pipeline and commission."
- **If `hasDeals` is true** → a 2-col grid of two big figures:
  - **Estimated annual pipeline** — value `hasPrice ? fmtMoney(calc.pipeline) : '—'` in `.display .num` 28px `--ink-900`; caption "Estimated annual pipeline"; sub-caption `hasPrice ? "{deals} deals × {fmtMoney(avgHomePrice)}" : "Add a home price to project"`.
  - **Potential annual commission** — value `avgCommission>0 ? fmtMoney(calc.commission) : '—'` in 28px **orange-700**; caption "Potential annual commission"; sub-caption `avgCommission>0 ? "{deals} deals × {fmtMoney(avgCommission)}" : "Add avg commission in step 1"`.
- **And** (still inside `hasDeals`) a footer above a `1px dashed var(--orange-200)` divider: "Based on your goal of **{goalDeals}** deal(s) closed this year — about **{fmtMoney(commission/12)}/mo** in commission." The "/mo" clause only appears when `avgCommission > 0`; "deal" vs "deals" pluralizes on `calc.deals === 1`.

This panel updates live as the user types — it's the reason home price / commission live across steps 1–2.

---

## 10. Step 3 — Connect tools (`Step3`)

Column, gap 16. Three blocks separated by a `1px var(--line)` divider:
1. **`<SmsCard/>`** — SMS automation (gated behind a paid plan).
2. **`<EmailSetup/>`** — the required email connection, with 3 methods.
3. A status footer line: a `check` icon + text. When `conn.email` → "You can connect or change these anytime in Settings." (ink-500). When not → "Connect an email to finish — it's required." (orange-700 with an orange check) — this mirrors the disabled Continue button.

### 10a. SmsCard
A bordered rounded-16 card; `--ink-50` bg when off, white + green border when on. Layout: 36px white rounded icon tile (`chat` icon) + a body column:
- Title row: "SMS Automation" (16/700) + a grey **"Free Plan"** pill + a status pill — green "SMS enabled" when on, else orange "SMS requires upgrade".
- Sub: "Automatically text leads from a verified business number."
- A `CheckItem` list: "AI follow-ups and appointment booking" / "Requires SMS setup + 10DLC approval" / "Available on paid plans".
- A full-width toggle button: off → transparent w/ orange-400 border, "Upgrade to Enable SMS →" (arrow icon); on → white w/ green border, "✓ SMS Enabled". Clicking calls `toggleConn('phone')`.
- When on, reveals a phone `.fld` (placeholder "+1 (555) 000-0000") bound to `data.phone`.

`Pill` is a tiny local helper with `green / orange / grey` tones (rounded-999, 11px/600, tinted bg+fg).

### 10b. CheckItem
`<li>` with a small green `check` (13px) + text (12.5px `--ink-700`), used in cards across step 3.

### 10c. EmailSetup (multi-option, the core of step 3)
Local state: `more` (advanced options expander), `showDomain` (domain modal). Accent palettes `orange/blue/violet` each `{fg,bg,border}`. Two CTA-style factories:
- `primaryCta(connected)` → solid orange full-width button; when connected → white w/ green border + green text.
- `outlineCta(color)(connected)` → outlined full-width button in the given color; when connected → green-bg + green border.

An inline `<style>` collapses the top grid to 1 column under 620px (`.email-top-grid`).

**Header:** 38px `--orange-50` mail tile + "Email **(Required)**" (the "(Required)" in orange-600) + "Send personalized follow-ups from your inbox" + "Gmail or business email · Takes 10 seconds".

**Top grid** (2 cols, gap 12) of two `<EmailOptionCard/>`:
- **Option 1 · Fastest — Connect Gmail** (orange accent, `recommended`): items "Send instantly from your existing inbox" / "No DNS setup required" / "Ready in seconds". CTA "Continue with Google" via `primaryCta`. `connected` when `conn.email && emailMethod==='gmail'`. onClick → `connectEmail('gmail')`.
- **Option 2 · Best deliverability — Verify Your Domain** (blue accent, `tint:'var(--blue-bg)'`): items "Send from your branded domain" / "Higher sending limits" / "DNS setup required". CTA "Verify Domain" via `outlineCta('var(--blue)')`. `connected` when `emailMethod==='domain'`. onClick → if already connected, toggle off via `connectEmail('domain')`; else open the domain modal (`setShowDomain(true)`).

**"More options" toggle** — a full-width dashed-border button that expands/collapses the advanced section; chevron rotates between `90deg`/`-90deg`.

**Option 3 (collapsed)** — `<EmailOptionCard/>` "Option 3 · No email provider — Use WarmChats Inbox" (violet accent): items "Send & receive emails inside WarmChats" / "DNS setup handled automatically" / "Switch to Gmail later anytime". CTA "Set Up Inbox" via `outlineCta('var(--violet)')`. onClick → `connectEmail('inbox')`.

**Domain modal** — rendered when `showDomain`; `onVerify` calls `connectEmail('domain')` then closes.

### 10d. EmailOptionCard
A bordered rounded-16 flex-column card. Border + bg switch to green pair when `connected` (else uses the accent border and optional `tint` bg). Contents:
- Optional absolute **"RECOMMENDED"** pill top-right (solid orange-500, white) — only when `recommended && !connected`.
- `eyebrow` (10px/700 uppercase, accent fg, green when connected).
- `title` (16/700).
- `desc` (12px italic `--ink-500`).
- An items list of `CheckItem` (flex:1 so all cards bottom-align their CTA).
- The CTA button, styled by the passed `ctaStyle(connected)` factory; label becomes "✓ Connected" when connected.

### 10e. DomainModal (advanced email verification)
A fixed full-screen overlay (`rgba(33,26,20,.45)` + `backdrop-filter:blur(3px)`, `z:50`, scrollable, click-outside closes). Inner panel `maxWidth:560`, white, rounded-20, `.step-anim`, `e.stopPropagation()`.

Local state: `email`, `codeSent`, `code`, `verified`. `valid = /\S+@\S+\.\S+/.test(email)`.

- **Header:** "Connect Email" (22px `.display`) + an "×" close button. Sub: Gmail is fastest; domain verification is for advanced users who want higher limits + deliverability.
- **Body card** ("Option 2 · Advanced / Verify Business Email"): explanatory copy, then an email `.fld` (disabled once `codeSent`, `autoFocus`), then a note "DNS changes can take 5–30 minutes, and sometimes up to 24 hours."
- **Three-phase flow:**
  1. `!codeSent` → "Send verification code" button via `sendBtn(valid)` (orange when valid, disabled/grey when not). Click sets `codeSent` when valid.
  2. `codeSent && !verified` → "Resend code" outline button + a 6-digit code `.fld` (strips non-digits, `maxLength 6`) + "Verify code and show DNS records" button (orange once `code.length===6`). Below the card, a note: "Verification code sent. Elastic Email domain setup is prepared for DNS records after verification."
  3. `verified` → "Add these DNS records" header + three `<DnsRow/>`s + a "Done — finish connecting" orange button calling `onVerify`.

### 10f. DnsRow
A bordered rounded-12 record block. Header strip (`--ink-50`, bottom border): "{type} record" (12.5px/700) + a **Copy value** button. The button calls `navigator.clipboard.writeText(value)` in a try/catch, flips to "✓ Copied" (green) for 1200ms via local `copied` state. Body is a 2-col grid (`62px 1fr`, gap `11px 14px`): uppercase "Host" / `.mono` host, then "Value" / `.mono` value (both `word-break:break-all`).

The three seeded records:
| type | host | value |
|---|---|---|
| TXT | `@` | `warmchats-verify=8f3ad21c9b` |
| CNAME | `mail._domainkey` | `dkim.warmchats.com` |
| MX | `@` | `mx.warmchats.com · priority 10` |

### 10g. ConnectRow (utility component, present in the file)
A general-purpose connect-a-tool row (40px tinted icon tile per `tone` of orange/blue/violet, name + optional badge + sub, a "Connect"/"✓ Connected" button, and an optional reveal `.fld` when connected). It's a reusable primitive in the codebase; the live step 3 uses the richer `SmsCard` + `EmailSetup` instead, but keep `ConnectRow` available for additional integrations (e.g. calendar) that share this pattern.

---

## 11. Card header + footer (per step)

Inside the white card, when not `done`:
- **Header** (`padding:'26px 30px 4px'`): eyebrow (11px/700 uppercase orange-600) + `h.title` (`.display` 25px) + `h.sub` (14px `--ink-500`).
- **Body** (`padding:'20px 30px 6px'`): renders `Step1`/`Step2`/`Step3` by `step`.
- **Footer** (`padding:'18px 30px 24px'`, space-between):
  - Left: when `step > 1` a white bordered **Back** button (`back` icon); when `step === 1` the muted text "Takes about 2 minutes".
  - Right: the **Continue / Finish setup** button. Solid orange when `canNext`, disabled grey (`--ink-100` bg, `--ink-400` text, `not-allowed`) otherwise. Label is "Finish setup" on step 3, else "Continue", always with a trailing `chev`. Click → `next()`.

---

## 12. Finished screen (`Finished`)

Replaces the card body once `done`. Centered, `.step-anim`, `padding:'40px 34px 34px'`:
- 60px rounded-18 gradient tile (`linear-gradient(135deg,#fb8d3a,#e25a09)`, orange shadow) with a 30px white `check`.
- `<h1>` `.display` 26px: "You're all set{data.brokerage ? `, ${data.brokerage}` : ''}."
- Sub (max 420px): "Your AI agents are configured for {data.market || 'your market'} and ready to start working your pipeline."
- A 3-col grid of `<SummaryStat/>`:
  - "{goalAppts||0}/mo" — "Appointment goal"
  - `hasPrice ? fmtMoney(calc.pipeline) : fmtMoney(calc.commission)` — label "Projected pipeline" or "Projected commission" accordingly
  - "{connectedCount}/3" — "Tools connected", where `connectedCount = [conn.phone, conn.email].filter(Boolean).length`
- A full-width solid-orange **"Go to dashboard"** button (`chev`) → `window.location.href = 'Dashboard.html'`.

**`SummaryStat({value,label})`** — `--ink-50` card, `1px var(--line)`, rounded-13, value in `.display .num` 19px + label 11px `--ink-500`.

---

## 13. Behavior summary / acceptance

- Refreshing at any point restores the exact step, all field values, and connection states (step + data + conn persisted; only the final `done` flag is not).
- Money inputs show grouped thousands while storing digits only; the calc panel recomputes live.
- Continue is blocked until each step's required fields are valid; step 3 specifically requires a connected email (any of the three methods).
- Connecting a second email method does not stack — `emailMethod` holds the single active choice; re-clicking a connected method disconnects it.
- The domain modal is a self-contained 3-phase mock (send code → enter 6-digit code → show DNS records → done) and, on completion, connects email via the `domain` method.
- Copy is warm, real-estate-specific, reassuring; no emoji; no filler numbers. Everything is keyboard/clipboard friendly (autofocus, copy buttons).
