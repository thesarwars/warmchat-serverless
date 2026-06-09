# EXACT build spec — Admin ▸ Users tab ▸ the **"Users"** card

Reproduce the **Users** card pixel-for-pixel. It's the first card in the Admin ▸ **Users** tab (rendered by `WorkspaceTab` → `OrganizationTab`): a titled panel with an "Invite user" action and a horizontally-scrollable table of workspace members with their performance stats. Everything below — markup, sizes/colors/shadows, the data, and the CSS — is literal. Do not rename classes or change any number, color, or string.

> Anatomy: a **`Card`** (white panel, "Users" title + people icon) → a **header sub-row** with a caption on the left and an **"Invite user"** primary button on the right → a **horizontally-scrollable wrapper** holding a **`.wc-reptable`** with 12 columns. Each member row leads with an avatar + name/email, then a tinted role badge, team/office, an online status, and six right-aligned numeric stats, ending in a kebab button.

---

## 1. Environment

- Inline JSX (Babel in browser), no imports/exports. `const { useState: useAdmS } = React;`.
- Host globals: `React`, `Icon` (`<Icon name size/>`). Numbers use `.wc-mono`. Accent orange `--accent:#F97316`.
- Lives inside `admin.jsx`; the surrounding `WorkspaceTab` puts this card in a 2-column `.wc-admin-grid` left column. This spec covers just the Users card div.

---

## 2. The `Card` wrapper it uses

```jsx
function Card({ icon, title, children, className }) {
  return (
    <div className={'wc-panel-card pad wc-admincard ' + (className || '')}>
      <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name={icon} size={17} /></span>{title}</div>
      {children}
    </div>
  );
}
```
```css
.wc-panel-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-sm);overflow:hidden}
.wc-admincard{padding:18px 20px}                 /* note: overrides the default .pad 16px */
.wc-admincard-h{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:800;letter-spacing:-.01em;margin-bottom:14px}
.wc-admincard-ic{width:30px;height:30px;border-radius:9px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
```
- Panel: white, 1px `--line` border, radius **16**, `--shadow-sm`, padding **18×20** (the `wc-admincard` rule wins over `.pad`). Title row: **16px/800** with a **30×30 / radius-9** orange-soft icon chip (`users` glyph, 17px).

---

## 3. The Users card markup

```jsx
const ORG_USERS = [
  { name: 'Joseph Velasquez', email: 'joseph@jovrealestate.com', role: 'Admin', team: 'Listings', office: 'Burbank HQ', status: 'Active', leads: 142, appts: 18, deals: 4, response: '42s', convo: '14.8%', revenue: '$1.24M' },
];
const ORG_ROLE_TONE = {
  Admin: { fg: '#0EA5E9', bg: '#E7F6FD' },
  Agent: { fg: '#0EA5E9', bg: '#E7F6FD' },
  ISA:   { fg: '#0D9488', bg: '#E3F6F2' },
};

<Card icon="users" title="Users" className="wc-orgcard">
  <div className="wc-admincard-h2-row">
    <span className="wc-band-d">Manage who has access to this workspace.</span>
    <button className="wc-primary wc-sm"><Icon name="plus" size={14} />Invite user</button>
  </div>
  <div className="wc-orgtable-wrap">
    <table className="wc-reptable">
      <thead>
        <tr>
          <th>User</th><th>Role</th><th>Team</th><th>Office</th><th>Status</th>
          <th>Leads</th><th>Appts</th><th>Deals</th><th>Lead→Appt</th><th>Avg Response</th><th>Revenue</th><th></th>
        </tr>
      </thead>
      <tbody>
        {ORG_USERS.map(u => {
          const rt = ORG_ROLE_TONE[u.role];
          const ini = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          return (
            <tr key={u.email}>
              <td>
                <div className="wc-goalrow-agent">
                  <span className="wc-agoal-lav">{ini}</span>
                  <div><div className="wc-agoal-row-t">{u.name}</div><div className="wc-band-d">{u.email}</div></div>
                </div>
              </td>
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
```

- **Header sub-row** (`.wc-admincard-h2-row`): space-between — caption "Manage who has access to this workspace." (grey `.wc-band-d`) on the left, an **Invite user** primary button (`.wc-primary.wc-sm`, plus icon) on the right.
- **Avatar initials** built from the name (first letter of up to two words, uppercased → "JV").
- **Role badge** colored from `ORG_ROLE_TONE` (Admin = sky `#0EA5E9` on `#E7F6FD`).
- **Status** "Active" → online style with a green dot before the word.
- **Stats** (Leads/Appts/Deals/Revenue bold, Lead→Appt/Avg Response regular) all in `.wc-mono`, right-aligned by the reptable rule.
- **Kebab** (`.wc-task-open`) trailing each row.

