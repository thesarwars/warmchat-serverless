# "Create Workflow From Template → Choose a Template" Modal — Complete Build Spec

Self-contained spec to rebuild the **Browse Templates** modal in WarmChats. It opens from the Outbound tab's **"+ Add workflow → Browse templates"** action. The user picks one of **9 proven follow-up sequences**, toggles between the **SMS** and **Email** version, expands any card to read every step (with real computed send dates), and clicks **Use template** to seed the Create-Workflow wizard.

Stack: **React 18 (inline JSX / Babel)**. Styling via a shared global `<style>` block, class prefix `wc-wft-`. Icons via `<Icon name size />`. State hooks `const { useState: useAS } = React;`. Component: `BrowseTemplatesModal` → many `WfTemplateCard`.

---

## 0. Design tokens used

```css
--accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
--blue:#0EA5E9; --blue-bg:#E7F6FD; --violet:#7C5CFC; --violet-bg:#EEEAFE;
--green:#0E9F6E; --green-bg:#E4F7EF;
--ink:#191D29; --ink-2:#586173; --ink-3:#878FA0;
--panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8;
--mono:ui-monospace,"JetBrains Mono","SF Mono",Menlo,monospace;
--shadow-lg:0 18px 50px rgba(20,24,38,.15);
```

---

## 1. Modal structure (JSX)

