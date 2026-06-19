# "Create New Template" Wizard (+ New Template) — Complete Build Spec

Self-contained spec for the **2-step "Create New Template" wizard** in WarmChats. It opens from the Outbound → **Templates** tab's **"+ New template"** button. It is the *same wizard component* as "Create New Workflow", run in **template mode** (`workflowMode === 'template'`) — which shows **2 steps** instead of 3 and ends with **Save Template**:

1. **Step 1 — Create New Template** (Template Name + Choose Channel)
2. **Step 2 — Craft Your Message** (message + follow-up sequence → Save Template)

> Important: this is **not** a separate small modal — it's the shared inline-styled wizard. In template mode the audience "Who to enroll" card is hidden, the progress bar has **2 segments**, and the final button is **Save Template** (no Step 3 / Review).

Stack: **React 18 (inline JSX / Babel)**, styled with **inline `style={{}}` objects**. Icons via `<Icon name size />`. Hooks `const { useState: useAS, useEffect: useAE } = React;`.

---

## 0. Tokens & helpers referenced

```css
--accent-strong:#EA580C; --ink:#191D29; --ink-2:#586173; --ink-3:#878FA0;
--panel:#FFFFFF; --line:#E8EAF0; --line-soft:#F3F4F8; --shadow-lg:0 18px 50px rgba(20,24,38,.15);
```
- Email channel accent: icon color `rgb(14,165,233)` on bg `#E7F4FB`. SMS accent: `--accent-strong` on `#FFF1E8`. Selected channel card bg `#fff8f5`.
- Live PST clock: `pstNow` state updated every second via `useAE` interval.
- `AIWriteMenu` (sparkles popover) + `aiToneText(tone)` → fills message/subject.
- `FollowUpSequence` component (titled "Follow-Up Sequence (Optional)").

---

## 1. Trigger — Templates tab "+ New template"

```jsx
<TemplatesTab list={tplList} setList={setTplList} onNew={() => {
  setWorkflowMode('template');
  setCreateWorkflow(true);
  setWorkflowStep(1);
  setWorkflowName('');
  setWorkflowChannels(['sms']);
  setMsgChannel('sms');
  setWorkflowMessage('');
  setEmailSubject('');
  setWorkflowTiming('instant');
  setTplFollowUps([]);
}} />
```
Clicking **+ New template** resets all wizard state, sets `workflowMode='template'`, and opens the wizard at step 1.

Relevant wizard state:
```jsx
const [createWorkflow, setCreateWorkflow] = useState(false);
const [workflowMode, setWorkflowMode]     = useState('workflow');  // 'template' here
const [workflowStep, setWorkflowStep]     = useState(1);
const [workflowName, setWorkflowName]     = useState('');
const [workflowChannels, setWorkflowChannels] = useState(['sms']); // multi-select
const [msgChannel, setMsgChannel]         = useState('sms');        // message-body channel
const [workflowMessage, setWorkflowMessage] = useState('');
const [emailSubject, setEmailSubject]     = useState('');
const [workflowTiming, setWorkflowTiming] = useState('instant');    // 'instant' | 'scheduled'
const [tplFollowUps, setTplFollowUps]     = useState([]);
```

---

## 2. Modal shell + header + progress bar

```jsx
{createWorkflow && (
  <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={() => setCreateWorkflow(false)}>
    <div style={{ background:'var(--panel)', borderRadius:'12px', padding:'32px', width:'90%', maxWidth:'900px', maxHeight:'90vh', overflowY:'auto', boxShadow:'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div style={{ marginBottom:'24px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <Icon name={workflowMode === 'template' ? 'layers' : 'outbound'} size={22} style={{ color:'var(--accent-strong)' }} />
            <h2 style={{ fontSize:'18px', fontWeight:700, color:'var(--ink)', margin:0 }}>{workflowMode === 'template' ? 'Create New Template' : 'Create New Workflow'}</h2>
          </div>
          <button onClick={() => setCreateWorkflow(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink-2)', width:'32px', height:'32px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'6px' }}><Icon name="x" size={20} /></button>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          {(workflowMode === 'template' ? [1,2] : [1,2,3]).map(step => (
            <div key={step} style={{ flex:1, height:'6px', background: step <= workflowStep ? 'var(--accent-strong)' : '#e5e5e5', borderRadius:'3px', transition:'.3s' }}></div>
          ))}
        </div>
      </div>

      {workflowStep === 1 && (/* … Step 1 … */)}
      {workflowStep === 2 && (/* … Step 2 … */)}

      {/* Footer (below) */}
    </div>
  </div>
)}
```

