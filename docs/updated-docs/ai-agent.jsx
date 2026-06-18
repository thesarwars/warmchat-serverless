
const { useState: useAS, useEffect: useAE } = React;

// ---------- Navigation items ----------
function NavItem({ item, active, onClick }) {
  return (
    <button className={'wc-nav' + (active ? ' is-active' : '')} onClick={onClick}>
      <Icon name={item.icon} size={19} />
      <span className="wc-nav-label">{item.label}</span>
      {item.badge != null && <span className="wc-nav-badge">{item.badge}</span>}
    </button>
  );
}

function AiNavItem({ item, active, onClick }) {
  const t = TONES[item.tone];
  return (
    <button className={'wc-nav wc-nav-ai' + (active ? ' is-active' : '')} onClick={onClick}>
      <span className="wc-nav-tile" style={{ color: t.fg, background: t.bg }}>
        <Icon name={item.icon} size={15} />
      </span>
      <span className="wc-nav-label">{item.label}</span>
      <span className="wc-nav-statusdot" style={{ background: item.dot }} />
    </button>
  );
}

// ---------- Pulse dot for status ----------
function PulseDot({ on, color }) {
  return (
    <span className="wc-pdot">
      <span className="wc-pdot-core" style={{ background: on ? (color || 'var(--green)') : 'var(--muted)' }} />
      {on && <span className="wc-pdot-ring" style={{ background: color || 'var(--green)' }} />}
    </span>
  );
}

// ---------- Toggle switch ----------
function Toggle({ on, onChange }) {
  return (
    <button className={'wc-toggle' + (on ? ' is-on' : '')} onClick={e => { e.stopPropagation(); onChange(!on); }}>
      <span className="wc-toggle-knob" />
    </button>
  );
}

// ---------- Stat component ----------
function Stat({ label, value, sub, tone }) {
  const col = tone === 'up' ? 'var(--green)' : 'var(--ink-3)';
  return (
    <div className="wc-stat">
      <div className="wc-stat-label">{label}</div>
      <div className="wc-stat-val wc-mono">{value}</div>
      <div className="wc-stat-sub" style={{ color: col }}>{sub}</div>
    </div>
  );
}

function NurtureStat({ label, value, desc }) {
  return (
    <div className="wc-nstat">
      <div className="wc-nstat-label">{label}</div>
      <div className="wc-nstat-v wc-mono">{value}</div>
      <div className="wc-nstat-desc">{desc}</div>
    </div>
  );
}

// ---------- Agent data ----------
const AGENT_TONE = {
  violet: { fg: 'var(--violet)', bg: 'var(--violet-bg)' },
  blue:   { fg: 'var(--blue)',   bg: 'var(--blue-bg)' },
  orange: { fg: 'var(--accent-strong)', bg: 'var(--accent-soft)' },
};

const AGENTS = {
  assistant: {
    id: 'assistant',
    name: 'AI Assistant',
    role: 'Your control center',
    color: 'violet',
    icon: 'bot',
    statusOn: true,
    stats: [
      { label: 'Suggestions Today', value: '47', desc: 'AI-generated suggestions' },
      { label: 'Time Saved (7d)', value: '3h 12m', desc: 'vs manual work' },
      { label: 'Draft Acceptance', value: '82%', desc: 'user approval rate' },
      { label: 'Avg Reply Rating', value: '4.8/5', desc: 'recipient satisfaction' },
    ],
    capabilities: [
      { icon: 'sparkles', title: 'Smart reply drafts', desc: 'Generates 2–3 contextual replies inline in the inbox.' },
      { icon: 'layers', title: 'Lead summary', desc: 'TL;DR of every conversation when you open a thread.' },
      { icon: 'trending', title: 'Next-step coach', desc: 'Suggests the highest-leverage action per lead.' },
      { icon: 'edit', title: 'Tone & polish', desc: 'Rewrites your draft in your voice — friendly, firm, concise.' },
    ],
  },
  inbound: {
    id: 'inbound',
    name: 'Inbound AI',
    role: 'Lead qualification & routing',
    color: 'blue',
    icon: 'inbox',
    statusOn: false,
    stats: [
      { label: 'Conversations Today', value: '14', desc: 'active threads' },
      { label: 'Qualified Leads', value: '5', desc: 'this period' },
      { label: 'Appointments Booked', value: '1', desc: 'this period' },
    ],
    workflows: [
      {
        id: 'ib1',
        name: 'New lead → instant reply',
        icon: 'zap',
        live: true,
        runs: 8,
        triggers: ['New lead added', 'Form submission', 'Inbound message'],
        actions: ['Send instant welcome', 'Qualify with questions', 'Route to right flow'],
        outcomes: [
          { label: 'Qualified → Book Appointment', tone: 'green', icon: 'check' },
          { label: 'Hot → Notify', tone: 'orange', icon: 'flame' },
          { label: 'Not qualified → End', tone: 'gray', icon: 'x' },
        ],
      },
    ],
  },
  outbound: {
    id: 'outbound',
    name: 'Outbound AI',
    role: 'Multi-channel nurture campaigns',
    color: 'orange',
    icon: 'send',
    statusOn: true,
    stats: [
      { label: 'AI Actions Today', value: '0', desc: 'logged events' },
      { label: 'Hot Leads', value: '4', desc: 'across the org' },
      { label: 'Appointments Set', value: '1', desc: 'active' },
      { label: 'Qualified Leads', value: '4', desc: 'this period' },
    ],
    workflows: [
      {
        id: 'out1',
        name: 'Cold Follow-Up',
        icon: 'zap',
        live: true,
        leads: '87',
        reply: '24%',
        appts: '4',
        updated: 'Today, 9:41 AM',
        trigger: { title: 'No Reply', sub: 'After 48 hours' },
        channel: 'SMS',
        steps: 5,
        channels: ['sms', 'sms', 'sms', 'sms', 'sms'],
        messages: [
          { step: 1, date: 'June 10', day: 'Day 0', channel: 'SMS', text: 'Hey! Just following up on your inquiry. Are you still interested in learning more?' },
          { step: 2, date: 'June 12', day: 'Day 2', channel: 'SMS', text: 'We haven\'t heard from you. Quick question - what\'s the best time to connect?' },
          { step: 3, date: 'June 14', day: 'Day 4', channel: 'SMS', text: 'One more follow-up - we have some updates that might interest you!' },
          { step: 4, date: 'June 16', day: 'Day 6', channel: 'SMS', text: 'Last chance to connect. Reply anytime if you\'d like to chat.' },
          { step: 5, date: 'June 18', day: 'Day 8', channel: 'SMS', text: 'We\'ll stop here. Feel free to reach out whenever you\'re ready!' },
        ],
        outcomes: [
          { label: 'Reply → Stop', tone: 'green', icon: 'check' },
          { label: 'Hot lead → Task', tone: 'orange', icon: 'flame' },
          { label: 'Appt intent → Notify', tone: 'blue', icon: 'bell' },
        ],
      },
      {
        id: 'out2',
        name: 'Open House Follow-Up',
        icon: 'home',
        live: true,
        leads: '64',
        reply: '32%',
        appts: '5',
        updated: 'Today, 8:15 AM',
        trigger: { title: 'Open House Visit', sub: 'Sign-in form' },
        channel: 'SMS',
        steps: 3,
        channels: ['sms', 'sms', 'sms'],
        outcomes: [
          { label: 'Showing booked', tone: 'green', icon: 'check' },
          { label: 'Add to nurture', tone: 'blue', icon: 'refresh' },
          { label: 'No reply → Stop', tone: 'gray', icon: 'x' },
        ],
      },
      {
        id: 'out3',
        name: 'Cold Lead Nurture',
        icon: 'refresh',
        live: true,
        leads: '41',
        reply: '15%',
        appts: '1',
        updated: 'Yesterday, 4:32 PM',
        trigger: { title: 'No Activity', sub: '30+ days' },
        channel: 'Email + SMS',
        steps: 4,
        channels: ['email', 'sms', 'email', 'sms'],
        outcomes: [
          { label: 'Reply → Stop', tone: 'green', icon: 'check' },
          { label: 'Interested → Task', tone: 'blue', icon: 'zap' },
          { label: 'No reply → End', tone: 'gray', icon: 'x' },
        ],
      },
      {
        id: 'out4',
        name: 'AI Follow up 5 step sequence',
        icon: 'zap',
        live: true,
        leads: '128',
        reply: '38%',
        appts: '8',
        updated: 'Today, 2:15 PM',
        trigger: { title: 'New Inquiry', sub: 'Form submission' },
        channel: 'SMS',
        steps: 5,
        channels: ['sms', 'sms', 'sms', 'sms', 'sms'],
        messages: [
          { step: 1, date: 'June 10', day: 'Day 0', channel: 'SMS', text: 'Hi {first_name}, this is {agent} with JOV Realty. Thanks for your interest in {listing} — what\'s the best time to connect today?' },
          { step: 2, date: 'June 11', day: 'Day 1', channel: 'SMS', text: 'Hi {first_name}, just following up — are you still looking around {area}?' },
          { step: 3, date: 'June 13', day: 'Day 3', channel: 'SMS', text: 'Hey {first_name}, a few new options came up in {area}. Want me to send them over?' },
          { step: 4, date: 'June 15', day: 'Day 5', channel: 'SMS', text: 'No rush at all! I can set you up with alerts so you only hear from me when something great hits.' },
          { step: 5, date: 'June 17', day: 'Day 7', channel: 'SMS', text: 'Last check-in from me — reply anytime you\'d like to pick things back up, {first_name}!' },
        ],
        outcomes: [
          { label: 'Reply → Stop', tone: 'green', icon: 'check' },
          { label: 'Hot lead → Task', tone: 'orange', icon: 'flame' },
          { label: 'No reply → End', tone: 'gray', icon: 'x' },
        ],
      },
      {
        id: 'out5',
        name: 'Past Client',
        icon: 'star',
        live: true,
        leads: '38',
        reply: '21%',
        appts: '2',
        updated: 'Mon, 11:02 AM',
        trigger: { title: 'Past Client', sub: 'Closed 30+ days ago' },
        channel: 'Email',
        steps: 4,
        channels: ['email', 'email', 'email', 'email'],
        outcomes: [
          { label: 'Reply → Task', tone: 'green', icon: 'check' },
          { label: 'Referral → Notify', tone: 'orange', icon: 'share' },
          { label: 'No reply → End', tone: 'gray', icon: 'x' },
        ],
      },
    ],
  },
};

// ---------- Auto-routing panel ----------
const AUTO_ROUTES = [
  { from: 'Buyer', to: 'Buyer Nurture', icon: 'leaf', tone: 'green' },
  { from: 'Seller', to: 'Seller Nurture', icon: 'home', tone: 'orange' },
  { from: 'No Response', to: 'Re-Engagement', icon: 'refresh', tone: 'blue' },
  { from: 'Appointment Intent', to: 'Booking Flow', icon: 'calendarCheck', tone: 'indigo' },
  { from: 'Agent Requested', to: 'Human Takeover', icon: 'user', tone: 'rose' },
];