---

## 4. CSS — header sub-row, scroll wrapper, table, cells

```css
/* header sub-row */
.wc-admincard-h2-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.wc-band-d{font-size:12px;color:var(--ink-3);line-height:1.45;margin-top:2px}

/* primary button (Invite user) */
.wc-primary{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:11px;background:var(--accent);color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 16px rgba(249,115,22,.28);transition:.12s}
.wc-primary:hover{background:var(--accent-strong)}
.wc-sm{height:36px!important;padding:0 14px!important;font-size:13px!important}

/* horizontal scroll wrapper — table is wider than the card */
.wc-orgtable-wrap{border:1px solid var(--line);border-radius:13px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.wc-orgtable-wrap .wc-reptable{min-width:980px}
.wc-orgtable-wrap .wc-reptable th,
.wc-orgtable-wrap .wc-reptable td{white-space:nowrap}
.wc-orgtable-wrap .wc-reptable td{vertical-align:middle}

/* the table */
.wc-reptable{width:100%;border-collapse:collapse;font-size:13.5px}
.wc-reptable th{text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);padding:13px 18px;background:var(--line-soft);border-bottom:1px solid var(--line)}
.wc-reptable th:not(:first-child){text-align:right;width:130px}
.wc-reptable td{padding:13px 18px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
.wc-reptable td:not(:first-child){text-align:right}
.wc-reptable tr:last-child td{border-bottom:none}
.wc-reptable tbody tr:hover{background:var(--line-soft)}

/* agent (user) cell */
.wc-goalrow-agent{display:flex;align-items:center;gap:10px;font-weight:700}
.wc-agoal-lav{width:30px;height:30px;border-radius:50%;background:#EEECE8;color:#9A938A;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none}
.wc-agoal-row-t{font-size:13.5px;font-weight:700}

/* role badge */
.wc-cbadge{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px}

/* status */
.wc-actstatus{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-3);font-weight:600}
.wc-actstatus.is-online{color:#16A34A}
.wc-actdot-on{width:7px;height:7px;border-radius:50%;background:#16A34A}

/* kebab */
.wc-task-open{width:32px;height:32px;border-radius:8px;border:1px solid var(--line);display:grid;place-items:center;color:var(--ink-3);flex:none}
.wc-task-open:hover{border-color:var(--accent);color:var(--accent-strong)}
```

### Dimensions & behavior (encoded above)
- **Invite button:** primary orange, height **36** (the `.wc-sm` override), 13px text, plus icon; orange glow shadow.
- **Scroll wrapper:** its own 1px border + **radius 13**, `overflow-x:auto`. The inner table is forced to **min-width 980px**, so on a narrow card it **scrolls/swipes horizontally** to reveal the stat columns; cells are `white-space:nowrap`.
- **Table:** full width, 13.5px. Header cells uppercase 11px grey on a `--line-soft` strip with a bottom border; **first column left-aligned, every other column right-aligned** and ~130px wide. Body cells padded **13×18**, hairline row dividers, last row borderless, rows highlight `--line-soft` on hover.
- **User cell:** **30×30 round** initials avatar (`#EEECE8` bg, `#9A938A` text, 11px) + name (13.5px/700) and email (12px grey).
- **Role badge:** tiny pill, 10.5px/700, padding `2px 8px`, fully rounded, tinted per role.
- **Status:** 12.5px/600; "Active" turns green `#16A34A` with a **7×7** green dot before it.
- **Kebab:** **32×32 / radius-8** outlined button, grey `more` glyph; border + glyph turn orange on hover.

---

## 5. Token reference

```css
--accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
--panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
--ink:#191D29; --ink-2:#586173; --ink-3:#878FA0;
--shadow-sm:0 1px 2px rgba(20,24,38,.05);
/* role badge (Admin): #0EA5E9 on #E7F6FD · online green: #16A34A */
```

### Acceptance
- [ ] White card, "Users" title + orange people-icon chip, padding 18×20.
- [ ] Header sub-row: grey caption left, orange **Invite user** button (36px) right.
- [ ] 12-column table inside a bordered (radius-13) wrapper that **scrolls horizontally** (table min-width 980px) to reveal Leads/Appts/Deals/Lead→Appt/Avg Response/Revenue.
- [ ] One row — **Joseph Velasquez** — with JV avatar + email, sky **Admin** badge, Listings/Burbank HQ, green-dot **Active**, and mono stats `142 / 18 / 4 / 14.8% / 42s / $1.24M`, ending in a kebab.
- [ ] Header cells uppercase grey on `--line-soft`; non-first columns right-aligned; rows hover-highlight.
- [ ] All sizes/colors match §4 exactly.
```
