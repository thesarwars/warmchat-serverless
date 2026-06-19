# Outbound "Templates" Tab — Complete Build Spec

Self-contained spec to rebuild the **Templates** tab inside the Outbound area of WarmChats. It shows a grid of reusable message-template cards (the same `OUTBOUND_TEMPLATES` library — 9 by default), each previewable in **SMS** or **Email**, expandable to read the full send sequence, and **editable / deletable / creatable** via modals. Header line: **"{N} templates · variables like `{{first_name}}` fill in automatically"**.

Stack: **React 18 (inline JSX / Babel)**. Styling via a shared global `<style>` block, class prefix `wc-tpl-`. Icons via `<Icon name size />`. State hooks `const { useState: useAS } = React;`.

Component tree: `TemplatesTab` → `TemplateCard` × N → (`TemplateFlow`, `TemplateEditModal`, `ConfirmDelete`); plus a standalone `TemplateCreateModal` opened from the header's **New template** button. Shared helpers: `ChannelToggle`, `ChannelPill`, `VarText`, `MsgBody`, `StepContent`, `TEMPLATE_CH`.

---

## 0. Design tokens used

```css
--accent:#F97316; --accent-strong:#EA580C; --accent-soft:#FFF3EA;
--ink:#191D29; --ink-2:#586173; --ink-3:#878FA0; --ink-faint:#B4BAC6;
--panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8; --line-strong:#D8D4CD;
--mono:ui-monospace,"JetBrains Mono","SF Mono",Menlo,monospace;
--shadow-sm:0 1px 2px rgba(20,24,38,.05); --shadow:0 4px 16px rgba(20,24,38,.07); --shadow-lg:0 18px 50px rgba(20,24,38,.15);
/* danger red used in template UI: #E0524B (hover #C8362F), tints #FDECEA / border #F6C9C4 */
```

---

## 1. `TemplatesTab` (wrapper)

```jsx
function TemplatesTab({ list, setList, onNew }) {
  const updateT = (id, patch) => setList(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  const removeT = (id)        => setList(prev => prev.filter(t => t.id !== id));
  return (
    <div className="wc-tpl-wrap">
      <div className="wc-tpl-head">
        <div className="wc-tpl-headline">
          <strong>{list.length} templates</strong>
          <span className="wc-tpl-sub"> · variables like <span className="wc-tpl-var">{'{{first_name}}'}</span> fill in automatically</span>
        </div>
        <div className="wc-tpl-head-r">
          <button className="wc-tpl-new" onClick={onNew}><Icon name="plus" size={17} />New template</button>
        </div>
      </div>
      <div className="wc-tpl-grid">
        {list.map(t => <TemplateCard key={t.id} t={t} onSave={p => updateT(t.id, p)} onDelete={() => removeT(t.id)} />)}
      </div>
    </div>
  );
}
```

- **Header** (`.wc-tpl-head`): left = headline ("**9 templates**" bold + muted " · variables like `{{first_name}}` fill in automatically", with the variable rendered as an orange mono chip `.wc-tpl-var`). Right = orange **"+ New template"** button (`.wc-tpl-new`, opens `TemplateCreateModal` via `onNew`).
- **Grid** (`.wc-tpl-grid`): 2 columns, collapses to 1 ≤900px, 20px gap.
- The parent owns the list state: `const [tplList, setTplList] = useState(OUTBOUND_TEMPLATES);` and passes `onNew` that opens the create modal. New templates are prepended (`onCreate` → `setTplList(prev => [created, ...prev])`).

```css
.wc-tpl-wrap{display:flex;flex-direction:column}
.wc-tpl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:22px}
.wc-tpl-headline{font-size:15px;color:var(--ink-3);line-height:1.5;padding-top:6px}
.wc-tpl-headline strong{color:var(--ink);font-weight:800}
.wc-tpl-sub{color:var(--ink-3)}
.wc-tpl-var{font-family:var(--mono);font-size:.86em;font-weight:600;color:var(--accent-strong);background:var(--accent-soft);padding:2px 6px;border-radius:6px;white-space:nowrap}
.wc-tpl-head-r{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.wc-tpl-new{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;font-size:14px;font-weight:700;color:#fff;background:var(--accent);border:none;border-radius:11px;cursor:pointer;box-shadow:0 2px 8px rgba(249,115,22,.32);transition:.14s}
.wc-tpl-new:hover{background:var(--accent-strong)}
.wc-tpl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
@media (max-width:900px){.wc-tpl-grid{grid-template-columns:1fr}}
```

---

## 2. `TemplateCard`

