# EXACT build spec — WarmChats `admin.jsx` (fully self-contained)

This file contains **everything** needed to reproduce the Admin screen pixel-for-pixel: design tokens, the complete CSS (every class with its real sizes/shapes/positions), the host globals it depends on, every data array with literal values, and the complete component source. Reproduce it exactly — do not summarize, rename classes, or change any number, color, or string.

---

## 1. How it loads / environment contract

- A single file `admin.jsx`, authored as **inline JSX transpiled in-browser by Babel** — no `import`/`export`, no bundler. It runs after React 18 UMD + Babel standalone are loaded.
- First line is the banner comment; last line is `window.Admin = Admin;` (the host mounts `<Admin go={...} orgSub={...} />`).
- State hook aliased once at top: `const { useState: useAdmS } = React;` — used everywhere (never `React.useState`).
- **Host-provided globals** (already defined elsewhere — DO NOT redefine, just use): `React`, `Icon` (`<Icon name size />`, stroke icon set), `TONES` (tone→{fg,bg}), plus `window.RepOverviewTab`, `window.RepMessagingTab`, `window.GoalsPage` (the Overview / Messaging / Goals panels rendered inside Admin), and optional `window.__resources` (logo data-URIs).
- **Fonts:** Google **Newsreader** (serif display, used by Support h1 via `.wc-serif`), **JetBrains Mono** (all numbers via `.wc-mono`), system-ui for body.
- **Icon names used:** bot, inbound, outbound, zap, sparkles, trending, users, user, flame, target, route, home, building2, building, mail, message, phone, plus, more, check, checkCircle, chevronRight, list, pencil, clock, lock, file, download, refresh, settings, arrowUpRight, layers.

### 1a. TONES global (for reference if you must stub it)
```jsx
// Provided by host as a global. Shape: { fg, bg } per tone name.
const TONES = {
  violet:  { fg:'#7C5CFC', bg:'#EEEAFE' },
  blue:    { fg:'#0EA5E9', bg:'#E7F6FD' },
  orange:  { fg:'#EA580C', bg:'#FFF3EA' },
  green:   { fg:'#0E9F6E', bg:'#E4F7EF' },
  amber:   { fg:'#E08600', bg:'#FCF0DC' },
};
```

---

## 2. Design tokens + base (define in `:root`, exactly these values)

```css
:root{
  /* Primary — orange */
  --accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
  /* Secondary — light blue (sky) */
  --secondary:#0EA5E9; --secondary-strong:#0284C7; --secondary-soft:#E7F6FD;
  /* Neutrals — clean cool gray */
  --bg:#FFFFFF; --panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
  --ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --muted:#A8AEBD;
  --radius:14px; --shadow-sm:0 1px 2px rgba(20,24,38,.05); --shadow:0 4px 16px rgba(20,24,38,.07);
  --shadow-lg:0 18px 50px rgba(20,24,38,.15);
  /* Harmonized semantic accents — matched tone */
  --green:#0E9F6E; --green-bg:#E4F7EF; --blue:#0EA5E9; --blue-bg:#E7F6FD;
  --violet:#7C5CFC; --violet-bg:#EEEAFE; --amber:#E08600; --amber-bg:#FCF0DC;
}
/* Fonts (Google): Newsreader (serif display), JetBrains Mono (numbers), system UI for body */
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);margin:0;-webkit-font-smoothing:antialiased}
.wc-serif{font-family:'Newsreader',Georgia,serif;font-weight:600;letter-spacing:-.01em}
.wc-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}}
.wc-fade{animation:fadeUp .45s cubic-bezier(.2,.7,.3,1) both}
```

---

## 3. Complete CSS (verbatim — every class, size, shape, position)

All admin styling. Reproduce **exactly**; values encode the heights, widths, radii, paddings, grid templates and breakpoints for every card and control. (Relies on the tokens above.)