- **Scrim:** full-screen `rgba(0,0,0,.5)`, click closes. **Panel:** 90% width, **max-width 900px**, max-height 90vh, scrollable, radius 12px, padding 32px; inner click `stopPropagation`.
- **Header:** `layers` icon (orange) + **"Create New Template"** (18px/700) + ✕ close.
- **Progress bar:** template mode = **2 segments** `[1,2]` (workflow = 3). Filled `--accent-strong` up to `workflowStep`, else `#e5e5e5`.

---

## 3. Step 1 — "Create New Template" (Name & Channel)

```jsx
{workflowStep === 1 && (
  <div>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'32px' }}>
      <div>
        <h3 style={{ fontSize:'32px', fontWeight:700, color:'var(--ink)', margin:'0 0 8px 0' }}>Create New Template</h3>
        <p style={{ fontSize:'16px', color:'var(--ink-3)', margin:0 }}>Build a reusable sequence to save and use later</p>
      </div>
      <div style={{ fontSize:'16px', color:'var(--ink-3)', fontWeight:600, whiteSpace:'nowrap', flex:'none' }}>Step 1 of 2</div>
    </div>

    {/* Template Name */}
    <div style={{ marginBottom:'32px' }}>
      <label style={{ display:'block', fontSize:'14px', fontWeight:600, color:'var(--ink)', marginBottom:'12px' }}>Template Name</label>
      <input type="text" placeholder="New Lead Follow-Up" value={workflowName} onChange={e => setWorkflowName(e.target.value)}
             style={{ width:'100%', padding:'14px 16px', borderRadius:'12px', border:'2px solid var(--accent-strong)', fontSize:'16px', fontFamily:'inherit', boxSizing:'border-box' }} />
      <div style={{ fontSize:'12px', color:'var(--ink-3)', marginTop:'8px', textAlign:'right' }}>{workflowName.length}/80</div>
      {!workflowName.trim() && <div style={{ fontSize:'12px', color:'var(--ink-3)', marginTop:'2px' }}>Give your template a name to continue.</div>}
    </div>

    {/* Choose Channel */}
    <div>
      <label style={{ display:'block', fontSize:'12px', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--ink-3)', marginBottom:'16px' }}>Choose Channel</label>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'16px', marginBottom:'24px' }}>
        {[
          { id:'sms',   name:'SMS',   desc:'Fast replies',  icon:'message', iconColor:'var(--accent-strong)', iconBg:'#FFF1E8' },
          { id:'email', name:'Email', desc:'Rich content',  icon:'mail',    iconColor:'rgb(14, 165, 233)',    iconBg:'#E7F4FB' }
        ].map(ch => (
          <button key={ch.id} onClick={() => setWorkflowChannels(prev => prev.includes(ch.id) ? (prev.length > 1 ? prev.filter(c => c !== ch.id) : prev) : [...prev, ch.id])}
                  style={{ padding:'20px', borderRadius:'12px', border: workflowChannels.includes(ch.id) ? '2px solid var(--accent-strong)' : '1px solid var(--line)', background: workflowChannels.includes(ch.id) ? '#fff8f5' : 'var(--panel)', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:'16px', position:'relative' }}>
            <div style={{ width:'48px', height:'48px', borderRadius:'12px', background:ch.iconBg, display:'grid', placeItems:'center', flex:'none' }}><Icon name={ch.icon} size={22} style={{ color:ch.iconColor }} /></div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'18px', fontWeight:700, color:'var(--ink)', marginBottom:'4px' }}>{ch.name}</div>
              <div style={{ fontSize:'14px', color:'var(--ink-3)' }}>{ch.desc}</div>
            </div>
            {workflowChannels.includes(ch.id) && <div style={{ position:'absolute', top:'12px', right:'12px', width:'22px', height:'22px', borderRadius:'50%', background:'var(--accent-strong)', display:'grid', placeItems:'center' }}><Icon name="check" size={14} style={{ color:'#fff' }} /></div>}
          </button>
        ))}
      </div>
      <div style={{ paddingTop:'16px', borderTop:'1px solid var(--line)', display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'15px', color:'var(--ink-2)' }}><Icon name="checkCircle" size={18} style={{ color:'var(--accent-strong)', flex:'none' }} /><span><strong style={{ color:'var(--ink)' }}>SMS</strong> – higher reply rate</span></div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', fontSize:'15px', color:'var(--ink-2)' }}><Icon name="checkCircle" size={18} style={{ color:'var(--accent-strong)', flex:'none' }} /><span><strong style={{ color:'var(--ink)' }}>Email</strong> – better for long messages</span></div>
      </div>
    </div>
  </div>
)}
```