```jsx
function TemplateCard({ t, onSave, onDelete }) {
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const hasEmail = Array.isArray(t.emailFlow);
  const [ch, setCh] = useState(t.channel || 'sms');
  const flow      = ch === 'email' && hasEmail ? t.emailFlow : t.flow;
  const sentCount = ch === 'email' && hasEmail ? t.emailSent : t.sent;
  const first     = flow[0];
  return (
    <div className={'wc-tpl-card' + (open ? ' is-open' : '')}>
      <div className="wc-tpl-top">
        {hasEmail ? <ChannelToggle value={ch} onChange={setCh} /> : <ChannelPill channel={ch} />}
        <div className="wc-tpl-acts">
          <button className="wc-tpl-iconbtn" title="Edit template" onClick={() => setEditing(true)}><Icon name="pencil" size={16} /></button>
          <button className="wc-tpl-iconbtn is-danger" title="Delete template" onClick={() => setConfirmDel(true)}><Icon name="trash" size={16} /></button>
        </div>
      </div>
      <div className="wc-tpl-title">{t.name}</div>
      <div className="wc-tpl-stage">{t.stage} · {sentCount} SENT · {flow.length} MSGS</div>
      <div className="wc-tpl-msg">
        <div className="wc-tpl-msg-label">{ch === 'email' ? 'First email' : 'First message'}</div>
        {ch === 'email'
          ? <div className="wc-tpl-msg-body"><div className="wc-tpl-subj"><span className="wc-tpl-subj-k">Subject:</span> <VarText text={first.subject} /></div><div className="wc-tpl-emailbody"><MsgBody text={first.body} /></div></div>
          : <div className="wc-tpl-msg-body"><VarText text={first.text} /></div>}
      </div>
      <button className="wc-tpl-view" onClick={() => setOpen(o => !o)}>
        <Icon name="layers" size={16} />{open ? 'Hide template' : 'View template'}
        <Icon name="chevronDown" size={15} style={{ marginLeft:'2px', transition:'transform .2s', transform: open?'rotate(180deg)':'none' }} />
      </button>
      {open && <TemplateFlow flow={flow} />}
      {editing && <TemplateEditModal t={t} ch={ch} onClose={() => setEditing(false)} onSave={onSave} />}
      {confirmDel && <ConfirmDelete name={t.name} onCancel={() => setConfirmDel(false)} onConfirm={() => { setConfirmDel(false); onDelete(); }} />}
    </div>
  );
}
```

**Anatomy (top → bottom):**
1. **Top row** (`.wc-tpl-top`): if the template has both channels (`emailFlow` present) → a **`ChannelToggle`** (SMS/Email pill switch); else a static **`ChannelPill`**. Right side: **Edit** (pencil) + **Delete** (red trash) icon buttons (`.wc-tpl-iconbtn`).
2. **Title** (`.wc-tpl-title`, 20px/800).
3. **Stage meta** (`.wc-tpl-stage`): `{stage} · {sentCount} SENT · {flow.length} MSGS` (uppercase, letter-spaced). `sentCount` switches between `t.sent` (SMS) and `t.emailSent` (Email) with the toggle.
4. **First-message preview** (`.wc-tpl-msg`, gray rounded panel): label "FIRST MESSAGE" / "FIRST EMAIL"; SMS shows the text, Email shows **Subject:** line + body (via `MsgBody`). `{{vars}}` highlighted by `VarText`.
5. **"View template / Hide template"** button (`.wc-tpl-view`, orange, `layers` icon + chevron that flips). Expands `TemplateFlow`. When open the card gets `.is-open` (orange border + soft orange shadow).
6. Conditionally renders `TemplateEditModal` and `ConfirmDelete`.

```css
.wc-tpl-card{border:1px solid var(--line);border-radius:18px;background:var(--panel);box-shadow:var(--shadow-sm);padding:22px 24px;display:flex;flex-direction:column;align-self:start;transition:border-color .15s,box-shadow .15s}
.wc-tpl-card:hover{border-color:var(--line-strong);box-shadow:var(--shadow)}
.wc-tpl-card.is-open{border-color:var(--accent);box-shadow:0 6px 24px rgba(249,115,22,.12)}
.wc-tpl-top{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}
.wc-tpl-title{font-size:20px;font-weight:800;color:var(--ink);line-height:1.25;letter-spacing:-.01em;margin-bottom:10px}
.wc-tpl-acts{display:flex;gap:8px;flex:none}
.wc-tpl-iconbtn{width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink-2);cursor:pointer;transition:.14s}
.wc-tpl-iconbtn:hover{background:var(--line-soft);color:var(--ink)}
.wc-tpl-iconbtn.is-danger{color:#E0524B}
.wc-tpl-iconbtn.is-danger:hover{background:#FDECEA;border-color:#F6C9C4;color:#C8362F}
.wc-tpl-stage{font-size:13px;font-weight:700;letter-spacing:.06em;color:var(--ink-3);margin-bottom:14px}
.wc-tpl-msg{background:var(--line-soft);border-radius:14px;padding:16px 18px}
.wc-tpl-msg-label{font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}
.wc-tpl-msg-body{font-size:16px;line-height:1.5;color:var(--ink-2)}
.wc-tpl-subj{font-size:15px;color:var(--ink);margin-bottom:6px}
.wc-tpl-subj-k{font-weight:800;color:var(--ink-3);font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;margin-right:2px}
.wc-tpl-emailbody>div{font-size:15px;line-height:1.55;color:var(--ink-2)}
.wc-tpl-emailbody>div:empty{height:8px}
.wc-tpl-bullet{padding-left:6px}
.wc-tpl-view{display:inline-flex;align-items:center;gap:9px;align-self:flex-start;margin-top:16px;padding:6px 2px;font-size:15px;font-weight:800;color:var(--accent-strong);background:none;border:none;cursor:pointer}
.wc-tpl-view:hover{color:var(--accent)}
```