```jsx
function BrowseTemplatesModal({ onClose, onUse, templates }) {
  const [channel, setChannel] = useState('sms');               // 'sms' | 'email'
  const list = templates && templates.length ? templates : OUTBOUND_TEMPLATES;
  return (
    <div className="wc-wft-overlay" onClick={onClose}>
      <div className="wc-wft-modal" onClick={e => e.stopPropagation()}>
        <div className="wc-wft-topbar">
          <div className="wc-wft-eyebrow"><Icon name="arrowRight" size={18} style={{ color:'var(--accent-strong)' }} /> Create Workflow From Template</div>
          <button className="wc-wft-close" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
        <h2 className="wc-wft-h">Choose a Template</h2>
        <p className="wc-wft-sub">Pick a proven follow-up sequence. Switch channel to preview the SMS or Email version.</p>
        <div className="wc-wft-chrow"><ChannelToggle value={channel} onChange={setChannel} /></div>
        <div className="wc-wft-grid">
          {list.map(t => <WfTemplateCard key={t.id} t={t} channel={channel} onUse={onUse} />)}
        </div>
        <div className="wc-wft-foot">
          <button className="wc-wft-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- **Overlay** = full-screen scrim, click closes. **Modal** stops propagation.
- **Top bar:** eyebrow heading "Create Workflow From Template" (with an orange `arrowRight` icon) on the left, a **✕** close button on the right.
- **Title** `<h2>` "Choose a Template" (34px/800), **sub** paragraph (16px, `--ink-3`).
- **Channel row:** a single `ChannelToggle` (SMS / Email pill switch). Switching it re-renders every card in the chosen channel.
- **Grid:** 2 columns of `WfTemplateCard`, collapses to 1 column ≤820px.
- **Sticky footer:** a single **Cancel** button (left-aligned).

---

## 2. Modal CSS (verbatim)

```css
.wc-wft-overlay{position:fixed;inset:0;background:rgba(20,24,38,.5);display:flex;align-items:flex-start;justify-content:center;z-index:1000;padding:48px 24px;overflow-y:auto}
.wc-wft-modal{background:var(--panel);border-radius:22px;width:100%;max-width:980px;box-shadow:var(--shadow-lg);padding:34px 36px 0;display:flex;flex-direction:column;min-height:min(86vh,760px)}
.wc-wft-topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}
.wc-wft-eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:19px;font-weight:800;color:var(--ink);letter-spacing:-.01em}
.wc-wft-close{width:38px;height:38px;display:grid;place-items:center;border:none;background:none;color:var(--ink-3);border-radius:10px;cursor:pointer;transition:.14s}
.wc-wft-close:hover{background:var(--line-soft);color:var(--ink)}
.wc-wft-h{font-size:34px;font-weight:800;letter-spacing:-.02em;color:var(--ink);margin:0 0 8px}
.wc-wft-sub{font-size:16px;color:var(--ink-3);margin:0 0 26px;line-height:1.5}
.wc-wft-chrow{display:flex;margin:0 0 22px}
.wc-wft-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;flex:1}
@media (max-width:820px){.wc-wft-grid{grid-template-columns:1fr}}
.wc-wft-card{border:1px solid var(--line);border-radius:18px;background:var(--panel);padding:22px;align-self:start;transition:border-color .15s,background .15s}
.wc-wft-card.is-open{border-color:var(--accent);background:var(--accent-soft)}
.wc-wft-head{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px}
.wc-wft-tile{width:50px;height:50px;border-radius:14px;display:grid;place-items:center;flex:none}
.wc-wft-info{min-width:0}
.wc-wft-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:5px}
.wc-wft-title{font-size:19px;font-weight:800;color:var(--ink);letter-spacing:-.01em}
.wc-wft-meta{font-size:14.5px;color:var(--ink-3);line-height:1.4}
.wc-wft-use{flex:none;align-self:start;padding:12px 22px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(249,115,22,.25);transition:.14s}
.wc-wft-use:hover{background:var(--accent-strong)}
.wc-wft-viewsteps{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:18px;padding:13px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink-2);font-size:14.5px;font-weight:700;cursor:pointer;transition:.15s}
.wc-wft-viewsteps:hover{border-color:var(--accent)}
.wc-wft-steps{margin-top:20px;display:flex;flex-direction:column}
.wc-wft-step{display:flex;gap:16px}
.wc-wft-rail{display:flex;flex-direction:column;align-items:center;flex:none}
.wc-wft-node{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#fff;font-size:14px;font-weight:800;flex:none}
.wc-wft-line{width:2px;flex:1;min-height:16px;background:#F2C9A8;margin:4px 0}
.wc-wft-step-body{flex:1;min-width:0;padding-bottom:22px}
.wc-wft-step:last-child .wc-wft-step-body{padding-bottom:6px}
.wc-wft-step-when{font-size:15.5px;color:var(--ink-2);margin-bottom:5px}
.wc-wft-step-when strong{color:var(--ink);font-weight:800}
.wc-wft-step-text{font-size:15.5px;line-height:1.5;color:var(--ink-2)}
.wc-wft-foot{position:sticky;bottom:0;background:var(--panel);padding:22px 0;margin-top:8px;display:flex}
.wc-wft-cancel{padding:12px 24px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink-2);font-size:15px;font-weight:700;cursor:pointer;transition:.14s}
.wc-wft-cancel:hover{background:var(--line-soft);color:var(--ink)}
```

**Dimensions at a glance:** modal max-width **980px**, padding **34px 36px 0**, radius **22px**, min-height **min(86vh,760px)**. Overlay padding 48px top/bottom. Cards radius **18px**, padding **22px**, gap **22px**. Icon tile **50×50** radius 14. Step node **30px** circle, connector line **2px** in `#F2C9A8`.

---

## 3. `ChannelToggle` (SMS / Email pill switch)

```jsx
const TEMPLATE_CH = {
  sms:   { label:'SMS',   icon:'message', bg:'#5BB4E3',       fg:'#fff' },
  email: { label:'Email', icon:'mail',    bg:'var(--accent)', fg:'#fff' },
};
function ChannelToggle({ value, onChange }) {
  return (
    <div className="wc-tpl-chtoggle">
      {['sms','email'].map(ch => {
        const c = TEMPLATE_CH[ch]; const on = value === ch;
        return (
          <button key={ch} className={'wc-tpl-chbtn' + (on?' is-on':'')} style={on?{background:c.bg,color:c.fg}:null} onClick={() => onChange(ch)}>
            <Icon name={c.icon} size={13} />{c.label}
          </button>
        );
      })}
    </div>
  );
}
```
```css
.wc-tpl-chtoggle{display:inline-flex;background:var(--line-soft);border:1px solid var(--line);border-radius:999px;padding:3px;gap:2px}
.wc-tpl-chbtn{display:inline-flex;align-items:center;gap:5px;padding:6px 13px;border-radius:999px;font-size:12.5px;font-weight:700;color:var(--ink-3);background:none;cursor:pointer;transition:.14s;line-height:1}
.wc-tpl-chbtn:hover:not(.is-on){color:var(--ink-2)}
```
Active pill: **SMS** = sky `#5BB4E3` bg / white text; **Email** = orange `--accent` bg / white text. `ChannelPill` (used inside each card's title row) shares `TEMPLATE_CH` colors — small variant: `padding:3px 8px; font-size:11px; border-radius:999px`, icon + label.

---

## 4. `WfTemplateCard`

```jsx
function WfTemplateCard({ t, channel, onUse }) {
  const [open, setOpen] = useState(false);
  const meta = WF_TEMPLATE_META[t.id] || { icon:'layers', tone:'orange' };
  const tone = WF_TONES[meta.tone];
  const flow = (channel === 'email' && Array.isArray(t.emailFlow)) ? t.emailFlow : t.flow;
  return (
    <div className={'wc-wft-card' + (open?' is-open':'')}>
      <div className="wc-wft-head">
        <span className="wc-wft-tile" style={{ background:tone.bg, color:tone.fg }}><Icon name={meta.icon} size={22} /></span>
        <div className="wc-wft-info">
          <div className="wc-wft-title-row">
            <span className="wc-wft-title">{t.name}</span>
            <ChannelPill channel={channel} size="sm" />
          </div>
          <div className="wc-wft-meta">{flow.length} steps · {runsLabel(flow)} · Stops on reply</div>
        </div>
        <button className="wc-wft-use" onClick={() => onUse && onUse(t, channel)}>Use template</button>
      </div>
      <button className="wc-wft-viewsteps" onClick={() => setOpen(o => !o)}>
        {open ? 'Hide steps' : 'View steps'}
        <Icon name="chevronDown" size={16} style={{ transition:'transform .2s', transform: open?'rotate(180deg)':'none' }} />
      </button>
      {open && (
        <div className="wc-wft-steps">
          {flow.map((s, i) => (
            <div className="wc-wft-step" key={i}>
              <div className="wc-wft-rail">
                <span className="wc-wft-node">{i + 1}</span>
                {i < flow.length - 1 && <span className="wc-wft-line" />}
              </div>
              <div className="wc-wft-step-body">
                <div className="wc-wft-step-when">
                  {s.instant
                    ? <React.Fragment><strong>Instant</strong> · sends instantly</React.Fragment>
                    : <React.Fragment><strong>{s.day}</strong> · {stepDate(dayOffset(s.day))} · {SEND_TIME}</React.Fragment>}
                </div>
                <div className="wc-wft-step-text">
                  {s.subject != null
                    ? <React.Fragment><strong>{s.subject}</strong><br /><VarText text={s.body} /></React.Fragment>
                    : <VarText text={s.text} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Card anatomy:**
- **Head** = 3-col grid `auto 1fr auto`: tone-colored **icon tile** (50×50) · **info** (title + `ChannelPill` + meta line) · **"Use template"** orange button (calls `onUse(t, channel)`).
- **Meta line** = `{N} steps · {runsLabel} · Stops on reply`.
- **"View steps / Hide steps"** full-width toggle button (chevron rotates 180° when open). When open the whole card turns orange-tinted (`.is-open` → `border-color:var(--accent); background:var(--accent-soft)`).
- **Steps** = vertical numbered timeline; each step shows a **when** line and the **message text**. For **email** the step shows the **Subject in bold** then the body; for SMS just the text. `{{variables}}` render as orange mono chips via `VarText`/`.wc-tpl-var`.

### Per-card icon + tone — `WF_TEMPLATE_META`
| id | name | icon | tone |
|----|------|------|------|
| t1 | Buyer Follow-Up | `users` | orange |
| t2 | Buyer Appointment Push | `users` | blue |
| t3 | Seller Follow-Up | `home` | orange |
| t4 | Seller Appointment Push | `home` | orange |
| t5 | Re-engagement Campaign | `refresh` | violet |
| t6 | Open House Follow-Up | `home` | green |
| t7 | Cold Lead Nurture | `target` | blue |
| t8 | Past Client | `star` | violet |
| t9 | Long-Term Nurture | `clock` | green |

```js
const WF_TONES = {
  orange:{ bg:'var(--accent-soft)', fg:'var(--accent-strong)' },
  blue:  { bg:'var(--blue-bg)',     fg:'var(--blue)' },
  violet:{ bg:'var(--violet-bg)',   fg:'var(--violet)' },
  green: { bg:'var(--green-bg)',    fg:'var(--green)' },
};
```

### Helpers
```js
const SEND_TIME = '10:00 AM';   // all non-instant steps send at 10 AM in the lead's timezone
function dayOffset(dayStr){ const m=String(dayStr).match(/(\d+)/); return m?parseInt(m[1],10):0; }
function runsLabel(flow){
  const d = dayOffset(flow[flow.length-1].day);
  if (d===0)  return 'Same day';
  if (d>=60)  return 'Runs over ' + Math.round(d/30) + ' months';
  return 'Runs over ' + d + ' days';
}
function stepDate(offset){ const dt=new Date(); dt.setDate(dt.getDate()+offset); return dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }
function VarText({ text }){ return String(text).split(/(\{\{[^}]+\}\})/g).map((p,i)=>/^\{\{[^}]+\}\}$/.test(p)?<span key={i} className="wc-tpl-var">{p}</span>:<React.Fragment key={i}>{p}</React.Fragment>); }
```
```css
.wc-tpl-var{font-family:var(--mono);font-size:.86em;font-weight:600;color:var(--accent-strong);background:var(--accent-soft);padding:2px 6px;border-radius:6px;white-space:nowrap}
```
> Note: each card derives `runsLabel` from its **last step's day**. SMS flows mostly run Day 0→7 ("Runs over 7 days"); t8/t9 run to Day 365 / Month 6 ("Runs over N months"). Step "when" uses real dates from `stepDate(dayOffset(day))` so the preview always shows upcoming calendar dates.

---

## 5. The 9 templates — full data (`OUTBOUND_TEMPLATES`)

Each template: `{ id, channel:'sms', name, stage, sent, message, flow:[…5 SMS…], emailSent, emailFlow:[…5 Email…] }`.
SMS step: `{ day, instant?, channel:'sms', text }`. Email step: `{ day, instant?, channel:'email', subject, body }` (`\n` = line break; `•` lines render as bullets). Variables: `{{first_name}}`, `{{area}}`, `{{agent_name}}`.

> The exact copy for all 5 SMS + 5 Email steps of every template lives in `OUTBOUND_TEMPLATES` in `agents.jsx` — reproduce it verbatim. Summary of each (stage · counts · cadence):

| # | id | Name | Stage | SMS sent | Email sent | SMS cadence | Email cadence |
|---|----|------|-------|----------|-----------|-------------|---------------|
| 1 | t1 | Buyer Follow-Up | BUYER | 412 | 268 | Day 0/1/3/5/7 | Day 0/2/4/6/8 |
| 2 | t2 | Buyer Appointment Push | BUYER | 286 | 191 | Day 0/1/3/5/7 | Day 0/1/3/5/7 |
| 3 | t3 | Seller Follow-Up | SELLER | 198 | 142 | Day 0/1/3/5/7 | Day 0/2/4/6/8 |
| 4 | t4 | Seller Appointment Push | SELLER | 154 | 108 | Day 0/1/3/5/7 | Day 0/2/4/6/8 |
| 5 | t5 | Re-engagement Campaign | RE-ENGAGE | 132 | 96 | Day 0/1/3/5/7 | Day 0/2/4/6/8 |
| 6 | t6 | Open House Follow-Up | NURTURE | 119 | 84 | Day 0/1/3/5/7 | Day 0/1/3/5/7 |
| 7 | t7 | Cold Lead Nurture | COLD | 97 | 71 | Day 0/1/3/5/7 | Day 0/3/7/14/21 |
| 8 | t8 | Past Client | PAST CLIENT | 64 | 53 | Day 0/30/90/180/365 | Day 0/30/60/90/120 |
| 9 | t9 | Long-Term Nurture | NURTURE | 48 | 39 | Day 0/30/60/90/120 | Month 1/2/3/4/6 |

Representative step copy (SMS step 1 / opening `message` of each — full 5-step bodies are in source):
- **t1** "Hey {{first_name}}, saw you were interested in homes in {{area}} — are you looking to buy soon or just browsing?"
- **t2** "Hey {{first_name}}, would you be open to touring a few homes this week?"
- **t3** "Hey {{first_name}}, I saw you were interested in your home value. Are you just curious, or thinking about selling soon?"
- **t4** "Hey {{first_name}}, based on what you shared, it may be worth taking a closer look at your home's value. Would you be open to a quick 10–15 minute call…?"
- **t5** "Hey {{first_name}}, are you still looking to buy, or did you already find a house?"
- **t6** "Hey {{first_name}}, it was great meeting you at the open house! Would you like me to send you similar homes that pop up?"
- **t7** "Hey {{first_name}}, just wanted to check in. Are you still thinking about making a move, or has that been put on hold for now?"
- **t8** "Hey {{first_name}}, hope everything has been going well since your move. Just wanted to check in and see how things are going."
- **t9** "Hey {{first_name}}, thanks again for chatting with me. I know your timeline may be a little further out, but I'm here whenever you're ready."

Email steps carry a `subject` + multi-line `body`; e.g. t1 email step 1 subject "A few homes you might like", t4 email step 3 uses a bulleted body (Estimated value / Nearby sales / What buyers are paying / Possible net proceeds).

---

## 6. "Use template" behavior (host wiring)

`onUse(t, channel)` (passed by the parent page) seeds the Create-Workflow wizard and closes this modal:
```js
onUse = (t, chan) => {
  const useChan = chan || t.channel || 'sms';
  const flow = (useChan === 'email' && Array.isArray(t.emailFlow)) ? t.emailFlow : t.flow;
  // → set workflowName from t.name, workflowChannels/msgChannel from useChan,
  //   workflowMessage/emailSubject from flow[0], tplFollowUps from flow.slice(1),
  //   open the wizard at step 1, close BrowseTemplatesModal.
};
```
The chosen **channel** (SMS or Email) determines which flow is copied in.

---

## 7. Acceptance checklist
- [ ] Modal: 980px, radius 22px, scrim click + ✕ + Cancel all close it; eyebrow "Create Workflow From Template", title "Choose a Template", sub line present.
- [ ] Channel toggle switches SMS (sky)/Email (orange); every card re-renders to that channel (pill + steps + meta count).
- [ ] Exactly **9 cards** in a 2-col grid (1-col ≤820px), each with the correct icon tile color (t1 orange, t2 blue, t3/t4 orange, t5 violet, t6 green, t7 blue, t8 violet, t9 green).
- [ ] Each card meta reads "{N} steps · {runs} · Stops on reply"; t8/t9 show "Runs over N months".
- [ ] View steps expands a numbered timeline; card turns orange-tinted; chevron flips; Hide steps collapses.
- [ ] Steps show "Instant · sends instantly" for step 1, "Day N · {date} · 10:00 AM" otherwise; email steps show bold Subject + body; `{{variables}}` render as orange mono chips.
- [ ] "Use template" seeds the wizard with the card's name + selected-channel flow and closes the modal.
