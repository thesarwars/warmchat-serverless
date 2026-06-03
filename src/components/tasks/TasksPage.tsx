import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/MainLayout";
import { Icon } from "@/components/ai-v2/Icon";
import "@/components/ai-v2/prototype.css";

/* Tasks - AI action center, ported pixel-for-pixel from the "leads-remix-2"
   design bundle (tasks.jsx). UI-only demo with sample data: there is no tasks
   backend yet (only per-call `call_tasks`), so this showcases the design until
   a tasks API lands. Renders through the prototype's .wc-* classes under the
   .wcv2 wrapper (prototype.css). */

const TASK_TYPES: Record<string, { icon: string; fg: string; bg: string }> = {
  Call: { icon: "phone", fg: "#2563EB", bg: "#EAF1FE" },
  Text: { icon: "message", fg: "#7C3AED", bg: "#F2ECFE" },
  Email: { icon: "mail", fg: "#D97706", bg: "#FEF5E5" },
  Appointment: { icon: "calendar", fg: "#4F46E5", bg: "#ECEDFD" },
  Showing: { icon: "home", fg: "#0D9488", bg: "#E3F6F2" },
  Contract: { icon: "file", fg: "#EA580C", bg: "#FFF1E7" },
  Note: { icon: "tasks", fg: "#6B7280", bg: "#F1EFEA" },
};
const PRIO: Record<string, { c: string; bg: string }> = {
  High: { c: "#DC2626", bg: "#FEE2E2" },
  Medium: { c: "#D97706", bg: "#FEF3C7" },
  Low: { c: "#64748B", bg: "#EEF1F4" },
};

type GoFn = (key: string) => void;

interface AiTask {
  cat: string;
  type: string;
  title: string;
  lead: string;
  prio: string;
  why: string;
  next: string;
  primary: string;
  primaryIcon: string;
  go: string;
}

// AI Recommended - only tasks AI believes can close deals today.
const AI_TASKS: AiTask[] = [
  { cat: "Lead needs reply", type: "Text", title: "Reply to John Smith", lead: "John Smith", prio: "High",
    why: "Lead asked to see the home and has not received a reply in 4 hours.",
    next: "Reply with 2 showing times and ask if they are pre-approved.",
    primary: "AI Draft Reply", primaryIcon: "sparkles", go: "inbox" },
  { cat: "Missed call", type: "Call", title: "Call back Sarah Jones", lead: "Sarah Jones", prio: "High",
    why: "Missed call from a warm Zillow lead 22 minutes ago.",
    next: "Call now and offer a showing this weekend.",
    primary: "Call Now", primaryIcon: "phone", go: "calls" },
  { cat: "Showing confirmation", type: "Showing", title: "Confirm tomorrow's showing", lead: "Chris Wilson", prio: "Medium",
    why: "Showing at 1422 Maple St is tomorrow 2 PM and is unconfirmed.",
    next: "Send a confirmation text with the address and time.",
    primary: "Schedule", primaryIcon: "calendarCheck", go: "calendar" },
  { cat: "Seller pricing question", type: "Text", title: "Answer Emily Davis", lead: "Emily Davis", prio: "High",
    why: "Seller asked what her home can sell for - high intent.",
    next: "Send the CMA and offer a 15-min listing consult.",
    primary: "AI Draft Reply", primaryIcon: "sparkles", go: "inbox" },
  { cat: "Contract follow-up", type: "Contract", title: "Check escrow progress", lead: "Kevin Anderson", prio: "Medium",
    why: "Under contract 10 days - inspection contingency due soon.",
    next: "Confirm inspection date and send disclosures.",
    primary: "Open", primaryIcon: "arrowUpRight", go: "deals" },
  { cat: "Cold lead behavior", type: "Text", title: "Re-engage Daniel Kim", lead: "Daniel Kim", prio: "Low",
    why: "Lead re-opened your last 3 listings after 30 days quiet.",
    next: "Send fresh matches in his price range.",
    primary: "AI Draft Reply", primaryIcon: "sparkles", go: "inbox" },
];

