# Book Appointment Modal — Component Spec

A modal dialog for scheduling a real-estate appointment with a lead, featuring an **AI prompt bar** that parses a plain-English description ("Saturday 2pm showing at 123 Maple St") and auto-fills the form below.

Built with React (inline JSX / Babel). Visual language: clean cool-gray neutrals with an **orange accent**. Self-contained except for an `<Icon>` component and the shared CSS tokens listed below.

---

## 1. Purpose & behavior

- Opens as a centered overlay modal over the inbox.
- The user can **describe the appointment in natural language** in the AI bar; clicking **Fill** (or pressing Enter, or tapping a suggestion chip) runs a client-side parser that sets the form fields.
- All fields remain manually editable after an AI fill — the AI is a head-start, not a lock.
- On **Book Appointment**, fires `onBook({ kind, date, time, loc })` then closes.
- Closes on: backdrop click, the ✕ button, or Cancel.

### Props
| Prop | Type | Description |
|------|------|-------------|
| `name` | string | Lead's display name (shown in subheader + confirmation row). |
| `onClose` | `() => void` | Dismiss the modal. |
| `onBook` | `({ kind, date, time, loc }) => void` | Commit the booking. |

### Internal state (all `useState`)
| State | Default | Notes |
|-------|---------|-------|
| `kind` | `'Showing'` | One of `Showing · Call · Buyer Consult · Listing Appt.` |
| `date` | `''` | ISO `YYYY-MM-DD` (HTML date input) |
| `time` | `'14:00'` | 24h `HH:MM` (HTML time input) |
| `loc` | `'In Person'` | One of `In Person · Phone Call · Google Meet` |
| `address` | `''` | Label & placeholder change with `loc` (Address / Meeting link / Phone number) |
| `notes` | `''` | Optional, max 250 chars, live counter |
| `confirm` | `true` | Toggle: text + email confirmation to lead |
| `prompt` | `''` | The AI description text |
| `filled` | `false` | Shows the green "Form filled below" confirmation after a parse |

