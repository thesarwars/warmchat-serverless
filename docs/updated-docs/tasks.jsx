// WarmChats Tasks — AI action center (stats, AI Priorities, My Tasks table, Completed Today)
const { useState: useTaskS } = React;

const TASK_TYPES = {
  Call:        { icon: 'phone',    fg: '#0EA5E9', bg: '#E7F6FD' },
  Text:        { icon: 'message',  fg: '#7C5CFC', bg: '#EEEAFE' },
  Email:       { icon: 'mail',     fg: '#D97706', bg: '#FEF5E5' },
  Appointment: { icon: 'calendar', fg: '#0EA5E9', bg: '#E7F6FD' },
  Showing:     { icon: 'home',     fg: '#0D9488', bg: '#E3F6F2' },
  Contract:    { icon: 'file',     fg: '#EA580C', bg: '#FFF3EA' },
  Task:        { icon: 'tasks',    fg: '#7C5CFC', bg: '#EEEAFE' },
};
const PRIO = { High: { c: '#DC2626', bg: '#FEE2E2' }, Medium: { c: '#D97706', bg: '#FEF3C7' }, Low: { c: '#64748B', bg: '#EEF1F4' } };

const TASK_STATS = [
  { k: 'open', value: 18, label: 'Open',          icon: 'tasks',       fg: '#7C5CFC', bg: '#EEEAFE' },
  { k: 'ai',   value: 6,  label: 'AI Recommended', icon: 'sparkles',    fg: '#0EA5E9', bg: '#E7F6FD' },
  { k: 'urg',  value: 3,  label: 'Urgent',         icon: 'flame',       fg: '#DC2626', bg: '#FEE2E2' },
  { k: 'due',  value: 4,  label: 'Due Today',      icon: 'calendarCheck', fg: '#0D9488', bg: '#E3F6F2' },
];

// AI Priorities — the highest-impact tasks AI surfaces
const AI_TASKS = [
  { id: 'ai1', icon: 'message', tone: { fg: '#7C5CFC', bg: '#EEEAFE' }, score: '92%', scoreLabel: 'Likely to convert',
    title: 'Reply to John Smith', tag: 'Lead needs reply', tagTone: { fg: '#7C5CFC', bg: '#EEEAFE' },
    why: 'Lead asked about the home and has not received a reply in 4 hours.',
    rec: 'Offer 2 showing times and ask if they are pre-approved.',
    primary: 'Send Draft', primaryIcon: 'sparkles', go: 'inbox' },
  { id: 'ai2', icon: 'phone', tone: { fg: '#0EA5E9', bg: '#E7F6FD' }, score: '+87%', scoreLabel: 'Needs response',
    title: 'Call back Sarah Jones', tag: 'Missed call', tagTone: { fg: '#0EA5E9', bg: '#E7F6FD' },
    why: 'Missed call from a warm Zillow lead 22 minutes ago.',
    rec: 'Call now and offer a showing this weekend.',
    primary: 'Call Now', primaryIcon: 'phone', go: 'calls' },
  { id: 'ai3', icon: 'home', tone: { fg: '#0D9488', bg: '#E3F6F2' }, score: '+74%', scoreLabel: 'Showing opportunity',
    title: 'Confirm tomorrow\u2019s showing', tag: 'Showing confirmation', tagTone: { fg: '#0D9488', bg: '#E3F6F2' },
    why: 'Showing at 1422 Maple St is tomorrow 2 PM and is unconfirmed.',
    rec: 'Send confirmation text with the address and time.',
    primary: 'Schedule', primaryIcon: 'calendarCheck', go: 'calendar' },
  { id: 'ai4', icon: 'message', tone: { fg: '#D97706', bg: '#FEF5E5' }, score: '88%', scoreLabel: 'High intent',
    title: 'Answer Emily Davis', tag: 'Seller pricing question', tagTone: { fg: '#D97706', bg: '#FEF5E5' },
    why: 'Seller asked what her home can sell for \u2014 high intent.',
    rec: 'Send the CMA and offer a 15-min listing consult.',
    primary: 'Send Draft', primaryIcon: 'sparkles', go: 'inbox' },
  { id: 'ai5', icon: 'file', tone: { fg: '#EA580C', bg: '#FFF3EA' }, score: '+69%', scoreLabel: 'Deal at risk',
    title: 'Check escrow progress', tag: 'Contract follow-up', tagTone: { fg: '#EA580C', bg: '#FFF3EA' },
    why: 'Under contract 10 days \u2014 inspection contingency due soon.',
    rec: 'Confirm inspection date and send disclosures.',
    primary: 'Open', primaryIcon: 'arrowUpRight', go: 'deals' },
  { id: 'ai6', icon: 'message', tone: { fg: '#7C5CFC', bg: '#EEEAFE' }, score: '61%', scoreLabel: 'Re-engagement',
    title: 'Re-engage Daniel Kim', tag: 'Cold lead active', tagTone: { fg: '#7C5CFC', bg: '#EEEAFE' },
    why: 'Lead re-opened your last 3 listings after 30 days quiet.',
    rec: 'Send fresh matches in his price range.',
    primary: 'Send Draft', primaryIcon: 'sparkles', go: 'inbox' },
];