```css
.wc-serif{font-family:'Newsreader',Georgia,serif;font-weight:600;letter-spacing:-.01em}
.wc-mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.wc-fade{animation:fadeUp .45s cubic-bezier(.2,.7,.3,1) both}
.wc-icon{flex:none}
.wc-nav.is-active .wc-icon{color:var(--accent)}
/* ---- Page ---- */
.wc-page{padding:24px 26px 60px;max-width:1640px}
.wc-pagehead{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px}
.wc-pagehead h1{margin:0;font-size:28px;font-weight:800;letter-spacing:-.02em}
.wc-pagehead p{margin:5px 0 0;font-size:14px;color:var(--ink-2)}
.wc-ghostbtn{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-size:14px;font-weight:600;color:var(--ink-2);transition:.12s}
.wc-ghostbtn:hover{border-color:#D9D5CE;color:var(--ink);box-shadow:var(--shadow-sm)}
.wc-primary{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:11px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 16px rgba(249,115,22,.28);transition:.12s}
.wc-primary:hover{background:var(--accent-strong)}
.wc-inlsel-btn .wc-icon{color:var(--ink-3);flex:none}
.wc-rangeitem .wc-icon{color:var(--accent)}
.wc-ghostbtn{height:40px}
.wc-move-item .wc-check,.wc-move-item .wc-icon{margin-left:auto}
.wc-contact-row .wc-icon{color:var(--ink-3)}
.wc-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.wc-field{background:var(--line-soft);border:1px solid var(--line);border-radius:11px;padding:11px 13px}
.wc-field-l{font-size:11px;font-weight:600;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em}
.wc-field-v{font-size:14.5px;font-weight:700;margin-top:3px}
.wc-field-v.is-ok{color:#16A34A}
.wc-field-btn .wc-field-v{display:flex;align-items:center;gap:6px}
.wc-field.is-editing{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
/* ==== Dashboard + AI pages ==== */
.wc-eyebrow{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.wc-sm{height:36px!important;padding:0 14px!important;font-size:13px!important}
.wc-full{width:100%;justify-content:center}
.wc-nextsteps-h .wc-band-d{margin-left:4px}
.wc-panel-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-sm);overflow:hidden}
.wc-panel-card.pad{padding:16px}
.wc-hot-tag{font-size:10.5px;font-weight:600;color:var(--ink-2);background:var(--line-soft);padding:2px 7px;border-radius:6px}
.wc-qabtn .wc-icon{color:var(--accent)}
.wc-statuspill{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;padding:4px 11px;border-radius:99px;background:var(--line-soft);color:var(--ink-3)}
.wc-statuspill.is-live{background:var(--green-bg);color:var(--green)}
.wc-pdot{position:relative;display:inline-flex;width:8px;height:8px;flex:none}
.wc-pdot-core{position:absolute;inset:0;border-radius:50%}
.wc-stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 13px;box-shadow:var(--shadow-sm)}
.wc-stat-label{font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)}
.wc-stat-val{font-size:20px;font-weight:700;letter-spacing:-.02em;margin-top:4px}
.wc-stat-sub{font-size:11px;font-weight:600;margin-top:3px}
.wc-toggle{width:40px;height:22px;border-radius:99px;background:var(--ink-3);position:relative;transition:.18s;flex:none}
.wc-toggle.is-on{background:var(--accent)}
.wc-toggle-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:.18s}
.wc-toggle.is-on .wc-toggle-knob{left:20px}
.wc-iconbtn-sm{width:32px;height:32px;border-radius:8px;border:1px solid var(--line);display:grid;place-items:center;color:var(--ink-3)}
.wc-iconbtn-sm:hover{background:var(--line-soft)}
.wc-actfeed{display:flex;flex-direction:column}
.wc-actitem{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--line-soft)}
.wc-actitem:first-child{border-top:none}
.wc-actdot{width:6px;height:6px;border-radius:50%;margin-top:7px;flex:none}
.wc-acttext{font-size:13px;color:var(--ink);line-height:1.4}
.wc-actwhen{font-size:11.5px;color:var(--ink-3);margin-top:2px}
.wc-conn-status{font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:var(--line-soft);color:var(--ink-3)}
.wc-conn-status.is-on{background:var(--green-bg);color:var(--green)}
.wc-dtab{display:inline-flex;align-items:center;gap:8px;padding:11px 16px;margin-bottom:-1px;font-size:13.5px;font-weight:600;color:var(--ink-3);border-bottom:2px solid transparent}
.wc-dtab:hover{color:var(--ink)}
.wc-dtab.is-on{color:var(--accent-strong);border-bottom-color:var(--accent)}
.wc-dtab.is-on .wc-icon{color:var(--accent)}
.wc-dtab.is-on .wc-dtab-c{background:var(--accent-soft);color:var(--accent-strong)}
.wc-dcomm .wc-icon{color:var(--green)}
.wc-dtask .wc-icon{color:var(--ink-3);flex:none}
/* Add Deal modal */
.wc-modal-scrim{position:fixed;inset:0;background:rgba(24,28,40,.34);backdrop-filter:blur(2px);z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:56px 20px;overflow-y:auto;animation:fade .18s}
.wc-modal{width:560px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-lg);padding:24px 26px 20px;position:relative;animation:fadeUp .25s cubic-bezier(.2,.7,.3,1) both}
.wc-modal-x{position:absolute;top:18px;right:18px;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:var(--ink-3)}
.wc-modal-x:hover{background:var(--line-soft);color:var(--ink)}
.wc-modal-title{font-size:22px;font-weight:800;letter-spacing:-.02em;border:none;border-bottom:2px solid var(--line);outline:none;width:90%;padding:0 0 6px;color:var(--ink)}
.wc-modal-title:focus{border-bottom-color:var(--accent)}
.wc-modal-title::placeholder{color:var(--ink-3)}
.wc-modal-crumb{display:flex;align-items:center;gap:8px;margin:8px 0 22px;color:var(--ink-3)}
.wc-crumb-tag{font-size:13px;font-weight:700;color:var(--accent-strong)}
.wc-crumb-stage{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--ink-2)}
.wc-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;margin-bottom:20px}
.wc-modal-fieldfull{margin-bottom:18px}
.wc-modal-lbl{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}
.wc-modal-input{width:100%;height:40px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font-size:14px;font-family:inherit;color:var(--ink);background:var(--panel);outline:none}
.wc-modal-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-modal-select{appearance:none;cursor:pointer}
.wc-modal-foot{display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--line-soft);padding-top:16px;margin-top:4px}
.wc-primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.wc-tasktabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:4px 0 20px}
.wc-tasktabs .wc-dtab-c.is-alert{background:#FEE2E2;color:#DC2626}
.wc-aitask-acts .wc-primary{flex:1}
.wc-task-open{width:32px;height:32px;border-radius:8px;border:1px solid var(--line);display:grid;place-items:center;color:var(--ink-3);flex:none}
.wc-task-open:hover{border-color:var(--accent);color:var(--accent-strong)}
.wc-task-empty{padding:26px;text-align:center;font-size:13px;color:var(--muted)}
.wc-aip-acts .wc-primary{flex:0 0 auto}
.wc-admincard-h2-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.wc-inbox-tab .wc-icon{color:var(--ink-3)}
.wc-inbox-tab.is-on .wc-icon{color:var(--accent)}
.wc-callnav-item .wc-icon{color:var(--ink-3);flex:none}
.wc-callnav-item.is-on .wc-icon{color:var(--accent)}
.wc-aitask-why .wc-icon{color:#DC2626;flex:none;margin-top:2px}
.wc-aitask-next .wc-icon{color:var(--accent-strong);flex:none;margin-top:2px}
.wc-cbadge{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px}
.wc-cbadge.mini{padding:2px 6px;gap:3px}
.wc-msg-status .wc-icon{opacity:.85}
.wc-assistmenu button .wc-icon{color:var(--accent-strong)}
.wc-composer-input .wc-primary{height:44px;flex:none}
.wc-clock .wc-icon{color:var(--ink-3)}
.wc-intel-av{width:46px;height:46px;border-radius:50%;background:#EEECE8;color:#9A938A;display:grid;place-items:center;font-size:16px;font-weight:700;flex:none}
.wc-intel-name{font-size:17px;font-weight:800;letter-spacing:-.01em}
.wc-intel-last{font-size:12px;color:var(--ink-3);margin-top:2px}
.wc-aisummary{background:linear-gradient(135deg,var(--accent-soft),var(--panel));border:1px solid #FBE0CC;border-radius:14px;padding:14px;margin-bottom:18px}
.wc-aisummary-h{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--accent-strong);margin-bottom:8px}
.wc-aisummary p{margin:0;font-size:13px;line-height:1.5;color:var(--ink)}
.wc-intel-sec{margin-bottom:18px}
.wc-intel-sech{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3);margin-bottom:9px}
/* ==== Admin ==== */
.wc-planbadge{display:flex;align-items:center;gap:11px;background:var(--accent-soft);border:1px solid #FBE0CC;border-radius:14px;padding:12px 16px;color:var(--accent-strong)}
.wc-planbadge-t{font-size:13px;font-weight:800;letter-spacing:.02em}
.wc-planbadge-s{font-size:12px;font-weight:600;opacity:.85}
.wc-admin-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:18px 0 22px}
.wc-admin-grid{display:grid;grid-template-columns:1.15fr 1fr;gap:18px;align-items:start}
@media(max-width:1040px){.wc-admin-grid{grid-template-columns:1fr}}
.wc-admin-col{display:flex;flex-direction:column;gap:18px;min-width:0}
.wc-admincard{padding:18px 20px}
.wc-admincard-h{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:800;letter-spacing:-.01em;margin-bottom:14px}
.wc-admincard-ic{width:30px;height:30px;border-radius:9px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
.wc-notlist{display:flex;flex-direction:column}
.wc-notrow{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid var(--line-soft)}
.wc-notrow-l{font-size:14px;font-weight:700}
.wc-notrow-d{font-size:12px;color:var(--ink-3);margin-top:2px}
.wc-admin-band{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--accent-soft);border:1px solid #FBE0CC;border-radius:12px;padding:12px 14px;margin-top:12px}
.wc-band-t{font-size:13.5px;font-weight:700}
.wc-band-d{font-size:12px;color:var(--ink-3);line-height:1.45;margin-top:2px}
.wc-formgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.wc-formfoot{display:flex;justify-content:flex-end;margin-top:14px}
.wc-usage{margin-bottom:16px}
.wc-usage:last-child{margin-bottom:0}
.wc-usage-top{display:flex;align-items:center;justify-content:space-between;font-size:13.5px;font-weight:700;margin-bottom:7px}
.wc-usage-top .wc-mono{color:var(--ink-2);font-weight:600;font-size:13px}
.wc-usage-bar{height:7px;border-radius:99px;background:var(--accent-soft);overflow:hidden}
.wc-usage-bar>div{height:100%;border-radius:99px;background:var(--accent);min-width:4px}
.wc-conn-addr{display:flex;align-items:center;gap:12px;font-size:16px;font-weight:700;margin:16px 0 12px}
.wc-conn-mode{font-size:11.5px;font-weight:700;color:var(--ink-2);background:var(--line-soft);padding:3px 9px;border-radius:7px}
.wc-conn-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.wc-conn-chip{font-size:11.5px;font-weight:600;color:var(--ink-2);background:var(--line-soft);padding:5px 11px;border-radius:8px}
.wc-conn-status{background:var(--line-soft);border-radius:12px;padding:13px 15px;margin-bottom:14px}
.wc-conn-status>div{display:flex;align-items:center;justify-content:space-between;font-size:13.5px;padding:3px 0}
.wc-conn-status span{color:var(--ink-2)}
.wc-conn-status b{font-weight:700}
.wc-conn-status b.ok{color:#16A34A}
.wc-conn-btns{display:flex;flex-wrap:wrap;gap:9px}
.wc-danger{color:#DC2626!important}
.wc-danger:hover{border-color:#FBC9C9!important;background:#FEF2F2!important}
.wc-plan-now{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:8px}
.wc-plan-name{font-size:20px;font-weight:800;letter-spacing:-.02em}
.wc-plan-price{font-size:24px;font-weight:800;letter-spacing:-.02em;margin-top:2px}
.wc-plan-price span{font-size:14px;color:var(--ink-3);font-weight:600}
.wc-paycard{display:flex;align-items:center;gap:13px}
.wc-paycard-brand{font-size:12px;font-weight:800;letter-spacing:.06em;color:#1A1F71;background:#EAEDF8;padding:8px 11px;border-radius:9px;flex:none}
.wc-invlist{display:flex;flex-direction:column}
.wc-inv{display:flex;align-items:center;gap:13px;padding:11px 0;border-bottom:1px solid var(--line-soft)}
.wc-inv:last-child{border-bottom:none}
.wc-inv>div:first-child{flex:1}
.wc-inv-amt{font-weight:700;font-size:13.5px}
.wc-inv-status{font-size:11.5px;font-weight:700;color:#16A34A;background:#E8F8ED;padding:3px 10px;border-radius:99px}
.wc-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
@media(max-width:560px){.wc-plans{grid-template-columns:1fr}}
.wc-plancard{border:1px solid var(--line);border-radius:13px;padding:14px;display:flex;flex-direction:column}
.wc-plancard.is-current{border-color:var(--accent);background:var(--accent-soft)}
.wc-plancard-top{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:20px}
.wc-plancard-name{font-size:14px;font-weight:800}
.wc-plancard-cur{font-size:9.5px;font-weight:800;color:var(--accent-strong);background:#fff;padding:2px 7px;border-radius:6px}
.wc-plancard-pop{font-size:9.5px;font-weight:800;color:#fff;background:var(--accent);padding:2px 7px;border-radius:6px}
.wc-plancard-price{font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:8px}
.wc-plancard-price span{font-size:12px;color:var(--ink-3);font-weight:600}
.wc-plancard-tag{font-size:11.5px;color:var(--ink-3);margin-top:2px}
.wc-plancard-feats{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.wc-plancard-feats li{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-2)}
.wc-plancard-feats .wc-icon{color:#16A34A;flex:none}
.wc-plancard button{margin:12px 0 2px}
.wc-plancard.is-pop{border-color:var(--accent)}
.wc-plan-locked{margin-top:12px;padding-top:11px;border-top:1px dashed #DAD6CF}
.wc-plan-lockedh,.wc-plan-overh{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3);margin-bottom:7px}
.wc-plan-lock{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);padding:3px 0}
.wc-plan-lock .wc-icon{color:var(--muted);flex:none}
.wc-plan-over{margin-top:12px;padding-top:11px;border-top:1px solid var(--line-soft)}
.wc-plan-overrow{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--ink-2);padding:3px 0}
.wc-plan-overrow b{font-weight:700;color:var(--ink)}
.wc-goalrow-agent{display:flex;align-items:center;gap:10px;font-weight:700}
.wc-agoal-lav{width:30px;height:30px;border-radius:50%;background:#EEECE8;color:#9A938A;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none}
.wc-agoal-row-t{font-size:13.5px;font-weight:700}
.wc-actstatus{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-3);font-weight:600}
.wc-actstatus.is-online{color:#16A34A}
.wc-actdot-on{width:7px;height:7px;border-radius:50%;background:#16A34A}
/* ==== Support ==== */
.wc-support{max-width:1180px}
.wc-support-hero{text-align:center;max-width:760px;margin:8px auto 36px}
.wc-support-h1{font-size:46px;line-height:1.05;margin:0 0 16px;color:var(--ink)}
.wc-support-lede{font-size:17px;line-height:1.6;color:var(--ink-2);margin:0}
.wc-support-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:26px;align-items:start}
@media(max-width:920px){.wc-support-cols{grid-template-columns:1fr}}
.wc-support-sec{font-size:22px;font-weight:800;letter-spacing:-.01em;margin-bottom:8px}
.wc-support-secsub{font-size:14px;line-height:1.55;color:var(--ink-2);margin:0 0 18px}
.wc-support-card{display:flex;align-items:center;gap:14px;border:1px solid var(--line);border-radius:13px;padding:16px;margin-bottom:12px;transition:.12s}
a.wc-support-card:hover{border-color:var(--accent);box-shadow:var(--shadow-sm)}
.wc-support-card.is-soft{background:var(--accent-soft);border-color:#FBE0CC}
.wc-support-cardic{width:42px;height:42px;border-radius:11px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
.wc-support-card.is-soft .wc-support-cardic{background:#fff}
.wc-support-cardtext{font-size:15px;font-weight:700;color:var(--ink)}
.wc-support-common-h{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-strong);margin:22px 0 12px}
.wc-support-chips{display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.wc-support-chip{text-align:left;font-size:14px;font-weight:600;color:var(--ink-2);border:1px solid var(--line);border-radius:99px;padding:10px 18px;transition:.12s}
.wc-support-chip:hover{border-color:var(--accent);color:var(--accent-strong);background:var(--accent-soft)}
.wc-support-formcard{border:1px solid var(--line);border-radius:18px;padding:28px;box-shadow:var(--shadow-sm);background:var(--panel)}
.wc-support-formtitle{font-size:26px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px}
.wc-support-formsub{font-size:14px;color:var(--ink-2);margin:0 0 22px}
.wc-support-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:480px){.wc-support-grid2{grid-template-columns:1fr}}
.wc-support-field{margin-bottom:16px}
.wc-support-field label{display:block;font-size:13.5px;font-weight:700;color:var(--ink);margin-bottom:8px}
.wc-support-field label span{color:#DC2626}
.wc-support-field input,.wc-support-field textarea{width:100%;border:1px solid var(--line);border-radius:11px;padding:12px 14px;font-size:14px;font-family:inherit;color:var(--ink);outline:none;background:var(--panel)}
.wc-support-field textarea{min-height:120px;resize:vertical}
.wc-support-field textarea.wc-support-short{min-height:90px}
.wc-support-field input:focus,.wc-support-field textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.wc-support-privacy{font-size:12.5px;line-height:1.5;color:var(--ink-3);margin:4px 0 18px}
.wc-support-send{height:50px;font-size:15px}
.wc-support-success{text-align:center;padding:36px 16px}
.wc-support-success-ic{width:58px;height:58px;border-radius:50%;background:#E8F8ED;color:#16A34A;display:grid;place-items:center;margin:0 auto 16px}
.wc-support-success-t{font-size:22px;font-weight:800;letter-spacing:-.01em;margin-bottom:8px}
.wc-support-success-d{font-size:14px;line-height:1.55;color:var(--ink-2);max-width:380px;margin:0 auto 20px}
.wc-orgtab .wc-icon{color:var(--ink-3)}
.wc-orgtab.is-on .wc-icon{color:#fff}
.wc-orgtable-wrap{border:1px solid var(--line);border-radius:13px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.wc-comingsoon-pill .wc-icon{color:#fff}
.wc-orgtable-wrap .wc-reptable{min-width:980px}
.wc-orgtable-wrap .wc-reptable th,.wc-orgtable-wrap .wc-reptable td{white-space:nowrap}
.wc-orgtable-wrap .wc-reptable td{vertical-align:middle}
.wc-orgitem-top .wc-task-open{flex:none}
.wc-orgitem-meta .wc-icon{color:var(--ink-3);flex:none}
.wc-route-flow .wc-icon{color:var(--ink-3);flex:none}
/* ==== Admin · AI Management / Lead Sources / Compliance ==== */
.wc-aimgmt-list{display:flex;flex-direction:column;gap:10px;margin-top:6px}
.wc-aimgmt-row{display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.wc-aimgmt-ic{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:none}
.wc-aimgmt-b{flex:1;min-width:0}
.wc-srcgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.wc-srccard{position:relative;border:1px solid var(--line);border-radius:14px;padding:16px;background:var(--panel);box-shadow:var(--shadow-sm)}
.wc-srccard-top{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.wc-srccard-logo{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:#fff;font-size:18px;font-weight:800;flex:none}
.wc-srccard-id{min-width:0}
.wc-srccard-name{font-size:15px;font-weight:700}
.wc-srccard-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:13px;border-top:1px solid var(--line-soft)}
.wc-srccard-leads{font-size:12.5px;color:var(--ink-2);font-weight:600}
.wc-srccard-leads b{font-size:15px}
.wc-srccard-badge{position:absolute;top:14px;right:14px;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#16A34A}
.wc-tplch{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:99px;flex:none;color:#fff}
.wc-tplch.ch-sms{background:rgb(120, 190, 230)}
.wc-tplch.ch-email{background:#F97316}
.wc-psecbtn .wc-icon{color:var(--ink-3)}
.wc-psecbtn.is-on .wc-icon{color:#fff}
.wc-obrec .wc-icon{color:var(--accent-strong);flex:none}
.wc-aac-whyrow .wc-icon{color:#16A34A;flex:none}
.wc-kt-covrow .wc-icon{color:#16A34A;flex:none}
.wc-kt-covrow.is-warn .wc-icon{color:#D97706}
.wc-kt-can .wc-icon{color:#16A34A;flex:none}
.wc-kt-q .wc-icon{color:var(--accent-strong)}
.wc-actf-sumrow .wc-icon{color:var(--accent-strong);flex:none}
.wc-planhead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.wc-aplist{display:flex;flex-direction:column;gap:10px}
.wc-apcard{display:flex;align-items:stretch;gap:14px;border:1px solid var(--line);border-radius:14px;padding:14px 16px 14px 0;background:var(--panel);box-shadow:var(--shadow-sm);overflow:hidden}
.wc-apcard.is-off{opacity:.6}
.wc-apcard-bar{width:4px;border-radius:0 4px 4px 0;flex:none}
.wc-apcard-b{flex:1;min-width:0}
.wc-apcard-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px}
.wc-apcard-name{font-size:15px;font-weight:700}
.wc-apcard-desc{font-size:13px;color:var(--ink-2);margin-bottom:9px}
.wc-apcard-meta{display:flex;gap:16px;flex-wrap:wrap}
.wc-apcard-meta span{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-3);font-weight:600}
.wc-apcard-meta .wc-icon{color:var(--ink-3);flex:none}
.wc-apcard-actions{display:flex;align-items:center;gap:10px;flex:none}
.wc-wz-brand .wc-icon{color:var(--accent-strong)}
.wc-wz-hints .wc-icon{color:var(--accent-strong);flex:none}
.wc-wz-selbar .wc-icon{color:var(--accent-strong)}
.wc-wz-tcpa>.wc-icon{color:#16A34A;flex:none}
.wc-wz-toast .wc-icon{color:#4ADE80}
.wc-ac-brief-act .wc-icon{color:var(--accent);flex:none}
.wc-ac-brief-impact .wc-icon{color:#16A34A;flex:none}
.wc-ac-opp-sig .wc-icon{color:#EA580C;flex:none;margin-top:2px}
.wc-ac-opp-action .wc-band-d{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.wc-ac-worker-resp .wc-icon{color:#16A34A;flex:none}
.wc-ov-briefrow .wc-icon{color:#16A34A;flex:none}
.wc-exch{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}
@media(max-width:1180px){.wc-exch{grid-template-columns:1fr}}
.wc-exch-main{min-width:0}
.wc-exch-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
.wc-exch-title{display:flex;align-items:center;gap:9px;font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:3px}
.wc-exch-title .wc-icon{color:var(--accent-strong)}
.wc-exchtable td{vertical-align:middle}
.wc-exchrow{cursor:pointer}
.wc-exchrow:hover{background:var(--line-soft)}
.wc-exchrow.is-sel{background:var(--accent-soft)}
.wc-exch-score{display:inline-grid;place-items:center;min-width:38px;height:28px;padding:0 8px;border-radius:8px;border:1px solid var(--line);font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px}
.wc-exch-intent{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-2)}
.wc-exch-intent .wc-icon{color:var(--ink-3)}
.wc-exch-acts{display:flex;align-items:center;gap:7px}
.wc-exch-side{position:sticky;top:0;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:var(--shadow-sm);padding:16px}
.wc-exch-sidehead{display:flex;align-items:center;gap:12px}
.wc-exch-sideid{flex:1;min-width:0}
.wc-exch-scorebig{text-align:center;flex:none}
.wc-exch-scorebig span{font-size:22px;font-weight:800;color:#16A34A}
.wc-exch-scorebig small{display:block;font-size:10px;color:var(--ink-3);font-weight:600}
.wc-exch-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
.wc-exch-rec{margin-top:14px;border:1px solid var(--line);border-radius:13px;padding:13px}
.wc-exch-rec p{font-size:13px;line-height:1.5;color:var(--ink)}
.wc-intgroup{margin-bottom:22px}
.wc-intgroup-h{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:11px}
.wc-intgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.wc-intcard{border:1px solid var(--line);border-radius:14px;padding:15px;background:var(--panel);box-shadow:var(--shadow-sm)}
.wc-intcard.is-on{border-color:#CDE9D6}
.wc-intcard-top{display:flex;align-items:center;gap:12px;margin-bottom:13px}
.wc-intcard-logo{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:#fff;font-size:18px;font-weight:800;flex:none}
.wc-intlogo-svg{display:grid;place-items:center}
.wc-intlogo-svg svg{width:24px;height:24px;display:block}
.wc-intlogo-img{width:100%;height:100%;object-fit:cover;border-radius:11px;display:block}
.wc-intlogo-img.is-pad{object-fit:contain;padding:8px;border-radius:11px}
.wc-intcard-id{min-width:0}
.wc-intcard-name{font-size:14.5px;font-weight:700}
.wc-intcard-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px;border-top:1px solid var(--line-soft)}
.wc-intcard-status{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#16A34A}
.wc-billing{display:flex;flex-direction:column}
.wc-changeplan{order:-1;margin-bottom:18px}
.wc-rep-kpis .wc-kpi-icon .wc-icon{width:22px;height:22px}
.wc-reptable-card{overflow:hidden}
.wc-reptable{width:100%;border-collapse:collapse;font-size:13.5px}
.wc-reptable th{text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);padding:13px 18px;background:var(--line-soft);border-bottom:1px solid var(--line)}
.wc-reptable th:not(:first-child){text-align:right;width:130px}
.wc-reptable td{padding:13px 18px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
.wc-reptable td:not(:first-child){text-align:right}
.wc-reptable tr:last-child td{border-bottom:none}
.wc-reptable tbody tr:hover{background:var(--line-soft)}
.wc-rep-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}
.wc-rep-stats.two{grid-template-columns:1fr 1fr}
.wc-repstat{position:relative}
.wc-repstat-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;margin-bottom:10px}
```