interface Task {
  id: string;
  title: string;
  lead: string;
  type: string;
  prio: string;
  due: string;
  owner: string;
  group: string;
  overdue: boolean;
  hot: boolean;
  done?: boolean;
}
const T = (title: string, lead: string, type: string, prio: string, due: string, owner: string, group: string, overdue?: boolean, hot?: boolean): Task =>
  ({ id: title + lead, title, lead, type, prio, due, owner: owner || "Me", group, overdue: !!overdue, hot: !!hot });
const TASKS: Task[] = [
  // Agent (manual) tasks
  T("Call Sarah to follow up", "Sarah Jones", "Call", "High", "Today 10:30 AM", "Me", "agent", false, true),
  T("Send CMA", "Emily Davis", "Email", "Medium", "Today 1:00 PM", "Me", "agent"),
  T("Prep showing packet", "Amanda Garcia", "Showing", "Medium", "Today 11:00 AM", "Sarah", "agent"),
  T("Follow up after open house", "Mike Johnson", "Text", "Low", "Tomorrow", "Me", "agent"),
  T("Re-engage cold lead", "Daniel Kim", "Text", "Low", "Yesterday", "Me", "agent", true),
  // Deal / appointment tasks
  T("Confirm inspection", "Aisha Khan", "Appointment", "High", "Today 4:00 PM", "Me", "deal"),
  T("Send disclosures", "Kevin Anderson", "Contract", "High", "Tomorrow", "Me", "deal"),
  T("Check escrow progress", "Grace Holloway", "Contract", "Medium", "Thu", "Michael", "deal"),
  T("Confirm buyer tour", "Chris Wilson", "Showing", "Medium", "Sat 2:00 PM", "Me", "deal", false, true),
  T("Final walkthrough", "The Ruiz Family", "Appointment", "High", "Mon", "Sarah", "deal"),
];

const initialsOf = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
function Prio({ p }: { p: string }) { return <span className="wc-prio" style={{ color: PRIO[p].c, background: PRIO[p].bg }}>{p}</span>; }