**Step 1 contents:**
- **Title row:** "Create New Template" (32px/700) + sub "Build a reusable sequence to save and use later" + right-aligned "**Step 1 of 2**".
- **Template Name** — big input with a **2px orange border**, `{len}/80` counter, and a hint "Give your template a name to continue." while empty. (Continue is gated on this.)
- **Choose Channel** — two big selectable cards: **SMS** (`message`, orange, "Fast replies") and **Email** (`mail`, sky `rgb(14,165,233)`, "Rich content"). **Multi-select** (`workflowChannels` array; can't drop below 1). Selected card → 2px orange border + `#fff8f5` bg + a check badge top-right.
- Two `checkCircle` notes: "**SMS** – higher reply rate", "**Email** – better for long messages".

---

## 4. Step 2 — "Craft Your Message"

In **template mode** the "Who to enroll" audience card is **hidden** (it's `workflowMode !== 'template'`). What shows: a **Channel & Enrollment** summary, the **Message Card**, and the **Follow-Up Sequence**.

```jsx
{workflowStep === 2 && (
  <div>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'24px' }}>
      <div>
        <h3 style={{ fontSize:'32px', fontWeight:700, color:'var(--ink)', margin:'0 0 8px 0' }}>Craft Your Message</h3>
        <p style={{ fontSize:'16px', color:'var(--ink-3)', margin:0 }}>Write the message and follow-up sequence</p>
      </div>
      <div style={{ fontSize:'16px', color:'var(--ink-3)', fontWeight:600, whiteSpace:'nowrap', flex:'none' }}>Step 2 of 2</div>
    </div>

    <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'24px' }}>
      <div>
        {/* Audience "Who to enroll" — HIDDEN in template mode (workflowMode !== 'template') */}

        {/* Channel & Enrollment summary */}
        <div style={{ padding:'20px', background:'var(--panel)', border:'1px solid var(--line)', borderRadius:'12px', marginBottom:'16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px' }}>
          <div>
            <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:'8px' }}>Channel</div>
            <div style={{ fontSize:'18px', fontWeight:700, color:'var(--ink)' }}>{workflowChannels.map(c => c === 'sms' ? 'SMS' : 'Email').join(' + ')}</div>
          </div>
          <div>
            <div style={{ fontSize:'11px', fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:'8px' }}>Enrollment</div>
            <div style={{ fontSize:'18px', fontWeight:700, color:'var(--ink)' }}>{workflowMode === 'template' ? 'As leads opt in' : /* …workflow… */ ''}</div>
          </div>
        </div>

        {/* Message Card */}
        <div style={{ padding:'20px', background:'var(--panel)', border:'1px solid var(--line)', borderRadius:'12px' }}>
          {/* Header: sparkles + "Initial Message" + live PST clock */}
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px', flexWrap:'nowrap', minWidth:0 }}>
            <Icon name="sparkles" size={15} style={{ color:'var(--accent-strong)', flex:'none' }} />
            <span style={{ fontSize:'14px', fontWeight:700, color:'var(--ink)', whiteSpace:'nowrap' }}>Initial Message</span>
            <span style={{ fontSize:'12px', color:'var(--ink-3)', display:'flex', alignItems:'center', gap:'3px', flex:'none' }}><Icon name="clock" size={12} />{pstNow}</span>
          </div>

          {/* Message Type SMS/Email + Add files + AI Write */}
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
            <span style={{ fontSize:'12px', fontWeight:700, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.05em' }}>Message Type</span>
            <div style={{ display:'inline-flex', background:'var(--line-soft)', borderRadius:'10px', padding:'3px', gap:'3px' }}>
              <button onClick={() => setMsgChannel('sms')}  style={{ /* segmented; active: white bg, accent text, shadow */ }}><Icon name="message" size={14} />SMS</button>
              <button onClick={() => setMsgChannel('email')} style={{ /* … */ }}><Icon name="mail" size={14} />Email</button>
            </div>
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px', flex:'none' }}>
              <button style={{ /* ghost */ }}><Icon name="plus" size={14} />Add files</button>
              <AIWriteMenu onPick={(tone) => { const d = aiToneText(tone); setWorkflowMessage(d.text); if (msgChannel === 'email') setEmailSubject(d.subject); }} />
            </div>
          </div>

          {/* Subject (email only) */}
          {msgChannel === 'email' && (
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:700, color:'var(--ink)', marginBottom:'6px' }}>Subject</label>
              <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Enter email subject..." style={{ width:'100%', padding:'12px 14px', borderRadius:'10px', border:'1px solid var(--line)', fontSize:'14px', boxSizing:'border-box' }} />
            </div>
          )}

          {/* Message body */}
          <textarea value={workflowMessage} onChange={e => setWorkflowMessage(e.target.value)} placeholder={msgChannel === 'email' ? 'Write your email body...' : 'Write your message...'} style={{ width:'100%', padding:'16px', borderRadius:'10px', border:'2px solid var(--accent-strong)', fontSize:'14px', minHeight:'150px', resize:'vertical', boxSizing:'border-box' }} />
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'12px' }}>
            <div style={{ fontSize:'12px', color:'var(--ink-3)' }}>{workflowMessage.length} chars · {Math.max(1, Math.ceil(workflowMessage.length / 160))}/5 segments</div>
          </div>

          {/* When to send the opening */}
          <div style={{ marginTop:'16px' }}>
            <label style={{ display:'block', fontSize:'13px', fontWeight:700, color:'var(--ink)', marginBottom:'10px' }}>When to send the opening</label>
            <div style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
              <div style={{ display:'inline-flex', background:'var(--line-soft)', borderRadius:'10px', padding:'3px', gap:'3px' }}>
                <button onClick={() => setWorkflowTiming('instant')}>Instant</button>
                <button onClick={() => setWorkflowTiming('scheduled')}>At a time</button>
              </div>
              {workflowTiming === 'scheduled' && (
                <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                  {/* date input (calendar icon) · time input (clock icon, default 09:00) · timezone select PST/EST/CST/MST */}
                </div>
              )}
            </div>
          </div>

          {/* Follow-Up Sequence */}
          <FollowUpSequence value={tplFollowUps} onChange={setTplFollowUps} />
        </div>
      </div>
    </div>
  </div>
)}
```

**Step 2 contents (template mode):**
- **Title row:** "Craft Your Message" (32px/700) + sub "Write the message and follow-up sequence" + "**Step 2 of 2**".
- **Channel & Enrollment** summary card (2-col): **Channel** = joined channels ("SMS", "Email", or "SMS + Email"); **Enrollment** = **"As leads opt in"** (template mode).
- **Message Card** (white, bordered):
  - Header: `sparkles` + **"Initial Message"** + a **live PST clock** (`pstNow`, ticks every second).
  - **Message Type** SMS/Email segmented toggle (`msgChannel`); active button = white bg + accent text + subtle shadow.
  - **Add files** ghost button + **AI Write** menu (`AIWriteMenu`; picking a tone fills the body via `aiToneText`, and the subject too in email mode).
  - **Subject** input — email mode only.
  - **Message body** textarea — **2px orange border**, min-height 150px; placeholder depends on channel.
  - **Counter:** `{len} chars · ⌈len/160⌉/5 segments` (min 1).
  - **When to send the opening:** Instant / At a time toggle (`workflowTiming`). "At a time" reveals **date** (calendar icon, defaults today) + **time** (clock icon, default 09:00) + **timezone** select (PST/EST/CST/MST).
  - **`FollowUpSequence`** — "Follow-Up Sequence (Optional)" with **Add Follow-Up**; each follow-up card has date + time + timezone, a delete button, a Message Type SMS/Email toggle, Add files + AI Write, an email Subject (email only), and a message textarea; plus a dashed "+ Add another follow-up".

> Note: there is **no Step 3** in template mode — the "Review & Save" / Send-Timing / Stop-Rules screen only renders when `workflowStep === 3`, which template mode never reaches.

---

## 5. Footer (Back / Continue / Save Template)

```jsx
<div style={{ marginTop:'32px', paddingTop:'16px', borderTop:'1px solid var(--line)', display:'flex', gap:'12px', justifyContent:'space-between', alignItems:'center' }}>
  <button onClick={() => setWorkflowStep(Math.max(1, workflowStep - 1))}
          style={{ /* ghost */ visibility: workflowStep === 1 ? 'hidden' : 'visible', opacity: workflowStep === 1 ? 0.4 : 1 }}>← Back</button>

  {workflowStep < (workflowMode === 'template' ? 2 : 3) ? (
    <button onClick={() => { if (!(workflowStep === 1 && !workflowName.trim())) setWorkflowStep(workflowStep + 1); }}
            disabled={workflowStep === 1 && !workflowName.trim()}
            style={{ /* primary */ opacity: (workflowStep === 1 && !workflowName.trim()) ? 0.5 : 1 }}>Continue →</button>
  ) : workflowMode === 'template' ? (
    <button onClick={() => {
      const ch = msgChannel;
      const flow = [ ch === 'email'
        ? { day:'Day 0', instant: workflowTiming === 'instant', channel:'email', subject: emailSubject, body: workflowMessage }
        : { day:'Day 0', instant: workflowTiming === 'instant', channel:'sms', text: workflowMessage } ];
      (tplFollowUps || []).forEach((f, idx) => {
        const fch = f.channel || 'sms';
        flow.push(fch === 'email'
          ? { day:'Day ' + (idx + 1), channel:'email', subject: f.subject || '', body: f.message || '' }
          : { day:'Day ' + (idx + 1), channel:'sms', text: f.message || '' });
      });
      setTplList(prev => [{ id:'tpl' + Date.now(), channel: ch, name: workflowName.trim() || 'Untitled Template', stage:'CUSTOM', sent:0, flow }, ...prev]);
      setCreateWorkflow(false); setWorkflowStep(1); setWorkflowMode('workflow'); setOutTab('templates');
    }} style={{ /* primary */ }}><Icon name="check" size={16} />Save Template</button>
  ) : (
    <button onClick={() => { setCreateWorkflow(false); setWorkflowStep(1); }} style={{ /* primary */ }}>↳ Start Workflow</button>
  )}
</div>
```

- **Back** — hidden on step 1 (`visibility:hidden`), else goes back one step.
- **Continue →** — shown while `workflowStep < 2` (template). On step 1 it's **disabled until the name is non-empty** (50% opacity, `not-allowed`).
- **Save Template** — shown on step 2 (the last step in template mode). It builds the template's `flow`:
  - Message 1 = `Day 0`, `instant` from `workflowTiming`, channel = `msgChannel` (email → `{subject, body}`, SMS → `{text}`).
  - Each follow-up → `Day {idx+1}`, channel-appropriate fields.
  - Creates `{ id:'tpl'+Date.now(), channel, name, stage:'CUSTOM', sent:0, flow }`, **prepends** it to `tplList`, closes the wizard, resets step/mode, and switches the Outbound tab to **Templates** so the new card is visible.

Primary button style (all three): `padding:12px 24px; border-radius:8px; background:var(--accent-strong); color:#fff; font-size:14px; font-weight:600; display:flex; align-items:center; gap:6px`. Ghost (Back): same padding, `border:1px solid var(--line); background:var(--panel); color:var(--ink-2)`.

---

## 6. Behavior summary
- **2 steps** (progress bar 2 segments). Step 1 gates Continue on a non-empty name.
- Template mode **hides** the "Who to enroll" audience card; **Enrollment** reads "As leads opt in".
- The new template's `stage` is hardcoded **`CUSTOM`**, `sent` is `0`, and it lands at the **top** of the Templates grid.
- After saving, the wizard resets `workflowMode` back to `'workflow'` and `workflowStep` to `1`.

## 7. Acceptance checklist
- [ ] "+ New template" opens the wizard titled **Create New Template** with a `layers` icon and a **2-segment** progress bar.
- [ ] Step 1: 32px title + "Step 1 of 2"; orange-bordered Template Name input with `/80` counter + empty hint; SMS/Email multi-select channel cards (selected = orange border + check badge); the two reply-rate notes.
- [ ] Continue is disabled until the name is filled.
- [ ] Step 2: "Craft Your Message" + "Step 2 of 2"; **no** "Who to enroll" card; Channel & Enrollment summary ("As leads opt in"); Message Card with live PST clock, SMS/Email type toggle, AI Write, email Subject, body textarea + char/segment counter, Instant/At-a-time timing (date+time+tz), and the Follow-Up Sequence.
- [ ] Footer shows **Save Template** on step 2 (not "Continue"/"Start Workflow"); saving prepends a `CUSTOM` template to the grid and switches to the Templates tab.
- [ ] Scrim click and ✕ close the wizard.