function AutoRoutePanel() {
  return (
    <div className="wc-autoroute">
      <div className="wc-autoroute-h">
        <span className="wc-autoroute-ic"><Icon name="route" size={17} /></span>
        <div>
          <div className="wc-autoroute-t">Leads route themselves</div>
          <div className="wc-band-d">Once the AI qualifies a conversation it sends the lead into the right flow automatically — you never move leads between Inbound and Outbound by hand.</div>
        </div>
      </div>
      <div className="wc-autoroute-grid">
        {AUTO_ROUTES.map(r => {
          return (
            <div className="wc-autoroute-row" key={r.from}>
              <span className="wc-autoroute-from">{r.from}</span>
              <Icon name="arrowRight" size={14} className="wc-autoroute-arr" />
              <span className="wc-autoroute-to"><Icon name={r.icon} size={13} />{r.to}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Workflow row ----------
function WorkflowRow({ w, tone, isFirst, onToggle, onDelete, onDuplicate }) {
  const [open, setOpen] = useAS(isFirst ? true : false);
  const [menu, setMenu] = useAS(false);
  const [confirmDel, setConfirmDel] = useAS(false);
  return (
    <div className={'wc-wf' + (open ? ' is-open' : '') + (menu ? ' menu-open' : '')}>
      {confirmDel && (
        <div className="wc-modal-scrim" onClick={() => setConfirmDel(false)}>
          <div className="wc-modal wc-confirm" onClick={e => e.stopPropagation()}>
            <span className="wc-confirm-ic"><Icon name="trash" size={20} /></span>
            <div className="wc-confirm-t">Delete workflow?</div>
            <div className="wc-confirm-d">"{w.name}" will be removed. This can't be undone.</div>
            <div className="wc-confirm-acts">
              <button className="wc-ghostbtn" onClick={() => setConfirmDel(false)}>Cancel</button>
              <button className="wc-confirm-del" onClick={() => { onDelete && onDelete(); setConfirmDel(false); }}><Icon name="trash" size={15} />Delete</button>
            </div>
          </div>
        </div>
      )}
      <div className="wc-wf-row">
        <button className="wc-wf-main" onClick={() => setOpen(o => !o)}>
          <Icon name="chevronRight" size={15} className="wc-wf-caret" style={open ? { transform: 'rotate(90deg)' } : {}} />
          <span className="wc-wf-ic" style={{ color: tone.fg, background: tone.bg }}><Icon name={w.icon} size={15} /></span>
          <span className="wc-wf-name">{w.name}</span>
          {w.live && <span className="wc-pill-live"><PulseDot on />Live</span>}
          <span className="wc-wf-view">{open ? 'Hide flow' : 'View flow'}</span>
        </button>
        <Toggle on={w.live} onChange={onToggle} />
        <div style={{ position: 'relative' }}>
          <button style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--panel)', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', cursor: 'pointer', transition: '.15s' }} onMouseOver={e => e.target.style.background = 'var(--line-soft)'} onMouseOut={e => e.target.style.background = 'var(--panel)'} onClick={() => setMenu(!menu)}>
            <Icon name="more" size={16} />
          </button>
          {menu && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setMenu(false)}></div>
          )}
          {menu && (
            <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '8px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', boxShadow: 'var(--shadow)', zIndex: 100, minWidth: '140px' }} onClick={e => e.stopPropagation()}>
              <button style={{ width: '100%', padding: '10px 14px', textAlign: 'left', fontSize: '13px', color: 'var(--ink)', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { onDuplicate && onDuplicate(); setMenu(false); }} onMouseOver={e => e.target.style.background = 'var(--line-soft)'} onMouseOut={e => e.target.style.background = 'none'}>
                <Icon name="copy" size={14} />Duplicate
              </button>
              <div style={{ height: '1px', background: 'var(--line)', margin: '4px 0' }}></div>
              <button style={{ width: '100%', padding: '10px 14px', textAlign: 'left', fontSize: '13px', color: '#E11D48', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setConfirmDel(true); setMenu(false); }} onMouseOver={e => e.target.style.background = '#FFE8EE'} onMouseOut={e => e.target.style.background = 'none'}>
                <Icon name="trash" size={14} />Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {open && (
        <div className="wc-wf-detail">
          <div style={{ marginBottom: '24px', marginLeft: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '12px' }}>How This Flow Works</div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
              <div style={{ flex: 1, padding: '12px', background: '#F5F5F5', borderRadius: '8px', borderLeft: '3px solid var(--ink-3)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '6px' }}>Step 1: Trigger</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--ink)', lineHeight: 1.4 }}>
                  {w.triggers && w.triggers.slice(0, 2).join(', ')}
                  {w.triggers && w.triggers.length > 2 ? '...' : ''}
                </div>
              </div>
              <div style={{ width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)' }}>→</div>
              <div style={{ flex: 1, padding: '12px', background: '#E7F6FD', borderRadius: '8px', borderLeft: '3px solid #0284C7' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: '#0284C7', marginBottom: '6px' }}>Step 2: AI Action</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--ink)', lineHeight: 1.4 }}>
                  {w.actions && w.actions[0]}
                </div>
              </div>
              <div style={{ width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)' }}>→</div>
              <div style={{ flex: 1, padding: '12px', background: '#F5F5F5', borderRadius: '8px', borderLeft: '3px solid var(--ink-3)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '6px' }}>Step 3: Result</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--ink)', lineHeight: 1.4 }}>
                  {w.outcomes && w.outcomes[0]?.label}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Campaign card ----------
const FLOW_FALLBACK_SMS = [
  "Hi {{first_name}}, thanks for connecting! Is now a good time to chat about {{area}}?",
  "Hi {{first_name}}, just following up — happy to answer any questions you have.",
  "Hey {{first_name}}, a few new options came up that might be a great fit. Want me to send them over?",
  "Hi {{first_name}}, checking in — what does your timeline look like right now?",
  "Hey {{first_name}}, no rush at all. I'm here whenever you're ready to take the next step.",
  "Hi {{first_name}}, still happy to help whenever the time is right. Just reply anytime!",
];
const FLOW_FALLBACK_EMAIL = [
  "Subject: Great to connect — {{first_name}}, here's how I can help",
  "Subject: Following up on your {{area}} search",
  "Subject: A few options you might like in {{area}}",
  "Subject: Checking in on your timeline",
  "Subject: Still here whenever you're ready",
  "Subject: Keeping you posted on {{area}}",
];
const FLOW_DAY_NUMS = [0, 1, 3, 5, 7, 10, 14, 21];
function flowMessages(w) {
  if (w.messages && w.messages.length) return w.messages;
  const chs = w.channels && w.channels.length ? w.channels : Array.from({ length: w.steps || 3 }, () => (w.channel || 'SMS').toLowerCase());
  return chs.map((c, i) => {
    const isEmail = String(c).toLowerCase() === 'email';
    return {
      step: i + 1,
      day: 'Day ' + (FLOW_DAY_NUMS[i] != null ? FLOW_DAY_NUMS[i] : i * 2),
      date: i === 0 ? 'Send instantly' : SEND_TIME,
      channel: isEmail ? 'Email' : 'SMS',
      text: (isEmail ? FLOW_FALLBACK_EMAIL : FLOW_FALLBACK_SMS)[i % 6],
    };
  });
}

function CampaignCard({ w, onToggle, onDelete, onDuplicate }) {
  const [open, setOpen] = useAS(false);
  const tone = AGENT_TONE.orange;
  const [fg, bg] = [tone.fg, tone.bg];
  const [showFlowModal, setShowFlowModal] = useAS(false);
  const [showMenu, setShowMenu] = useAS(false);
  
  return (
    <div className="wc-cmp">
      <div className="wc-cmp-main">
        <div className="wc-cmp-top">
          <div className="wc-cmp-id">
            <span className="wc-cmp-ic" style={{ color: fg, background: bg }}><Icon name={w.icon} size={18} /></span>
            <div className="wc-cmp-idt">
              <div className="wc-cmp-titlerow">
                <span className="wc-cmp-name">{w.name}</span>
                {w.live ? <span className="wc-pill-live"><PulseDot on />Live</span> : <span className="wc-pill-draft">Draft</span>}
              </div>
              <div className="wc-cmp-sub">{w.channel} · {w.steps}-step sequence · Enrolled {w.updated}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
            <button style={{ padding: '6px 12px', fontSize: '13px', fontWeight: '600', color: showFlowModal ? '#FF6B35' : 'var(--accent-strong)', border: 'none', background: 'none', cursor: 'pointer', transition: '.15s' }} onMouseOver={e => e.target.style.opacity = '0.7'} onMouseOut={e => e.target.style.opacity = '1'} onClick={() => setShowFlowModal(o => !o)}>{showFlowModal ? 'Hide flow' : 'View flow'}</button>
            <div style={{ width: '60px', height: '32px', borderRadius: '16px', background: w.live ? '#FF6B35' : 'var(--line)', position: 'relative', cursor: 'pointer', transition: '.15s' }} onClick={onToggle} onMouseOver={e => e.target.style.opacity = '0.8'} onMouseOut={e => e.target.style.opacity = '1'}>
              <div style={{ position: 'absolute', width: '28px', height: '28px', borderRadius: '50%', background: '#fff', top: '2px', left: w.live ? '30px' : '2px', transition: '.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}></div>
            </div>
            <div style={{ position: 'relative' }}>
              <button style={{ padding: '6px 8px', fontSize: '14px', border: '1px solid var(--line)', background: 'var(--panel)', borderRadius: '6px', cursor: 'pointer', color: 'var(--ink-2)', transition: '.15s' }} onClick={() => setShowMenu(m => !m)} onMouseOver={e => { e.target.style.background = 'var(--line-soft)'; }} onMouseOut={e => { e.target.style.background = 'var(--panel)'; }}>•••</button>
              
              {showMenu && (
                <div style={{ position: 'absolute', top: '32px', right: 0, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 100, minWidth: '160px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { onDuplicate(); setShowMenu(false); }} style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: 'var(--ink)', transition: '.15s', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseOver={e => e.target.style.background = 'var(--line-soft)'} onMouseOut={e => e.target.style.background = 'none'}><Icon name="copy" size={16} />Duplicate</button>
                  <button onClick={() => { onDelete(); setShowMenu(false); }} style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#FF6B35', transition: '.15s', display: 'flex', alignItems: 'center', gap: '10px' }} onMouseOver={e => e.target.style.background = 'var(--line-soft)'} onMouseOut={e => e.target.style.background = 'none'}><Icon name="trash" size={16} />Delete</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="wc-cmp-body">
          <div className="wc-cmp-boxes">
            <div className="wc-cmp-box">
              <div className="wc-cmp-box-l">Trigger</div>
              <div className="wc-cmp-box-t">{w.trigger.title}</div>
              <div className="wc-cmp-box-s">{w.trigger.sub}</div>
            </div>
            <span className="wc-cmp-arr"><Icon name="arrowRight" size={14} /></span>
            <button className={'wc-cmp-box wc-cmp-box-follow' + (showFlowModal ? ' is-active' : '')} onClick={() => setShowFlowModal(o => !o)} style={{ background: showFlowModal ? 'var(--accent-soft)' : '', borderColor: showFlowModal ? '#FF6B35' : '', border: showFlowModal ? '2px solid #FF6B35' : '1px solid var(--line)' }}>
              <div className="wc-cmp-box-l" style={{ color: showFlowModal ? '#FF6B35' : 'var(--ink-3)' }}>AI Follow-Up</div>
              <div className="wc-cmp-box-s">{w.steps}-step {w.channel} sequence</div>
            </button>
            <span className="wc-cmp-arr"><Icon name="arrowRight" size={14} /></span>
            <div className="wc-cmp-box">
              <div className="wc-cmp-box-l">Outcome</div>
              <ul className="wc-cmp-outcomes">
                {w.outcomes && w.outcomes.map((o, i) => <li key={i}><Icon name="check" size={12} />{o.label || o}</li>)}
              </ul>
            </div>
          </div>
          <div className="wc-cmp-stats">
            <div className="wc-cmp-stat"><span className="wc-cmp-stat-v">{w.leads}</span><span className="wc-cmp-stat-l">Leads</span></div>
            <div className="wc-cmp-stat"><span className="wc-cmp-stat-v">{w.reply}</span><span className="wc-cmp-stat-l">Reply Rate</span></div>
            <div className="wc-cmp-stat"><span className="wc-cmp-stat-v">{w.appts}</span><span className="wc-cmp-stat-l">{w.appts === '1' ? 'Appt' : 'Appts'}</span></div>
            <div className="wc-cmp-stat"><span className="wc-cmp-status"><PulseDot on={w.live} />{w.live ? 'Live' : 'Draft'}</span><span className="wc-cmp-stat-l">{w.live ? 'Active' : 'Not Active'}</span></div>
            <div className="wc-cmp-stat"><span className="wc-cmp-stat-l">Last Updated</span><span className="wc-cmp-updated">{w.updated}</span></div>
          </div>
        </div>
      </div>
      
      {showFlowModal && (
        <div className="wc-cmp-flow">
          {(() => { const flowMsgs = flowMessages(w); return (
          <React.Fragment>
          <div className="wc-tpl-flow-h">
            <span>Send sequence · {flowMsgs.length} messages</span>
            <span className="wc-tpl-flow-tz"><Icon name="clock" size={12} />Times in the lead's timezone</span>
          </div>
          <div className="wc-tpl-steps">
            {flowMsgs.map((msg, i) => {
              const mch = (msg.channel || 'SMS').toLowerCase();
              return (
                <div className="wc-tpl-step" key={i}>
                  <div className="wc-tpl-rail">
                    <span className="wc-tpl-node" style={{ background: (TEMPLATE_CH[mch] || TEMPLATE_CH.sms).bg }}>{msg.step || i + 1}</span>
                    {i < flowMsgs.length - 1 && <span className="wc-tpl-line" />}
                  </div>
                  <div className="wc-tpl-step-body">
                    <div className="wc-tpl-step-meta">
                      <span className="wc-tpl-day">{msg.day}</span>
                      <span className="wc-tpl-dot">·</span>
                      {msg.date === 'Send instantly'
                        ? <span className="wc-tpl-time is-instant"><Icon name="zap" size={12} />Send instantly</span>
                        : <span className="wc-tpl-time"><Icon name="clock" size={12} />{msg.date}</span>}
                      <ChannelPill channel={mch} size="sm" />
                    </div>
                    <div className="wc-tpl-step-text"><VarText text={msg.text} /></div>
                  </div>
                </div>
              );
            })}
          </div>
          </React.Fragment>
          ); })()}
        </div>
      )}
      
      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            {w.seq && w.seq.map((msg, i) => (
              <div key={i} style={{ padding: '14px', background: 'var(--line-soft)', borderRadius: '8px', borderLeft: `3px solid var(--accent-strong)` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--ink)' }}>Step {i + 1}: {msg.name}</div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--ink-3)', background: 'var(--line)', padding: '3px 8px', borderRadius: '5px' }}>
                    {i === 0 ? 'Immediate' : i === 1 ? '24 hours' : i === 2 ? '2 days' : i === 3 ? '5 days' : '7 days'}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-2)', lineHeight: 1.5 }}>{msg.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Outbound campaigns list ----------
function OutboundCampaigns({ workflows }) {
  const [list, setList] = useAS(workflows);
  return (
    <div className="wc-cmp-wrap">
      <div className="wc-cmp-list">
        {list.map(w => <CampaignCard key={w.id} w={w} onToggle={() => { w.live = !w.live; setList([...list]); }} onDelete={() => {}} onDuplicate={() => {}} />)}
      </div>
    </div>
  );
}

// ---------- AI Write tone menu ----------
const AI_TONES = [
  { key: 'professional', label: 'Make professional' },
  { key: 'shorter', label: 'Make shorter' },
  { key: 'friendlier', label: 'Make friendlier' },
  { key: 'appointment', label: 'Appointment push' },
  { key: 'followup', label: 'Follow-up suggestion' },
];
function aiToneText(tone) {
  switch (tone) {
    case 'professional': return { subject: 'Following up on your home search', text: "Hi {{first_name}}, thank you for your interest in {{area}}. I'd be glad to share a few suitable options and answer any questions. When would be a good time for a brief call?" };
    case 'shorter': return { subject: 'Quick question', text: "Hi {{first_name}} — still looking in {{area}}? Happy to help." };
    case 'friendlier': return { subject: 'Great to connect!', text: "Hey {{first_name}}! So glad you're looking in {{area}} — want me to send over a few great options I think you'll love?" };
    case 'appointment': return { subject: 'Want to tour a few homes?', text: "Hi {{first_name}}, would you like to tour a few homes in {{area}} this week? I can set up a quick showing whenever works best for you." };
    case 'followup': return { subject: 'Just checking in', text: "Hey {{first_name}}, just circling back — are you still exploring {{area}}? No rush at all, happy to help whenever you're ready." };
    default: return { subject: '', text: '' };
  }
}
function AIWriteMenu({ onPick }) {
  const [open, setOpen] = useAS(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: '#FFF1E8', color: 'var(--accent-strong)', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap' }}><Icon name="sparkles" size={15} />AI Write</button>
      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1200 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '12px', boxShadow: 'var(--shadow-lg)', zIndex: 1201, minWidth: '230px', padding: '6px' }} onClick={e => e.stopPropagation()}>
            {AI_TONES.map(t => (
              <button key={t.key} onClick={() => { onPick(t.key); setOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: '8px', fontSize: '14.5px', fontWeight: '600', color: 'var(--ink)', textAlign: 'left', transition: '.12s' }} onMouseOver={e => e.currentTarget.style.background = 'var(--line-soft)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                <Icon name="sparkles" size={16} style={{ color: 'var(--accent-strong)', flex: 'none' }} />{t.label}
              </button>
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// ---------- Follow-Up Sequence ----------
function FollowUpSequence({ value, onChange, initial }) {
  const _internal = useAS(() => initial || []);
  const controlled = typeof onChange === 'function';
  const followUps = controlled ? (value || []) : _internal[0];
  const setFollowUps = (updater) => {
    const next = typeof updater === 'function' ? updater(followUps) : updater;
    if (controlled) onChange(next); else _internal[1](next);
  };
  const addFollowUp = () => setFollowUps(prev => [...prev, { id: Date.now(), delay: 1, unit: 'days', timing: 'instant', time: '09:00', timezone: 'PST', channel: 'sms', message: '' }]);
  const removeFollowUp = (id) => setFollowUps(prev => prev.filter(f => f.id !== id));
  const updateFollowUp = (id, key, val) => setFollowUps(prev => prev.map(f => f.id === id ? { ...f, [key]: val } : f));
  return (
    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon name="clock" size={16} style={{ color: 'var(--ink-3)' }} />
          <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--ink)' }}>Follow-Up Sequence</span>
          <span style={{ fontSize: '13px', color: 'var(--ink-3)' }}>(Optional)</span>
        </div>
        <button onClick={addFollowUp} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-strong)', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="plus" size={14} />Add Follow-Up</button>
      </div>
      {followUps.length === 0 ? (
        <div style={{ padding: '20px', border: '1.5px dashed var(--line)', borderRadius: '10px', textAlign: 'center', fontSize: '13px', color: 'var(--ink-3)' }}>
          No follow-ups yet. Add one to nudge leads who don't reply.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {followUps.map((f, i) => (
            <div key={f.id} style={{ padding: '16px', border: '1px solid var(--line)', borderRadius: '10px', background: 'var(--panel)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--ink-3)' }}>Follow-up {i + 1}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--panel)', fontSize: '13px', fontWeight: '600', color: 'var(--ink)' }}>
                    <Icon name="calendar" size={14} style={{ color: 'var(--ink-3)' }} />
                    <input type="date" value={f.date || ''} onChange={e => updateFollowUp(f.id, 'date', e.target.value)} style={{ border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit', fontWeight: '600', color: 'var(--ink)', background: 'transparent', cursor: 'pointer' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--panel)', fontSize: '13px', fontWeight: '600', color: 'var(--ink)' }}>
                    <Icon name="clock" size={14} style={{ color: 'var(--ink-3)' }} />
                    <input type="time" value={f.time} onChange={e => updateFollowUp(f.id, 'time', e.target.value)} style={{ border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit', fontWeight: '600', color: 'var(--ink)', background: 'transparent', cursor: 'pointer' }} />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <select value={f.timezone} onChange={e => updateFollowUp(f.id, 'timezone', e.target.value)} style={{ padding: '8px 28px 8px 12px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit', background: 'var(--panel)', appearance: 'none', fontWeight: '600', color: 'var(--ink)', cursor: 'pointer' }}>
                      <option>PST</option><option>EST</option><option>CST</option><option>MST</option>
                    </select>
                    <Icon name="chevronDown" size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)' }} />
                  </div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <button onClick={() => removeFollowUp(f.id)} style={{ width: '30px', height: '30px', borderRadius: '6px', border: 'none', background: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }} onMouseOver={e => e.currentTarget.style.background = '#fee2e2'} onMouseOut={e => e.currentTarget.style.background = 'none'}><Icon name="trash" size={14} style={{ color: '#ef4444' }} /></button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Message Type</span>
                <div style={{ display: 'inline-flex', background: 'var(--line-soft)', borderRadius: '10px', padding: '3px', gap: '3px' }}>
                  <button onClick={() => updateFollowUp(f.id, 'channel', 'sms')} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', background: (f.channel || 'sms') === 'sms' ? 'var(--panel)' : 'transparent', color: (f.channel || 'sms') === 'sms' ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', boxShadow: (f.channel || 'sms') === 'sms' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', display: 'flex', alignItems: 'center', gap: '6px', transition: '.15s' }}><Icon name="message" size={14} />SMS</button>
                  <button onClick={() => updateFollowUp(f.id, 'channel', 'email')} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', background: f.channel === 'email' ? 'var(--panel)' : 'transparent', color: f.channel === 'email' ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', boxShadow: f.channel === 'email' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', display: 'flex', alignItems: 'center', gap: '6px', transition: '.15s' }}><Icon name="mail" size={14} />Email</button>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--panel)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-2)' }}><Icon name="plus" size={14} />Add files</button>
                  <AIWriteMenu onPick={(tone) => updateFollowUp(f.id, 'message', aiToneText(tone).text)} />
                </div>
              </div>

              {f.channel === 'email' && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--ink)', marginBottom: '6px' }}>Subject</label>
                  <input type="text" value={f.subject || ''} onChange={e => updateFollowUp(f.id, 'subject', e.target.value)} placeholder="Enter email subject..." style={{ width: '100%', padding: '11px 13px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                </div>
              )}

              <textarea value={f.message} onChange={e => updateFollowUp(f.id, 'message', e.target.value)} placeholder={f.channel === 'email' ? 'Write your email body...' : 'Write your follow-up message...'} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1.5px solid var(--accent-strong)', fontSize: '13px', fontFamily: 'inherit', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          ))}
          <button onClick={addFollowUp} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px dashed var(--line-strong)', background: 'none', color: 'var(--ink-2)', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', transition: '.14s' }} onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent-strong)'; e.currentTarget.style.color = 'var(--accent-strong)'; e.currentTarget.style.background = 'var(--accent-soft)'; }} onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--line-strong)'; e.currentTarget.style.color = 'var(--ink-2)'; e.currentTarget.style.background = 'none'; }}><Icon name="plus" size={15} />Add another follow-up</button>
        </div>
      )}
    </div>
  );
}

// ---------- Outbound message templates ----------
const TEMPLATE_CH = {
  sms:   { label: 'SMS',   icon: 'message', bg: '#5BB4E3', fg: '#fff' },
  email: { label: 'Email', icon: 'mail',    bg: 'var(--accent)', fg: '#fff' },
};

// All follow-up sends standardized: message 1 instant, the rest at 10:00 AM in the lead's timezone.
const SEND_TIME = '10:00 AM';
const OUTBOUND_TEMPLATES = [
  {
    id: 't1', channel: 'sms', name: 'Buyer Follow-Up', stage: 'BUYER', sent: 412,
    message: "Hey {{first_name}}, saw you were interested in homes in {{area}} — are you looking to buy soon or just browsing?",
    flow: [
      { day: 'Day 0', instant: true, channel: 'sms', text: "Hey {{first_name}}, saw you were interested in homes in {{area}} — are you looking to buy soon or just browsing?" },
      { day: 'Day 1', channel: 'sms', text: "Hi {{first_name}}, just wanted to follow up. Are you still looking to buy a home around {{area}}?" },
      { day: 'Day 3', channel: 'sms', text: "Hey {{first_name}}, not sure if you saw my last message — are you still interested in homes in {{area}}?" },
      { day: 'Day 5', channel: 'sms', text: "Hey {{first_name}}, I can send you a few good options in {{area}} if you're still looking. Want me to?" },
      { day: 'Day 7', channel: 'sms', text: "Hi {{first_name}}, I don't want to bug you — I'll assume timing isn't right. Feel free to reach out anytime if that changes!" },
    ],
    emailSent: 268,
    emailFlow: [
      { day: 'Day 0', instant: true, channel: 'email', subject: "A few homes you might like", body: "Hey {{first_name}},\nI came across a few homes that match what you're looking for. Want me to send them your way?\n— {{agent_name}}" },
      { day: 'Day 2', channel: 'email', subject: "Quick question for you", body: "Hi {{first_name}},\nJust wanted to check — are you actively looking right now, or still exploring your options?\n— {{agent_name}}" },
      { day: 'Day 4', channel: 'email', subject: "Good opportunities hitting the market", body: "Hey {{first_name}},\nThere are a few homes hitting the market right now that are priced really well compared to others nearby. If you want, I can send you the best ones before they get picked up.\n— {{agent_name}}" },
      { day: 'Day 6', channel: 'email', subject: "This week or weekend?", body: "Hey {{first_name}},\nI'm showing a few homes this week that match what you're looking for. Would you be open to taking a look Wednesday or Saturday?\n— {{agent_name}}" },
      { day: 'Day 8', channel: 'email', subject: "Should I keep sending homes?", body: "Hey {{first_name}},\nJust wanted to check in to see if you want me to send you good options as they come up. Just let me know.\n— {{agent_name}}" },
    ],
  },
  {
    id: 't2', channel: 'sms', name: 'Buyer Appointment Push', stage: 'BUYER', sent: 286,
    message: "Hey {{first_name}}, would you be open to touring a few homes this week?",
    flow: [
      { day: 'Day 0', instant: true, channel: 'sms', text: "Hey {{first_name}}, would you be open to touring a few homes this week?" },
      { day: 'Day 1', channel: 'sms', text: "Hey {{first_name}}, I have a couple homes that match what you're looking for — want me to set up a quick showing?" },
      { day: 'Day 3', channel: 'sms', text: "Hey {{first_name}}, a few good homes are getting picked up quickly right now — do you want to take a look before they're gone?" },
      { day: 'Day 5', channel: 'sms', text: "Hey {{first_name}}, I'm free this week — would weekday evenings or this weekend work better for you?" },
      { day: 'Day 7', channel: 'sms', text: "Hey {{first_name}}, not sure if timing is right, but happy to line up some homes whenever you're ready. Just let me know." },
    ],
    emailSent: 191,
    emailFlow: [
      { day: 'Day 0', instant: true, channel: 'email', subject: "Quick question about your home search", body: "Hey {{first_name}},\nI saw you were looking at homes recently — are you actively trying to find something right now, or just browsing? I'd be happy to send you options that match exactly what you're looking for and even set up private tours if anything stands out. Let me know 👍\n— {{agent_name}}" },
      { day: 'Day 1', channel: 'email', subject: "Found a few homes you might like", body: "Hey {{first_name}},\nI came across a few homes in {{area}} that could be a great fit based on what you're looking for. Would you like me to send them over? I can also set up a time to tour any that catch your eye.\n— {{agent_name}}" },
      { day: 'Day 3', channel: 'email', subject: "Want to see any homes this week?", body: "Hey {{first_name}},\nQuick question — if you found the right home, would you want to see it in person this week? Homes in {{area}} have been moving pretty quickly, so I can help you get in early if something pops up.\n— {{agent_name}}" },
      { day: 'Day 5', channel: 'email', subject: "Should I keep sending homes?", body: "Hey {{first_name}},\nNot sure where you're at in the process, but I didn't want to overload you. Do you want me to keep sending you homes that match what you're looking for, or are you still just exploring for now? Happy to help either way.\n— {{agent_name}}" },
      { day: 'Day 7', channel: 'email', subject: "Still looking or pause for now?", body: "Hey {{first_name}},\nI haven't heard back, so I just wanted to check in one last time. Should I keep an eye out for homes and reach out when something good pops up, or would you prefer I close this out for now? Either way, feel free to reach out anytime 👍\n— {{agent_name}}" },
    ],
  },
  {
    id: 't3', channel: 'sms', name: 'Seller Follow-Up', stage: 'SELLER', sent: 198,
    message: "Hey {{first_name}}, I saw you were interested in your home value. Are you just curious, or thinking about selling soon?",
    flow: [
      { day: 'Day 0', instant: true, channel: 'sms', text: "Hey {{first_name}}, I saw you were interested in your home value. Are you just curious, or thinking about selling soon?" },
      { day: 'Day 1', channel: 'sms', text: "Hi {{first_name}}, just wanted to follow up. I ran some numbers for homes near {{area}}. Want me to send a quick estimate of what your house can sell for in today's market?" },
      { day: 'Day 3', channel: 'sms', text: "Hey {{first_name}}, quick question — homes in {{area}} have been selling pretty fast lately. Have you thought about what you'd list your home for?" },
      { day: 'Day 5', channel: 'sms', text: "Hey {{first_name}}, no rush at all — just checking in. Even if you're not ready to sell, I can keep you updated on your home value over time." },
      { day: 'Day 7', channel: 'sms', text: "Hey {{first_name}}, I don't want to keep bugging you. Should I close this out for now, or are you still interested in seeing your home value?" },
    ],
    emailSent: 142,
    emailFlow: [
      { day: 'Day 0', instant: true, channel: 'email', subject: "Buyers looking in your area", body: "Hey {{first_name}},\nI've been working with a few buyers actively looking in your area, and your home came up. Have you thought about selling, or just keeping an eye on the market?\n— {{agent_name}}" },
      { day: 'Day 2', channel: 'email', subject: "What your home could sell for", body: "Hey {{first_name}},\nQuick heads up — homes around you have been selling strong recently. If you're curious, I can give you an idea of what your home would sell for in today's market.\n— {{agent_name}}" },
      { day: 'Day 4', channel: 'email', subject: "Strong demand right now", body: "Hey {{first_name}},\nThere's still solid buyer demand right now, especially for homes like yours. The ones priced right are moving quickly and getting strong offers. Want me to show you what that could look like for your place?\n— {{agent_name}}" },
      { day: 'Day 6', channel: 'email', subject: "This week or weekend?", body: "Hey {{first_name}},\nIf you're open to it, I can swing by for a quick 10-minute walkthrough and give you a realistic price + strategy. No pressure at all, just helpful info. Would this week or weekend be better?\n— {{agent_name}}" },
      { day: 'Day 8', channel: 'email', subject: "Still thinking about selling?", body: "Hey {{first_name}},\nNot sure where you're at with selling, but I can keep you updated on what homes near you are actually selling for. Just let me know.\n— {{agent_name}}" },
    ],
  },
  {
    id: 't4', channel: 'sms', name: 'Seller Appointment Push', stage: 'SELLER', sent: 154,
    message: "Hey {{first_name}}, based on what you shared, it may be worth taking a closer look at your home's value. Would you be open to a quick 10–15 minute call so I can give you a more accurate estimate?",
    flow: [
      { day: 'Day 0', instant: true, channel: 'sms', text: "Hey {{first_name}}, based on what you shared, it may be worth taking a closer look at your home's value. Would you be open to a quick 10–15 minute call so I can give you a more accurate estimate?" },
      { day: 'Day 1', channel: 'sms', text: "Hi {{first_name}}, just following up. A quick call would help me understand your property, timeline, and what homes near you are selling for. Do you have time today or tomorrow?" },
      { day: 'Day 3', channel: 'sms', text: "Hey {{first_name}}, homes in {{area}} can vary a lot depending on condition, upgrades, and timing. Want to schedule a quick home value review so I can give you a realistic number?" },
      { day: 'Day 5', channel: 'sms', text: "Hi {{first_name}}, even if you're not ready to sell right now, it may still help to know what your options are. Would you like me to walk you through your estimated value and possible selling strategy?" },
      { day: 'Day 7', channel: 'sms', text: "Hey {{first_name}}, I don't want to keep bugging you. Should I close this out for now, or would you still like to schedule a quick call about your home value?" },
    ],
    emailSent: 108,
    emailFlow: [
      { day: 'Day 0', instant: true, channel: 'email', subject: "Quick question about your home", body: "Hey {{first_name}},\nNot sure if you've considered selling recently, but I've been seeing strong buyer activity in your area. If you're curious what your home could realistically sell for in today's market, I'd be happy to give you a quick estimate and strategy.\n— {{agent_name}}" },
      { day: 'Day 2', channel: 'email', subject: "Buyers are still looking nearby", body: "Hi {{first_name}},\nI'm still working with buyers looking for homes in your area, and inventory is staying pretty limited. If you've thought about making a move, this could be a good time to explore your options. Happy to walk you through what that could look like.\n— {{agent_name}}" },
      { day: 'Day 4', channel: 'email', subject: "Want a quick home value breakdown?", body: "Hey {{first_name}},\nA lot of homeowners are surprised by what homes are actually selling for right now. I can put together a quick breakdown of:\n• Estimated value\n• Nearby sales\n• What buyers are paying\n• Possible net proceeds\nWould you like me to send one over?\n— {{agent_name}}" },
      { day: 'Day 6', channel: 'email', subject: "This week or weekend?", body: "Hey {{first_name}},\nIf it's easier, I can stop by for a quick 10-minute walkthrough and give you a realistic idea of pricing and strategy. No pressure at all, just useful information so you know your options. Would this week or weekend work better?\n— {{agent_name}}" },
      { day: 'Day 8', channel: 'email', subject: "Should I keep you updated?", body: "Hey {{first_name}},\nTotally understand if the timing isn't right. I can still keep you updated on:\n• Nearby home sales\n• Buyer demand\n• Pricing trends in your area\nJust let me know if you'd like occasional updates.\n— {{agent_name}}" },
    ],
  },
  {
    id: 't5', channel: 'sms', name: 'Re-engagement Campaign', stage: 'RE-ENGAGE', sent: 132,
    message: "Hey {{first_name}}, are you still looking to buy, or did you already find a house?",
    flow: [
      { day: 'Day 0', instant: true, channel: 'sms', text: "Hey {{first_name}}, are you still looking to buy, or did you already find a house?" },
      { day: 'Day 1', channel: 'sms', text: "Hey {{first_name}}, I'm seeing some solid opportunities right now — want me to send you a few that match what you're looking for?" },
      { day: 'Day 3', channel: 'sms', text: "Hey {{first_name}}, what's your timeline looking like right now?" },
      { day: 'Day 5', channel: 'sms', text: "Hi {{first_name}}, just checking — are you still in the market right now?" },
      { day: 'Day 7', channel: 'sms', text: "Hey {{first_name}}, a few strong homes just hit the market. I can send you the best ones if you're still looking?" },
    ],
    emailSent: 96,
    emailFlow: [
      { day: 'Day 0', instant: true, channel: 'email', subject: "Quick check-in", body: "Hey {{first_name}},\nNot sure where you're at with your home search right now. Are you still looking, or did you put things on hold?\n— {{agent_name}}" },
      { day: 'Day 2', channel: 'email', subject: "Homes you might like", body: "Hey {{first_name}},\nA few solid homes just came up that fit what you were looking for. Want me to send you the best ones?\n— {{agent_name}}" },
      { day: 'Day 4', channel: 'email', subject: "Market update", body: "Hey {{first_name}},\nQuick update — I'm seeing some price adjustments and better opportunities popping up right now. Could be a good time to take another look. Let me know if you'd like me to send options that may interest you.\n— {{agent_name}}" },
      { day: 'Day 6', channel: 'email', subject: "Timing might be better now", body: "Hey {{first_name}},\nSome buyers who paused a few months ago are starting to jump back in right now. If you've been thinking about it again, I can help you move at the right time.\n— {{agent_name}}" },
      { day: 'Day 8', channel: 'email', subject: "Let me know", body: "Hey {{first_name}},\nNot sure if now just isn't the right time — totally fine if that's the case. Should I stop sending homes for now, or do you still want to stay updated?\n— {{agent_name}}" },
    ],
  },
  {
    id: 't6', channel: 'sms', name: 'Open House Follow-Up', stage: 'NURTURE', sent: 119,
    message: "Hey {{first_name}}, it was great meeting you at the open house! Would you like me to send you similar homes that pop up?",
    flow: [
      { day: 'Day 0', instant: true, channel: 'sms', text: "Hey {{first_name}}, it was great meeting you at the open house! Would you like me to send you similar homes that pop up?" },
      { day: 'Day 1', channel: 'sms', text: "Hey {{first_name}}, are you actively looking to buy a home in the next 3–6 months, or just exploring?" },
      { day: 'Day 3', channel: 'sms', text: "Hey {{first_name}}, I came across a couple homes similar to the one you saw. Want me to send them over?" },
      { day: 'Day 5', channel: 'sms', text: "Hey {{first_name}}, quick question — if you found the right home, how soon would you be ready to move?" },
      { day: 'Day 7', channel: 'sms', text: "Hey {{first_name}}, not sure if you're still in the market, but happy to keep an eye out for deals that fit what you're looking for. Want me to do that?" },
    ],
    emailSent: 84,
    emailFlow: [
      { day: 'Day 0', instant: true, channel: 'email', subject: "About the open house", body: "Hey {{first_name}},\nIt was great meeting you at the open house today. Let me know if you'd like to tour any homes or if you have any questions.\n— {{agent_name}}" },
      { day: 'Day 1', channel: 'email', subject: "A few options you might like", body: "Hey {{first_name}},\nBased on what you liked at the open house, I can send you a few similar homes that just hit the market. Want me to send those over?\n— {{agent_name}}" },
      { day: 'Day 3', channel: 'email', subject: "Quick update", body: "Hey {{first_name}},\nJust a heads up — homes like the one you saw are moving pretty quickly right now. Let me know if you'd like me to send similar options.\n— {{agent_name}}" },
      { day: 'Day 5', channel: 'email', subject: "Want to see a few homes?", body: "Hey {{first_name}},\nI'm showing a few homes this week that are similar to the one you saw. Would you be open to taking a look on a weekday evening or weekend?\n— {{agent_name}}" },
      { day: 'Day 7', channel: 'email', subject: "Still looking?", body: "Hey {{first_name}},\nNot sure where you're at in your search, but I can keep sending you strong options as they come up. Just let me know.\n— {{agent_name}}" },
    ],
  },
  {
    id: 't7', channel: 'sms', name: 'Cold Lead Nurture', stage: 'COLD', sent: 97,
    message: "Hey {{first_name}}, just wanted to check in. Are you still thinking about making a move, or has that been put on hold for now?",
    flow: [
      { day: 'Day 0', instant: true, channel: 'sms', text: "Hey {{first_name}}, just wanted to check in. Are you still thinking about making a move, or has that been put on hold for now?" },
      { day: 'Day 1', channel: 'sms', text: "Hi {{first_name}}, no rush at all. Just curious — what does your timeline look like right now?" },
      { day: 'Day 3', channel: 'sms', text: "Hey {{first_name}}, I know timing can change. If you'd like, I can keep an eye out for opportunities that fit what you're looking for." },
      { day: 'Day 5', channel: 'sms', text: "Hi {{first_name}}, are you still interested in the market, or should I check back with you later on?" },
      { day: 'Day 7', channel: 'sms', text: "Hey {{first_name}}, I don't want to keep bugging you. Feel free to reach out anytime if things change — I'd be happy to help." },
    ],
    emailSent: 71,
    emailFlow: [
      { day: 'Day 0', instant: true, channel: 'email', subject: "Just checking in", body: "Hey {{first_name}},\nNot sure where you're at in the process right now, but I wanted to reach out and introduce myself. If you're thinking about buying, selling, or just have questions about the market, I'm happy to help.\n— {{agent_name}}" },
      { day: 'Day 3', channel: 'email', subject: "Still thinking about making a move?", body: "Hey {{first_name}},\nA lot of people I've spoken with recently are still trying to figure out the right timing. Are you actively considering a move, or just keeping an eye on things for now?\n— {{agent_name}}" },
      { day: 'Day 7', channel: 'email', subject: "Market update", body: "Hey {{first_name}},\nJust a quick update — new homes are hitting the market every week and some good opportunities are popping up. If you'd like me to keep you updated, just let me know.\n— {{agent_name}}" },
      { day: 'Day 14', channel: 'email', subject: "Have any questions?", body: "Hey {{first_name}},\nReal estate can be confusing, especially when you're not sure where to start. If you have any questions about buying, selling, financing, or the market, feel free to reach out anytime.\n— {{agent_name}}" },
      { day: 'Day 21', channel: 'email', subject: "Stay in touch?", body: "Hey {{first_name}},\nI haven't heard back, which is completely okay. Would you like me to keep sending occasional market updates and opportunities, or should I leave the ball in your court for now?\n— {{agent_name}}" },
    ],
  },
  {
    id: 't8', channel: 'sms', name: 'Past Client', stage: 'PAST CLIENT', sent: 64,
    message: "Hey {{first_name}}, hope everything has been going well since your move. Just wanted to check in and see how things are going.",
    flow: [
      { day: 'Day 0', instant: true, channel: 'sms', text: "Hey {{first_name}}, hope everything has been going well since your move. Just wanted to check in and see how things are going." },
      { day: 'Day 30', channel: 'sms', text: "Hi {{first_name}}, quick question — have you had any friends, family, or coworkers talking about buying or selling lately?" },
      { day: 'Day 90', channel: 'sms', text: "Hey {{first_name}}, hope you're enjoying the home. If you ever need anything real estate related, don't hesitate to reach out." },
      { day: 'Day 180', channel: 'sms', text: "Hi {{first_name}}, just checking in. If you'd ever like an updated value on your home, I'd be happy to put one together." },
      { day: 'Day 365', channel: 'sms', text: "Hey {{first_name}}, hard to believe it's already been a year! Hope everything is going great. Let me know if I can help with anything." },
    ],
    emailSent: 53,
    emailFlow: [
      { day: 'Day 0', instant: true, channel: 'email', subject: "Hope you're doing well", body: "Hey {{first_name}},\nJust wanted to check in and see how everything has been going since we last worked together. Hope you're enjoying the home and settling in well.\n— {{agent_name}}" },
      { day: 'Day 30', channel: 'email', subject: "Quick market update", body: "Hey {{first_name}},\nI wanted to send a quick update on what's happening in the market around your area. If you're ever curious about your home's value or local activity, I'd be happy to help.\n— {{agent_name}}" },
      { day: 'Day 60', channel: 'email', subject: "Anyone I can help?", body: "Hey {{first_name}},\nOne of the biggest compliments I can receive is an introduction to a friend or family member who needs help buying or selling. If someone comes to mind, I'd love the opportunity to help them.\n— {{agent_name}}" },
      { day: 'Day 90', channel: 'email', subject: "Home value update", body: "Hey {{first_name}},\nA lot can change in a few months. If you'd like an updated estimate of what your home could sell for today, I'd be happy to put one together for you.\n— {{agent_name}}" },
      { day: 'Day 120', channel: 'email', subject: "Always here if you need anything", body: "Hey {{first_name}},\nEven if you're not planning a move anytime soon, I'm always here as a resource. Whether it's real estate questions, referrals, contractors, or market updates, don't hesitate to reach out.\n— {{agent_name}}" },
    ],
  },
  {
    id: 't9', channel: 'sms', name: 'Long-Term Nurture', stage: 'NURTURE', sent: 48,
    message: "Hey {{first_name}}, thanks again for chatting with me. I know your timeline may be a little further out, but I'm here whenever you're ready.",
    flow: [
      { day: 'Day 0', instant: true, channel: 'sms', text: "Hey {{first_name}}, thanks again for chatting with me. I know your timeline may be a little further out, but I'm here whenever you're ready." },
      { day: 'Day 30', channel: 'sms', text: "Hi {{first_name}}, just checking in. Has anything changed with your plans since we last spoke?" },
      { day: 'Day 60', channel: 'sms', text: "Hey {{first_name}}, a few interesting opportunities have popped up recently. Let me know if you'd like me to keep an eye out for anything specific." },
      { day: 'Day 90', channel: 'sms', text: "Hi {{first_name}}, hope everything is going well. Are you still thinking about making a move later this year?" },
      { day: 'Day 120', channel: 'sms', text: "Hey {{first_name}}, no pressure at all. Just wanted to stay in touch and let you know I'm here whenever the timing feels right." },
    ],
    emailSent: 39,
    emailFlow: [
      { day: 'Month 1', instant: true, channel: 'email', subject: "Real estate update", body: "Hey {{first_name}},\nJust checking in with a quick market update. There are some interesting opportunities showing up right now, and I wanted to stay on your radar in case your plans change.\n— {{agent_name}}" },
      { day: 'Month 2', channel: 'email', subject: "Curious about your plans", body: "Hey {{first_name}},\nJust wondering if anything has changed since we last spoke. Are you still considering a move at some point, or staying put for now?\n— {{agent_name}}" },
      { day: 'Month 3', channel: 'email', subject: "What's happening locally", body: "Hey {{first_name}},\nI've been keeping an eye on the local market and wanted to check in. If you'd like updates on home values, inventory, or market trends, I'd be happy to send them over.\n— {{agent_name}}" },
      { day: 'Month 4', channel: 'email', subject: "Still here to help", body: "Hey {{first_name}},\nI know timing is everything when it comes to real estate. Whenever the time is right, I'll be here to help answer questions and guide you through the process.\n— {{agent_name}}" },
      { day: 'Month 6', channel: 'email', subject: "Should I keep you updated?", body: "Hey {{first_name}},\nI wanted to do a quick check-in. Would you like to continue receiving occasional updates and opportunities, or would you prefer I only reach out when you contact me? Either way is completely fine.\n— {{agent_name}}" },
    ],
  },
];

function VarText({ text }) {
  const parts = String(text).split(/(\{\{[^}]+\}\})/g);
  return parts.map((p, i) => /^\{\{[^}]+\}\}$/.test(p)
    ? <span key={i} className="wc-tpl-var">{p}</span>
    : <React.Fragment key={i}>{p}</React.Fragment>);
}

function ChannelPill({ channel, size }) {
  const c = TEMPLATE_CH[channel];
  const big = size !== 'sm';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: big ? '6px' : '5px', background: c.bg, color: c.fg, fontWeight: 700, fontSize: big ? '13px' : '11px', letterSpacing: '.01em', padding: big ? '5px 11px' : '3px 8px', borderRadius: '999px', flex: 'none', lineHeight: 1 }}>
      <Icon name={c.icon} size={big ? 14 : 12} />{c.label}
    </span>
  );
}

function MsgBody({ text }) {
  return String(text).split('\n').map((ln, i) => (
    <div key={i} className={ln.trim().startsWith('\u2022') ? 'wc-tpl-bullet' : undefined}><VarText text={ln} /></div>
  ));
}

function ChannelToggle({ value, onChange }) {
  return (
    <div className="wc-tpl-chtoggle">
      {['sms', 'email'].map(ch => {
        const c = TEMPLATE_CH[ch];
        const on = value === ch;
        return (
          <button key={ch} className={'wc-tpl-chbtn' + (on ? ' is-on' : '')} style={on ? { background: c.bg, color: c.fg } : null} onClick={() => onChange(ch)}>
            <Icon name={c.icon} size={13} />{c.label}
          </button>
        );
      })}
    </div>
  );
}

function StepContent({ s }) {
  if (s.subject != null) {
    return (
      <div className="wc-tpl-step-text">
        <div className="wc-tpl-subj"><span className="wc-tpl-subj-k">Subject:</span> <VarText text={s.subject} /></div>
        <div className="wc-tpl-emailbody"><MsgBody text={s.body} /></div>
      </div>
    );
  }
  return <div className="wc-tpl-step-text"><VarText text={s.text} /></div>;
}

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

function TemplateEditModal({ t, ch, onClose, onSave }) {
  const hasEmail = Array.isArray(t.emailFlow);
  const activeKey = ch === 'email' && hasEmail ? 'emailFlow' : 'flow';
  const [name, setName] = useAS(t.name);
  const [stage, setStage] = useAS(t.stage);
  const [steps, setSteps] = useAS(() => (t[activeKey] || []).map(s => ({ ...s, _hhmm: tplParseHHMM(s.time), tz: tplParseTZ(s.time) })));
  const updateStep = (i, patch) => setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const save = () => { onSave({ name, stage, [activeKey]: steps }); onClose(); };
  return (
    <div className="wc-tpl-modal-ov" onClick={onClose}>
      <div className="wc-tpl-modal" onClick={e => e.stopPropagation()}>
        <div className="wc-tpl-modal-h">
          <div className="wc-tpl-modal-t"><Icon name="pencil" size={18} style={{ color: 'var(--accent-strong)' }} /> Edit Template</div>
          <button className="wc-tpl-modal-x" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
        <div className="wc-tpl-modal-body">
          <label className="wc-tpl-flabel">Template Name</label>
          <input className="wc-tpl-finput" value={name} onChange={e => setName(e.target.value)} />
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label className="wc-tpl-flabel">Category</label>
              <input className="wc-tpl-finput" value={stage} onChange={e => setStage(e.target.value)} />
            </div>
            <div style={{ flex: 'none' }}>
              <label className="wc-tpl-flabel">Channel</label>
              <div className="wc-tpl-finput is-static"><ChannelPill channel={ch} size="sm" /></div>
            </div>
          </div>
          <label className="wc-tpl-flabel">Messages · {steps.length}</label>
          <div className="wc-tpl-msglist">
            {steps.map((s, i) => (
              <div className="wc-tpl-msgedit" key={i}>
                <div className="wc-tpl-msgedit-h"><span className="wc-tpl-node" style={{ background: TEMPLATE_CH[s.channel].bg, boxShadow: 'none' }}>{i + 1}</span><span>Message {i + 1}</span></div>
                <div className="wc-tpl-when">
                  <label className="wc-tpl-inst"><input type="checkbox" checked={!!s.instant} onChange={e => updateStep(i, { instant: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> Send instantly</label>
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

function ConfirmDelete({ name, onCancel, onConfirm }) {
  return (
    <div className="wc-tpl-modal-ov" onClick={onCancel}>
      <div className="wc-confirm" onClick={e => e.stopPropagation()}>
        <div className="wc-confirm-ic"><Icon name="trash" size={22} /></div>
        <div className="wc-confirm-t">Delete template?</div>
        <div className="wc-confirm-d"><strong>{name}</strong> will be permanently removed. This can't be undone.</div>
        <div className="wc-confirm-acts">
          <button className="wc-tpl-mbtn" onClick={onCancel}>Cancel</button>
          <button className="wc-confirm-del" onClick={onConfirm}><Icon name="trash" size={15} />Delete</button>
        </div>
      </div>
    </div>
  );
}

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
function tplAiDraft(channel, idx) {
  return channel === 'email' ? TPL_EMAIL_DRAFTS[idx % TPL_EMAIL_DRAFTS.length] : { text: TPL_SMS_DRAFTS[idx % TPL_SMS_DRAFTS.length] };
}
function tplFmtTime(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return hh + ':' + String(m || 0).padStart(2, '0') + ' ' + ap;
}
function tplParseHHMM(str) {
  const m = String(str || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return '10:00';
  let h = +m[1]; const min = m[2]; const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + min;
}
function tplParseTZ(str) {
  const m = String(str || '').match(/\b(PST|EST|CST|MST)\b/);
  return m ? m[1] : 'PST';
}

function TemplateCreateModal({ onClose, onCreate }) {
  const [channel, setChannel] = useAS('sms');
  const [name, setName] = useAS('');
  const [stage, setStage] = useAS('Nurture');
  const [steps, setSteps] = useAS([{ instant: true, day: 'Day 0', time: '10:00', text: '', subject: '', body: '' }]);
  const update = (i, p) => setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...p } : s));
  const add = () => setSteps(prev => { const n = prev.length; return [...prev, { instant: false, day: 'Day ' + (2 * n - 1), time: '10:00', text: '', subject: '', body: '' }]; });
  const remove = (i) => setSteps(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const aiFill = (i) => { const d = tplAiDraft(channel, i); update(i, channel === 'email' ? { subject: d.subject, body: d.body } : { text: d.text }); };
  const valid = name.trim() && steps.every(s => channel === 'email' ? (s.subject.trim() || s.body.trim()) : s.text.trim());
  const create = () => {
    if (!valid) return;
    const flow = steps.map(s => channel === 'email'
      ? { day: s.day, instant: s.instant, time: s.instant ? undefined : tplFmtTime(s.time), channel: 'email', subject: s.subject, body: s.body }
      : { day: s.day, instant: s.instant, time: s.instant ? undefined : tplFmtTime(s.time), channel: 'sms', text: s.text });
    onCreate({ id: 'tpl' + Date.now(), channel, name: name.trim(), stage: (stage.trim() || 'Nurture').toUpperCase(), sent: 0, flow });
    onClose();
  };
  return (
    <div className="wc-tpl-modal-ov" onClick={onClose}>
      <div className="wc-tpl-modal" onClick={e => e.stopPropagation()}>
        <div className="wc-tpl-modal-h">
          <div className="wc-tpl-modal-t"><Icon name="plus" size={18} style={{ color: 'var(--accent-strong)' }} /> New Template</div>
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
                  <span className="wc-tpl-node" style={{ background: TEMPLATE_CH[channel].bg, boxShadow: 'none' }}>{i + 1}</span>
                  <span>Message {i + 1}</span>
                  {steps.length > 1 && <button className="wc-tpl-rm" onClick={() => remove(i)} title="Remove message"><Icon name="trash" size={13} /></button>}
                </div>
                <div className="wc-tpl-when">
                  <label className="wc-tpl-inst"><input type="checkbox" checked={s.instant} onChange={e => update(i, { instant: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> Send instantly</label>
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

function TemplateCard({ t, onSave, onDelete }) {
  const [open, setOpen] = useAS(false);
  const [editing, setEditing] = useAS(false);
  const [confirmDel, setConfirmDel] = useAS(false);
  const hasEmail = Array.isArray(t.emailFlow);
  const [ch, setCh] = useAS(t.channel || 'sms');
  const flow = ch === 'email' && hasEmail ? t.emailFlow : t.flow;
  const sentCount = ch === 'email' && hasEmail ? t.emailSent : t.sent;
  const first = flow[0];
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
        <Icon name="layers" size={16} />
        {open ? 'Hide template' : 'View template'}
        <Icon name="chevronDown" size={15} style={{ marginLeft: '2px', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <TemplateFlow flow={flow} />}
      {editing && <TemplateEditModal t={t} ch={ch} onClose={() => setEditing(false)} onSave={onSave} />}
      {confirmDel && <ConfirmDelete name={t.name} onCancel={() => setConfirmDel(false)} onConfirm={() => { setConfirmDel(false); onDelete(); }} />}
    </div>
  );
}

function TemplatesTab({ list, setList, onNew }) {
  const [scope, setScope] = useAS('agent');
  const updateT = (id, patch) => setList(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  const removeT = (id) => setList(prev => prev.filter(t => t.id !== id));
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

// ---------- Browse / Create Workflow From Template modal ----------
const WF_TEMPLATE_META = {
  t1: { icon: 'users',   tone: 'orange' },
  t2: { icon: 'users',   tone: 'blue' },
  t3: { icon: 'home',    tone: 'orange' },
  t4: { icon: 'home',    tone: 'orange' },
  t5: { icon: 'refresh', tone: 'violet' },
  t6: { icon: 'home',    tone: 'green' },
  t7: { icon: 'target',  tone: 'blue' },
  t8: { icon: 'star',    tone: 'violet' },
  t9: { icon: 'clock',   tone: 'green' },
};
const WF_TONES = {
  orange: { bg: 'var(--accent-soft)', fg: 'var(--accent-strong)' },
  blue:   { bg: 'var(--blue-bg)',     fg: 'var(--blue)' },
  violet: { bg: 'var(--violet-bg)',   fg: 'var(--violet)' },
  green:  { bg: 'var(--green-bg)',    fg: 'var(--green)' },
};

function dayOffset(dayStr) {
  const m = String(dayStr).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
function runsLabel(flow) {
  const d = dayOffset(flow[flow.length - 1].day);
  if (d === 0) return 'Same day';
  if (d >= 60) return 'Runs over ' + Math.round(d / 30) + ' months';
  return 'Runs over ' + d + ' days';
}
function stepDate(offset) {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function WfTemplateCard({ t, channel, onUse }) {
  const [open, setOpen] = useAS(false);
  const meta = WF_TEMPLATE_META[t.id] || { icon: 'layers', tone: 'orange' };
  const tone = WF_TONES[meta.tone];
  const flow = (channel === 'email' && Array.isArray(t.emailFlow)) ? t.emailFlow : t.flow;
  return (
    <div className={'wc-wft-card' + (open ? ' is-open' : '')}>
      <div className="wc-wft-head">
        <span className="wc-wft-tile" style={{ background: tone.bg, color: tone.fg }}><Icon name={meta.icon} size={22} /></span>
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
        <Icon name="chevronDown" size={16} style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
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
                <div className="wc-wft-step-text">{s.subject != null ? <React.Fragment><strong>{s.subject}</strong><br /><VarText text={s.body} /></React.Fragment> : <VarText text={s.text} />}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrowseTemplatesModal({ onClose, onUse, templates }) {
  const [channel, setChannel] = useAS('sms');
  const list = templates && templates.length ? templates : OUTBOUND_TEMPLATES;
  return (
    <div className="wc-wft-overlay" onClick={onClose}>
      <div className="wc-wft-modal" onClick={e => e.stopPropagation()}>
        <div className="wc-wft-topbar">
          <div className="wc-wft-eyebrow"><Icon name="arrowRight" size={18} style={{ color: 'var(--accent-strong)' }} /> Create Workflow From Template</div>
          <button className="wc-wft-close" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
        <h2 className="wc-wft-h">Choose a Template</h2>
        <p className="wc-wft-sub">Pick a proven follow-up sequence. Switch channel to preview the SMS or Email version.</p>
        <div className="wc-wft-chrow">
          <ChannelToggle value={channel} onChange={setChannel} />
        </div>
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

// ---------- AI Settings ----------
function SetCard({ title, desc, children }) {
  return (
    <div className="wc-set-card">
      <div className="wc-set-card-h">
        <div className="wc-set-card-t">{title}</div>
        {desc && <div className="wc-set-card-d">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function SetToggleRow({ title, desc, on, onChange }) {
  return (
    <div className="wc-set-trow">
      <div className="wc-set-trow-txt">
        <div className="wc-set-trow-t">{title}</div>
        {desc && <div className="wc-set-trow-d">{desc}</div>}
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function SetCheck({ label, tone, defaultChecked }) {
  return (
    <label className="wc-set-check">
      <input type="checkbox" defaultChecked={defaultChecked !== false} style={{ accentColor: tone === 'blue' ? '#5BB4E3' : 'var(--accent)' }} />
      <span>{label}</span>
    </label>
  );
}

function SetRadioRow({ name, label, desc, defaultChecked }) {
  return (
    <label className="wc-set-radio">
      <input type="radio" name={name} defaultChecked={defaultChecked} style={{ accentColor: 'var(--accent)' }} />
      <div className="wc-set-radio-txt">
        <div className="wc-set-radio-t">{label}</div>
        {desc && <div className="wc-set-radio-d">{desc}</div>}
      </div>
    </label>
  );
}

function KbRow({ icon, label }) {
  return (
    <div className="wc-set-kb">
      <span className="wc-set-kb-ic"><Icon name={icon} size={17} /></span>
      <span className="wc-set-kb-label">{label}</span>
      <span className="wc-set-kb-time">Updated 2 days ago</span>
      <button className="wc-set-kb-edit"><Icon name="pencil" size={15} /></button>
    </div>
  );
}

function NotifRow({ icon, tone, title, desc, on, onChange }) {
  const t = WF_TONES[tone] || WF_TONES.orange;
  return (
    <div className="wc-set-notif">
      <span className="wc-set-notif-ic" style={{ background: t.bg, color: t.fg }}><Icon name={icon} size={16} /></span>
      <div className="wc-set-notif-txt">
        <div className="wc-set-notif-t">{title}</div>
        <div className="wc-set-notif-d">{desc}</div>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function AISettings() {
  const [aiOn, setAiOn] = useAS(true);
  const [tg, setTg] = useAS({
    autoReply: true, leadQual: true, apptBook: true, humanDetect: true,
    followUp: true, nurture: true, reengage: true, stopReply: true,
    nHot: true, nAppt: true, nHuman: true, nMissed: true,
  });
  const set = (k, v) => setTg(o => ({ ...o, [k]: v }));
  return (
    <div className="wc-agent-body wc-set">
      <div className="wc-set-head">
        <div>
          <h2 className="wc-set-h">AI Settings</h2>
          <p className="wc-set-sub">Configure how your AI assistant handles conversations and leads.</p>
        </div>
        <div className="wc-set-head-r">
          <button className="wc-set-help"><Icon name="checkCircle" size={16} />Help</button>
          <button className="wc-set-save">Save Changes</button>
        </div>
      </div>

      <div className="wc-set-status">
        <div className="wc-set-status-l">
          <div className="wc-set-status-t">AI Assistant <span className={'wc-set-pill' + (aiOn ? ' is-on' : '')}>{aiOn ? 'ON' : 'PAUSED'}</span></div>
          <div className="wc-set-status-d">{aiOn ? 'Your AI is active and ready to engage with leads.' : 'Your AI is paused and will not engage leads.'}</div>
        </div>
        <button className="wc-set-pause" onClick={() => setAiOn(o => !o)}><Icon name={aiOn ? 'pause' : 'play'} size={15} />{aiOn ? 'Pause AI' : 'Resume AI'}</button>
      </div>

      <div className="wc-set-grid">
        <SetCard title="Inbound AI" desc="How AI handles incoming leads">
          <div className="wc-set-split">
            <div className="wc-set-panel">
              <SetToggleRow title="Auto Reply" desc="Automatically reply to new conversations" on={tg.autoReply} onChange={v => set('autoReply', v)} />
              <SetToggleRow title="Lead Qualification" desc="Ask qualifying questions and score leads" on={tg.leadQual} onChange={v => set('leadQual', v)} />
              <SetToggleRow title="Appointment Booking" desc="Allow AI to book appointments" on={tg.apptBook} onChange={v => set('apptBook', v)} />
              <SetToggleRow title="Human Takeover Detection" desc="Detect when to escalate to human" on={tg.humanDetect} onChange={v => set('humanDetect', v)} />
            </div>
            <div className="wc-set-side">
              <div className="wc-set-box">
                <div className="wc-set-box-t">Response Time</div>
                <SetRadioRow name="resp" label="Instant" defaultChecked />
                <SetRadioRow name="resp" label="30 Seconds" />
                <SetRadioRow name="resp" label="1 Minute" />
                <SetRadioRow name="resp" label="2 Minutes" />
              </div>
              <div className="wc-set-box">
                <div className="wc-set-box-t">Business Hours</div>
                <div className="wc-set-bh">
                  <div>
                    <div className="wc-set-bh-time">9:00 AM – 7:00 PM</div>
                    <div className="wc-set-bh-days">Mon – Sun</div>
                  </div>
                  <button className="wc-set-bh-edit"><Icon name="pencil" size={14} /></button>
                </div>
              </div>
            </div>
          </div>
        </SetCard>

        <SetCard title="Outbound AI" desc="How AI follows up with leads">
          <div className="wc-set-split">
            <div className="wc-set-panel">
              <SetToggleRow title="Follow-Up AI" desc="Automatically follow up with new leads" on={tg.followUp} onChange={v => set('followUp', v)} />
              <SetToggleRow title="Lead Nurture" desc="Nurture leads over time" on={tg.nurture} onChange={v => set('nurture', v)} />
              <SetToggleRow title="Re-engagement" desc="Re-engage inactive leads" on={tg.reengage} onChange={v => set('reengage', v)} />
              <SetToggleRow title="Stop On Reply" desc="Stop sequence when lead replies" on={tg.stopReply} onChange={v => set('stopReply', v)} />
            </div>
            <div className="wc-set-side">
              <div className="wc-set-box">
                <div className="wc-set-box-t">Follow-Up Frequency</div>
                <SetRadioRow name="freq" label="Aggressive" desc="More frequent follow ups" />
                <SetRadioRow name="freq" label="Standard" desc="Recommended" defaultChecked />
                <SetRadioRow name="freq" label="Light" desc="Less frequent follow ups" />
              </div>
            </div>
          </div>
        </SetCard>

        <SetCard title="AI Qualification" desc="What AI should ask and learn">
          <div className="wc-set-split">
            <div className="wc-set-box">
              <div className="wc-set-box-t"><Icon name="file" size={15} style={{ color: '#5BB4E3' }} /> Buyer Questions</div>
              <div className="wc-set-checks">
                {['Location', 'Price Range', 'Bedrooms', 'Timeline', 'Pre-Approved'].map(q => <SetCheck key={q} label={q} tone="blue" />)}
              </div>
              <button className="wc-set-editq is-blue">Edit Questions</button>
            </div>
            <div className="wc-set-box">
              <div className="wc-set-box-t"><Icon name="home" size={15} style={{ color: 'var(--accent)' }} /> Seller Questions</div>
              <div className="wc-set-checks">
                {['Property Address', 'Timeline', 'Reason For Selling', 'Expected Price', 'Already Listed'].map(q => <SetCheck key={q} label={q} />)}
              </div>
              <button className="wc-set-editq">Edit Questions</button>
            </div>
          </div>
        </SetCard>

        <SetCard title="Appointment Rules" desc="When AI should book appointments">
          <div className="wc-set-split">
            <div className="wc-set-box">
              <div className="wc-set-box-t">Book Appointment When:</div>
              <div className="wc-set-checks">
                {['Lead is qualified', 'Lead asks to tour', 'Lead requests pricing', 'Lead requests consultation'].map(q => <SetCheck key={q} label={q} />)}
              </div>
            </div>
            <div className="wc-set-box">
              <div className="wc-set-box-t">Calendar Connected</div>
              <div className="wc-set-cal">
                <span className="wc-set-cal-ic"><Icon name="calendar" size={18} style={{ color: '#fff' }} /></span>
                <div className="wc-set-cal-txt">
                  <div className="wc-set-cal-name">Google Calendar</div>
                  <div className="wc-set-cal-status"><Icon name="check" size={12} />Connected</div>
                </div>
                <button className="wc-set-cal-more"><Icon name="more" size={16} /></button>
              </div>
              <button className="wc-set-editq">Manage Calendars</button>
            </div>
          </div>
        </SetCard>

        <SetCard title="Human Takeover" desc="When AI should notify you or transfer">
          <div className="wc-set-checks wc-set-checks-2">
            {['Lead requests human', 'AI confidence is low', 'Lead asks a legal question', 'Contract or agreement questions', 'Lead becomes frustrated', 'Urgent or sensitive issues'].map(q => <SetCheck key={q} label={q} />)}
          </div>
          <div className="wc-set-box" style={{ marginTop: '16px' }}>
            <div className="wc-set-box-t">Notification Method</div>
            <div className="wc-set-select">In-App + Email <Icon name="chevronDown" size={14} /></div>
          </div>
        </SetCard>

        <SetCard title="Notifications" desc="Alerts and updates about important events">
          <div className="wc-set-notifs">
            <NotifRow icon="flame" tone="violet" title="Hot Lead Alert" desc="Notify when a lead shows high intent" on={tg.nHot} onChange={v => set('nHot', v)} />
            <NotifRow icon="calendarCheck" tone="green" title="Appointment Ready" desc="Notify when an appointment is booked" on={tg.nAppt} onChange={v => set('nAppt', v)} />
            <NotifRow icon="user" tone="orange" title="Human Takeover Required" desc="Notify when AI needs your attention" on={tg.nHuman} onChange={v => set('nHuman', v)} />
            <NotifRow icon="alert" tone="blue" title="Missed Appointment" desc="Notify when appointment is missed or cancelled" on={tg.nMissed} onChange={v => set('nMissed', v)} />
          </div>
        </SetCard>

        <SetCard title="AI Brain" desc="Personality, tone and behavior">
          <div className="wc-set-brain">
            <div className="wc-set-box">
              <div className="wc-set-box-t">Tone</div>
              <SetRadioRow name="tone" label="Professional" defaultChecked />
              <SetRadioRow name="tone" label="Friendly" />
              <SetRadioRow name="tone" label="Casual" />
            </div>
            <div className="wc-set-box">
              <div className="wc-set-box-t">Goals</div>
              <div className="wc-set-checks">
                <SetCheck label="Qualify Leads" />
                <SetCheck label="Book Appointments" />
                <SetCheck label="Nurture Relationships" />
                <SetCheck label="Close Deals" defaultChecked={false} />
              </div>
            </div>
            <div className="wc-set-box wc-set-instr">
              <div className="wc-set-box-t">Custom Instructions</div>
              <textarea className="wc-set-ta" maxLength={500} defaultValue={"Act like a top-performing real estate ISA. Keep messages short, friendly and focused on helping the lead take the next step. Escalate contract questions to me."} />
              <div className="wc-set-ta-count">143/500</div>
            </div>
          </div>
        </SetCard>

        <SetCard title="Knowledge Base" desc="Information AI uses to answer questions">
          <div className="wc-set-kbs">
            <KbRow icon="user" label="Agent Bio" />
            <KbRow icon="pin" label="Service Areas" />
            <KbRow icon="building" label="Office Information" />
            <KbRow icon="file" label="FAQ" />
            <KbRow icon="clipboard" label="Custom Documents" />
          </div>
        </SetCard>
      </div>
    </div>
  );
}

// ---------- Main agent page ----------
// Sample audience for workflow enrollment (step 2)
const WF_AUD_LEADS = [
  { id: 1, name: 'Marisol Gomez', contact: '(555) 204-1180', source: 'Zillow', type: 'Buyer', stage: 'New Lead', flags: ['Hot Leads', 'Needs Reply'] },
  { id: 2, name: 'Devon Carter', contact: 'devon.c@email.com', source: 'Facebook', type: 'Buyer', stage: 'Contacted', flags: ['No Response 7 Days'] },
  { id: 3, name: 'Anna Lin', contact: '(555) 661-0042', source: 'Open House', type: 'Renter', stage: 'Appointment Set', flags: ['Appointment Ready'] },
  { id: 4, name: 'Carlos Hernandez', contact: 'c.hernandez@email.com', source: 'Referral', type: 'Seller', stage: 'Active Client', flags: ['Hot Leads', 'Human Takeover'] },
  { id: 5, name: 'Priya Patel', contact: '(555) 815-7723', source: 'Zillow', type: 'Investor', stage: 'Engaged', flags: ['Needs Reply'] },
  { id: 6, name: 'Jordan Webb', contact: 'jordan.webb@email.com', source: 'Realtor.com', type: 'Seller', stage: 'Under Contract', flags: [] },
  { id: 7, name: 'Sofia Romano', contact: '(555) 332-9087', source: 'Facebook', type: 'Renter', stage: 'Qualified', flags: ['Appointment Ready', 'Needs Reply'] },
  { id: 8, name: 'Trevor Nash', contact: 'trevor.n@email.com', source: 'Referral', type: 'Investor', stage: 'Closed', flags: ['Hot Leads'] },
  { id: 9, name: 'Bianca Flores', contact: '(555) 770-3318', source: 'Open House', type: 'Buyer', stage: 'Lost', flags: ['No Response 7 Days', 'Human Takeover'] },
];
const WF_AUD_SOURCES = ['Zillow', 'Facebook', 'Open House', 'Referral', 'Realtor.com'];
const WF_AUD_TYPES = ['Buyer', 'Seller', 'Investor', 'Renter'];
const WF_AUD_STAGES = ['New Lead', 'Contacted', 'Engaged', 'Qualified', 'Appointment Set', 'Active Client', 'Under Contract', 'Closed', 'Lost'];
const WF_AUD_FILTERS = ['Hot Leads', 'Needs Reply', 'Appointment Ready', 'Human Takeover', 'No Response 7 Days'];
const wfInitials = n => n.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

function AgentPage({ agentId, go }) {
  const base = AGENTS[agentId] || AGENTS.assistant;
  const [agent, setAgent] = useAS(base);
  const [statusOn, setStatusOn] = useAS(base.statusOn);
  const [subTab, setSubTab] = useAS(agentId === 'ai' ? 'inbound' : null);
  const [outTab, setOutTab] = useAS('workflows');
  const [inTab, setInTab] = useAS('workflows');
  const [createAutoResponse, setCreateAutoResponse] = useAS(false);
  const [inboundList, setInboundList] = useAS(AGENTS.inbound.workflows);
  const [arGoal, setArGoal] = useAS('Qualify Lead');
  const [arTrigger, setArTrigger] = useAS('New Lead');
  const [arCustomTrigger, setArCustomTrigger] = useAS('');
  const [arCustomMessage, setArCustomMessage] = useAS('');
  const [arHours, setArHours] = useAS('Any time');
  const [arHoursStart, setArHoursStart] = useAS('07:00');
  const [arHoursEnd, setArHoursEnd] = useAS('19:00');
  const [addWorkflow, setAddWorkflow] = useAS(false);
  const [browseTemplates, setBrowseTemplates] = useAS(false);
  const [inBrowseTemplates, setInBrowseTemplates] = useAS(false);
  const [templateFilter, setTemplateFilter] = useAS('all');
  const [inTemplateFilter, setInTemplateFilter] = useAS('all');
  const [createWorkflow, setCreateWorkflow] = useAS(false);
  const [workflowStep, setWorkflowStep] = useAS(1);
  const [workflowName, setWorkflowName] = useAS('');
  const [workflowChannels, setWorkflowChannels] = useAS(['sms']);
  const [workflowMessage, setWorkflowMessage] = useAS('');
  const [msgChannel, setMsgChannel] = useAS('sms');
  const [emailSubject, setEmailSubject] = useAS('');
  const [workflowTiming, setWorkflowTiming] = useAS('instant');
  const [tplFollowUps, setTplFollowUps] = useAS([]);
  const [audMode, setAudMode] = useAS('leads');
  const [audSel, setAudSel] = useAS(() => new Set());
  const [audSearch, setAudSearch] = useAS('');
  const [audSource, setAudSource] = useAS(() => new Set());
  const [audType, setAudType] = useAS(() => new Set());
  const [audStage, setAudStage] = useAS(() => new Set());
  const [audFilter, setAudFilter] = useAS(() => new Set());
  const [workflowMode, setWorkflowMode] = useAS('workflow');
  const [tplList, setTplList] = useAS(OUTBOUND_TEMPLATES);
  const [pstNow, setPstNow] = useAS(() => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' }) + ' PST');
  useAE(() => {
    const t = setInterval(() => {
      setPstNow(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' }) + ' PST');
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const [refresh, setRefresh] = useAS(false);
  const tone = AGENT_TONE[agent.color];

  // Workflow audience (step 2) helpers
  const audMatch = WF_AUD_LEADS.filter(l => (audSource.size === 0 || audSource.has(l.source)) && (audType.size === 0 || audType.has(l.type)) && (audStage.size === 0 || audStage.has(l.stage)) && (audFilter.size === 0 || [...audFilter].every(f => (l.flags || []).includes(f))));
  const audCount = audMode === 'leads' ? audSel.size : audMatch.length;
  const audShown = WF_AUD_LEADS.filter(l => !audSearch || (l.name + l.contact + l.source).toLowerCase().includes(audSearch.toLowerCase()));
  const audAll = audSel.size === WF_AUD_LEADS.length;
  const audSome = audSel.size > 0 && !audAll;
  const toggleAud = id => setAudSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAudAll = () => setAudSel(audAll ? new Set() : new Set(WF_AUD_LEADS.map(l => l.id)));
  const toggleAudSrc = v => setAudSource(s => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleAudTyp = v => setAudType(s => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleAudStg = v => setAudStage(s => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleAudFlt = v => setAudFilter(s => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const audChk = (on, some) => ({ width: '22px', height: '22px', borderRadius: '6px', display: 'grid', placeItems: 'center', flex: 'none', border: (on || some) ? 'none' : '2px solid var(--line)', background: (on || some) ? 'var(--accent-strong)' : 'var(--panel)', boxSizing: 'border-box' });

  return (
    <div className="wc-page wc-agent wc-fade" key={agentId}>
      {agentId === 'ai' && (
        <div className="wc-ai-subtabs">
          <button className={'wc-ai-subtab' + (subTab === 'inbound' ? ' is-on' : '')} onClick={() => setSubTab('inbound')}>Inbound</button>
          <button className={'wc-ai-subtab' + (subTab === 'outbound' ? ' is-on' : '')} onClick={() => setSubTab('outbound')}>Outbound</button>
          <button className={'wc-ai-subtab' + (subTab === 'settings' ? ' is-on' : '')} onClick={() => setSubTab('settings')}><Icon name="settings" size={14} /> AI Settings</button>
        </div>
      )}
      
      {subTab !== 'settings' && (
        <div className="wc-stats">
          {(agentId === 'ai') && (
            <div className={'wc-stat-status' + (subTab === 'outbound' ? ' is-orange' : ' is-blue')}>
              <div className="wc-stat-status-label">Status</div>
              <div className="wc-stat-status-on" style={{ color: subTab === 'outbound' ? 'var(--accent-strong)' : 'var(--blue)' }}>
                <span className="wc-stat-status-dot" style={{ background: subTab === 'outbound' ? 'var(--accent-strong)' : 'var(--blue)' }} />
                {statusOn ? 'ON' : 'OFF'}
              </div>
              <Toggle on={statusOn} onChange={setStatusOn} />
            </div>
          )}
          {agentId === 'ai' ? (
            subTab === 'inbound' ? (
              AGENTS.inbound.stats && AGENTS.inbound.stats.map((s, i) => <NurtureStat key={i} label={s.label} value={s.value} desc={s.desc} />)
            ) : (
              AGENTS.outbound.stats && AGENTS.outbound.stats.map((s, i) => <NurtureStat key={i} label={s.label} value={s.value} desc={s.desc} />)
            )
          ) : (
            agent.stats && agent.stats.map((s, i) => <NurtureStat key={i} label={s.label} value={s.value} desc={s.desc} />)
          )}
        </div>
      )}

      {agentId === 'ai' && subTab === 'inbound' && (
        <div className="wc-agent-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div className="wc-tabs">
              <button className="wc-tab is-on">Workflows <span className="wc-tab-c">{inboundList.length}</span></button>
            </div>
            <button style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-strong)', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: '.15s' }} onMouseOver={e => e.target.style.opacity = '0.9'} onMouseOut={e => e.target.style.opacity = '1'} onClick={() => setCreateAutoResponse(true)}><Icon name="plus" size={16} style={{ marginRight: '6px', display: 'inline' }} />Create auto-response</button>
          </div>
          <AutoRoutePanel />
          <div className="wc-wf-list">
            {inboundList.map((w, i) => <WorkflowRow key={w.id} w={w} isFirst={i === 0} tone={AGENT_TONE[AGENTS.inbound.color]} onToggle={() => { w.live = !w.live; setInboundList(prev => [...prev]); }} onDelete={() => setInboundList(prev => prev.filter(x => x.id !== w.id))} onDuplicate={() => {}} />)}
          </div>
          {createAutoResponse && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setCreateAutoResponse(false)}>
              <div style={{ background: 'var(--panel)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--ink)', margin: 0 }}>Create Auto Response</h2>
                  <button onClick={() => setCreateAutoResponse(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--ink-2)', padding: '0', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', transition: '.15s' }} onMouseOver={e => e.target.style.background = 'var(--line-soft)'} onMouseOut={e => e.target.style.background = 'none'}>×</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '12px' }}>Goal</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {['Qualify Lead', 'Book Appointment', 'Re-Engage Lead', 'Human Takeover'].map(goal => (
                        <label key={goal} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', border: '1px solid var(--line)', cursor: 'pointer', transition: '.15s' }} onMouseOver={e => e.target.parentElement.style.background = 'var(--line-soft)'} onMouseOut={e => e.target.parentElement.style.background = 'transparent'}>
                          <input type="radio" name="goal" value={goal} checked={arGoal === goal} onChange={() => setArGoal(goal)} style={{ cursor: 'pointer' }} />
                          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--ink)' }}>{goal}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '12px' }}>Trigger</label>
                    <select value={arTrigger} onChange={e => setArTrigger(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit' }}>
                      <option>New Lead</option>
                      <option>Website Form</option>
                      <option>Facebook Lead</option>
                      <option>Zillow Lead</option>
                      <option>Missed Call</option>
                      <option>Custom…</option>
                    </select>
                    {arTrigger === 'Custom…' && (
                      <div style={{ marginTop: '10px' }}>
                        <input type="text" value={arCustomTrigger} onChange={e => setArCustomTrigger(e.target.value)} autoFocus placeholder="e.g. Lead texts the word &quot;TOUR&quot;" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        <div style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '6px', lineHeight: 1.4 }}>Describe the phrase or condition that makes the AI auto-respond — e.g. a keyword, a question type, or an event.</div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--ink-3)', margin: '14px 0 6px' }}>Custom response message</label>
                        <textarea value={arCustomMessage} onChange={e => setArCustomMessage(e.target.value)} placeholder="e.g. Thanks for reaching out! I'd love to set up a tour — what day works best for you?" rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
                        <div style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '6px', lineHeight: 1.4 }}>The AI sends this message when the custom trigger fires. Leave blank to let the AI write its own reply.</div>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '12px' }}>AI Will</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {[
                        { col: 1, actions: ['Reply instantly', 'Qualify the lead', 'Build lead profile'] },
                        { col: 2, actions: ['Detect appointment intent', 'Book appointments', 'Notify agent when needed'] }
                      ].map(col => (
                        <div key={col.col} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {col.actions.map(action => (
                            <label key={action} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', cursor: 'pointer' }}>
                              <input type="checkbox" defaultChecked style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--accent-strong)' }} />
                              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>✓ {action}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '12px' }}>Advanced Settings</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--ink-3)', marginBottom: '6px' }}>Response Delay</label>
                        <select style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option>Immediately</option>
                          <option>5 minutes</option>
                          <option>15 minutes</option>
                          <option>30 minutes</option>
                          <option>1 hour</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--ink-3)', marginBottom: '6px' }}>Channels</label>
                        <select style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option>SMS</option>
                          <option>Email</option>
                          <option>Both (SMS & Email)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--ink-3)', marginBottom: '6px' }}>Business Hours</label>
                        <select value={arHours} onChange={e => setArHours(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit' }}>
                          <option>Any time</option>
                          <option>Custom hours</option>
                        </select>
                        {arHours === 'Custom hours' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                            <input type="time" value={arHoursStart} onChange={e => setArHoursStart(e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                            <span style={{ fontSize: '13px', color: 'var(--ink-3)', fontWeight: '600' }}>to</span>
                            <input type="time" value={arHoursEnd} onChange={e => setArHoursEnd(e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                  <button style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--panel)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} onClick={() => setCreateAutoResponse(false)}>Cancel</button>
                  <button style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-strong)', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} onClick={() => {
                    const triggerLabel = arTrigger === 'Custom…' ? (arCustomTrigger.trim() || 'Custom trigger') : arTrigger;
                    const nw = { id: 'ar' + Date.now(), name: arGoal, icon: 'zap', live: true, runs: 0, triggers: [triggerLabel], actions: ['Reply instantly', 'Qualify the lead', 'Build lead profile'], outcomes: [{ label: 'Qualified → Book Appointment', tone: 'green', icon: 'check' }, { label: 'Hot → Notify', tone: 'orange', icon: 'flame' }, { label: 'Not qualified → End', tone: 'gray', icon: 'x' }] };
                    setInboundList(prev => [nw, ...prev]);
                    setCreateAutoResponse(false);
                    setArGoal('Qualify Lead'); setArTrigger('New Lead'); setArCustomTrigger(''); setArCustomMessage('');
                  }}><Icon name="check" size={14} style={{ marginRight: '6px', display: 'inline' }} />Create</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {agentId === 'ai' && subTab === 'outbound' && (
        <div className="wc-agent-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div className="wc-tabs">
              <button className={'wc-tab' + (outTab === 'workflows' ? ' is-on' : '')} onClick={() => setOutTab('workflows')}>Workflows <span className="wc-tab-c">{AGENTS.outbound.workflows.length}</span></button>
              <button className={'wc-tab' + (outTab === 'templates' ? ' is-on' : '')} onClick={() => setOutTab('templates')}>Templates</button>
            </div>
            {outTab === 'workflows' && (
            <div style={{ position: 'relative' }}>
              <button style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-strong)', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: '.15s', display: 'flex', alignItems: 'center', gap: '6px' }} onMouseOver={e => e.currentTarget.style.opacity = '0.9'} onMouseOut={e => e.currentTarget.style.opacity = '1'} onClick={() => setAddWorkflow(o => !o)}><Icon name="plus" size={16} />Add workflow <span style={{ fontSize: '10px', marginLeft: '2px' }}>▼</span></button>
              {addWorkflow && (
                <React.Fragment>
                <div onClick={() => setAddWorkflow(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }}></div>
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: 'var(--panel)', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid var(--line)', zIndex: 100, minWidth: '320px', padding: '8px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                  <button style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', transition: '.15s', display: 'flex', gap: '14px', alignItems: 'center' }} onMouseOver={e => e.currentTarget.style.background = 'var(--line-soft)'} onMouseOut={e => e.currentTarget.style.background = 'none'} onClick={() => { setAddWorkflow(false); setWorkflowMode('workflow'); setCreateWorkflow(true); setWorkflowStep(1); setWorkflowName(''); setWorkflowChannels(['sms']); setWorkflowMessage(''); setEmailSubject(''); setTplFollowUps([]); }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#F1F1F2', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="plus" size={20} style={{ color: 'var(--ink-2)' }} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--ink)', marginBottom: '2px' }}>Start from scratch</div>
                      <div style={{ fontSize: '13px', color: 'var(--ink-3)', lineHeight: 1.4 }}>Build a new automation step by step</div>
                    </div>
                  </button>
                  <button style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', transition: '.15s', display: 'flex', gap: '14px', alignItems: 'center' }} onMouseOver={e => e.currentTarget.style.background = 'var(--line-soft)'} onMouseOut={e => e.currentTarget.style.background = 'none'} onClick={() => { setAddWorkflow(false); setBrowseTemplates(true); }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#FFF1E8', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="layers" size={20} style={{ color: 'var(--accent-strong)' }} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--ink)', marginBottom: '2px' }}>Browse templates</div>
                      <div style={{ fontSize: '13px', color: 'var(--ink-3)', lineHeight: 1.4 }}>Start from a proven follow-up sequence</div>
                    </div>
                  </button>
                </div>
                </React.Fragment>
              )}
            </div>
            )}
          </div>
          {outTab === 'workflows' && <OutboundCampaigns workflows={AGENTS.outbound.workflows} />}
          {outTab === 'templates' && <TemplatesTab list={tplList} setList={setTplList} onNew={() => { setWorkflowMode('template'); setCreateWorkflow(true); setWorkflowStep(1); setWorkflowName(''); setWorkflowChannels(['sms']); setMsgChannel('sms'); setWorkflowMessage(''); setEmailSubject(''); setWorkflowTiming('instant'); setTplFollowUps([]); }} />}
          {browseTemplates && <BrowseTemplatesModal templates={tplList} onClose={() => setBrowseTemplates(false)} onUse={(t, chan) => {
            const useChan = chan || t.channel || 'sms';
            const flow = (useChan === 'email' && Array.isArray(t.emailFlow)) ? t.emailFlow : t.flow;
            const first = (flow && flow[0]) || {};
            setBrowseTemplates(false);
            setWorkflowName(t.name);
            setWorkflowChannels([useChan]);
            setMsgChannel(useChan);
            setWorkflowMessage(first.text || first.body || '');
            setEmailSubject(first.subject || '');
            setWorkflowTiming(first.instant ? 'instant' : 'scheduled');
            setTplFollowUps((flow || []).slice(1).map((s, idx) => ({ id: Date.now() + idx, time: '10:00', timezone: 'PST', channel: s.channel || useChan, message: s.text || s.body || '', subject: s.subject || '', date: '' })));
            setWorkflowMode('workflow');
            setWorkflowStep(1);
            setCreateWorkflow(true);
          }} />}
        </div>
      )}

      {agentId === 'ai' && subTab === 'outbound' && createWorkflow && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setCreateWorkflow(false)}>
              <div style={{ background: 'var(--panel)', borderRadius: '12px', padding: '32px', width: '90%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon name={workflowMode === 'template' ? 'layers' : 'outbound'} size={22} style={{ color: 'var(--accent-strong)' }} />
                      <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--ink)', margin: 0 }}>{workflowMode === 'template' ? 'Create New Template' : 'Create New Workflow'}</h2>
                    </div>
                    <button onClick={() => setCreateWorkflow(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-2)', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', transition: '.15s' }} onMouseOver={e => e.currentTarget.style.background = 'var(--line-soft)'} onMouseOut={e => e.currentTarget.style.background = 'none'}><Icon name="x" size={20} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(workflowMode === 'template' ? [1, 2] : [1, 2, 3]).map(step => (
                      <div key={step} style={{ flex: 1, height: '6px', background: step <= workflowStep ? 'var(--accent-strong)' : '#e5e5e5', borderRadius: '3px', transition: '.3s' }}></div>
                    ))}
                  </div>
                </div>

                {/* Step 1: Create New Workflow */}
                {workflowStep === 1 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                      <div>
                        <h3 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--ink)', margin: '0 0 8px 0' }}>{workflowMode === 'template' ? 'Create New Template' : 'Create New Workflow'}</h3>
                        <p style={{ fontSize: '16px', color: 'var(--ink-3)', margin: 0 }}>{workflowMode === 'template' ? 'Build a reusable sequence to save and use later' : 'Set up your outreach in seconds'}</p>
                      </div>
                      <div style={{ fontSize: '16px', color: 'var(--ink-3)', fontWeight: '600', whiteSpace: 'nowrap', flex: 'none' }}>Step 1 of {workflowMode === 'template' ? 2 : 3}</div>
                    </div>

                    <div style={{ marginBottom: '32px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--ink)', marginBottom: '12px' }}>{workflowMode === 'template' ? 'Template Name' : 'Workflow Name'}</label>
                      <input type="text" placeholder={workflowMode === 'template' ? 'New Lead Follow-Up' : 'Spring Buyer Leads'} value={workflowName} onChange={e => setWorkflowName(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid var(--accent-strong)', fontSize: '16px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      <div style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '8px', textAlign: 'right' }}>{workflowName.length}/80</div>
                      {!workflowName.trim() && <div style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '2px' }}>{workflowMode === 'template' ? 'Give your template a name to continue.' : 'Give your workflow a name to continue.'}</div>}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: '16px' }}>Choose Channel</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
                        {[
                          { id: 'sms', name: 'SMS', desc: 'Fast replies', icon: 'message', iconColor: 'var(--accent-strong)', iconBg: '#FFF1E8' },
                          { id: 'email', name: 'Email', desc: 'Rich content', icon: 'mail', iconColor: 'rgb(14, 165, 233)', iconBg: '#E7F4FB' }
                        ].map(ch => (
                          <button key={ch.id} onClick={() => setWorkflowChannels(prev => prev.includes(ch.id) ? (prev.length > 1 ? prev.filter(c => c !== ch.id) : prev) : [...prev, ch.id])} style={{ padding: '20px', borderRadius: '12px', border: workflowChannels.includes(ch.id) ? '2px solid var(--accent-strong)' : '1px solid var(--line)', background: workflowChannels.includes(ch.id) ? '#fff8f5' : 'var(--panel)', cursor: 'pointer', textAlign: 'left', transition: '.15s', display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: ch.iconBg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={ch.icon} size={22} style={{ color: ch.iconColor }} /></div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--ink)', marginBottom: '4px' }}>{ch.name}</div>
                              <div style={{ fontSize: '14px', color: 'var(--ink-3)' }}>{ch.desc}</div>
                            </div>
                            {workflowChannels.includes(ch.id) && <div style={{ position: 'absolute', top: '12px', right: '12px', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent-strong)', display: 'grid', placeItems: 'center' }}><Icon name="check" size={14} style={{ color: '#fff' }} /></div>}
                          </button>
                        ))}
                      </div>
                      <div style={{ paddingTop: '16px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: 'var(--ink-2)' }}>
                          <Icon name="checkCircle" size={18} style={{ color: 'var(--accent-strong)', flex: 'none' }} />
                          <span><strong style={{ color: 'var(--ink)' }}>SMS</strong> – higher reply rate</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: 'var(--ink-2)' }}>
                          <Icon name="checkCircle" size={18} style={{ color: 'var(--accent-strong)', flex: 'none' }} />
                          <span><strong style={{ color: 'var(--ink)' }}>Email</strong> – better for long messages</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Craft Your Message */}
                {workflowStep === 2 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                      <div>
                        <h3 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--ink)', margin: '0 0 8px 0' }}>Craft Your Message</h3>
                        <p style={{ fontSize: '16px', color: 'var(--ink-3)', margin: 0 }}>Write the message and follow-up sequence</p>
                      </div>
                      <div style={{ fontSize: '16px', color: 'var(--ink-3)', fontWeight: '600', whiteSpace: 'nowrap', flex: 'none' }}>Step 2 of {workflowMode === 'template' ? 2 : 3}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                      {/* Left Column */}
                      <div>
                        {/* Audience — who to enroll (workflow only) */}
                        {workflowMode !== 'template' && (
                          <div style={{ padding: '20px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '12px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Icon name="users" size={16} style={{ color: 'var(--accent-strong)', flex: 'none' }} />
                                  <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--ink)', whiteSpace: 'nowrap' }}>Who to enroll</span>
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--ink-3)', marginTop: '4px' }}>Pick specific leads, or enroll everyone matching a filter.</div>
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-strong)', background: '#FFF1E8', padding: '5px 12px', borderRadius: '999px', whiteSpace: 'nowrap', flex: 'none' }}>{audCount} {audMode === 'leads' ? 'selected' : 'leads match'}</span>
                            </div>

                            {/* mode toggle */}
                            <div style={{ display: 'inline-flex', background: 'var(--line-soft)', borderRadius: '10px', padding: '3px', gap: '3px', marginBottom: '16px' }}>
                              {[['leads', 'Select leads', 'check'], ['filters', 'Use filters', 'filter']].map(([id, label, icon]) => (
                                <button key={id} onClick={() => setAudMode(id)} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: audMode === id ? 'var(--panel)' : 'transparent', color: audMode === id ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', boxShadow: audMode === id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', display: 'flex', alignItems: 'center', gap: '6px', transition: '.15s' }}><Icon name={icon} size={14} />{label}</button>
                              ))}
                            </div>

                            {audMode === 'leads' ? (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', border: '1px solid var(--line)', borderRadius: '10px', marginBottom: '12px', color: 'var(--ink-3)' }}>
                                  <Icon name="search" size={15} />
                                  <input value={audSearch} onChange={e => setAudSearch(e.target.value)} placeholder="Search leads…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '14px', fontFamily: 'inherit', width: '100%', color: 'var(--ink)' }} />
                                </div>
                                <div style={{ border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' }}>
                                  <button onClick={toggleAudAll} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr 96px 64px', alignItems: 'center', gap: '14px', padding: '12px 16px', background: 'var(--line-soft)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                    <span style={audChk(audAll, audSome)}>{audAll ? <Icon name="check" size={13} style={{ color: '#fff' }} /> : audSome ? <Icon name="minus" size={13} style={{ color: '#fff' }} /> : null}</span>
                                    <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)' }}>{audAll ? 'Deselect all' : 'Select all'}</span>
                                    <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)' }}>Source</span>
                                    <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)' }}>Type</span>
                                  </button>
                                  <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                    {audShown.length === 0 ? (
                                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-3)', fontSize: '14px' }}>No leads match “{audSearch}”</div>
                                    ) : audShown.map(l => {
                                      const on = audSel.has(l.id);
                                      return (
                                        <button key={l.id} onClick={() => toggleAud(l.id)} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr 96px 64px', alignItems: 'center', gap: '14px', padding: '12px 16px', background: on ? '#FFF6F0' : 'var(--panel)', border: 'none', borderTop: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left' }}>
                                          <span style={audChk(on, false)}>{on && <Icon name="check" size={13} style={{ color: '#fff' }} />}</span>
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                            <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--line-soft)', color: 'var(--ink-2)', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: '700', flex: 'none' }}>{wfInitials(l.name)}</span>
                                            <span style={{ minWidth: 0 }}>
                                              <span style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                                              <span style={{ display: 'block', fontSize: '13px', color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.contact}</span>
                                            </span>
                                          </span>
                                          <span style={{ fontSize: '13px', color: 'var(--ink-2)' }}>{l.source}</span>
                                          <span><span style={{ fontSize: '12px', fontWeight: '700', color: l.type === 'Seller' ? 'var(--accent-strong)' : '#0EA5E9', background: l.type === 'Seller' ? '#FFF1E8' : '#E7F4FB', padding: '3px 8px', borderRadius: '6px' }}>{l.type}</span></span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--ink-3)', marginTop: '12px' }}><strong style={{ color: 'var(--ink-2)' }}>{audSel.size}</strong> of {WF_AUD_LEADS.length} leads selected for enrollment.</div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ marginBottom: '18px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: '10px' }}>Lead type</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {WF_AUD_TYPES.map(t => {
                                      const on = audType.has(t);
                                      return <button key={t} onClick={() => toggleAudTyp(t)} style={{ padding: '8px 14px', borderRadius: '999px', border: on ? '1.5px solid var(--accent-strong)' : '1.5px solid var(--line)', background: on ? '#FFF1E8' : 'var(--panel)', color: on ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: '.15s' }}>{on && <Icon name="check" size={13} />}{t}</button>;
                                    })}
                                  </div>
                                </div>
                                <div style={{ marginBottom: '18px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: '10px' }}>Stage</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {WF_AUD_STAGES.map(st => {
                                      const on = audStage.has(st);
                                      const dot = { 'New Lead': '#FF6A3D', 'Contacted': '#FFA630', 'Engaged': '#3DBFF2', 'Qualified': '#8B5CF6', 'Appointment Set': '#0EA5E9', 'Active Client': '#10B981', 'Under Contract': '#F59E0B', 'Closed': '#16A34A', 'Lost': '#94A3B8' }[st];
                                      return <button key={st} onClick={() => toggleAudStg(st)} style={{ padding: '8px 14px', borderRadius: '999px', border: on ? '1.5px solid var(--accent-strong)' : '1.5px solid var(--line)', background: on ? '#FFF1E8' : 'var(--panel)', color: on ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', transition: '.15s' }}>{on ? <Icon name="check" size={13} /> : <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot, flex: 'none' }} />}{st}</button>;
                                    })}
                                  </div>
                                </div>
                                <div style={{ marginBottom: '18px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: '10px' }}>Filters</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {WF_AUD_FILTERS.map(f => {
                                      const on = audFilter.has(f);
                                      return <button key={f} onClick={() => toggleAudFlt(f)} style={{ padding: '8px 14px', borderRadius: '999px', border: on ? '1.5px solid var(--accent-strong)' : '1.5px solid var(--line)', background: on ? '#FFF1E8' : 'var(--panel)', color: on ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', transition: '.15s' }}><span style={{ width: '16px', height: '16px', borderRadius: '5px', display: 'grid', placeItems: 'center', flex: 'none', border: on ? 'none' : '1.5px solid var(--line)', background: on ? 'var(--accent-strong)' : 'transparent' }}>{on && <Icon name="check" size={11} style={{ color: '#fff' }} />}</span>{f}</button>;
                                    })}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', padding: '14px 16px', background: '#fff8f5', border: '1px solid #ffd9c2', borderRadius: '12px', alignItems: 'flex-start' }}>
                                  <Icon name="filter" size={16} style={{ color: 'var(--accent-strong)', flex: 'none', marginTop: '2px' }} />
                                  <div style={{ fontSize: '13px', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                                    <strong style={{ color: 'var(--ink)' }}>{audMatch.length} lead{audMatch.length === 1 ? '' : 's'}</strong> currently match{(audType.size || audStage.size || audFilter.size) ? ' these filters' : ' (no filter — everyone)'}. New leads that match will be enrolled automatically as they come in.
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Channel & Enrollment */}
                        <div style={{ padding: '20px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '12px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '8px' }}>Channel</div>
                            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--ink)' }}>{workflowChannels.map(c => c === 'sms' ? 'SMS' : 'Email').join(' + ')}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '8px' }}>Enrollment</div>
                            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--ink)' }}>{workflowMode === 'template' ? 'As leads opt in' : audMode === 'leads' ? (audCount + ' lead' + (audCount === 1 ? '' : 's') + ' selected') : (audCount + ' match filters')}</div>
                          </div>
                        </div>

                        {/* Message Card */}
                        <div style={{ padding: '20px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '12px' }}>
                          {/* Initial Message header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'nowrap', minWidth: 0 }}>
                            <Icon name="sparkles" size={15} style={{ color: 'var(--accent-strong)', flex: 'none' }} />
                            <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--ink)', whiteSpace: 'nowrap' }}>Initial Message</span>
                            <span style={{ fontSize: '12px', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: '3px', flex: 'none', whiteSpace: 'nowrap' }}><Icon name="clock" size={12} />{pstNow}</span>
                          </div>
                          {/* Message channel selector */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Message Type</span>
                            <div style={{ display: 'inline-flex', background: 'var(--line-soft)', borderRadius: '10px', padding: '3px', gap: '3px' }}>
                              <button onClick={() => setMsgChannel('sms')} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', background: msgChannel === 'sms' ? 'var(--panel)' : 'transparent', color: msgChannel === 'sms' ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', boxShadow: msgChannel === 'sms' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', display: 'flex', alignItems: 'center', gap: '6px', transition: '.15s' }}><Icon name="message" size={14} />SMS</button>
                              <button onClick={() => setMsgChannel('email')} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', background: msgChannel === 'email' ? 'var(--panel)' : 'transparent', color: msgChannel === 'email' ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', boxShadow: msgChannel === 'email' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', display: 'flex', alignItems: 'center', gap: '6px', transition: '.15s' }}><Icon name="mail" size={14} />Email</button>
                            </div>
                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' }}>
                              <button style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--panel)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-2)' }}><Icon name="plus" size={14} />Add files</button>
                              <AIWriteMenu onPick={(tone) => { const d = aiToneText(tone); setWorkflowMessage(d.text); if (msgChannel === 'email') setEmailSubject(d.subject); }} />
                            </div>
                          </div>
                          {/* Subject line (email only) */}
                          {msgChannel === 'email' && (
                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--ink)', marginBottom: '6px' }}>Subject</label>
                              <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Enter email subject..." style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                            </div>
                          )}
                          <textarea value={workflowMessage} onChange={e => setWorkflowMessage(e.target.value)} placeholder={msgChannel === 'email' ? 'Write your email body...' : 'Write your message...'} style={{ width: '100%', padding: '16px', borderRadius: '10px', border: '2px solid var(--accent-strong)', fontSize: '14px', fontFamily: 'inherit', minHeight: '150px', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '12px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{workflowMessage.length} chars · {Math.max(1, Math.ceil(workflowMessage.length / 160))}/5 segments</div>
                          </div>

                          {/* When to send - initial message only */}
                          <div style={{ marginTop: '16px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--ink)', marginBottom: '10px' }}>When to send the opening</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'inline-flex', background: 'var(--line-soft)', borderRadius: '10px', padding: '3px', gap: '3px' }}>
                                <button onClick={() => setWorkflowTiming('instant')} style={{ padding: '7px 18px', borderRadius: '7px', border: 'none', background: workflowTiming === 'instant' ? 'var(--panel)' : 'transparent', color: workflowTiming === 'instant' ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', boxShadow: workflowTiming === 'instant' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', transition: '.15s' }}>Instant</button>
                                <button onClick={() => setWorkflowTiming('scheduled')} style={{ padding: '7px 18px', borderRadius: '7px', border: 'none', background: workflowTiming === 'scheduled' ? 'var(--panel)' : 'transparent', color: workflowTiming === 'scheduled' ? 'var(--accent-strong)' : 'var(--ink-2)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', boxShadow: workflowTiming === 'scheduled' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', transition: '.15s' }}>At a time</button>
                              </div>
                              {workflowTiming === 'scheduled' && (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--panel)', fontSize: '13px', fontWeight: '600', color: 'var(--ink)' }}>
                                    <Icon name="calendar" size={14} style={{ color: 'var(--ink-3)' }} />
                                    <input type="date" defaultValue={new Date().toISOString().slice(0, 10)} style={{ border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit', fontWeight: '600', color: 'var(--ink)', background: 'transparent', cursor: 'pointer' }} />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--panel)', fontSize: '13px', fontWeight: '600', color: 'var(--ink)' }}>
                                    <Icon name="clock" size={14} style={{ color: 'var(--ink-3)' }} />
                                    <input type="time" defaultValue="09:00" style={{ border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'inherit', fontWeight: '600', color: 'var(--ink)', background: 'transparent', cursor: 'pointer' }} />
                                  </div>
                                  <div style={{ position: 'relative' }}>
                                    <select style={{ padding: '7px 28px 7px 12px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit', background: 'var(--panel)', appearance: 'none', fontWeight: '600', color: 'var(--ink)', cursor: 'pointer' }}>
                                      <option>PST</option><option>EST</option><option>CST</option><option>MST</option>
                                    </select>
                                    <Icon name="chevronDown" size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)' }} />
                                  </div>
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

                {/* Step 3: Review & Launch */}
                {workflowStep === 3 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                      <div>
                        <h3 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--ink)', margin: '0 0 8px 0' }}>{workflowMode === 'template' ? 'Review & Save' : 'Review & Launch'}</h3>
                        <p style={{ fontSize: '16px', color: 'var(--ink-3)', margin: 0 }}>{workflowMode === 'template' ? 'Double-check your template before saving it' : 'Double-check your workflow settings before sending'}</p>
                      </div>
                      <div style={{ fontSize: '16px', color: 'var(--ink-3)', fontWeight: '600', whiteSpace: 'nowrap', flex: 'none' }}>Step 3 of 3</div>
                    </div>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
                      {[
                        { icon: 'users', label: 'Enrollment', value: 'Opt-in', desc: 'as leads join' },
                        { icon: 'message', label: 'Channel', value: workflowChannels.map(c => c === 'sms' ? 'SMS' : 'Email').join(' + '), desc: workflowChannels.length + (workflowChannels.length > 1 ? ' channels' : ' channel') },
                        { icon: 'clock', label: 'Follow-ups', value: String((tplFollowUps || []).length), desc: 'messages' },
                        { icon: 'checkCircle', label: 'Stop Rules', value: 'Reply + Appt', desc: '2 rules active' }
                      ].map((stat, i) => (
                        <div key={i} style={{ padding: '18px', borderRadius: '14px', border: '1px solid var(--line)', background: 'var(--panel)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-3)', marginBottom: '12px' }}>
                            <Icon name={stat.icon} size={15} />
                            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em' }}>{stat.label}</span>
                          </div>
                          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--ink)', marginBottom: '4px', lineHeight: 1 }}>{stat.value}</div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{stat.desc}</div>
                        </div>
                      ))}
                    </div>

                    {/* Message Flow */}
                    <div style={{ padding: '20px', background: 'var(--line-soft)', borderRadius: '14px', marginBottom: '24px' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', margin: '0 0 16px 0' }}>Message Flow - How This Workflow Runs</h4>
                      {(() => {
                        const fmtTime = (t) => {
                          if (!t) return '';
                          const [h, m] = t.split(':').map(Number);
                          const ap = h >= 12 ? 'PM' : 'AM';
                          const hh = ((h + 11) % 12) + 1;
                          return hh + ':' + String(m).padStart(2, '0') + ' ' + ap;
                        };
                        const fmtDate = (d) => {
                          if (!d) return '';
                          const dt = new Date(d + 'T00:00:00');
                          return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        };
                        const chMeta = (c) => c === 'email'
                          ? { label: 'Email', icon: 'mail', fg: 'rgb(14,165,233)', bg: '#E7F4FB' }
                          : { label: 'SMS', icon: 'message', fg: 'var(--accent-strong)', bg: '#FFEDE3' };
                        const messages = [
                          { channel: msgChannel, subject: msgChannel === 'email' ? emailSubject : '', body: workflowMessage, when: workflowTiming === 'instant' ? 'Sent immediately when the lead opts in' : 'Sent at your scheduled opening time', tag: 'Opening message' },
                          ...(tplFollowUps || []).map((f, i) => {
                            const c = f.channel || 'sms';
                            const when = (f.date ? fmtDate(f.date) : 'Follow-up') + (f.time ? ' at ' + fmtTime(f.time) : '') + (f.timezone ? ' ' + f.timezone : '');
                            return { channel: c, subject: c === 'email' ? f.subject : '', body: f.message, when, tag: 'Follow-up ' + (i + 1) };
                          }),
                        ];
                        const steps = [
                          ...messages.map(m => ({ type: 'message', ...m })),
                          { type: 'stop', icon: 'checkCircle', title: 'Workflow stops', desc: 'when lead replies or when appointment booked', fg: '#16A34A', bg: '#DCFCE7' },
                        ];
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {steps.map((item, i, arr) => (
                              <React.Fragment key={i}>
                                {item.type === 'message' ? (() => {
                                  const cm = chMeta(item.channel);
                                  return (
                                    <div style={{ padding: '16px', background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--line)', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: cm.bg, color: cm.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={cm.icon} size={18} /></div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                          <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--ink)' }}>{item.tag}</span>
                                          <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.04em', padding: '3px 8px', borderRadius: '999px', background: cm.bg, color: cm.fg }}>{cm.label}</span>
                                        </div>
                                        {item.subject ? <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--ink-2)', marginTop: '6px' }}>Subject: {item.subject}</div> : null}
                                        <div style={{ fontSize: '13px', color: 'var(--ink-2)', marginTop: '4px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.body ? '"' + item.body + '"' : <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>No message written yet</span>}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '12px', fontWeight: '600', color: 'var(--ink-3)' }}><Icon name="clock" size={13} />{item.when}</div>
                                      </div>
                                    </div>
                                  );
                                })() : (
                                  <div style={{ padding: '16px', background: 'var(--panel)', borderRadius: '12px', display: 'flex', gap: '14px', alignItems: 'flex-start', border: '1px solid var(--line)' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: item.bg, color: item.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={item.icon} size={18} /></div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--ink)' }}>{item.title}</div>
                                      <div style={{ fontSize: '13px', color: 'var(--ink-3)', marginTop: '3px' }}>{item.desc}</div>
                                    </div>
                                  </div>
                                )}
                                {i < arr.length - 1 && (
                                  <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--ink-3)', padding: '8px 0' }}><Icon name="chevronDown" size={16} /></div>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Send Timing */}
                    <div style={{ marginBottom: '24px' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: '12px' }}>Send Timing</h4>
                      <div style={{ padding: '16px', background: '#fff8f5', borderRadius: '12px', border: '2px solid var(--accent-strong)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '5px solid var(--accent-strong)', flex: 'none', boxSizing: 'border-box' }}></div>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--ink)' }}>Start Workflow</div>
                          <div style={{ fontSize: '13px', color: 'var(--ink-3)', marginTop: '2px' }}>The workflow starts running immediately after you launch it.</div>
                        </div>
                      </div>
                    </div>

                    {/* Workflow Stop Rules */}
                    <div>
                      <h4 style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: '12px' }}>Workflow Stop Rules</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                        {[
                          { checked: true, text: 'Stop follow-ups when lead replies' },
                          { checked: true, text: 'Stop when appointment is booked' }
                        ].map((rule, i) => (
                          <div key={i} style={{ padding: '12px', background: 'var(--panel)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input type="checkbox" defaultChecked={rule.checked} style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--accent-strong)' }} />
                            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--ink)' }}>{rule.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer Buttons */}
                <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid var(--line)', display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button onClick={() => setWorkflowStep(Math.max(1, workflowStep - 1))} style={{ padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--ink-2)', fontSize: '14px', fontWeight: '600', cursor: workflowStep === 1 ? 'not-allowed' : 'pointer', opacity: workflowStep === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '6px', transition: '.15s', visibility: workflowStep === 1 ? 'hidden' : 'visible' }}>← Back</button>
                  {workflowStep < (workflowMode === 'template' ? 2 : 3) ? (
                    <button onClick={() => { if (!(workflowStep === 1 && !workflowName.trim())) setWorkflowStep(workflowStep + 1); }} disabled={workflowStep === 1 && !workflowName.trim()} style={{ padding: '12px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent-strong)', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: (workflowStep === 1 && !workflowName.trim()) ? 'not-allowed' : 'pointer', opacity: (workflowStep === 1 && !workflowName.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '6px', transition: '.15s' }}>Continue →</button>
                  ) : workflowMode === 'template' ? (
                    <button onClick={() => {
                      const ch = msgChannel;
                      const flow = [ ch === 'email'
                        ? { day: 'Day 0', instant: workflowTiming === 'instant', channel: 'email', subject: emailSubject, body: workflowMessage }
                        : { day: 'Day 0', instant: workflowTiming === 'instant', channel: 'sms', text: workflowMessage } ];
                      (tplFollowUps || []).forEach((f, idx) => {
                        const fch = f.channel || 'sms';
                        flow.push(fch === 'email'
                          ? { day: 'Day ' + (idx + 1), channel: 'email', subject: f.subject || '', body: f.message || '' }
                          : { day: 'Day ' + (idx + 1), channel: 'sms', text: f.message || '' });
                      });
                      setTplList(prev => [{ id: 'tpl' + Date.now(), channel: ch, name: workflowName.trim() || 'Untitled Template', stage: 'CUSTOM', sent: 0, flow }, ...prev]);
                      setCreateWorkflow(false); setWorkflowStep(1); setWorkflowMode('workflow'); setOutTab('templates');
                    }} style={{ padding: '12px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent-strong)', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="check" size={16} />Save Template</button>
                  ) : (
                    <button onClick={() => { setCreateWorkflow(false); setWorkflowStep(1); }} style={{ padding: '12px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent-strong)', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>↳ Start Workflow</button>
                  )}
                </div>
              </div>
            </div>
          )}

      {agentId === 'ai' && subTab === 'settings' && <AISettings />}

      {agentId !== 'ai' && (
        <div className="wc-agent-body">
          {agent.capabilities && (
            <div className="wc-caps">
              {agent.capabilities.map((cap, i) => (
                <div className="wc-cap" key={i}>
                  <span className="wc-cap-icon" style={{ color: tone.fg, background: tone.bg }}><Icon name={cap.icon} size={18} /></span>
                  <div className="wc-cap-title">{cap.title}</div>
                  <div className="wc-cap-desc">{cap.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

window.AgentPage = AgentPage;