const T = (title, sub, lead, type, prio, due, owner, group, opts = {}) =>
  ({ id: title + lead, title, sub, lead, type, prio, due, owner: owner || 'Me', group, overdue: !!opts.overdue, urgent: !!opts.urgent, ai: !!opts.ai });

const TASKS = [
  T('Call Sarah Jones', 'Missed call follow-up', 'Sarah Jones', 'Call', 'High', 'Today 10:30 AM', 'Me', 'today', { overdue: true, urgent: true, ai: true }),
  T('Send CMA', 'Seller requested', 'Emily Davis', 'Email', 'Medium', 'Today 1:00 PM', 'Me', 'today', { ai: true }),
  T('Confirm showing', '1422 Maple St', 'Amanda Garcia', 'Showing', 'Medium', 'Today 4:00 PM', 'Sarah', 'today'),
  T('Prep showing packet', 'For upcoming showing', 'Mike Johnson', 'Task', 'Low', 'Tomorrow', 'Me', 'upcoming'),
  T('Re-engage cold lead', 'Last contact 30 days ago', 'Daniel Kim', 'Text', 'Low', 'Yesterday', 'Me', 'today', { overdue: true, ai: true }),
  T('Confirm inspection', 'Due diligence', 'Aisha Khan', 'Appointment', 'High', 'Today 4:00 PM', 'Me', 'today', { urgent: true }),
  T('Send disclosures', 'Buyer due diligence', 'Kevin Anderson', 'Contract', 'High', 'Tomorrow', 'Me', 'upcoming'),
  T('Check escrow progress', 'Under contract 10 days', 'Grace Holloway', 'Contract', 'Medium', 'Thu', 'Michael', 'upcoming'),
  T('Confirm buyer tour', 'Weekend availability', 'Chris Wilson', 'Showing', 'Medium', 'Sat 2:00 PM', 'Me', 'upcoming'),
  T('Final walkthrough', 'Closing prep', 'The Ruiz Family', 'Appointment', 'High', 'Mon', 'Sarah', 'upcoming'),
];

const COMPLETED = [
  { title: 'Add follow-up task', lead: 'John Smith', time: '9:15 AM' },
  { title: 'Send listing details', lead: 'Maria Lopez', time: '11:30 AM' },
  { title: 'Update lead status', lead: 'Robert Brown', time: '1:45 PM' },
  { title: 'Log showing feedback', lead: 'The Patel Family', time: '2:20 PM' },
  { title: 'Send thank-you note', lead: 'Olivia Brooks', time: '3:05 PM' },
  { title: 'Schedule next call', lead: 'Daniel Kim', time: '3:40 PM' },
];