### 3a. Key dimensions quick-reference (already encoded in the CSS above)
- **Page:** `.wc-page` padding `24px 26px 60px`, `max-width:1640px`. Head `<h1>` 28px/800.
- **Tabs:** `.wc-admin-tabs` bottom-bordered row; `.wc-dtab` 13.5px, active = orange text + 2px orange underline.
- **2-col layout:** `.wc-admin-grid` = `1.15fr 1fr`, gap 18px, collapses to 1 col ≤1040px. `.wc-admin-col` is a 18px-gap vertical stack.
- **Cards:** `.wc-panel-card` radius 16px + `--shadow-sm`; `.wc-admincard` padding `18px 20px`; header `.wc-admincard-h` 16px/800 with a 30×30 radius-9 tinted icon chip (`.wc-admincard-ic`, orange-soft bg).
- **Toggle:** 40×22 pill, 18px knob, slides to `left:20px` when on; on = `--accent`.
- **Plan badge:** `.wc-planbadge` orange-soft pill, 12×16 padding, `#FBE0CC` border.
- **Integration card:** `.wc-intcard` radius 14, padding 15; logo chip 40×40 radius 11; connected border `#CDE9D6`. SVG logos render 24×24; `img` logos `object-fit:cover` (or `.is-pad` → contain + 8px padding).
- **Plans grid:** `.wc-plans` auto-fit minmax(220px,1fr); `.wc-plancard` radius 13; current/pop = orange border, current also orange-soft bg.
- **Users table:** wrapper `.wc-orgtable-wrap` is horizontally scrollable, inner `.wc-reptable` `min-width:980px`, header cells uppercase 11px on `--line-soft`, non-first columns right-aligned.
- **Modal:** `.wc-modal` 560px, radius 18, `--shadow-lg`; scrim `rgba(24,28,40,.34)` + blur; title is an underline-only input.
- **Support:** hero `.wc-support-h1` 46px serif; two-col `minmax(0,1fr) minmax(0,1.15fr)`; form card radius 18, padding 28.

---

## 4. Complete component source (verbatim target)

This is the **exact** implementation to reproduce — all data arrays (with literal values), brand-logo SVG strings, every component, and the `Admin` root. Match it 1:1.

