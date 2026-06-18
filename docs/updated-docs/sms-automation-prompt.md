# Build Prompt — `SmsCard` (WarmChats · SMS Automation)

A self-contained React component (React 18 + inline-style objects, no CSS framework). It's the SMS-channel block on the "Connect your tools" onboarding step — a card that advertises SMS automation, shows it's gated behind a paid plan, and toggles to a "connected" state revealing a phone-number input. Warm, paper-toned palette; orange = brand accent, green = connected/success.

---

## 1. Tokens it depends on

These CSS variables must exist on `:root` (define them globally):
```css
--orange-400:#f7973f; --orange-600:#e25a09;
--ink-900:#211a14; --ink-600:#6a5d50; --ink-500:#8c7d6f; --ink-100:#f4efe8; --ink-50:#faf7f2;
--line:#ece6dd;
--green:#1f7a52; --green-bg:#e8f1ea;
```
Plus the shared input class:
```css
.fld{width:100%;font-family:inherit;font-size:14.5px;color:var(--ink-900);background:var(--ink-50);
  border:1px solid var(--line);border-radius:11px;padding:12px 13px;outline:none;
  transition:border-color .15s,box-shadow .15s,background .15s}
.fld::placeholder{color:var(--ink-400)}
.fld:focus{border-color:var(--orange-400);background:#fff;box-shadow:0 0 0 3px rgba(244,115,30,.12)}
```
Font: `Plus Jakarta Sans` (the body default). Green check border color used inline is `#c7e0ce`.

---

## 2. Props (component API)

```js
<SmsCard
  connected={bool}      // is SMS enabled?
  onToggle={fn}         // flips connected state
  value={string}        // phone number
  onChange={fn(str)}    // updates phone number
/>
```

---

## 3. Sub-helpers

### `CheckItem({children})` — bullet line
An `<li>`: `display:flex; align-items:flex-start; gap:8; font-size:12.5px; color:var(--ink-700); line-height:1.4`. Leading green check icon (13×13, `color:var(--green)`, `flex-shrink:0; margin-top:2.5px`) + a `<span>` with the text.

The check icon is an inline SVG: `viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"` with path `M5 12.5l4.5 4.5L19 7`.

### `Pill({children, tone})` — status chips (local to the card)
`font-size:11px; font-weight:600; padding:3px 10px; border-radius:999px; white-space:nowrap`, with tone-driven `{bg, fg}`:
- `green` → bg `--green-bg`, fg `--green`
- `orange` → bg `--orange-50`, fg `--orange-700`
- `grey` (default) → bg `--ink-100`, fg `--ink-600`

---

## 4. The card — exact spec

### Outer container
- `border: 1px solid` — `#c7e0ce` when `connected`, else `var(--line)`
- `border-radius: 16px`
- `padding: 18px`
- `background:` white (`#fff`) when `connected`, else `var(--ink-50)`
- `transition: all .2s`
- No explicit width/height — the card is **fluid**: it fills its parent's width (in the onboarding it sits in a `max-width:640px` column) and is **as tall as its content**. Height grows by ~52px when connected (the revealed input).

### Inner row
`display:flex; align-items:flex-start; gap:13px`. Two children:

**(a) Icon tile** — `flex-shrink:0`:
- `width:36px; height:36px; border-radius:10px`
- `background:#fff`, `border:1px solid var(--line)`
- `display:grid; place-items:center`
- `color: var(--green)` when connected, else `var(--ink-600)`
- Holds the **chat** icon, 18×18: `viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"` round caps/joins, path `M21 11.5a8.5 8.5 0 01-12.2 7.7L3 21l1.8-5.8A8.5 8.5 0 1121 11.5z`.

**(b) Body column** — `flex:1; min-width:0`:

1. **Title row** — `display:flex; align-items:center; gap:8px; flex-wrap:wrap`:
   - "SMS Automation" — `font-size:16px; font-weight:700; color:var(--ink-900)`
   - `<Pill tone="grey">Free Plan</Pill>`
   - status pill: `connected ? <Pill tone="green">SMS enabled</Pill> : <Pill tone="orange">SMS requires upgrade</Pill>`