const MYTASK_FILTERS = [
  { k: 'all', label: 'All' },
  { k: 'urgent', label: 'Urgent' },
  { k: 'ai', label: 'AI' },
  { k: 'today', label: 'Today' },
  { k: 'upcoming', label: 'Upcoming' },
];

const initialsOf = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
function Prio({ p }) { return <span className="wc-prio" style={{ color: PRIO[p].c, background: PRIO[p].bg }}>{p}</span>; }

function AiPriorityCard({ task, go, onDone, onDismiss }) {
  return (
    <div className="wc-aip">
      <div className="wc-aip-top">
        <span className="wc-aip-ic" style={{ color: task.tone.fg, background: task.tone.bg }}><Icon name={task.icon} size={20} /></span>
        <span className="wc-aip-score"><b>{task.score}</b>{task.scoreLabel}</span>
      </div>
      <div className="wc-aip-title">{task.title}</div>
      <span className="wc-aip-tag" style={{ color: task.tagTone.fg, background: task.tagTone.bg }}>{task.tag}</span>
      <p className="wc-aip-why"><strong>Why:</strong> {task.why}</p>
      <div className="wc-aip-rec">
        <div className="wc-aip-rec-h"><Icon name="sparkles" size={12} />AI Recommendation</div>
        <div className="wc-aip-rec-t">{task.rec}</div>
      </div>
      <div className="wc-aip-acts">
        <button className="wc-primary wc-sm" onClick={() => go(task.go)}><Icon name={task.primaryIcon} size={14} />{task.primary}</button>
        <button className="wc-tbtn wc-tbtn-text" onClick={() => go(task.go)}>Open</button>
        <div className="wc-aip-endacts">
          <button className="wc-tbtn wc-tbtn-done" onClick={onDone} title="Mark done"><Icon name="check" size={16} /></button>
          <button className="wc-tbtn" onClick={onDismiss} title="Dismiss"><Icon name="x" size={16} /></button>
        </div>
      </div>
    </div>
  );
}

const HOW_TASKS_STEPS = [
  { icon: 'sparkles', fg: '#7C5CFC', bg: '#EEEAFE', title: 'AI surfaces what matters', text: 'Every lead signal, missed call, and stalled deal is scored. The highest-impact actions rise to the top as AI Priorities.' },
  { icon: 'tasks', fg: '#0EA5E9', bg: '#E7F6FD', title: 'You act in one click', text: 'Send an AI-drafted reply, call back, or schedule — straight from the card. Open pulls up the full lead or conversation.' },
  { icon: 'checkCircle', fg: '#0E9F6E', bg: '#E4F7EF', title: 'Tasks clear themselves', text: 'Mark done or dismiss to keep the list tight. Completed work moves to Completed Today so nothing slips.' },
];

function HowTasksWorkModal({ onClose }) {
  return (
    <div className="wc-modal-scrim" onClick={onClose}>
      <div className="wc-modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="wc-modal-title" style={{ width: 'auto' }}>How Tasks work</div>
        <div className="wc-band-d" style={{ margin: '2px 0 18px' }}>Your AI action center turns every lead signal into a clear next step.</div>
        <div className="wc-howsteps">
          {HOW_TASKS_STEPS.map((s, i) => (
            <div className="wc-howstep" key={i}>
              <span className="wc-howstep-ic" style={{ color: s.fg, background: s.bg }}><Icon name={s.icon} size={18} /></span>
              <div><div className="wc-howstep-t">{s.title}</div><div className="wc-howstep-d">{s.text}</div></div>
            </div>
          ))}
        </div>
        <div className="wc-modal-foot"><button className="wc-primary" onClick={onClose}>Got it</button></div>
      </div>
    </div>
  );
}