```jsx
// WarmChats Admin — Account & Usage, Connected Accounts, Billing (top tabs)
const { useState: useAdmS } = React;

const ADMIN_TABS = [
  { k: 'overview', label: 'Overview' },
  { k: 'org', label: 'Users' },
  { k: 'messaging', label: 'Messaging' },
  { k: 'goals', label: 'Goals' },
  { k: 'integrations', label: 'Integrations' },
  { k: 'billing', label: 'Billing & Usage' },
];

const ADMIN_BLURB = {
  org: 'Manage users and their roles across your organization.',
  overview: 'Track leads, conversations, appointments, pipeline, AI impact, and closed business.',
  messaging: 'Volume, response times, and engagement across SMS, email, and AI conversations.',
  goals: 'Set and track revenue, deal, and activity goals for your team.',
  exchange: 'Shared lead pools your agents can claim and convert. Tap any lead to see AI insights.',
  ai: 'Control your AI agents, automation guardrails, persona, and message limits.',
  sources: 'Connect and manage where your leads come from and how they flow in.',
  integrations: 'Connect WarmChats to your CRM, calendar, dialer, and the tools your team already uses.',
  billing: 'Manage your plan, payment method, usage, and invoices.',
  workspace: 'Profile, notifications, channels, timezone, quiet hours, and security.',
};

const AI_AGENTS_CFG = [
  { name: 'AI Assistant', desc: 'Drafts replies, summaries, and next-step suggestions in your inbox', on: true, tone: 'violet', icon: 'bot' },
  { name: 'Inbound', desc: 'Auto-responds to new leads, qualifies them, and books appointments', on: true, tone: 'blue', icon: 'inbound' },
  { name: 'Outbound', desc: 'Runs follow-up sequences and re-engagement campaigns', on: false, tone: 'orange', icon: 'outbound' },
];
const AI_GUARDRAILS = [
  { k: 'autoreply', label: 'Auto-reply to new leads', desc: 'Respond within 60 seconds, 24/7', on: true },
  { k: 'afterhours', label: 'Send during quiet hours', desc: 'Queue messages until the next morning instead', on: false },
  { k: 'escalate', label: 'Escalate hot leads to a human', desc: 'Notify the assigned agent when intent is high', on: true },
  { k: 'pricing', label: 'Discuss pricing & offers', desc: 'Allow the AI to answer price and offer questions', on: true },
  { k: 'handoff', label: 'Pause AI after a human reply', desc: 'Stop automation once an agent jumps into the thread', on: true },
];
const AI_LIMITS = [
  { label: 'Max AI messages per lead', value: '8' },
  { label: 'Languages', value: 'English · Spanish' },
  { label: 'Default tone', value: 'Friendly & professional' },
  { label: 'Signature', value: '— Joseph, JOV Realty' },
];

const LEAD_SOURCES = [
  { name: 'Zillow', desc: 'Premier Agent leads', leads: 45, status: 'Connected', color: '#1E40AF', letter: 'Z' },
  { name: 'Realtor.com', desc: 'Connections Plus', leads: 0, status: 'Not connected', color: '#D92228', letter: 'R' },
  { name: 'Meta Ads', desc: 'Facebook & Instagram lead forms', leads: 22, status: 'Connected', color: '#1877F2', letter: 'M' },
  { name: 'Google PPC', desc: 'Search & Local Services Ads', leads: 14, status: 'Connected', color: '#34A853', letter: 'G' },
  { name: 'Website forms', desc: 'jovrealestate.com — 2 forms', leads: 18, status: 'Connected', color: '#0D9488', letter: 'W' },
  { name: 'Open House', desc: 'Sign-in app', leads: 18, status: 'Connected', color: '#8B5CF6', letter: 'O' },
  { name: 'Referral', desc: 'Manual referral entry', leads: 12, status: 'Connected', color: '#D97706', letter: 'R' },
  { name: 'CSV / Import', desc: 'Bulk upload contacts', leads: 0, status: 'Available', color: '#64748B', letter: 'C' },
];

const EX_KPIS = [
  { icon: 'users', label: 'Total Pools', value: '8', sub: 'Active lead pools', tone: 'violet' },
  { icon: 'user', label: 'Leads Available', value: '317', sub: 'Ready to claim', tone: 'green' },
  { icon: 'flame', label: 'Hot Opportunities', value: '62', sub: 'High intent leads', tone: 'orange' },
  { icon: 'target', label: 'Claimed Today', value: '23', sub: 'By your agents', tone: 'blue' },
];
const EX_STATUS = { Hot: { fg: '#DC2626', bg: '#FEE2E2', icon: 'flame' }, Warm: { fg: '#D97706', bg: '#FEF3C7', icon: 'flame' }, Cold: { fg: '#0EA5E9', bg: '#E7F6FD', icon: 'trending' }, Nurturing: { fg: '#7C3AED', bg: '#F2ECFE', icon: 'sparkles' } };
const EX_LEADS = [
  { id: 'js', name: 'John Smith', city: 'Fresno, CA', type: 'Buyer', score: 92, act: '5m ago', src: 'Website Form', status: 'Hot',
    summary: 'John is looking for a 4 bed, 2 bath home in Fresno between $450k–$550k. Pre-approved and wants to buy within the next 60 days. He asked about school districts and neighborhoods.',
    rec: 'High intent buyer. Call within 5 minutes for best results.', recCta: 'Call Now',
    activity: [{ t: '5m ago', ev: 'Form Submitted', d: 'Website Form' }, { t: '7m ago', ev: 'AI Auto Reply Sent', d: 'Asked about preferences' }, { t: '12m ago', ev: 'Email Opened', d: 'Property Recommendations' }] },
  { id: 'sj', name: 'Sarah Jones', city: 'Clovis, CA', type: 'Seller', score: 88, act: '1h ago', src: 'Zillow', status: 'Warm',
    summary: 'Sarah is considering listing her Clovis home in the next 3 months. Wants a valuation and a sense of the current market before committing.',
    rec: 'Send a CMA and offer a no-pressure listing consult.', recCta: 'Send CMA',
    activity: [{ t: '1h ago', ev: 'Replied to text', d: 'Zillow' }, { t: '2h ago', ev: 'AI Auto Reply Sent', d: 'Valuation offer' }] },
  { id: 'mb', name: 'Mike Brown', city: 'Fresno, CA', type: 'Buyer', score: 76, act: 'Yesterday', src: 'Google Ads', status: 'Warm',
    summary: 'Mike is an early-stage buyer browsing 3-bed homes. Budget and timeline not yet confirmed.',
    rec: 'Qualify budget and timeline before nurturing.', recCta: 'Qualify',
    activity: [{ t: 'Yesterday', ev: 'Clicked ad', d: 'Google Ads' }] },
  { id: 'kt', name: 'Katie Taylor', city: 'Madera, CA', type: 'Seller', score: 72, act: 'Yesterday', src: 'Facebook Lead Ad', status: 'Nurturing',
    summary: 'Katie filled out a Facebook lead form about home value. Long-term seller, likely 6+ months out.',
    rec: 'Add to the seller nurture sequence.', recCta: 'Add to sequence',
    activity: [{ t: 'Yesterday', ev: 'Form Submitted', d: 'Facebook Lead Ad' }] },
  { id: 'rw', name: 'Robert Wilson', city: 'Fresno, CA', type: 'Buyer', score: 68, act: '2d ago', src: 'Realtor.com', status: 'Cold',
    summary: 'Robert inquired about a single listing on Realtor.com and has not responded since.',
    rec: 'Send a re-engagement message with similar homes.', recCta: 'Re-engage',
    activity: [{ t: '2d ago', ev: 'Inquiry', d: 'Realtor.com' }] },
  { id: 'al', name: 'Amanda Lee', city: 'Clovis, CA', type: 'Buyer', score: 64, act: '2d ago', src: 'Website Form', status: 'Cold',
    summary: 'Amanda browsed listings and submitted a general inquiry. No budget captured.',
    rec: 'Send qualifying questions to warm her up.', recCta: 'Qualify',
    activity: [{ t: '2d ago', ev: 'Form Submitted', d: 'Website Form' }] },
  { id: 'dl', name: 'David Lopez', city: 'Fresno, CA', type: 'Seller', score: 61, act: '3d ago', src: 'Zillow', status: 'Nurturing',
    summary: 'David is a potential seller researching the market. Not ready to list yet.',
    rec: 'Keep in the monthly market-update drip.', recCta: 'Add to drip',
    activity: [{ t: '3d ago', ev: 'Viewed listing', d: 'Zillow' }] },
];

const LOGO_SLACK = '<svg viewBox="0 0 122.8 122.8" xmlns="http://www.w3.org/2000/svg"><path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9z" fill="#E01E5A"/><path d="M32.3 77.6c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A"/><path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2z" fill="#36C5F0"/><path d="M45.2 32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36C5F0"/><path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2z" fill="#2EB67D"/><path d="M90.5 45.2c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2EB67D"/><path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9z" fill="#ECB22E"/><path d="M77.6 90.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ECB22E"/></svg>';
const LOGO_ZAPIER = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#FF4F00" d="M15 12a4.97 4.97 0 0 1-.327 1.776 4.98 4.98 0 0 1-1.897.371 4.98 4.98 0 0 1-1.776-.326A4.98 4.98 0 0 1 10.674 12c0-.62.113-1.214.32-1.762A4.97 4.97 0 0 1 12.776 9.9c.62 0 1.214.113 1.762.32.215.553.331 1.155.331 1.78z"/><path fill="#FF4F00" d="M23.708 10.21h-6.305l4.458-4.458a11.97 11.97 0 0 0-1.302-1.831 12.04 12.04 0 0 0-1.831-1.302L14.27 7.077V.772A12.07 12.07 0 0 0 12.001.56c-.772 0-1.53.074-2.266.212v6.305L5.276 2.619a11.97 11.97 0 0 0-1.83 1.303 12.03 12.03 0 0 0-1.302 1.83L6.603 10.21H.297S.085 11.226.085 12.001q0 1.162.211 2.266h6.305l-4.458 4.458c.376.661.812 1.277 1.303 1.831.554.49 1.17.927 1.831 1.302l4.458-4.458v6.306c.735.137 1.492.211 2.264.212h.004a12.07 12.07 0 0 0 2.264-.212v-6.306l4.459 4.458a12.05 12.05 0 0 0 1.83-1.303 12.05 12.05 0 0 0 1.302-1.83l-4.458-4.458h6.306c.137-.734.211-1.49.212-2.262v-.007c0-.772-.075-1.53-.212-2.265z"/></svg>';
const LOGO_MANYCHAT = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#0084FF" d="M12 2C6.477 2 2 6.13 2 11.222c0 2.9 1.45 5.487 3.717 7.18V22l3.4-1.867c.907.252 1.87.39 2.883.39 5.523 0 10-4.13 10-9.3C22 6.13 17.523 2 12 2z"/><path fill="#fff" d="m6.9 14.18 2.94-3.12 2.52 1.34 2.7-1.46-2.94 3.12-2.46-1.34z"/></svg>';
const LOGO_WEBHOOKS = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#64748B" stroke-width="2.1" stroke-linecap="round"><path d="M11 7.8 7.3 13.6"/><path d="M13 7.8 16.7 13.6"/><path d="M8.7 16.4h6.6"/></g><circle cx="12" cy="6" r="2.7" fill="#64748B"/><circle cx="6" cy="16.6" r="2.7" fill="#64748B"/><circle cx="18" cy="16.6" r="2.7" fill="#64748B"/></svg>';
const LOGO_META = '<svg viewBox="0 0 36 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="metaGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0099FF"/><stop offset="1" stop-color="#0064E1"/></linearGradient></defs><path d="M18 12 C15 6 12 5 9 6.5 C5 8.5 5 15.5 9 17.5 C12 19 15 18 18 12 C21 6 24 5 27 6.5 C31 8.5 31 15.5 27 17.5 C24 19 21 18 18 12 Z" fill="none" stroke="url(#metaGrad)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const LOGO_INSTAGRAM = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="igGrad" cx="0.3" cy="1" r="1.1"><stop offset="0" stop-color="#FED576"/><stop offset="0.26" stop-color="#F47133"/><stop offset="0.61" stop-color="#BC3081"/><stop offset="1" stop-color="#4C63D2"/></radialGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igGrad)"/><rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.6" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="#fff"/></svg>';
const LOGO_FACEBOOK = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#1877F2"/><path d="M14.9 12.6h-2v7.3a10 10 0 0 1-1.8 0v-7.3H9.2v-2.4h1.9V8.5c0-2 1.2-3 2.9-3 .8 0 1.5.06 1.7.09v2H14.5c-.9 0-1.1.43-1.1 1.06v1.55h2.2l-.3 2.4Z" fill="#fff"/></svg>';

const INTEGRATIONS = [
  { cat: 'CRM & Lead Sources', items: [
    { name: 'Zillow Premier Agent', desc: 'Sync leads from Zillow & Trulia', color: '#1E40AF', letter: 'Z', img: (window.__resources && window.__resources.logoZillow) || 'logos/zillow.png', on: true },
    { name: 'Follow Up Boss', desc: 'Two-way CRM contact sync', color: '#0F172A', letter: 'F', img: (window.__resources && window.__resources.logoFollowupboss) || 'logos/followupboss.png', pad: true, on: false },
    { name: 'Meta Lead Ads', desc: 'Import leads from Facebook & Instagram ads', color: '#0866FF', letter: 'M', logo: LOGO_META, on: false },
  ] },
  { cat: 'Calendar & Scheduling', items: [
    { name: 'Google Calendar', desc: 'Two-way appointment sync', color: '#4285F4', letter: 'G', img: (window.__resources && window.__resources.logoGooglecalendar) || 'logos/googlecalendar.png', pad: true, on: true },
    { name: 'Outlook Calendar', desc: 'Sync Microsoft 365 events', color: '#0078D4', letter: 'O', img: (window.__resources && window.__resources.logoOutlook) || 'logos/outlook.png', pad: true, on: false },
    { name: 'Calendly', desc: 'Let leads self-book showings', color: '#006BFF', letter: 'C', img: (window.__resources && window.__resources.logoCalendly) || 'logos/calendly.png', pad: true, on: true },
  ] },
  { cat: 'Automation', items: [
    { name: 'Instagram', desc: 'Auto-reply to DMs & story mentions', color: '#BC3081', letter: 'I', logo: LOGO_INSTAGRAM, on: false },
    { name: 'Facebook', desc: 'Capture Messenger leads & page comments', color: '#1877F2', letter: 'F', logo: LOGO_FACEBOOK, on: false },
    { name: 'ManyChat', desc: 'Automate Instagram, Messenger & WhatsApp chats', color: '#00B0FF', letter: 'M', img: (window.__resources && window.__resources.logoManychat) || 'logos/manychat.png', on: false },
    { name: 'Zapier', desc: 'Connect 6,000+ apps', color: '#FF4F00', letter: 'Z', logo: LOGO_ZAPIER, on: true },
    { name: 'Webhooks', desc: 'Push events to any endpoint', color: '#64748B', letter: 'W', logo: LOGO_WEBHOOKS, on: false },
  ] },
];

const ACTION_PLANS = [
  { name: 'New Zillow lead', trigger: 'Lead created · Source = Zillow', steps: 5, channels: ['SMS', 'Email'], enrolled: 34, on: true, color: '#1E40AF', desc: 'Instant text + 4 follow-ups over 7 days until they reply.' },
  { name: 'Speed-to-lead (all sources)', trigger: 'Any new lead', steps: 3, channels: ['SMS'], enrolled: 62, on: true, color: '#EA580C', desc: 'Reply within 60 seconds, then nudge at 1h and 24h.' },
  { name: 'Seller valuation nurture', trigger: 'Form = Home Value', steps: 6, channels: ['Email', 'SMS'], enrolled: 18, on: true, color: '#8B5CF6', desc: 'CMA offer, market updates, and a listing-consult invite.' },
  { name: 'Post-showing follow-up', trigger: 'Appointment completed', steps: 4, channels: ['SMS', 'Email'], enrolled: 11, on: true, color: '#0D9488', desc: 'Same-day recap, similar listings, and a check-in.' },
  { name: 'Cold lead re-engagement', trigger: 'No activity 90 days', steps: 5, channels: ['SMS', 'Email'], enrolled: 142, on: false, color: '#D97706', desc: 'Win back idle leads with a market update + soft check-in.' },
  { name: 'Birthday & anniversary', trigger: 'Date matches', steps: 1, channels: ['SMS'], enrolled: 86, on: true, color: '#DB2777', desc: 'Automatic personal touch to stay top-of-mind.' },
];

const SUPPORT_COMMON = [
  'Connecting Gmail or business email',
  'Registering phone numbers and SMS campaigns',
  'Importing leads and consent records',
  'Creating AI follow-up templates',
  'Billing, plan, and usage questions',
  'Troubleshooting inbox or delivery issues',
];

const NOTIFS = [
  { k: 'sms', label: 'Lead messages (SMS)', desc: 'New inbound text messages from leads', on: true },
  { k: 'email', label: 'Lead messages (email)', desc: 'New inbound emails and replies from leads', on: true },
  { k: 'calls', label: 'Calls', desc: 'Incoming, missed calls, and voicemail', on: true },
  { k: 'appts', label: 'Appointments', desc: 'Bookings, reschedules, cancellations, reminders', on: true },
  { k: 'billing', label: 'Billing', desc: 'Payment issues, plan changes, quota warnings', on: true },
  { k: 'system', label: 'System', desc: 'SMS / domain registration status, campaigns, other system events', on: true },
  { k: 'toasts', label: 'In-app toasts', desc: 'Show pop-up toasts inside the app', on: true },
  { k: 'sound', label: 'Sound', desc: 'Play a chime when a new notification arrives', on: true },
  { k: 'push', label: 'Mobile push', desc: 'Deliver on installed mobile devices', on: true },
  { k: 'digest', label: 'Email digest', desc: 'Get periodic summary emails (when enabled)', on: false },
];

const USAGE = [
  { label: 'Emails', used: 0, cap: 20000 },
  { label: 'SMS', used: 1, cap: 2500 },
  { label: 'Calling minutes', used: 318, cap: 2500 },
  { label: 'AI actions', used: 0, cap: 15000 },
];

const ORG_SUBTABS = [
  { k: 'users', label: 'Users', icon: 'user' },
];
const ORG_USERS = [
  { name: 'Joseph Velasquez', email: 'joseph@jovrealestate.com', role: 'Admin', team: 'Listings', office: 'Burbank HQ', status: 'Active', leads: 142, appts: 18, deals: 4, response: '42s', convo: '14.8%', revenue: '$1.24M' },
];
const ORG_ROLE_TONE = { Admin: { fg: '#0EA5E9', bg: '#E7F6FD' }, Agent: { fg: '#0EA5E9', bg: '#E7F6FD' }, ISA: { fg: '#0D9488', bg: '#E3F6F2' } };
const ORG_TEAMS = [
  { name: 'Buyers', lead: 'Sarah Chen', members: 4, leads: 62, color: '#38BDF8' },
  { name: 'Listings', lead: 'Joseph Velasquez', members: 3, leads: 38, color: '#8B5CF6' },
  { name: 'Inside Sales', lead: 'Dana Whitfield', members: 2, leads: 41, color: '#14B8A6' },
];
const ORG_OFFICES = [
  { name: 'Burbank HQ', addr: '4042 E Clinton Ave, Burbank, CA', agents: 6, primary: true },
  { name: 'Glendale', addr: '210 N Brand Blvd, Glendale, CA', agents: 4, primary: false },
  { name: 'Pasadena', addr: '88 Hillcrest Ave, Pasadena, CA', agents: 2, primary: false },
];
const ROUTING_RULES = [
  { name: 'Zillow buyer leads', cond: 'Source is Zillow', then: 'Round-robin → Buyers team', on: true },
  { name: 'Seller / valuation requests', cond: 'Form is Home Value', then: 'Assign → Listings team', on: true },
  { name: 'Spanish-speaking leads', cond: 'Language is Spanish', then: 'Assign → Joseph Velasquez', on: true },
  { name: 'After-hours inbound', cond: 'Outside business hours', then: 'Assign → Inside Sales (ISA)', on: true },
  { name: 'High-value ($1M+)', cond: 'Budget over $1M', then: 'Notify + assign → Joseph Velasquez', on: false },
];

const INVOICES = [
  { date: 'May 1, 2026', amt: '$149.00', status: 'Paid' },
  { date: 'Apr 1, 2026', amt: '$149.00', status: 'Paid' },
  { date: 'Mar 1, 2026', amt: '$149.00', status: 'Paid' },
  { date: 'Feb 1, 2026', amt: '$149.00', status: 'Paid' },
];

const PLANS = [
  { name: 'Free', tag: 'Best for agents testing AI follow-up', price: '$0', cta: 'Start Free', current: false,
    feats: ['1 seat', 'Centralized lead inbox', 'Email outreach only', '500 emails / month', 'AI email writer (limited credits)', '1 follow-up sequence (3 steps)', 'Auto-response (email, basic rules)'],
    locked: ['SMS outreach', 'AI auto-replies', 'Advanced sequences', 'Campaign automation'] },
  { name: 'Starter', tag: 'Best for new agents', price: '$89', cta: 'Start Now', current: false,
    feats: ['1 seat', '1,250 SMS / month', '10,000 emails / month', '2,500 AI messages', '1,000 calling minutes', 'AI instant reply', 'Lead inbox', 'Templates'],
    overages: [['Extra SMS', '$0.015'], ['Extra emails', '$0.002'], ['Extra AI messages', '$0.002'], ['Extra calling minutes', '$0.015']] },
  { name: 'Growth', tag: 'Best for active agents', price: '$149', cta: 'Start Now', popular: true, current: true,
    feats: ['1 seat', '2,500 SMS / month', '20,000 emails / month', '15,000 AI messages', '3,750 calling minutes', 'AI follow-up sequences', 'Campaign automation', 'Appointment alerts', 'Advanced templates'],
    overages: [['Extra SMS', '$0.015'], ['Extra emails', '$0.002'], ['Extra AI messages', '$0.002'], ['Extra calling minutes', '$0.015']] },
  { name: 'Custom Brokerage', tag: 'For teams and brokerages looking to scale lead conversion with AI.', price: 'Custom', cta: 'Book Demo', current: false,
    feats: ['Multi-agent onboarding', 'Team management', 'AI follow-up automation', 'Shared templates', 'Priority support', 'Custom onboarding', 'Volume pricing'] },
];

function AdmToggle({ on, onChange }) {
  return <button className={'wc-toggle' + (on ? ' is-on' : '')} onClick={() => onChange(!on)}><span className="wc-toggle-knob" /></button>;
}

function UsageBar({ label, used, cap }) {
  const pct = Math.min(100, (used / cap) * 100);
  return (
    <div className="wc-usage">
      <div className="wc-usage-top"><span>{label}</span><span className="wc-mono">{used.toLocaleString()} / {cap.toLocaleString()}</span></div>
      <div className="wc-usage-bar"><div style={{ width: Math.max(pct, 1.5) + '%' }} /></div>
    </div>
  );
}

function Card({ icon, title, children, className }) {
  return (
    <div className={'wc-panel-card pad wc-admincard ' + (className || '')}>
      <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name={icon} size={17} /></span>{title}</div>
      {children}
    </div>
  );
}

function OrgSection({ initialSub }) {
  const orgInitials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const [sub, setSub] = useAdmS(initialSub || 'users');
  const [rules, setRules] = useAdmS(() => ROUTING_RULES.map(r => ({ ...r })));
  const toggleRule = i => setRules(rs => rs.map((r, idx) => idx === i ? { ...r, on: !r.on } : r));
  const addLabel = { users: 'Invite user' }[sub];

  return (
    <div>
      <WorkspaceTab />
    </div>
  );
}

function OrganizationTab({ orgSub }) {
  return <OrgSection key={orgSub || 'users'} initialSub={orgSub} />;
}

function AiMgmtTab() {
  const [agents, setAgents] = useAdmS(() => AI_AGENTS_CFG.map(a => ({ ...a })));
  const [rails, setRails] = useAdmS(() => AI_GUARDRAILS.map(r => ({ ...r })));
  const setAgent = (i, v) => setAgents(as => as.map((a, idx) => idx === i ? { ...a, on: v } : a));
  const setRail = (k, v) => setRails(rs => rs.map(r => r.k === k ? { ...r, on: v } : r));
  const liveCount = agents.filter(a => a.on).length;
  return (
    <div className="wc-admin-grid">
      <div className="wc-admin-col">
        <Card icon="bot" title="AI Agents">
          <div className="wc-admin-band" style={{ marginTop: 0 }}>
            <div><div className="wc-band-t">Master AI switch</div><div className="wc-band-d">{liveCount} of {agents.length} agents active across your workspace</div></div>
            <span className="wc-statuspill is-live"><span className="wc-pdot"><span className="wc-pdot-core" style={{ background: 'var(--green)' }} /></span>On</span>
          </div>
          <div className="wc-aimgmt-list">
            {agents.map((a, i) => {
              const t = TONES[a.tone];
              return (
                <div className="wc-aimgmt-row" key={a.name}>
                  <span className="wc-aimgmt-ic" style={{ color: t.fg, background: t.bg }}><Icon name={a.icon} size={17} /></span>
                  <div className="wc-aimgmt-b"><div className="wc-notrow-l">{a.name}</div><div className="wc-notrow-d">{a.desc}</div></div>
                  <AdmToggle on={a.on} onChange={v => setAgent(i, v)} />
                </div>
              );
            })}
          </div>
        </Card>

        <Card icon="zap" title="Automation guardrails">
          <div className="wc-notlist">
            {rails.map(r => (
              <div className="wc-notrow" key={r.k}>
                <div><div className="wc-notrow-l">{r.label}</div><div className="wc-notrow-d">{r.desc}</div></div>
                <AdmToggle on={r.on} onChange={v => setRail(r.k, v)} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="wc-admin-col">
        <Card icon="sparkles" title="Persona & limits">
          <div className="wc-fields">
            {AI_LIMITS.map(l => <div className="wc-field" key={l.label}><div className="wc-field-l">{l.label}</div><div className="wc-field-v">{l.value}</div></div>)}
          </div>
          <div className="wc-formfoot"><button className="wc-primary wc-sm" onClick={() => null}>Edit persona</button></div>
        </Card>

        <Card icon="trending" title="AI usage this month">
          <UsageBar label="AI messages" used={4280} cap={15000} />
          <UsageBar label="AI calls handled" used={64} cap={500} />
          <div className="wc-admin-band">
            <div><div className="wc-band-t">Time saved by AI</div><div className="wc-band-d">Across replies, summaries, and scheduling</div></div>
            <span className="wc-mono" style={{ fontWeight: 800, fontSize: 18 }}>12h</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

function LeadSourcesTab() {
  const connected = LEAD_SOURCES.filter(s => s.status === 'Connected');
  const totalLeads = LEAD_SOURCES.reduce((s, x) => s + x.leads, 0);
  return (
    <div>
      <div className="wc-rep-stats" style={{ marginBottom: 16 }}>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: '#0EA5E9', background: '#E7F6FD' }}><Icon name="zap" size={17} /></span><div className="wc-stat-label">Connected Sources</div><div className="wc-stat-val wc-mono">{connected.length}</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: '#16A34A', background: '#E8F8ED' }}><Icon name="user" size={17} /></span><div className="wc-stat-label">Leads This Month</div><div className="wc-stat-val wc-mono">{totalLeads}</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: '#7C3AED', background: '#F2ECFE' }}><Icon name="route" size={17} /></span><div className="wc-stat-label">Routing Rules</div><div className="wc-stat-val wc-mono">{ROUTING_RULES.length}</div></div>
      </div>
      <div className="wc-srcgrid">
        {LEAD_SOURCES.map(s => {
          const on = s.status === 'Connected';
          return (
            <div className="wc-srccard" key={s.name}>
              <div className="wc-srccard-top">
                <span className="wc-srccard-logo" style={{ background: s.color }}>{s.letter}</span>
                <div className="wc-srccard-id"><div className="wc-srccard-name">{s.name}</div><div className="wc-band-d">{s.desc}</div></div>
              </div>
              <div className="wc-srccard-foot">
                {on ? <span className="wc-srccard-leads"><b className="wc-mono">{s.leads}</b> leads / mo</span> : <span className="wc-band-d">{s.status}</span>}
                <button className={on ? 'wc-ghostbtn wc-sm' : 'wc-primary wc-sm'}>{on ? 'Manage' : s.status === 'Available' ? 'Import' : 'Connect'}</button>
              </div>
              {on && <span className="wc-srccard-badge"><Icon name="checkCircle" size={13} />Connected</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadExchangeTab() {
  const [tab, setTab] = useAdmS('all');
  const [sel, setSel] = useAdmS('js');
  const [claimed, setClaimed] = useAdmS(() => new Set());
  const tabs = [{ k: 'all', label: 'All Pools' }, { k: 'mine', label: 'My Claimed Leads' }, { k: 'attn', label: 'Needs Attention' }];
  const rows = EX_LEADS.filter(l => tab === 'all' ? true : tab === 'mine' ? claimed.has(l.id) : (l.status === 'Hot' || l.status === 'Warm'));
  const cur = EX_LEADS.find(l => l.id === sel);
  const claim = id => setClaimed(s => { const n = new Set(s); n.add(id); return n; });

  return (
    <div className="wc-exch">
      <div className="wc-exch-main">
        <div className="wc-exch-head">
          <div><div className="wc-exch-title"><Icon name="users" size={18} />Lead Pools</div><div className="wc-band-d">Shared lead pools your agents can claim and convert.</div></div>
          <button className="wc-primary wc-sm"><Icon name="plus" size={14} />Create Pool</button>
        </div>
        <div className="wc-rep-stats" style={{ marginBottom: 16 }}>
          {EX_KPIS.map(k => { const t = TONES[k.tone]; return (
            <div className="wc-stat wc-repstat" key={k.label}><span className="wc-repstat-ic" style={{ color: t.fg, background: t.bg }}><Icon name={k.icon} size={17} /></span><div className="wc-stat-label">{k.label}</div><div className="wc-stat-val wc-mono">{k.value}</div><div className="wc-stat-sub">{k.sub}</div></div>
          ); })}
        </div>
        <div className="wc-tasktabs" style={{ margin: '0 0 14px' }}>
          {tabs.map(t => <button key={t.k} className={'wc-dtab' + (tab === t.k ? ' is-on' : '')} onClick={() => setTab(t.k)}>{t.label}</button>)}
        </div>
        <div className="wc-panel-card wc-reptable-card">
          <table className="wc-reptable wc-exchtable">
            <thead><tr><th>Lead</th><th>Score</th><th>Intent</th><th>Last Activity</th><th>AI Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map(l => {
                const st = EX_STATUS[l.status];
                const isClaimed = claimed.has(l.id);
                return (
                  <tr key={l.id} className={'wc-exchrow' + (sel === l.id ? ' is-sel' : '')} onClick={() => setSel(l.id)}>
                    <td><div className="wc-goalrow-agent"><span className="wc-agoal-lav">{l.name.split(' ').map(w => w[0]).join('')}</span><div><div className="wc-agoal-row-t">{l.name}</div><div className="wc-band-d">{l.city} · {l.type}</div></div></div></td>
                    <td><span className="wc-exch-score">{l.score}</span></td>
                    <td><span className="wc-exch-intent"><Icon name={l.type === 'Buyer' ? 'home' : 'building2'} size={14} />{l.type}</span></td>
                    <td><div className="wc-agoal-row-t" style={{ fontSize: 13 }}>{l.act}</div><div className="wc-band-d">{l.src}</div></td>
                    <td><span className="wc-cbadge" style={{ color: st.fg, background: st.bg }}><Icon name={st.icon} size={12} />{l.status}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="wc-exch-acts">
                        <button className={isClaimed ? 'wc-ghostbtn wc-sm' : 'wc-primary wc-sm'} disabled={isClaimed} onClick={() => claim(l.id)}>{isClaimed ? 'Claimed' : 'Claim'}</button>
                        <button className="wc-iconbtn-sm"><Icon name="more" size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan="6"><div className="wc-task-empty">No leads in this view.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {cur && (
        <aside className="wc-exch-side">
          <div className="wc-exch-sidehead">
            <span className="wc-intel-av">{cur.name.split(' ').map(w => w[0]).join('')}</span>
            <div className="wc-exch-sideid"><div className="wc-intel-name">{cur.name}</div><div className="wc-intel-last">{cur.city}</div></div>
            <div className="wc-exch-scorebig"><span className="wc-mono">{cur.score}</span><small>AI Score</small></div>
          </div>
          <div className="wc-exch-tags">
            <span className="wc-hot-tag">{cur.type}</span>
            <span className="wc-cbadge" style={{ color: EX_STATUS[cur.status].fg, background: EX_STATUS[cur.status].bg }}><Icon name={EX_STATUS[cur.status].icon} size={11} />{cur.status}</span>
            <span className="wc-hot-tag">{cur.src}</span>
          </div>
          <div className="wc-aisummary" style={{ marginTop: 14 }}>
            <div className="wc-aisummary-h"><Icon name="sparkles" size={13} />AI Summary</div>
            <p>{cur.summary}</p>
          </div>
          <div className="wc-exch-rec">
            <div className="wc-aisummary-h" style={{ color: 'var(--ink-2)' }}><Icon name="target" size={13} />Recommended Action</div>
            <p className="wc-band-t" style={{ fontWeight: 600, margin: '0 0 10px' }}>{cur.rec}</p>
            <button className="wc-ghostbtn wc-sm wc-full" style={{ color: 'var(--accent-strong)', borderColor: '#FBE0CC' }}><Icon name="phone" size={14} />{cur.recCta}</button>
          </div>
          <div className="wc-intel-sec" style={{ marginTop: 16 }}>
            <div className="wc-intel-sech">Activity</div>
            <div className="wc-actfeed">
              {cur.activity.map((a, i) => (
                <div className="wc-actitem" key={i}><span className="wc-actdot" style={{ background: 'var(--accent)' }} /><div><div className="wc-acttext"><strong>{a.ev}</strong></div><div className="wc-band-d">{a.d}</div><div className="wc-actwhen wc-mono">{a.t}</div></div></div>
              ))}
            </div>
          </div>
          <button className="wc-primary wc-full" style={{ marginTop: 8 }} disabled={claimed.has(cur.id)} onClick={() => claim(cur.id)}>{claimed.has(cur.id) ? 'Claimed' : 'Claim Lead'}</button>
          <button className="wc-ghostbtn wc-full" style={{ marginTop: 8 }}>View Full Profile</button>
        </aside>
      )}
    </div>
  );
}

function IntegrationsTab() {
  const [conn, setConn] = useAdmS(() => {
    const m = {}; INTEGRATIONS.forEach(g => g.items.forEach(it => { m[it.name] = it.on; })); return m;
  });
  const toggle = name => setConn(c => ({ ...c, [name]: !c[name] }));
  return (
    <div>
      <div className="wc-rep-stats" style={{ marginBottom: 18 }}>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: '#16A34A', background: '#E8F8ED' }}><Icon name="checkCircle" size={17} /></span><div className="wc-stat-label">Connected</div><div className="wc-stat-val wc-mono">7</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: '#EA580C', background: 'var(--accent-soft)' }}><Icon name="zap" size={17} /></span><div className="wc-stat-label">Needs Setup</div><div className="wc-stat-val wc-mono">2</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: '#DC2626', background: '#FEE2E2' }}><Icon name="x" size={17} /></span><div className="wc-stat-label">Sync Errors</div><div className="wc-stat-val wc-mono">0</div></div>
      </div>
      {INTEGRATIONS.map(g => (
        <div className="wc-intgroup" key={g.cat}>
          <div className="wc-intgroup-h">{g.cat}</div>
          <div className="wc-intgrid">
            {g.items.map(it => {
              const on = conn[it.name];
              return (
                <div className={'wc-intcard' + (on ? ' is-on' : '')} key={it.name}>
                  <div className="wc-intcard-top">
                    <span className="wc-intcard-logo" style={(it.logo || it.img) ? { background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)' } : { background: it.color }}>{it.img ? <img className={'wc-intlogo-img' + (it.pad ? ' is-pad' : '')} src={it.img} alt={it.name} /> : it.logo ? <span className="wc-intlogo-svg" dangerouslySetInnerHTML={{ __html: it.logo }} /> : it.letter}</span>
                    <div className="wc-intcard-id"><div className="wc-intcard-name">{it.name}</div><div className="wc-band-d">{it.desc}</div></div>
                  </div>
                  <div className="wc-intcard-foot">
                    {on ? <span className="wc-intcard-status"><Icon name="checkCircle" size={13} />Connected</span> : <span className="wc-band-d">Not connected</span>}
                    <button className={on ? 'wc-ghostbtn wc-sm' : 'wc-primary wc-sm'} onClick={() => toggle(it.name)}>{on ? 'Disconnect' : 'Connect'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionPlansTab() {
  const [plans, setPlans] = useAdmS(() => ACTION_PLANS.map(p => ({ ...p })));
  const [adding, setAdding] = useAdmS(false);
  const toggle = i => setPlans(ps => ps.map((p, idx) => idx === i ? { ...p, on: !p.on } : p));
  const active = plans.filter(p => p.on).length;
  return (
    <div>
      <ApStyles />

      {/* Summary */}
      <div className="wc-apsummary">
        <div className="wc-apsum-lead">
          <span className="wc-apsum-ic"><Icon name="zap" size={20} /></span>
          <span className="wc-apsum-count wc-mono">{active}</span>
          <span className="wc-apsum-label">Active Action Plans</span>
        </div>
        <div className="wc-apsum-meta">
          <span><Icon name="user" size={15} />211 leads currently enrolled</span>
          <span className="wc-apsum-dot">·</span>
          <span><Icon name="clock" size={15} />Last automation triggered 2 min ago</span>
        </div>
      </div>

      {/* Your Action Plans */}
      <div className="wc-planhead wc-apsec-head">
        <div className="wc-apsec-h" style={{ margin: 0 }}>Your Action Plans</div>
        <button className="wc-primary wc-sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} />New action plan</button>
      </div>
      <div className="wc-aplist">
        {plans.map((p, i) => (
          <div className={'wc-apcard' + (p.on ? '' : ' is-off')} key={p.name}>
            <span className="wc-apcard-bar" style={{ background: p.color }} />
            <div className="wc-apcard-b">
              <div className="wc-apcard-top">
                <span className="wc-apcard-name">{p.name}</span>
                {p.channels.map(c => <span key={c} className={'wc-tplch ch-' + c.toLowerCase()}><Icon name={c === 'Email' ? 'mail' : 'message'} size={11} />{c}</span>)}
              </div>
              <div className="wc-apcard-desc">{p.desc}</div>
              <div className="wc-apcard-meta">
                <span><Icon name="zap" size={13} />{p.trigger}</span>
                <span><Icon name="list" size={13} />{p.steps} steps</span>
                <span><Icon name="user" size={13} />{p.enrolled} enrolled</span>
              </div>
            </div>
            <div className="wc-apcard-actions">
              <button className="wc-iconbtn-sm" title="Edit plan"><Icon name="pencil" size={15} /></button>
              <AdmToggle on={p.on} onChange={() => toggle(i)} />
            </div>
          </div>
        ))}
      </div>
      {adding && <NewPlanModal onClose={() => setAdding(false)} onCreate={p => setPlans(ps => [p, ...ps])} />}
    </div>
  );
}

function ApStyles() {
  return <style>{`
    .wc-apsec-h{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2);margin:0 0 14px}
    .wc-apsec-head{margin-bottom:14px}
    .wc-apsummary{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px;box-shadow:var(--shadow-sm);margin-bottom:26px}
    .wc-apsum-lead{display:flex;align-items:center;gap:13px}
    .wc-apsum-ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;color:#EA580C;background:var(--accent-soft);flex:none}
    .wc-apsum-count{font-size:30px;font-weight:800;letter-spacing:-.02em;color:var(--ink);line-height:1}
    .wc-apsum-label{font-size:18px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
    .wc-apsum-meta{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px;font-size:14px;color:var(--ink-2);font-weight:500}
    .wc-apsum-meta span{display:inline-flex;align-items:center;gap:7px}
    .wc-apsum-meta .wc-icon{color:var(--ink-3)}
    .wc-apsum-dot{color:var(--ink-3)}
  `}</style>;
}

const PLAN_COLORS = ['#EA580C', '#1E40AF', '#16A34A', '#7C3AED', '#DB2777', '#0EA5E9'];

function NewPlanModal({ onClose, onCreate }) {
  const [name, setName] = useAdmS('');
  const [trigger, setTrigger] = useAdmS('Any new lead');
  const [desc, setDesc] = useAdmS('');
  const [steps, setSteps] = useAdmS(3);
  const [channels, setChannels] = useAdmS(['SMS']);
  const [color, setColor] = useAdmS(PLAN_COLORS[0]);
  const can = name.trim();
  const toggleCh = c => setChannels(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);
  const submit = () => {
    if (!can) return;
    onCreate({
      name: name.trim(),
      trigger: trigger.trim() || 'Any new lead',
      desc: desc.trim() || 'Automated multi-step follow-up sequence.',
      steps: Math.max(1, Number(steps) || 1),
      channels: channels.length ? channels : ['SMS'],
      enrolled: 0, on: true, color,
    });
    onClose();
  };
  return (
    <div className="wc-modal-scrim" onClick={onClose}>
      <div className="wc-modal" onClick={e => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <input className="wc-modal-title" placeholder="Plan name" value={name} autoFocus
          onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        <div className="wc-modal-crumb">
          <span className="wc-crumb-tag">#Action Plan</span>
          <Icon name="chevronRight" size={12} />
          <span className="wc-crumb-stage"><Icon name="zap" size={12} />Automated</span>
        </div>
        <div className="wc-modal-grid">
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Trigger</div>
            <select className="wc-modal-input wc-modal-select" value={trigger} onChange={e => setTrigger(e.target.value)}>
              <option>Any new lead</option>
              <option>Lead created · Source = Zillow</option>
              <option>Lead created · Source = Realtor.com</option>
              <option>Lead created · Source = Website</option>
              <option>Stage changed</option>
              <option>No reply in 24h</option>
            </select>
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Steps</div>
            <input className="wc-modal-input" type="number" min="1" max="20" value={steps} onChange={e => setSteps(e.target.value)} />
          </div>
        </div>
        <div className="wc-modal-fieldfull">
          <div className="wc-modal-lbl">Channels</div>
          <div className="wc-np-chips">
            {['SMS', 'Email', 'Call'].map(c => (
              <button key={c} type="button" className={'wc-np-chip' + (channels.includes(c) ? ' is-on' : '')} onClick={() => toggleCh(c)}>
                <Icon name={c === 'Email' ? 'mail' : c === 'Call' ? 'phone' : 'message'} size={13} />{c}
              </button>
            ))}
          </div>
        </div>
        <div className="wc-modal-fieldfull">
          <div className="wc-modal-lbl">Accent color</div>
          <div className="wc-np-chips">
            {PLAN_COLORS.map(c => (
              <button key={c} type="button" className={'wc-np-swatch' + (color === c ? ' is-on' : '')} style={{ background: c }} onClick={() => setColor(c)} aria-label={c}>
                {color === c && <Icon name="check" size={13} />}
              </button>
            ))}
          </div>
        </div>
        <div className="wc-modal-fieldfull">
          <div className="wc-modal-lbl">Description</div>
          <input className="wc-modal-input" placeholder="What this plan does…" value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        <div className="wc-modal-foot">
          <button className="wc-ghostbtn" onClick={onClose}>Cancel</button>
          <button className="wc-primary" disabled={!can} onClick={submit}><Icon name="plus" size={16} />Create plan</button>
        </div>
        <style>{`
          .wc-np-chips{display:flex;flex-wrap:wrap;gap:8px}
          .wc-np-chip{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:600;color:var(--ink-2);transition:.12s}
          .wc-np-chip:hover{border-color:#D9D5CE}
          .wc-np-chip.is-on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-strong)}
          .wc-np-swatch{width:34px;height:34px;border-radius:9px;border:2px solid transparent;display:grid;place-items:center;color:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);transition:.12s}
          .wc-np-swatch.is-on{border-color:var(--ink);transform:scale(1.05)}
        `}</style>
      </div>
    </div>
  );
}

function WorkspaceTab() {
  const [notifs, setNotifs] = useAdmS(() => NOTIFS.map(n => ({ ...n })));
  const set = (k, v) => setNotifs(ns => ns.map(n => n.k === k ? { ...n, on: v } : n));
  return (
    <div className="wc-admin-grid">
      <div className="wc-admin-col">
        <Card icon="users" title="Users" className="wc-orgcard">
          <div className="wc-admincard-h2-row">
            <span className="wc-band-d">Manage who has access to this workspace.</span>
            <button className="wc-primary wc-sm"><Icon name="plus" size={14} />Invite user</button>
          </div>
          <div className="wc-orgtable-wrap">
            <table className="wc-reptable">
              <thead><tr><th>User</th><th>Role</th><th>Team</th><th>Office</th><th>Status</th><th>Leads</th><th>Appts</th><th>Deals</th><th>Lead→Appt</th><th>Avg Response</th><th>Revenue</th><th></th></tr></thead>
              <tbody>
                {ORG_USERS.map(u => {
                  const rt = ORG_ROLE_TONE[u.role];
                  const ini = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <tr key={u.email}>
                      <td><div className="wc-goalrow-agent"><span className="wc-agoal-lav">{ini}</span><div><div className="wc-agoal-row-t">{u.name}</div><div className="wc-band-d">{u.email}</div></div></div></td>
                      <td><span className="wc-cbadge" style={{ color: rt.fg, background: rt.bg }}>{u.role}</span></td>
                      <td className="wc-band-d">{u.team}</td>
                      <td className="wc-band-d">{u.office}</td>
                      <td><span className={'wc-actstatus' + (u.status === 'Active' ? ' is-online' : '')}>{u.status === 'Active' && <span className="wc-actdot-on" />}{u.status}</span></td>
                      <td className="wc-mono"><b>{u.leads}</b></td>
                      <td className="wc-mono"><b>{u.appts}</b></td>
                      <td className="wc-mono"><b>{u.deals}</b></td>
                      <td className="wc-mono">{u.convo}</td>
                      <td className="wc-mono">{u.response}</td>
                      <td className="wc-mono"><b>{u.revenue}</b></td>
                      <td><button className="wc-task-open" title="Manage"><Icon name="more" size={15} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card icon="user" title="Notification Settings">
          <div className="wc-notlist">
            {notifs.map(n => (
              <div className="wc-notrow" key={n.k}>
                <div><div className="wc-notrow-l">{n.label}</div><div className="wc-notrow-d">{n.desc}</div></div>
                <AdmToggle on={n.on} onChange={v => set(n.k, v)} />
              </div>
            ))}
          </div>
          <div className="wc-admin-band">
            <div><div className="wc-band-t">Send a test notification</div><div className="wc-band-d">Fires a notification end-to-end to verify the bell, toast, sound, and push.</div></div>
            <button className="wc-primary wc-sm"><Icon name="arrowUpRight" size={14} />Send test</button>
          </div>
        </Card>

      </div>

      <div className="wc-admin-col">
        <Card icon="mail" title="Email channel">
          <div className="wc-conn-addr"><span className="wc-mono">jv@jovrealestate.com</span><span className="wc-conn-mode">Mode: Business</span></div>
          <div className="wc-conn-status">
            <div><span>Sending</span><b className="ok">Ready</b></div>
            <div><span>Receiving</span><b className="ok">Ready</b></div>
            <div className="wc-band-d">Provider: Elastic</div>
          </div>
          <div className="wc-conn-btns">
            <button className="wc-ghostbtn wc-sm"><Icon name="refresh" size={14} />Verify DNS</button>
            <button className="wc-ghostbtn wc-sm"><Icon name="settings" size={14} />Manage domain</button>
          </div>
        </Card>

        <Card icon="message" title="SMS channel">
          <div className="wc-conn-addr"><span className="wc-mono">+1 747 201 7203</span></div>
          <div className="wc-conn-chips">
            {['10DLC: approved', 'Brand: approved', 'Campaign: approved', 'Number: assigned'].map(c => <span key={c} className="wc-conn-chip">{c}</span>)}
          </div>
          <div className="wc-conn-btns"><button className="wc-primary wc-sm"><Icon name="settings" size={14} />Manage setup</button></div>
        </Card>

        <Card icon="building" title="Workspace Timezone">
          <div className="wc-band-d" style={{ marginBottom: 10 }}>Used as the default schedule for new campaigns and follow-ups.</div>
          <select className="wc-modal-input wc-modal-select"><option>Pacific (PST/PDT)</option><option>Mountain (MST/MDT)</option><option>Central (CST/CDT)</option><option>Eastern (EST/EDT)</option></select>
          <div className="wc-formfoot"><button className="wc-primary wc-sm">Save timezone</button></div>
        </Card>

        <Card icon="lock" title="Password">
          <div className="wc-band-d" style={{ marginBottom: 12 }}>Update the password used to sign in to this workspace.</div>
          <div className="wc-formgrid">
            <div className="wc-modal-field"><div className="wc-modal-lbl">Current password</div><input className="wc-modal-input" type="password" defaultValue="************" /></div>
            <div className="wc-modal-field"><div className="wc-modal-lbl">New password</div><input className="wc-modal-input" type="password" placeholder="Enter new password" /></div>
            <div className="wc-modal-field"><div className="wc-modal-lbl">Confirm new password</div><input className="wc-modal-input" type="password" placeholder="Re-enter new password" /></div>
          </div>
          <div className="wc-formfoot"><button className="wc-primary wc-sm">Update password</button></div>
        </Card>
      </div>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="wc-billing">
    <div className="wc-admin-grid">
      <div className="wc-admin-col">
        <Card icon="trophy" title="Current plan">
          <div className="wc-plan-now">
            <div><div className="wc-plan-name">Growth</div><div className="wc-plan-price wc-mono">$149<span>/mo</span></div></div>
            <span className="wc-statuspill is-live"><span className="wc-pdot"><span className="wc-pdot-core" style={{ background: 'var(--green)' }} /></span>Active</span>
          </div>
          <div className="wc-band-d">Subscribed April 30, 2026 · Renews June 1, 2026</div>
          <div className="wc-conn-btns" style={{ marginTop: 14 }}>
            <button className="wc-primary wc-sm"><Icon name="settings" size={14} />Manage subscription</button>
            <button className="wc-ghostbtn wc-sm wc-danger">Cancel plan</button>
          </div>
        </Card>

        <Card icon="file" title="Payment method">
          <div className="wc-paycard">
            <span className="wc-paycard-brand">VISA</span>
            <div><div className="wc-band-t wc-mono">•••• •••• •••• 4242</div><div className="wc-band-d">Expires 08 / 2028</div></div>
            <button className="wc-ghostbtn wc-sm">Update</button>
          </div>
        </Card>
      </div>

      <div className="wc-admin-col">
        <Card icon="trending" title="Usage this cycle">
          {USAGE.map(u => <UsageBar key={u.label} {...u} />)}
        </Card>
        <Card icon="list" title="Invoices">
          <div className="wc-invlist">
            {INVOICES.map(inv => (
              <div className="wc-inv" key={inv.date}>
                <div><div className="wc-band-t">{inv.date}</div><div className="wc-band-d">Growth plan</div></div>
                <span className="wc-mono wc-inv-amt">{inv.amt}</span>
                <span className="wc-inv-status">{inv.status}</span>
                <button className="wc-task-open" title="Download invoice"><Icon name="download" size={15} /></button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>

    <div className="wc-panel-card pad wc-admincard wc-changeplan">
      <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="layers" size={17} /></span>Change plan</div>
      <div className="wc-plans">
        {PLANS.map(p => (
          <div className={'wc-plancard' + (p.current ? ' is-current' : '') + (p.popular ? ' is-pop' : '')} key={p.name}>
            <div className="wc-plancard-top">
              <span className="wc-plancard-name">{p.name}</span>
              {p.current ? <span className="wc-plancard-cur">Current</span> : p.popular ? <span className="wc-plancard-pop">Most popular</span> : null}
            </div>
            <div className="wc-plancard-tag">{p.tag}</div>
            <div className="wc-plancard-price wc-mono">{p.price}{p.price.charAt(0) === '$' && <span>/mo</span>}</div>
            <button className={p.current ? 'wc-ghostbtn wc-sm wc-full' : 'wc-primary wc-sm wc-full'} disabled={p.current}>{p.current ? 'Current plan' : p.cta}</button>
            <ul className="wc-plancard-feats">{p.feats.map(f => <li key={f}><Icon name="check" size={13} />{f}</li>)}</ul>
            {p.locked && <div className="wc-plan-locked"><div className="wc-plan-lockedh">Upgrade to unlock</div>{p.locked.map(l => <div className="wc-plan-lock" key={l}><Icon name="lock" size={12} />{l}</div>)}</div>}
            {p.overages && <div className="wc-plan-over"><div className="wc-plan-overh">Overages</div>{p.overages.map(o => <div className="wc-plan-overrow" key={o[0]}><span>{o[0]}</span><b className="wc-mono">{o[1]}</b></div>)}</div>}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

function SupportTab() {
  const [form, setForm] = useAdmS({ first: '', last: '', email: '', help: '', heard: '' });
  const [sent, setSent] = useAdmS(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSend = form.first.trim() && form.last.trim() && form.email.trim() && form.help.trim();
  const submit = () => { if (canSend) { setSent(true); } };

  return (
    <div className="wc-support">
      <div className="wc-support-hero">
        <h1 className="wc-serif wc-support-h1">How can we help?</h1>
        <p className="wc-support-lede">Tell us what is going on in WarmChats and we will route it to the right person. Account setup, billing, inbox issues, SMS approvals, automations, and deliverability are all fair game.</p>
      </div>

      <div className="wc-support-cols">
        <div className="wc-support-left">
          <div className="wc-support-sec">Reach the team</div>
          <p className="wc-support-secsub">Send the form or email us directly. Including the page, campaign, lead, or inbox thread involved helps us move faster.</p>
          <a className="wc-support-card" href="mailto:support@warmchats.com">
            <span className="wc-support-cardic"><Icon name="mail" size={18} /></span>
            <span className="wc-support-cardtext">support@warmchats.com</span>
          </a>
          <div className="wc-support-card is-soft">
            <span className="wc-support-cardic"><Icon name="clock" size={18} /></span>
            <span className="wc-support-cardtext">Support is available 24/7 for any issues.</span>
          </div>
          <div className="wc-support-common-h">Common requests</div>
          <div className="wc-support-chips">
            {SUPPORT_COMMON.map(c => <button key={c} className="wc-support-chip" onClick={() => { set('help', c); }}>{c}</button>)}
          </div>
        </div>

        <div className="wc-support-formcard">
          {sent ? (
            <div className="wc-support-success">
              <span className="wc-support-success-ic"><Icon name="check" size={26} /></span>
              <div className="wc-support-success-t">Message sent</div>
              <div className="wc-support-success-d">Thanks, {form.first || 'there'}. We'll reply to {form.email || 'your email'} shortly — usually within a few hours.</div>
              <button className="wc-ghostbtn wc-sm" onClick={() => { setSent(false); setForm({ first: '', last: '', email: '', help: '', heard: '' }); }}>Send another message</button>
            </div>
          ) : (
            <>
              <h2 className="wc-support-formtitle">Send a message</h2>
              <p className="wc-support-formsub">We will reply to the email address you provide.</p>
              <div className="wc-support-grid2">
                <div className="wc-support-field"><label>First name <span>*</span></label><input value={form.first} onChange={e => set('first', e.target.value)} /></div>
                <div className="wc-support-field"><label>Last name <span>*</span></label><input value={form.last} onChange={e => set('last', e.target.value)} /></div>
              </div>
              <div className="wc-support-field"><label>Work email address <span>*</span></label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
              <div className="wc-support-field"><label>How can we help you? <span>*</span></label><textarea value={form.help} onChange={e => set('help', e.target.value)} /></div>
              <div className="wc-support-field"><label>How did you hear about us?</label><textarea className="wc-support-short" value={form.heard} onChange={e => set('heard', e.target.value)} /></div>
              <p className="wc-support-privacy">WarmChats uses this information only to respond to your request. You can review our privacy practices in the Privacy Policy.</p>
              <button className="wc-primary wc-full wc-support-send" disabled={!canSend} onClick={submit}><Icon name="arrowUpRight" size={16} />Send</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Admin({ go, orgSub }) {
  const [tab, setTab] = useAdmS('overview');
  const cur = ADMIN_TABS.find(t => t.k === tab) || ADMIN_TABS[0];
  return (
    <div className="wc-page wc-fade">
      <div className="wc-pagehead">
        <div>
          <div className="wc-eyebrow" style={{ color: 'var(--accent-strong)', marginBottom: 6 }}>Admin</div>
          <h1>{cur.label}</h1>
          <p>{ADMIN_BLURB[tab]}</p>
        </div>
        <div className="wc-planbadge"><Icon name="checkCircle" size={18} /><div><div className="wc-planbadge-t">PLAN: GROWTH</div><div className="wc-planbadge-s">Status: active</div></div></div>
      </div>

      <div className="wc-admin-tabs">
        {ADMIN_TABS.map(t => (
          <button key={t.k} className={'wc-dtab' + (tab === t.k ? ' is-on' : '')} onClick={() => setTab(t.k)}>{t.label}</button>
        ))}
      </div>

      {tab === 'org' && <OrganizationTab orgSub={orgSub} />}
      {tab === 'overview' && window.RepOverviewTab && <window.RepOverviewTab />}
      {tab === 'messaging' && window.RepMessagingTab && <window.RepMessagingTab />}
      {tab === 'goals' && window.GoalsPage && <window.GoalsPage embedded go={go} />}
      {tab === 'ai' && <AiMgmtTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'billing' && <BillingTab />}
      {tab === 'workspace' && <WorkspaceTab />}
    </div>
  );
}

window.Admin = Admin;
```

---

## 5. Acceptance checklist

- [ ] File runs as inline Babel JSX, exposes `window.Admin`, uses `useAdmS`.
- [ ] Tab order: Overview · Users · Messaging · Goals · Integrations · Billing & Usage; opens on **Overview**; eyebrow "Admin", `<h1>` = active tab label, `<p>` = its blurb; right-side GROWTH plan badge.
- [ ] Users tab → single user **Joseph Velasquez** row with all 11 columns + horizontal scroll; Notification list (10 rows) + test-notification band; right column Email/SMS/Timezone/Password cards.
- [ ] Integrations → 3 stat tiles (7/2/0) + 3 groups; Instagram, Facebook, Meta, Zapier, Webhooks render real brand SVGs; toggles flip Connect/Disconnect.
- [ ] Billing → current plan + payment + usage + invoices, and a full-width Change-plan grid (Free/Starter/Growth-current/Custom) with locked + overage blocks.
- [ ] All colors/sizes match the CSS in §2–§3; all copy, numbers, prices, and logos match §4 exactly.