function AiTaskCard({ task, onDone, onDismiss, go }: { task: AiTask; onDone: () => void; onDismiss: () => void; go: GoFn }) {
  const tt = TASK_TYPES[task.type];
  return (
    <div className="wc-aitask">
      <div className="wc-aitask-head">
        <span className="wc-aitask-cat" style={{ color: tt.fg, background: tt.bg }}><Icon name={tt.icon} size={12} />{task.cat}</span>
        <Prio p={task.prio} />
      </div>
      <div className="wc-aitask-title">{task.title}</div>
      <div className="wc-aitask-why"><Icon name="zap" size={12} /><span><strong>Why:</strong> {task.why}</span></div>
      <div className="wc-aitask-next"><Icon name="sparkles" size={12} /><span><strong>Recommended:</strong> {task.next}</span></div>
      <div className="wc-aitask-acts">
        <button className="wc-primary wc-sm" style={{ flex: "none", cursor: "pointer" }} onClick={() => go(task.go)}><Icon name={task.primaryIcon} size={14} />{task.primary}</button>
        <button className="wc-ghostbtn wc-sm" style={{ flex: "none", cursor: "pointer" }} onClick={() => go(task.go)}>Open</button>
        <div className="wc-aitask-icons">
          <button className="wc-tbtn is-done" style={{ cursor: "pointer" }} onClick={onDone} title="Mark done"><Icon name="check" size={15} /></button>
          <button className="wc-tbtn" style={{ cursor: "pointer" }} onClick={onDismiss} title="Dismiss"><Icon name="x" size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function TasksInner({ go }: { go: GoFn }) {
  const [tasks, setTasks] = useState<Task[]>(() => TASKS.map((t) => ({ ...t })));
  const [ai, setAi] = useState<AiTask[]>(() => AI_TASKS.map((t) => ({ ...t })));
  const [when, setWhen] = useState("all");
  const removeAi = (i: number) => setAi((a) => a.filter((_, idx) => idx !== i));
  const toggleDone = (id: string) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const bucketOf = (t: Task) => (t.overdue ? "overdue" : /^Today/.test(t.due) ? "today" : "upcoming");
  const visible = tasks.filter((t) => (when === "all" ? true : bucketOf(t) === when));

  return (
    <div className="wc-page wc-fade">
      <div className="wc-pagehead">
        <div>
          <h1>Tasks</h1>
          <p>Your AI action center for follow-ups, appointments, and deal next steps.</p>
        </div>
        <div className="wc-pagehead-actions">
          <button className="wc-ghostbtn"><Icon name="sparkles" size={15} />How Tasks work</button>
          <button className="wc-primary"><Icon name="plus" size={16} />Add Task</button>
        </div>
      </div>

      {ai.length > 0 && (
        <div className="wc-tasksec">
          <div className="wc-tasksec-head"><span className="wc-tasksec-icon" style={{ color: "#EA580C", background: "var(--accent-soft)" }}><Icon name="flame" size={15} /></span>AI Recommended<span className="wc-tasksec-c">{ai.length}</span><span className="wc-tasksec-sub">Tasks AI believes can help close deals today</span></div>
          <div className="wc-aitasks" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
            {ai.map((t, i) => <AiTaskCard key={t.title} task={t} go={go} onDone={() => removeAi(i)} onDismiss={() => removeAi(i)} />)}
          </div>
        </div>
      )}

      <div className="wc-tasksec">
        <div className="wc-tasksec-head"><span className="wc-tasksec-title">All Tasks</span><span className="wc-tasksec-c">{visible.length}</span>
          <div className="wc-tasksec-tabs">
            {[["all", "All"], ["today", "Today's"], ["overdue", "Overdue"], ["upcoming", "Upcoming"]].map(([k, l]) => (
              <button key={k} className={"wc-tasksec-tab" + (when === k ? " is-on" : "")} onClick={() => setWhen(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="wc-panel-card wc-reptable-card">
          <table className="wc-reptable wc-tasktable">
            <thead><tr><th></th><th>Task</th><th>Lead</th><th>Type</th><th>Priority</th><th>Due</th><th>Owner</th><th>Action</th></tr></thead>
            <tbody>
              {visible.map((t) => {
                const tt = TASK_TYPES[t.type];
                return (
                  <tr key={t.id} className={t.done ? "wc-taskrow-done" : ""}>
                    <td><button className={"wc-check" + (t.done ? " is-on" : "")} style={{ cursor: "pointer" }} onClick={() => toggleDone(t.id)}>{t.done && <Icon name="check" size={12} />}</button></td>
                    <td><span className="wc-tasktbl-title">{t.title}</span></td>
                    <td><div className="wc-goalrow-agent"><span className="wc-agoal-lav">{initialsOf(t.lead)}</span>{t.lead}{t.hot && <Icon name="flame" size={12} fill className="wc-flame" />}</div></td>
                    <td><span className="wc-tasktbl-type" style={{ color: tt.fg, background: tt.bg }}><Icon name={tt.icon} size={12} />{t.type}</span></td>
                    <td><Prio p={t.prio} /></td>
                    <td className={"wc-band-d" + (t.overdue ? " wc-overdue" : "")}>{t.due}</td>
                    <td className="wc-band-d">{t.owner}</td>
                    <td><div className="wc-tasktbl-acts"><button className="wc-tbtn" style={{ cursor: "pointer" }} onClick={() => go("inbox")} title="Open"><Icon name="arrowUpRight" size={14} /></button><button className={"wc-tbtn" + (t.done ? " is-done" : "")} style={{ cursor: "pointer" }} onClick={() => toggleDone(t.id)} title="Mark done"><Icon name="check" size={14} /></button></div></td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={8}><div className="wc-task-empty">No tasks match this filter.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const navigate = useNavigate();
  const go = (key: string) => {
    const routes: Record<string, string> = {
      inbox: "/inbox", calls: "/inbox", calendar: "/appointments",
      deals: "/leads", leads: "/leads", tasks: "/tasks", dashboard: "/dashboard",
    };
    const to = routes[key];
    if (to) navigate(to);
  };
  return (
    <MainLayout title="Tasks">
      <div className="wcv2 min-h-[calc(100vh-4rem)] lg:-mx-4 lg:-mt-4">
        <TasksInner go={go} />
      </div>
    </MainLayout>
  );
}