---

## 3. `TemplateFlow` (expanded send sequence)

```jsx
function TemplateFlow({ flow }) {
  return (
    <div className="wc-tpl-flow">
      <div className="wc-tpl-flow-h">
        <span>Send sequence · {flow.length} {flow.length === 1 ? 'message' : 'messages'}</span>
        <span className="wc-tpl-flow-tz"><Icon name="clock" size={12} />Times in the lead's timezone</span>
      </div>
      <div className="wc-tpl-steps">
        {flow.map((s, i) => (
          <div className="wc-tpl-step" key={i}>
            <div className="wc-tpl-rail">
              <span className="wc-tpl-node" style={{ background: TEMPLATE_CH[s.channel].bg }}>{i + 1}</span>
              {i < flow.length - 1 && <span className="wc-tpl-line" />}
            </div>
            <div className="wc-tpl-step-body">
              <div className="wc-tpl-step-meta">
                <span className="wc-tpl-day">{s.day}</span>
                <span className="wc-tpl-dot">·</span>
                {s.instant
                  ? <span className="wc-tpl-time is-instant"><Icon name="zap" size={12} />Send instantly</span>
                  : <span className="wc-tpl-time"><Icon name="clock" size={12} />{s.time || SEND_TIME}</span>}
                <ChannelPill channel={s.channel} size="sm" />
              </div>
              <StepContent s={s} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- Dashed top divider + slide-in animation (`wcTplDrop`).
- Header: "Send sequence · N messages" + a right "Times in the lead's timezone" note (clock icon).
- Each step: numbered **node** colored by the step's channel (`TEMPLATE_CH[channel].bg` — SMS sky `#5BB4E3`, Email orange), connector **line**, a **meta row** (bold `day` · instant-zap or clock+time · `ChannelPill`), and **`StepContent`** (SMS text, or Email "Subject:" + body).

```css
.wc-tpl-flow{margin-top:18px;padding-top:18px;border-top:1px dashed var(--line);animation:wcTplDrop .22s ease}
@keyframes wcTplDrop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.wc-tpl-flow-h{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:16px}
.wc-tpl-flow-tz{display:inline-flex;align-items:center;gap:5px;font-weight:700;letter-spacing:.02em;text-transform:none;color:var(--ink-faint)}
.wc-tpl-steps{display:flex;flex-direction:column}
.wc-tpl-step{display:flex;gap:14px}
.wc-tpl-rail{display:flex;flex-direction:column;align-items:center;flex:none}
.wc-tpl-node{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:800;flex:none;box-shadow:0 0 0 4px var(--panel)}
.wc-tpl-line{width:2px;flex:1;min-height:14px;background:var(--line);margin:4px 0}
.wc-tpl-step-body{flex:1;min-width:0;padding-bottom:18px}
.wc-tpl-step:last-child .wc-tpl-step-body{padding-bottom:0}
.wc-tpl-step-meta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:6px}
.wc-tpl-day{font-size:13.5px;font-weight:800;color:var(--ink)}
.wc-tpl-dot{color:var(--ink-faint)}
.wc-tpl-time{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;color:var(--ink-3)}
.wc-tpl-time.is-instant{color:var(--accent-strong);font-weight:700}
.wc-tpl-step-text{font-size:14.5px;line-height:1.5;color:var(--ink-2)}
.wc-tpl-step-text .wc-tpl-emailbody>div{font-size:14.5px}
```

---

## 4. Shared sub-components & helpers

```jsx
const TEMPLATE_CH = {
  sms:   { label:'SMS',   icon:'message', bg:'#5BB4E3',       fg:'#fff' },
  email: { label:'Email', icon:'mail',    bg:'var(--accent)', fg:'#fff' },
};

function StepContent({ s }) {
  if (s.subject != null) return (
    <div className="wc-tpl-step-text">
      <div className="wc-tpl-subj"><span className="wc-tpl-subj-k">Subject:</span> <VarText text={s.subject} /></div>
      <div className="wc-tpl-emailbody"><MsgBody text={s.body} /></div>
    </div>
  );
  return <div className="wc-tpl-step-text"><VarText text={s.text} /></div>;
}

function VarText({ text }) {       // highlights {{tokens}} as orange mono chips
  return String(text).split(/(\{\{[^}]+\}\})/g).map((p,i) =>
    /^\{\{[^}]+\}\}$/.test(p) ? <span key={i} className="wc-tpl-var">{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>);
}
function MsgBody({ text }) {        // splits on \n; lines starting with • get .wc-tpl-bullet
  return String(text).split('\n').map((ln,i) =>
    <div key={i} className={ln.trim().startsWith('\u2022') ? 'wc-tpl-bullet' : undefined}><VarText text={ln} /></div>);
}
function ChannelPill({ channel, size }) { /* rounded pill, TEMPLATE_CH colors; size="sm" smaller */ }
function ChannelToggle({ value, onChange }) { /* SMS/Email pill switch — see §below */ }
```