2. **Sub-line** — "Automatically text leads from a verified business number." — `font-size:13.5px; color:var(--ink-600); margin:6px 0 12px; line-height:1.45`.

3. **Feature list** — `<ul>` reset (`list-style:none; margin:0 0 14px; padding:0; display:flex; flex-direction:column; gap:7px`), three `CheckItem`s:
   - "AI follow-ups and appointment booking"
   - "Requires SMS setup + 10DLC approval"
   - "Available on paid plans"

4. **Toggle button** — full width:
   - `width:100%; padding:12px; border-radius:11px; font-size:14px; font-weight:700; font-family:inherit`
   - `display:inline-flex; align-items:center; justify-content:center; gap:8px`
   - `border: 1px solid` — `#c7e0ce` when connected, else `var(--orange-400)`
   - `background:` `#fff` when connected, else `transparent`
   - `color:` `var(--green)` when connected, else `var(--orange-600)`
   - Label: connected → `✓ SMS Enabled` (green check icon 16×16 + text); not connected → `Upgrade to Enable SMS` + a trailing **arrow** icon (16×16, `M5 12h14M13 6l6 6-6 6`).
   - `onClick={onToggle}`.

5. **Phone input (only when `connected`)** — an `.fld` with inline overrides `background:#fff; margin-top:11px`, `value={value}`, `placeholder="+1 (555) 000-0000"`, `onChange={e => onChange(e.target.value)}`.

---

## 5. State summary

| State | Border | Card bg | Icon color | Status pill | Button | Phone input |
|---|---|---|---|---|---|---|
| **Off** (default) | `var(--line)` | `var(--ink-50)` | `--ink-600` | orange "SMS requires upgrade" | transparent, orange-400 border, orange-600 "Upgrade to Enable SMS →" | hidden |
| **On** (connected) | `#c7e0ce` | `#fff` | `--green` | green "SMS enabled" | white, green border, green "✓ SMS Enabled" | visible (`+1 (555) 000-0000`) |

---

## 6. Full reference code

```jsx
function SmsCard({ connected, onToggle, value, onChange }) {
  const Pill = ({ children, tone }) => {
    const t = tone === 'green'
      ? { bg: 'var(--green-bg)', fg: 'var(--green)' }
      : tone === 'orange'
      ? { bg: 'var(--orange-50)', fg: 'var(--orange-700)' }
      : { bg: 'var(--ink-100)', fg: 'var(--ink-600)' };
    return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>{children}</span>;
  };
  return (
    <div style={{ border: '1px solid ' + (connected ? '#c7e0ce' : 'var(--line)'), borderRadius: 16, padding: 18, background: connected ? '#fff' : 'var(--ink-50)', transition: 'all .2s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', color: connected ? 'var(--green)' : 'var(--ink-600)', display: 'grid', placeItems: 'center', flexShrink: 0, border: '1px solid var(--line)' }}>
          {/* chat icon 18x18 */}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)' }}>SMS Automation</span>
            <Pill tone="grey">Free Plan</Pill>
            {connected ? <Pill tone="green">SMS enabled</Pill> : <Pill tone="orange">SMS requires upgrade</Pill>}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-600)', margin: '6px 0 12px', lineHeight: 1.45 }}>Automatically text leads from a verified business number.</div>
          <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <CheckItem>AI follow-ups and appointment booking</CheckItem>
            <CheckItem>Requires SMS setup + 10DLC approval</CheckItem>
            <CheckItem>Available on paid plans</CheckItem>
          </ul>
          <button onClick={onToggle} style={{
            width: '100%', padding: '12px', borderRadius: 11, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            border: '1px solid ' + (connected ? '#c7e0ce' : 'var(--orange-400)'),
            background: connected ? '#fff' : 'transparent', color: connected ? 'var(--green)' : 'var(--orange-600)'
          }}>
            {connected ? <>{/* check 16 */} SMS Enabled</> : <>Upgrade to Enable SMS {/* arrow 16 */}</>}
          </button>
          {connected &&
            <input className="fld" style={{ background: '#fff', marginTop: 11 }} value={value} placeholder="+1 (555) 000-0000" onChange={(e) => onChange(e.target.value)} />}
        </div>
      </div>
    </div>
  );
}
```