function AddTaskModal({ onClose, onCreate }) {
  const [title, setTitle] = useTaskS('');
  const [sub, setSub] = useTaskS('');
  const [lead, setLead] = useTaskS('');
  const [type, setType] = useTaskS('Call');
  const [prio, setPrio] = useTaskS('Medium');
  const [group, setGroup] = useTaskS('today');
  const [due, setDue] = useTaskS('');
  const tt = TASK_TYPES[type];
  const can = title.trim();
  const submit = () => {
    if (!can) return;
    onCreate({
      id: title + (lead || 'me') + Date.now(),
      title: title.trim(),
      sub: sub.trim() || '—',
      lead: lead.trim() || 'Unassigned',
      type, prio, group,
      due: due.trim() || (group === 'today' ? 'Today' : 'Upcoming'),
      owner: 'Me',
      overdue: false, urgent: prio === 'High', ai: false,
    });
    onClose();
  };
  return (
    <div className="wc-modal-scrim" onClick={onClose}>
      <div className="wc-modal" onClick={e => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <input className="wc-modal-title" placeholder="Task name" value={title} autoFocus
          onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        <div className="wc-modal-crumb">
          <span className="wc-crumb-tag">#Task</span>
          <Icon name="chevronRight" size={12} />
          <span className="wc-crumb-stage"><span className="wc-tasktbl-type" style={{ color: tt.fg, background: tt.bg }}><Icon name={tt.icon} size={12} />{type}</span></span>
        </div>
        <div className="wc-modal-grid">
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Type</div>
            <select className="wc-modal-input wc-modal-select" value={type} onChange={e => setType(e.target.value)}>
              {Object.keys(TASK_TYPES).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Priority</div>
            <select className="wc-modal-input wc-modal-select" value={prio} onChange={e => setPrio(e.target.value)}>
              {Object.keys(PRIO).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">When</div>
            <select className="wc-modal-input wc-modal-select" value={group} onChange={e => setGroup(e.target.value)}>
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
            </select>
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Due</div>
            <input className="wc-modal-input" placeholder="e.g. Today 4:00 PM" value={due} onChange={e => setDue(e.target.value)} />
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Lead</div>
            <input className="wc-modal-input" placeholder="Lead name" value={lead} onChange={e => setLead(e.target.value)} />
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Owner</div>
            <input className="wc-modal-input" value="Me" disabled />
          </div>
        </div>
        <div className="wc-modal-fieldfull">
          <div className="wc-modal-lbl">Details</div>
          <input className="wc-modal-input" placeholder="Add a short description…" value={sub} onChange={e => setSub(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        <div className="wc-modal-foot">
          <button className="wc-ghostbtn" onClick={onClose}>Cancel</button>
          <button className="wc-primary" disabled={!can} onClick={submit}><Icon name="plus" size={16} />Add Task</button>
        </div>
      </div>
    </div>
  );
}

function Tasks({ go }) {
  const [tasks, setTasks] = useTaskS(() => TASKS.map(t => ({ ...t })));
  const [ai, setAi] = useTaskS(() => AI_TASKS.map(t => ({ ...t })));
  const [filter, setFilter] = useTaskS('all');
  const [view, setView] = useTaskS('list');
  const [shown, setShown] = useTaskS(6);
  const [adding, setAdding] = useTaskS(false);
  const [showAllAi, setShowAllAi] = useTaskS(false);
  const [howOpen, setHowOpen] = useTaskS(false);
  const [showAllDone, setShowAllDone] = useTaskS(false);

  const removeAi = id => setAi(a => a.filter(t => t.id !== id));
  const toggleDone = id => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const removeTask = id => setTasks(ts => ts.filter(t => t.id !== id));
  const addTask = t => setTasks(ts => [t, ...ts]);

  const matches = t => {
    switch (filter) {
      case 'all': return true;
      case 'urgent': return t.urgent || t.overdue;
      case 'ai': return t.ai;
      case 'today': return t.group === 'today';
      case 'upcoming': return t.group === 'upcoming';
      default: return true;
    }
  };
  const filtered = tasks.filter(matches);
  const visible = filtered.slice(0, shown);

  return (
    <div className="wc-page wc-fade">
      <div className="wc-pagehead">
        <div>
          <h1>Tasks</h1>
          <p>Your AI action center for follow-ups, appointments, and deal next steps.</p>
        </div>
        <div className="wc-pagehead-actions">
          <button className="wc-ghostbtn" onClick={() => setHowOpen(true)}><Icon name="sparkles" size={15} />How Tasks Work</button>
          <button className="wc-primary wc-split" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add Task<span className="wc-split-div" /><Icon name="chevronDown" size={14} /></button>
        </div>
      </div>

      <div className="wc-task-stats">
        {TASK_STATS.map(s => (
          <div className="wc-task-stat" key={s.k}>
            <span className="wc-task-stat-ic" style={{ color: s.fg, background: s.bg }}><Icon name={s.icon} size={18} /></span>
            <div><div className="wc-task-stat-v wc-mono">{s.value}</div><div className="wc-task-stat-l">{s.label}</div></div>
          </div>
        ))}
      </div>

      {ai.length > 0 && (
        <div className="wc-tasksec">
          <div className="wc-aip-head">
            <span className="wc-aip-head-ic"><Icon name="sparkles" size={17} /></span>
            <span className="wc-aip-head-title">AI Priorities</span>
            <span className="wc-aip-head-sub">Tasks AI believes will have the biggest impact today.</span>
            <button className="wc-linkbtn wc-aip-viewall" onClick={() => setShowAllAi(s => !s)}>{showAllAi ? 'Show less' : `View all (${ai.length})`}<Icon name={showAllAi ? 'chevronUp' : 'chevronRight'} size={14} /></button>
          </div>
          <div className="wc-aip-row">
            {(showAllAi ? ai : ai.slice(0, 3)).map(t => <AiPriorityCard key={t.id} task={t} go={go} onDone={() => removeAi(t.id)} onDismiss={() => removeAi(t.id)} />)}
          </div>
        </div>
      )}

      <div className="wc-tasksec">
        <div className="wc-mytasks-head">
          <div className="wc-mytasks-l"><span className="wc-tasksec-title">My Tasks</span><span className="wc-tasksec-c">{filtered.length}</span></div>
          <div className="wc-seg wc-mytasks-view">
            <button className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')}><Icon name="list" size={14} />List</button>
            <button className={view === 'board' ? 'is-on' : ''} onClick={() => setView('board')}><Icon name="grid" size={14} />Board</button>
          </div>
          <div className="wc-mytasks-r">
            <div className="wc-pills">
              {MYTASK_FILTERS.map(f => (
                <button key={f.k} className={'wc-pill' + (filter === f.k ? ' is-on' : '')} onClick={() => { setFilter(f.k); setShown(6); }}>{f.label}</button>
              ))}
            </div>
          </div>
        </div>

        {view === 'list' ? (
          <div className="wc-panel-card wc-reptable-card">
            <table className="wc-reptable wc-tasktable">
              <thead><tr><th className="wc-tcheck-col"><span className="wc-check wc-check-head" /></th><th>Task</th><th>Lead</th><th>Type</th><th>Priority</th><th>Due</th><th>Owner</th><th className="wc-tacts-col">Actions</th></tr></thead>
              <tbody>
                {visible.map(t => {
                  const tt = TASK_TYPES[t.type];
                  return (
                    <tr key={t.id} className={t.done ? 'wc-taskrow-done' : ''}>
                      <td><button className={'wc-check' + (t.done ? ' is-on' : '')} onClick={() => toggleDone(t.id)}>{t.done && <Icon name="check" size={12} />}</button></td>
                      <td><div className="wc-tasktbl-title">{t.title}</div><div className="wc-tasktbl-sub">{t.sub}</div></td>
                      <td><div className="wc-goalrow-agent"><span className="wc-agoal-lav">{initialsOf(t.lead)}</span>{t.lead}</div></td>
                      <td><span className="wc-tasktbl-type" style={{ color: tt.fg, background: tt.bg }}><Icon name={tt.icon} size={12} />{t.type}</span></td>
                      <td><Prio p={t.prio} /></td>
                      <td className={'wc-band-d' + (t.overdue ? ' wc-overdue' : '')}>{t.due}</td>
                      <td className="wc-band-d">{t.owner}</td>
                      <td><div className="wc-tasktbl-acts"><button className="wc-tbtn wc-tbtn-box" onClick={() => go('inbox')} title="Open"><Icon name="arrowUpRight" size={15} /></button><button className={'wc-tbtn wc-tbtn-box wc-tbtn-done' + (t.done ? ' is-done' : '')} onClick={() => toggleDone(t.id)} title={t.done ? 'Mark not done' : 'Mark done'}><Icon name="check" size={15} /></button><button className="wc-tbtn wc-tbtn-box" onClick={() => removeTask(t.id)} title="Dismiss"><Icon name="x" size={15} /></button></div></td>
                    </tr>
                  );
                })}
                {visible.length === 0 && <tr><td colSpan="8"><div className="wc-task-empty">No tasks match this filter.</div></td></tr>}
              </tbody>
            </table>
            {shown < filtered.length && (
              <button className="wc-loadmore" onClick={() => setShown(s => s + 6)}>Load more tasks<Icon name="chevronDown" size={15} /></button>
            )}
          </div>
        ) : (
          <div className="wc-taskboard">
            {[['today', 'Today'], ['upcoming', 'Upcoming']].map(([g, label]) => (
              <div className="wc-taskcol" key={g}>
                <div className="wc-taskcol-h">{label}<span className="wc-tasksec-c">{filtered.filter(t => t.group === g).length}</span></div>
                {filtered.filter(t => t.group === g).map(t => {
                  const tt = TASK_TYPES[t.type];
                  return (
                    <div className={'wc-taskcard' + (t.done ? ' wc-taskrow-done' : '')} key={t.id}>
                      <div className="wc-taskcard-top"><span className="wc-tasktbl-type" style={{ color: tt.fg, background: tt.bg }}><Icon name={tt.icon} size={12} />{t.type}</span><Prio p={t.prio} /></div>
                      <div className="wc-tasktbl-title">{t.title}</div>
                      <div className="wc-tasktbl-sub">{t.sub}</div>
                      <div className="wc-taskcard-foot"><div className="wc-goalrow-agent"><span className="wc-agoal-lav">{initialsOf(t.lead)}</span>{t.lead}</div><span className={'wc-band-d' + (t.overdue ? ' wc-overdue' : '')}>{t.due}</span></div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wc-tasksec">
        <div className="wc-aip-head">
          <span className="wc-aip-head-ic" style={{ color: '#0E9F6E', background: '#E4F7EF' }}><Icon name="checkCircle" size={17} /></span>
          <span className="wc-aip-head-title">Completed Today</span>
          <span className="wc-tasksec-c">{COMPLETED.length}</span>
          <button className="wc-linkbtn wc-aip-viewall" onClick={() => setShowAllDone(s => !s)}>{showAllDone ? 'Show less' : 'View all completed'}<Icon name={showAllDone ? 'chevronUp' : 'chevronRight'} size={14} /></button>
        </div>
        <div className="wc-done-row">
          {(showAllDone ? COMPLETED : COMPLETED.slice(0, 3)).map((c, i) => (
            <div className="wc-donecard" key={i}>
              <span className="wc-donecard-ic"><Icon name="checkCircle" size={18} /></span>
              <div className="wc-donecard-b"><div className="wc-donecard-t">{c.title}</div><div className="wc-donecard-l">{c.lead}</div></div>
              <span className="wc-donecard-time wc-mono">{c.time}</span>
            </div>
          ))}
        </div>
      </div>

      {adding && <AddTaskModal onClose={() => setAdding(false)} onCreate={addTask} />}
      {howOpen && <HowTasksWorkModal onClose={() => setHowOpen(false)} />}
    </div>
  );
}

window.Tasks = Tasks;