**`ChannelToggle`** (`.wc-tpl-chtoggle` / `.wc-tpl-chbtn`): two pills inside a gray rounded track; active pill takes the channel's `bg`/`fg` (SMS sky, Email orange).
```css
.wc-tpl-chtoggle{display:inline-flex;background:var(--line-soft);border:1px solid var(--line);border-radius:999px;padding:3px;gap:2px}
.wc-tpl-chbtn{display:inline-flex;align-items:center;gap:5px;padding:6px 13px;border-radius:999px;font-size:12.5px;font-weight:700;color:var(--ink-3);background:none;cursor:pointer;transition:.14s;line-height:1}
.wc-tpl-chbtn:hover:not(.is-on){color:var(--ink-2)}
```

**AI-draft helpers** (used by the create modal's “AI assist” button) — verbatim data:
```js
const TPL_SMS_DRAFTS = [
  "Hey {{first_name}}, just checking in — are you still exploring homes in {{area}}? Happy to help however I can.",
  "Hi {{first_name}}, wanted to follow up. Any questions I can answer for you about {{area}}?",
  "Hey {{first_name}}, a few new options just came up that might be a great fit. Want me to send them over?",
  "Hi {{first_name}}, no rush at all — what's your timeline looking like right now?",
  "Hey {{first_name}}, I don't want to bug you. Feel free to reach out anytime if things change!",
];
const TPL_EMAIL_DRAFTS = [
  { subject: "A few homes you might like", body: "Hey {{first_name}},\nI came across a few homes that match what you're looking for in {{area}}. Want me to send them your way?\n— {{agent_name}}" },
  { subject: "Quick question for you", body: "Hi {{first_name}},\nJust wanted to check — are you actively looking right now, or still exploring your options?\n— {{agent_name}}" },
  { subject: "Good opportunities right now", body: "Hey {{first_name}},\nA few well-priced homes just hit the market in {{area}}. If you'd like, I can send you the best ones.\n— {{agent_name}}" },
  { subject: "Still here to help", body: "Hey {{first_name}},\nWhenever the timing feels right, I'm here to help answer questions and guide you through the process.\n— {{agent_name}}" },
];
function tplAiDraft(channel, idx){ return channel==='email' ? TPL_EMAIL_DRAFTS[idx%TPL_EMAIL_DRAFTS.length] : { text: TPL_SMS_DRAFTS[idx%TPL_SMS_DRAFTS.length] }; }
function tplFmtTime(hhmm){ const [h,m]=String(hhmm).split(':').map(Number); const ap=h>=12?'PM':'AM'; const hh=((h+11)%12)+1; return hh+':'+String(m||0).padStart(2,'0')+' '+ap; } // "13:00" → "1:00 PM"
function tplParseHHMM(str){ const m=String(str||'').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); if(!m) return '10:00'; let h=+m[1]; const min=m[2]; const ap=(m[3]||'').toUpperCase(); if(ap==='PM'&&h<12)h+=12; if(ap==='AM'&&h===12)h=0; return String(h).padStart(2,'0')+':'+min; } // "10:00 AM PST" → "10:00"
function tplParseTZ(str){ const m=String(str||'').match(/\b(PST|EST|CST|MST)\b/); return m?m[1]:'PST'; }
const SEND_TIME = '10:00 AM';
```

---

## 5. `TemplateEditModal`

Opens from the card's pencil. Edits the **currently-previewed channel's** flow (`activeKey = ch==='email' && hasEmail ? 'emailFlow' : 'flow'`).

State: `name`, `stage`, and `steps` = the active flow mapped to add `_hhmm` (24h time for the `<input type=time>`) and `tz` (parsed timezone) per step. `onSave({ name, stage, [activeKey]: steps })` then `onClose()`. Note: **channel is NOT editable here** — it's whichever channel was being previewed on the card; shown read-only as a pill.

```jsx
function TemplateEditModal({ t, ch, onClose, onSave }) {
  const hasEmail  = Array.isArray(t.emailFlow);
  const activeKey = ch === 'email' && hasEmail ? 'emailFlow' : 'flow';
  const [name, setName]   = useState(t.name);
  const [stage, setStage] = useState(t.stage);
  const [steps, setSteps] = useState(() => (t[activeKey] || []).map(s => ({ ...s, _hhmm: tplParseHHMM(s.time), tz: tplParseTZ(s.time) })));
  const updateStep = (i, patch) => setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const save = () => { onSave({ name, stage, [activeKey]: steps }); onClose(); };
  return (
    <div className="wc-tpl-modal-ov" onClick={onClose}>
      <div className="wc-tpl-modal" onClick={e => e.stopPropagation()}>
        <div className="wc-tpl-modal-h">
          <div className="wc-tpl-modal-t"><Icon name="pencil" size={18} style={{ color:'var(--accent-strong)' }} /> Edit Template</div>
          <button className="wc-tpl-modal-x" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
        <div className="wc-tpl-modal-body">
          <label className="wc-tpl-flabel">Template Name</label>
          <input className="wc-tpl-finput" value={name} onChange={e => setName(e.target.value)} />
          <div style={{ display:'flex', gap:'12px' }}>
            <div style={{ flex:1 }}>
              <label className="wc-tpl-flabel">Category</label>
              <input className="wc-tpl-finput" value={stage} onChange={e => setStage(e.target.value)} />
            </div>
            <div style={{ flex:'none' }}>
              <label className="wc-tpl-flabel">Channel</label>
              <div className="wc-tpl-finput is-static"><ChannelPill channel={ch} size="sm" /></div>
            </div>
          </div>
          <label className="wc-tpl-flabel">Messages · {steps.length}</label>
          <div className="wc-tpl-msglist">
            {steps.map((s, i) => (
              <div className="wc-tpl-msgedit" key={i}>
                <div className="wc-tpl-msgedit-h"><span className="wc-tpl-node" style={{ background: TEMPLATE_CH[s.channel].bg, boxShadow:'none' }}>{i + 1}</span><span>Message {i + 1}</span></div>
                <div className="wc-tpl-when">
                  <label className="wc-tpl-inst"><input type="checkbox" checked={!!s.instant} onChange={e => updateStep(i, { instant: e.target.checked })} style={{ accentColor:'var(--accent)' }} /> Send instantly</label>
                  {!s.instant && (
                    <React.Fragment>
                      <input className="wc-tpl-finput wc-tpl-day" value={s.day} onChange={e => updateStep(i, { day: e.target.value })} placeholder="Day 1" />
                      <span className="wc-tpl-at">at</span>
                      <input type="time" className="wc-tpl-finput wc-tpl-timein" value={s._hhmm} onChange={e => updateStep(i, { _hhmm: e.target.value, time: tplFmtTime(e.target.value) + ' ' + (s.tz || 'PST') })} />
                      <select className="wc-tpl-finput wc-tpl-tzsel" value={s.tz || 'PST'} onChange={e => updateStep(i, { tz: e.target.value, time: tplFmtTime(s._hhmm || '10:00') + ' ' + e.target.value })}><option>PST</option><option>EST</option><option>CST</option><option>MST</option></select>
                    </React.Fragment>
                  )}
                </div>
                {s.subject != null ? (
                  <React.Fragment>
                    <input className="wc-tpl-finput" value={s.subject} onChange={e => updateStep(i, { subject: e.target.value })} placeholder="Subject" />
                    <textarea className="wc-tpl-fta" value={s.body} onChange={e => updateStep(i, { body: e.target.value })} />
                  </React.Fragment>
                ) : (
                  <textarea className="wc-tpl-fta" value={s.text} onChange={e => updateStep(i, { text: e.target.value })} />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="wc-tpl-modal-foot">
          <button className="wc-tpl-mbtn" onClick={onClose}>Cancel</button>
          <button className="wc-tpl-mbtn is-primary" onClick={save}><Icon name="check" size={15} />Save changes</button>
        </div>
      </div>
    </div>
  );
}
```

**Header:** `pencil` icon + **"Edit Template"** title, ✕ close. **Modal:** 620px wide, max-height 86vh, scrim click closes, inner panel `stopPropagation`.

Body fields:
- **Template Name** input (full width).
- A flex row: **Category** input (flex:1) + a read-only **Channel** field (`.is-static`, gray, shows a `ChannelPill` — the channel can't be changed in edit).
- **Messages · {N}** list (`.wc-tpl-msglist` of `.wc-tpl-msgedit` cards). Each editor:
  - Header: channel-colored node `{i+1}` + "Message {i+1}". *(Edit has no remove/AI-assist buttons — those are Create-only.)*
  - **When row** (`.wc-tpl-when`): a "Send instantly" checkbox (`accentColor:var(--accent)`); when unchecked → a **Day** text input + "at" + a **time** input (`_hhmm`, 24h) + a **timezone** `<select>` (PST/EST/CST/MST). Editing either recomputes the display `s.time` via `tplFmtTime(hhmm)+' '+tz`.
  - Body: email step (`s.subject != null`) → **Subject** input + **body** textarea; SMS → single **text** textarea.
- Footer: **Cancel** + **Save changes** (primary orange, check icon).

## 6. `TemplateCreateModal`

Opens from header **New template** (`onNew`). Same modal shell as Edit (`pencil`→`plus` icon, title **"New Template"**, 620px). Unlike Edit, the **channel IS switchable** (a `ChannelToggle` at the top), and each message has **AI assist** + **remove**, plus an **Add message** button.

```jsx
function TemplateCreateModal({ onClose, onCreate }) {
  const [channel, setChannel] = useState('sms');
  const [name, setName]   = useState('');
  const [stage, setStage] = useState('Nurture');
  const [steps, setSteps] = useState([{ instant:true, day:'Day 0', time:'10:00', text:'', subject:'', body:'' }]);
  const update = (i, p) => setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...p } : s));
  const add    = () => setSteps(prev => { const n = prev.length; return [...prev, { instant:false, day:'Day ' + (2*n - 1), time:'10:00', text:'', subject:'', body:'' }]; });
  const remove = (i) => setSteps(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const aiFill = (i) => { const d = tplAiDraft(channel, i); update(i, channel === 'email' ? { subject:d.subject, body:d.body } : { text:d.text }); };
  const valid  = name.trim() && steps.every(s => channel === 'email' ? (s.subject.trim() || s.body.trim()) : s.text.trim());
  const create = () => {
    if (!valid) return;
    const flow = steps.map(s => channel === 'email'
      ? { day:s.day, instant:s.instant, time: s.instant ? undefined : tplFmtTime(s.time), channel:'email', subject:s.subject, body:s.body }
      : { day:s.day, instant:s.instant, time: s.instant ? undefined : tplFmtTime(s.time), channel:'sms',   text:s.text });
    onCreate({ id:'tpl' + Date.now(), channel, name:name.trim(), stage:(stage.trim() || 'Nurture').toUpperCase(), sent:0, flow });
    onClose();
  };
  return (
    <div className="wc-tpl-modal-ov" onClick={onClose}>
      <div className="wc-tpl-modal" onClick={e => e.stopPropagation()}>
        <div className="wc-tpl-modal-h">
          <div className="wc-tpl-modal-t"><Icon name="plus" size={18} style={{ color:'var(--accent-strong)' }} /> New Template</div>
          <button className="wc-tpl-modal-x" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
        <div className="wc-tpl-modal-body">
          <label className="wc-tpl-flabel">Channel</label>
          <ChannelToggle value={channel} onChange={setChannel} />
          <label className="wc-tpl-flabel">Template Name</label>
          <input className="wc-tpl-finput" value={name} onChange={e => setName(e.target.value)} placeholder={channel === 'email' ? 'e.g. Buyer Welcome Email' : 'e.g. New Lead Follow-Up'} />
          <label className="wc-tpl-flabel">Category</label>
          <input className="wc-tpl-finput" value={stage} onChange={e => setStage(e.target.value)} placeholder="e.g. Buyer, Seller, Nurture" />
          <label className="wc-tpl-flabel">Messages · {steps.length}</label>
          <div className="wc-tpl-msglist">
            {steps.map((s, i) => (
              <div className="wc-tpl-msgedit" key={i}>
                <div className="wc-tpl-msgedit-h">
                  <span className="wc-tpl-node" style={{ background: TEMPLATE_CH[channel].bg, boxShadow:'none' }}>{i + 1}</span>
                  <span>Message {i + 1}</span>
                  {steps.length > 1 && <button className="wc-tpl-rm" onClick={() => remove(i)} title="Remove message"><Icon name="trash" size={13} /></button>}
                </div>
                <div className="wc-tpl-when">
                  <label className="wc-tpl-inst"><input type="checkbox" checked={s.instant} onChange={e => update(i, { instant: e.target.checked })} style={{ accentColor:'var(--accent)' }} /> Send instantly</label>
                  {!s.instant && (
                    <React.Fragment>
                      <input className="wc-tpl-finput wc-tpl-day" value={s.day} onChange={e => update(i, { day: e.target.value })} placeholder="Day 1" />
                      <span className="wc-tpl-at">at</span>
                      <input type="time" className="wc-tpl-finput wc-tpl-timein" value={s.time} onChange={e => update(i, { time: e.target.value })} />
                    </React.Fragment>
                  )}
                  <button className="wc-tpl-ai" onClick={() => aiFill(i)} title="Draft with AI"><Icon name="sparkles" size={14} />AI assist</button>
                </div>
                {channel === 'email' ? (
                  <React.Fragment>
                    <input className="wc-tpl-finput" value={s.subject} onChange={e => update(i, { subject: e.target.value })} placeholder="Subject line" />
                    <textarea className="wc-tpl-fta" value={s.body} onChange={e => update(i, { body: e.target.value })} placeholder="Write your email… Use {{first_name}}, {{area}}, {{agent_name}}" />
                  </React.Fragment>
                ) : (
                  <textarea className="wc-tpl-fta" value={s.text} onChange={e => update(i, { text: e.target.value })} placeholder="Write your message… Use {{first_name}}, {{area}}" />
                )}
              </div>
            ))}
          </div>
          <button className="wc-tpl-addmsg" onClick={add}><Icon name="plus" size={15} />Add message</button>
        </div>
        <div className="wc-tpl-modal-foot">
          <button className="wc-tpl-mbtn" onClick={onClose}>Cancel</button>
          <button className={'wc-tpl-mbtn is-primary' + (valid ? '' : ' is-disabled')} onClick={create}><Icon name="check" size={15} />Create template</button>
        </div>
      </div>
    </div>
  );
}
```

**Header:** `plus` icon + **"New Template"** title, ✕ close. Body fields:
- **Channel** — a `ChannelToggle` (SMS/Email). Switching it swaps every message editor between SMS (single text textarea) and Email (Subject input + body textarea), and recomputes `valid`.
- **Template Name** input (placeholder depends on channel), **Category** input (default "Nurture").
- **Messages · {N}** list — each `.wc-tpl-msgedit` editor:
  - Header: channel-colored node + "Message {i+1}" + a **remove** trash button (`.wc-tpl-rm`, red) shown only when there's more than one message.
  - **When row:** "Send instantly" checkbox; when unchecked → **Day** input + "at" + **time** input. *(Create's time is the raw `<input type=time>` value — no timezone select; the wizard standardizes to 10 AM in the lead's timezone on save.)* Always-present **"AI assist"** button (`.wc-tpl-ai`, sparkles, pushed right) → fills the message via `tplAiDraft(channel, i)`.
  - Body: Email → **Subject line** input + body textarea; SMS → text textarea. Placeholders mention `{{first_name}}`, `{{area}}`, `{{agent_name}}`.
- A dashed **"+ Add message"** button (`.wc-tpl-addmsg`) → `add()` appends a message at `Day {2n-1}`, instant=false.
- Footer: **Cancel** + **Create template** (primary). Disabled (`.is-disabled`, 50% opacity, no pointer events) until `valid` = name set **and** every step has content (SMS: `text`; Email: `subject` or `body`).
- `create()` maps `steps` → a `flow` (non-instant `time` formatted via `tplFmtTime`), then `onCreate({ id:'tpl'+Date.now(), channel, name, stage: UPPERCASE, sent:0, flow })`. Parent prepends it to the grid.

> **Edit vs Create — key differences:** Create has a **channel toggle** (Edit shows channel read-only); Create has **AI assist** + **remove** per message and an **Add message** button (Edit has none of these); Create has a **disabled-until-valid** primary button; Edit's time row includes a **timezone select** (Create's does not).

## 7. `ConfirmDelete`

Centered 400px confirm dialog: red trash tile (`.wc-confirm-ic`), title **"Delete template?"**, body "**{name}** will be permanently removed. This can't be undone.", actions **Cancel** + red **Delete** (`.wc-confirm-del`).

```css
/* ===== Template edit/create modal + delete confirm ===== */
.wc-tpl-modal-ov{position:fixed;inset:0;background:rgba(20,24,38,.5);display:flex;align-items:center;justify-content:center;z-index:1100;padding:40px 24px}
.wc-tpl-modal{background:var(--panel);border-radius:18px;width:100%;max-width:620px;max-height:86vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden}
.wc-tpl-modal-h{display:flex;align-items:center;justify-content:space-between;padding:22px 24px;border-bottom:1px solid var(--line)}
.wc-tpl-modal-t{display:inline-flex;align-items:center;gap:9px;font-size:18px;font-weight:800;color:var(--ink)}
.wc-tpl-modal-x{width:36px;height:36px;display:grid;place-items:center;border:none;background:none;color:var(--ink-3);border-radius:9px;cursor:pointer;transition:.14s}
.wc-tpl-modal-x:hover{background:var(--line-soft);color:var(--ink)}
.wc-tpl-modal-body{padding:22px 24px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
.wc-tpl-flabel{display:block;font-size:11.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);margin:10px 0 7px}
.wc-tpl-finput{width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid var(--line);border-radius:10px;font-size:14px;font-family:inherit;color:var(--ink);outline:none;transition:.14s}
.wc-tpl-finput:focus{border-color:var(--accent)}
.wc-tpl-finput.is-static{display:flex;align-items:center;background:var(--line-soft)}
.wc-tpl-msglist{display:flex;flex-direction:column;gap:12px;margin-top:2px}
.wc-tpl-msgedit{border:1px solid var(--line);border-radius:12px;padding:13px;background:var(--line-soft)}
.wc-tpl-msgedit-h{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700;color:var(--ink-2);margin-bottom:9px}
.wc-tpl-msgedit .wc-tpl-finput{margin-bottom:8px;background:var(--panel)}
.wc-tpl-fta{width:100%;box-sizing:border-box;min-height:74px;resize:vertical;padding:11px 13px;border:1px solid var(--line);border-radius:10px;font-size:13.5px;line-height:1.5;font-family:inherit;color:var(--ink);outline:none;background:var(--panel)}
.wc-tpl-fta:focus{border-color:var(--accent)}
.wc-tpl-modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:18px 24px;border-top:1px solid var(--line)}
.wc-tpl-mbtn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink-2);font-size:14px;font-weight:700;cursor:pointer;transition:.14s}
.wc-tpl-mbtn:hover{background:var(--line-soft);color:var(--ink)}
.wc-tpl-mbtn.is-primary{border:none;background:var(--accent);color:#fff;box-shadow:0 2px 8px rgba(249,115,22,.3)}
.wc-tpl-mbtn.is-primary:hover{background:var(--accent-strong);color:#fff}
.wc-tpl-mbtn.is-disabled{opacity:.5;pointer-events:none}
.wc-tpl-when{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px}
.wc-tpl-inst{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--ink-2);cursor:pointer}
.wc-tpl-inst input{width:16px;height:16px;cursor:pointer}
.wc-tpl-day{width:84px;padding:7px 10px !important;font-size:13px !important}
.wc-tpl-at{font-size:13px;color:var(--ink-3)}
.wc-tpl-timein{width:130px;padding:7px 10px !important;font-size:13px !important}
.wc-tpl-tzsel{width:auto !important;padding:7px 10px !important;font-size:13px !important;font-weight:600;background:var(--panel);cursor:pointer}
.wc-tpl-ai{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border:none;border-radius:8px;background:var(--accent-soft);color:var(--accent-strong);font-size:13px;font-weight:700;cursor:pointer;transition:.14s;white-space:nowrap}
.wc-tpl-ai:hover{background:#FCE3D2}
.wc-tpl-rm{margin-left:auto;width:28px;height:28px;display:grid;place-items:center;border:none;border-radius:7px;background:none;color:#E0524B;cursor:pointer;transition:.14s}
.wc-tpl-rm:hover{background:#FDECEA}
.wc-tpl-addmsg{display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding:10px 16px;border:1.5px dashed var(--line-strong);border-radius:10px;background:none;color:var(--ink-2);font-size:13.5px;font-weight:700;cursor:pointer;transition:.14s;align-self:flex-start}
.wc-tpl-addmsg:hover{border-color:var(--accent);color:var(--accent-strong);background:var(--accent-soft)}
.wc-confirm{background:var(--panel);border-radius:18px;width:100%;max-width:400px;padding:28px;text-align:center;box-shadow:var(--shadow-lg)}
.wc-confirm-ic{width:54px;height:54px;border-radius:14px;background:#FDECEA;color:#E0524B;display:grid;place-items:center;margin:0 auto 16px}
.wc-confirm-t{font-size:19px;font-weight:800;color:var(--ink);margin-bottom:8px}
.wc-confirm-d{font-size:14.5px;line-height:1.5;color:var(--ink-3);margin-bottom:22px}
.wc-confirm-d strong{color:var(--ink);font-weight:700}
.wc-confirm-acts{display:flex;gap:10px}
.wc-confirm-acts .wc-tpl-mbtn{flex:1;justify-content:center}
.wc-confirm-del{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 18px;border:none;border-radius:10px;background:#E0524B;color:#fff;font-size:14px;font-weight:700;cursor:pointer;transition:.14s}
.wc-confirm-del:hover{background:#C8362F}
```

---

## 8. Template data (`OUTBOUND_TEMPLATES`)

Same library used by the Browse-Templates modal — 9 templates `t1`–`t9`. Each:
`{ id, channel:'sms', name, stage, sent, message, flow:[5 SMS steps], emailSent, emailFlow:[5 Email steps] }`.
- SMS step: `{ day:'Day N', instant?:true, channel:'sms', text }`.
- Email step: `{ day:'Day N', instant?:true, channel:'email', subject, body }` (`\n` = line break, `•` = bullet).
- Variables: `{{first_name}}`, `{{area}}`, `{{agent_name}}`.

| id | name | stage | SMS sent | Email sent |
|----|------|-------|----------|-----------|
| t1 | Buyer Follow-Up | BUYER | 412 | 268 |
| t2 | Buyer Appointment Push | BUYER | 286 | 191 |
| t3 | Seller Follow-Up | SELLER | 198 | 142 |
| t4 | Seller Appointment Push | SELLER | 154 | 108 |
| t5 | Re-engagement Campaign | RE-ENGAGE | 132 | 96 |
| t6 | Open House Follow-Up | NURTURE | 119 | 84 |
| t7 | Cold Lead Nurture | COLD | 97 | 71 |
| t8 | Past Client | PAST CLIENT | 64 | 53 |
| t9 | Long-Term Nurture | NURTURE | 48 | 39 |

(Full verbatim 5-SMS + 5-Email step copy lives in `OUTBOUND_TEMPLATES` in `agents.jsx` — reproduce as-is.)

---

## 9. Acceptance checklist
- [ ] Header reads "**{N} templates** · variables like `{{first_name}}` fill in automatically" with the variable as an orange mono chip; **+ New template** opens the create modal.
- [ ] 2-col grid (1-col ≤900px) of 9 cards; card hover lifts; open card turns orange-bordered.
- [ ] Cards with both channels show a SMS/Email toggle that swaps preview, sent count, and msg count; SMS-only cards show a static pill.
- [ ] Stage line "{stage} · {sent} SENT · {msgs} MSGS"; first-message preview shows SMS text or Email Subject+body; `{{vars}}` highlighted.
- [ ] View template expands the numbered send sequence with per-step day · time/instant · channel pill; nodes colored by channel; "Times in the lead's timezone" note present.
- [ ] Edit modal: name/category, per-message instant toggle or Day+time+timezone, subject/body editors, Save changes persists.
- [ ] Create modal: channel toggle, name/category, add/remove messages, AI assist fills a draft, Create disabled until valid; new template prepends to the grid.
- [ ] Delete shows the red confirm dialog; confirming removes the card.