### AI parser rules (`parseFill(text)`)
- **Type:** matches `listing` → Listing Appt.; `consult` → Buyer Consult; `showing/tour/walkthrough/see the` → Showing; `call/phone call` → Call.
- **Location:** `google meet/video/zoom/virtual/online` → Google Meet; `phone/over the phone/by phone` → Phone Call; `in person/at the/on site` → In Person.
- **Date:** `today`, `tomorrow`, or any weekday name → resolved to the next upcoming occurrence (anchored to the app's "today" = `2026-06-10`). `this <weekday>` resolves within the current week.
- **Time:** `2pm`, `2:30 pm`, or 24h `14:30`.
- **Address:** street-address regex (number + name + St/Ave/Rd/Dr/Blvd/Ln/Way/Ct/Pl/Ter/Cir); only applied when location is In Person.
- Three example **suggestion chips** call `applyPrompt(text)` which sets the text and parses in one tap.

---

## 2. Layout & dimensions

| Element | Spec |
|---------|------|
| **Backdrop** (`.wc-modal-scrim`) | Fixed full-viewport, `rgba(24,28,40,.34)` + 2px blur, z-index 60, scrollable, content top-aligned with `56px 20px` padding. |
| **Modal panel** (`.wc-modal.wc-bookmodal`) | **width 600px**, `max-width:100%`, white, 1px border `--line`, **border-radius 18px**, `--shadow-lg`, padding `24px 26px 20px`, `position:relative`, `fadeUp .25s` entrance. |
| **Close ✕** (`.wc-modal-x`) | 32×32, absolute top-right (18px/18px), radius 9px. |
| **Title** (`.wc-book-h`) | 22px / 800 / `-.02em`. |
| **Subheader** (`.wc-book-sub`) | "for {name}", 13px uppercase `--ink-3`, bottom border + 16px padding. |
| **AI bar** (`.wc-book-ai`) | Accent-soft gradient card, 1px `#FBE0CC`, radius 14px, padding 14px. |
| ↳ input (`.wc-book-ai-input`) | flex:1, **height 42px**, radius 10px, 14px text. |
| ↳ Fill button (`.wc-book-ai-fill`) | height 42px, orange `--accent`, white, radius 10px. |
| ↳ chips (`.wc-book-ai-chip`) | pill, 12px, wrap with 8px gap. |
| ↳ done note (`.wc-book-ai-done`) | green `#16A34A`, 12.5px, check icon. |
| **Field label** (`.wc-book-lbl`) | 14px / 800, margins `16px 0 9px`. |
| **Type grid** (`.wc-book-grid4`) | 4 columns, 10px gap; each `.wc-book-opt` is a vertical icon+label tile, padding `16px 8px`, radius 12px, 1.5px border. |
| **Date/Time row** (`.wc-book-row2`) | 2-col grid, 14px gap. Inputs use `.wc-modal-input` (height 40px). |
| **Location grid** (`.wc-book-grid3`) | 3 columns; `.wc-book-opt-row` is a horizontal icon+label tile, padding `13px 8px`. |
| **Address input** | `.wc-modal-input`, dynamic label/placeholder. |
| **Notes** | `.wc-modal-textarea` (min-height 72px), max 250, counter `.wc-book-count`. |
| **Confirmation** (`.wc-book-confirm`) | Full-width toggle row, 1.5px border, 20×20 check box `.wc-book-check`. |
| **Footer** (`.wc-book-foot`) | Top border + 18px padding; Cancel `flex:1`, Book `flex:2`. |

**Selected state** (`.is-on`) on any option/tile/toggle: border → `--accent`, background → `--accent-soft`, text → `--accent-strong`, icon → `--accent`.

---

## 3. Design tokens (CSS variables)

```css
:root{
  --accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
  --bg:#FFFFFF; --panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
  --ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --muted:#A8AEBD; --ink-faint:#B4BAC6;
  --shadow-sm:0 1px 2px rgba(20,24,38,.05);
  --shadow-lg:0 18px 50px rgba(20,24,38,.15);
}
@keyframes fadeUp{from{transform:translateY(8px)}to{transform:none}}
```
Accent badge border color used in the AI/summary cards: `#FBE0CC`. Success green: `#16A34A`.

---

## 4. Full CSS

```css
/* ---- shared modal base ---- */
.wc-modal-scrim{position:fixed;inset:0;background:rgba(24,28,40,.34);backdrop-filter:blur(2px);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:56px 20px;overflow-y:auto}
.wc-modal{width:560px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-lg);padding:24px 26px 20px;position:relative;animation:fadeUp .25s}
.wc-modal-x{position:absolute;top:18px;right:18px;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:var(--ink-3)}
.wc-modal-x:hover{background:var(--line-soft);color:var(--ink)}
.wc-modal-input{width:100%;height:40px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font-size:14px;font-family:inherit;color:var(--ink);background:var(--panel);outline:none}
.wc-modal-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-modal-textarea{width:100%;min-height:72px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px;font-family:inherit;color:var(--ink);resize:vertical;outline:none}
.wc-modal-textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}

/* ---- Book Appointment modal ---- */
.wc-bookmodal{width:600px}
.wc-book-h{font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.wc-book-sub{font-size:13px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin:2px 0 18px;padding-bottom:16px;border-bottom:1px solid var(--line-soft)}

/* AI prompt bar */
.wc-book-ai{background:linear-gradient(135deg,var(--accent-soft),var(--panel));border:1px solid #FBE0CC;border-radius:14px;padding:14px;margin-bottom:6px}
.wc-book-ai-h{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--accent-strong);margin-bottom:10px}
.wc-book-ai-row{display:flex;gap:9px}
.wc-book-ai-input{flex:1;height:42px;border:1px solid var(--line);border-radius:10px;padding:0 13px;font-size:14px;font-family:inherit;color:var(--ink);background:var(--panel);outline:none}
.wc-book-ai-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-book-ai-input::placeholder{color:var(--ink-3)}
.wc-book-ai-fill{display:inline-flex;align-items:center;gap:7px;height:42px;padding:0 16px;border-radius:10px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;flex:none;transition:.12s}
.wc-book-ai-fill:hover{background:var(--accent-strong)}
.wc-book-ai-fill .wc-icon{color:#fff}
.wc-book-ai-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}
.wc-book-ai-chip{font-size:12px;font-weight:600;color:var(--ink-2);background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:6px 12px;transition:.12s}
.wc-book-ai-chip:hover{border-color:var(--accent);color:var(--accent-strong);background:var(--accent-soft)}
.wc-book-ai-done{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:#16A34A;margin-top:11px}
.wc-book-ai-done .wc-icon{color:#16A34A}

/* form */
.wc-book-lbl{font-size:14px;font-weight:800;color:var(--ink);margin:16px 0 9px}
.wc-book-opt-sub{font-weight:500;color:var(--ink-3)}
.wc-book-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.wc-book-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.wc-book-opt{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px 8px;border:1.5px solid var(--line);border-radius:12px;font-size:13px;font-weight:700;color:var(--ink-2);transition:.12s}
.wc-book-opt .wc-icon{color:var(--ink-3)}
.wc-book-opt:hover{border-color:var(--ink-faint)}
.wc-book-opt.is-on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-strong)}
.wc-book-opt.is-on .wc-icon{color:var(--accent)}
.wc-book-opt-row{flex-direction:row;gap:8px;padding:13px 8px}
.wc-book-row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.wc-book-field .wc-book-lbl{margin-top:16px}
.wc-book-notehead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:16px 0 9px}
.wc-book-notehead .wc-book-lbl{white-space:nowrap}
.wc-book-count{font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.wc-book-confirm{display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;border:1.5px solid var(--line);border-radius:12px;padding:13px 15px;transition:.12s}
.wc-book-confirm.is-on{border-color:var(--accent);background:var(--accent-soft)}
.wc-book-check{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--line);display:grid;place-items:center;color:#fff;flex:none;margin-top:1px}
.wc-book-confirm.is-on .wc-book-check{background:var(--accent);border-color:var(--accent)}
.wc-book-confirm-t{font-size:13.5px;font-weight:700;color:var(--ink)}
.wc-book-confirm-s{font-size:12px;color:var(--ink-3);margin-top:2px}
.wc-book-foot{display:flex;gap:12px;margin-top:22px;padding-top:18px;border-top:1px solid var(--line-soft)}
.wc-book-cancel{flex:1;justify-content:center}
.wc-book-submit{flex:2;justify-content:center}

/* shared buttons used in footer */
.wc-ghostbtn{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-size:14px;font-weight:600;color:var(--ink-2)}
.wc-ghostbtn:hover{border-color:#D9D5CE;color:var(--ink);box-shadow:var(--shadow-sm)}
.wc-primary{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:11px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 16px rgba(234,88,12,.25)}
.wc-primary:hover{background:var(--accent-strong)}

/* optional: dock to bottom sheet on phones */
@media (max-width:640px){
  .wc-modal-scrim{padding:0;align-items:flex-end}
  .wc-modal,.wc-bookmodal{width:100%;border-radius:18px 18px 0 0}
  .wc-book-grid4{grid-template-columns:repeat(2,1fr)}
  .wc-book-grid3{grid-template-columns:1fr}
  .wc-book-ai-row{flex-direction:column}
  .wc-book-ai-fill{width:100%;justify-content:center}
}
```

---

## 5. External dependencies

- **React 18** (`useState`).
- **`<Icon name size />`** — an inline SVG icon component. Icons referenced: `x`, `sparkles`, `check`, `home`, `phone`, `users`, `file`, `pin`, `video`, `calendar`.
- Data constants `IBX_APPT_KINDS` and `IBX_APPT_LOCS` (included in the JSX file).

See `BookApptModal.jsx` for the full component source.
