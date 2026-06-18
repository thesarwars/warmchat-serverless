import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import { Icon } from "@/components/ai-v2/Icon";
import { humanizeTaskText } from "@/utils/humanizeTime";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  fetchOrgTasks,
  fetchOrgLeads,
  createTask,
  updateTask,
  type TaskRecord,
} from "@/helpers/backend";
import "@/components/ai-v2/prototype.css";
import "./tasks.css";

/* Tasks - AI action center. Ported from the design bundle (tasks.jsx + tasks.css)
   and wired to the real task backend per Tasks.md: stats, AI Priorities
   (source='ai'), My Tasks list/board with filters, Complete -> Completed Today. */

const TASK_TYPES: Record<string, { icon: string; fg: string; bg: string }> = {
  Call: { icon: "phone", fg: "#0EA5E9", bg: "#E7F6FD" },
  Text: { icon: "message", fg: "#7C5CFC", bg: "#EEEAFE" },
  Email: { icon: "mail", fg: "#D97706", bg: "#FEF5E5" },
  Appointment: { icon: "calendar", fg: "#0EA5E9", bg: "#E7F6FD" },
  Showing: { icon: "home", fg: "#0D9488", bg: "#E3F6F2" },
  Contract: { icon: "file", fg: "#EA580C", bg: "#FFF3EA" },
  Task: { icon: "tasks", fg: "#7C5CFC", bg: "#EEEAFE" },
};
type DispPrio = "High" | "Medium" | "Low";
const PRIO: Record<DispPrio, { c: string; bg: string }> = {
  High: { c: "#DC2626", bg: "#FEE2E2" },
  Medium: { c: "#D97706", bg: "#FEF3C7" },
  Low: { c: "#64748B", bg: "#EEF1F4" },
};

const TYPE_ALIASES: Record<string, string> = {
  call: "Call", text: "Text", sms: "Text", email: "Email", appointment: "Appointment",
  showing: "Showing", tour: "Showing", contract: "Contract", followup: "Task",
  cma: "Email", task: "Task", note: "Task",
};
const dispType = (t: string | null): string => (t && TYPE_ALIASES[t.toLowerCase()]) || "Task";
const TYPE_TO_DB: Record<string, string> = {
  Call: "call", Text: "text", Email: "email", Appointment: "appointment",
  Showing: "showing", Contract: "contract", Task: "task",
};
function dispPrio(p: string): DispPrio {
  const v = (p || "").toLowerCase();
  if (v === "urgent" || v === "high") return "High";
  if (v === "low") return "Low";
  return "Medium";
}
const PRIO_TO_DB: Record<DispPrio, string> = { High: "high", Medium: "normal", Low: "low" };

function parseTs(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
}
function isTodayLocal(iso: string | null): boolean {
  if (!iso) return false;
  const d = parseTs(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function fmtTime(iso: string): string {
  const d = parseTs(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
type Bucket = "overdue" | "today" | "upcoming" | "none";
function fmtDue(due: string | null): { label: string; bucket: Bucket; overdue: boolean } {
  if (!due) return { label: "No due date", bucket: "none", overdue: false };
  const d = parseTs(due);
  if (isNaN(d.getTime())) return { label: due, bucket: "upcoming", overdue: false };
  const now = new Date();
  const sod = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((sod(d) - sod(now)) / 86_400_000);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const overdue = d.getTime() < now.getTime();
  let label: string;
  if (dayDiff === 0) label = `Today ${time}`;
  else if (dayDiff === 1) label = `Tomorrow ${time}`;
  else if (dayDiff === -1) label = `Yesterday ${time}`;
  else label = `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
  const bucket: Bucket = overdue ? "overdue" : dayDiff === 0 ? "today" : "upcoming";
  return { label, bucket, overdue };
}
const groupOf = (t: TaskRecord): "today" | "upcoming" => {
  const b = fmtDue(t.due_at).bucket;
  return b === "overdue" || b === "today" ? "today" : "upcoming";
};
function goForType(t: string): { route: string; primary: string; icon: string } {
  switch (t) {
    case "Call": return { route: "calls", primary: "Call Now", icon: "phone" };
    case "Text":
    case "Email": return { route: "inbox", primary: "Send Draft", icon: "sparkles" };
    case "Showing":
    case "Appointment": return { route: "calendar", primary: "Schedule", icon: "calendarCheck" };
    case "Contract": return { route: "deals", primary: "Open", icon: "arrowUpRight" };
    default: return { route: "inbox", primary: "Open", icon: "arrowUpRight" };
  }
}

const initialsOf = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
function Prio({ p }: { p: DispPrio }) { return <span className="wc-prio" style={{ color: PRIO[p].c, background: PRIO[p].bg }}>{p}</span>; }

const STAT_META = {
  open: { label: "Open", icon: "tasks", fg: "#EA580C", bg: "#FFF3EA" },
  ai: { label: "AI Recommended", icon: "sparkles", fg: "#EA580C", bg: "#FFF3EA" },
  urgent: { label: "Urgent", icon: "flame", fg: "#EA580C", bg: "#FFF3EA" },
  due: { label: "Due Today", icon: "calendarCheck", fg: "#EA580C", bg: "#FFF3EA" },
} as const;

function AiPriorityCard({ task, onPrimary, onOpen, onDone, onDismiss, busy }: { task: TaskRecord; onPrimary: () => void; onOpen: () => void; onDone: () => void; onDismiss: () => void; busy: boolean }) {
  const type = dispType(task.type);
  const tt = TASK_TYPES[type];
  const act = goForType(type);
  const why = humanizeTaskText(task.why || task.description);
  return (
    <div className="wc-aip">
      <div className="wc-aip-top">
        <span className="wc-aip-ic" style={{ color: tt.fg, background: tt.bg }}><Icon name={tt.icon} size={20} /></span>
        {(task.score || task.score_label) && (
          <span className="wc-aip-score">{task.score && <b>{task.score}</b>}{task.score_label}</span>
        )}
      </div>
      <div className="wc-aip-title">{humanizeTaskText(task.title)}</div>
      <span className="wc-aip-tag" style={{ color: tt.fg, background: tt.bg }}>{type}</span>
      {why && <p className="wc-aip-why"><strong>Why:</strong> {why}</p>}
      {task.recommendation && (
        <div className="wc-aip-rec">
          <div className="wc-aip-rec-h"><Icon name="sparkles" size={12} />AI Recommendation</div>
          <div className="wc-aip-rec-t">{humanizeTaskText(task.recommendation)}</div>
        </div>
      )}
      <div className="wc-aip-acts">
        <button className="wc-primary wc-sm" style={{ cursor: "pointer" }} onClick={onPrimary}><Icon name={act.icon} size={14} />{act.primary}</button>
        <button className="wc-tbtn wc-tbtn-text" style={{ cursor: "pointer" }} onClick={onOpen}>Open</button>
        <div className="wc-aip-endacts">
          <button className="wc-tbtn wc-tbtn-done" style={{ cursor: "pointer" }} disabled={busy} onClick={onDone} title="Mark done"><Icon name="check" size={16} /></button>
          <button className="wc-tbtn" style={{ cursor: "pointer" }} disabled={busy} onClick={onDismiss} title="Dismiss"><Icon name="x" size={16} /></button>
        </div>
      </div>
    </div>
  );
}

const HOW_STEPS = [
  { icon: "sparkles", fg: "#7C5CFC", bg: "#EEEAFE", title: "AI surfaces what matters", text: "Every lead signal, missed call, and stalled deal is scored. The highest-impact actions rise to the top as AI Priorities." },
  { icon: "tasks", fg: "#0EA5E9", bg: "#E7F6FD", title: "You act in one click", text: "Send an AI-drafted reply, call back, or schedule - straight from the card. Open pulls up the full lead or conversation." },
  { icon: "checkCircle", fg: "#0E9F6E", bg: "#E4F7EF", title: "Tasks clear themselves", text: "Mark done or dismiss to keep the list tight. Completed work moves to Completed Today so nothing slips." },
];
function HowTasksWorkModal({ onClose }: { onClose: () => void }) {
  useBodyScrollLock();
  return (
    <div className="wc-modal-scrim" onClick={onClose}>
      <div className="wc-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="wc-modal-title" style={{ width: "auto" }}>How Tasks work</div>
        <div className="wc-band-d" style={{ margin: "2px 0 18px" }}>Your AI action center turns every lead signal into a clear next step.</div>
        <div className="wc-howsteps">
          {HOW_STEPS.map((s, i) => (
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

interface LeadOpt { id: number; name: string }
interface NewTask { title: string; sub: string; type: string; prio: DispPrio; when: "today" | "upcoming"; due: string; leadId: number | null; }

function AddTaskModal({ onClose, onCreate, leads, busy }: { onClose: () => void; onCreate: (t: NewTask) => void; leads: LeadOpt[]; busy: boolean }) {
  const [title, setTitle] = useState("");
  const [sub, setSub] = useState("");
  const [leadId, setLeadId] = useState<number | null>(null);
  const [type, setType] = useState("Call");
  const [prio, setPrio] = useState<DispPrio>("Medium");
  const [when, setWhen] = useState<"today" | "upcoming">("today");
  const [due, setDue] = useState("");
  useBodyScrollLock();
  const tt = TASK_TYPES[type];
  const can = Boolean(title.trim());
  const submit = () => { if (can) onCreate({ title: title.trim(), sub: sub.trim(), type, prio, when, due, leadId }); };
  return (
    <div className="wc-modal-scrim" onClick={onClose}>
      <div className="wc-modal" onClick={(e) => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <input className="wc-modal-title" placeholder="Task name" value={title} autoFocus
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <div className="wc-modal-crumb">
          <span className="wc-crumb-tag">#Task</span>
          <Icon name="chevronRight" size={12} />
          <span className="wc-crumb-stage"><span className="wc-tasktbl-type" style={{ color: tt.fg, background: tt.bg }}><Icon name={tt.icon} size={12} />{type}</span></span>
        </div>
        <div className="wc-modal-grid">
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Type</div>
            <select className="wc-modal-input wc-modal-select" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.keys(TASK_TYPES).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Priority</div>
            <select className="wc-modal-input wc-modal-select" value={prio} onChange={(e) => setPrio(e.target.value as DispPrio)}>
              {(Object.keys(PRIO) as DispPrio[]).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">When</div>
            <select className="wc-modal-input wc-modal-select" value={when} onChange={(e) => setWhen(e.target.value as "today" | "upcoming")}>
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
            </select>
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Due (optional)</div>
            <input type="datetime-local" className="wc-modal-input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Lead</div>
            <select className="wc-modal-input wc-modal-select" value={leadId ?? ""} onChange={(e) => setLeadId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Unassigned</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Owner</div>
            <input className="wc-modal-input" value="Me" disabled />
          </div>
        </div>
        <div className="wc-modal-fieldfull">
          <div className="wc-modal-lbl">Details</div>
          <input className="wc-modal-input" placeholder="Add a short description..." value={sub} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div className="wc-modal-foot">
          <button className="wc-ghostbtn" onClick={onClose}>Cancel</button>
          <button className="wc-primary" disabled={!can || busy} onClick={submit}><Icon name="plus" size={16} />{busy ? "Adding..." : "Add Task"}</button>
        </div>
      </div>
    </div>
  );
}

function TasksInner() {
  const navigate = useNavigate();
  const orgId = localStorage.getItem("org_id") || "";
  const currentUserId = Number(localStorage.getItem("user_id")) || 0;
  const qc = useQueryClient();

  // Open a task -> deep-link straight to the lead's inbox conversation
  // (?lead=<id>, which the Inbox reads). Calendar/deal tasks route to their page.
  const leadConvPath = (leadId: number | null) => (leadId ? `/inbox?lead=${leadId}&channel=unified` : "/inbox");
  const primaryPath = (t: TaskRecord) => {
    const type = dispType(t.type);
    const route = goForType(type).route;
    if (route === "calendar") return "/appointments";
    if (route === "deals") return "/leads";
    const base = leadConvPath(t.lead_id);
    // "Send Draft" (Text/Email) -> open the lead and auto-generate an AI draft
    // in the composer (the Inbox reads ?aidraft=1).
    if ((type === "Text" || type === "Email") && t.lead_id) return `${base}&aidraft=1`;
    return base;
  };
  const [filter, setFilter] = useState<"all" | "urgent" | "ai" | "today" | "upcoming">("all");
  const [view, setView] = useState<"list" | "board">("list");
  const [shown, setShown] = useState(6);
  const [addOpen, setAddOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [showAllAi, setShowAllAi] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);

  const openQuery = useQuery({
    queryKey: ["org-tasks", orgId, "open"],
    queryFn: () => fetchOrgTasks(orgId, { status: "open" }),
    enabled: Boolean(orgId),
  });
  const doneQuery = useQuery({
    queryKey: ["org-tasks", orgId, "done"],
    queryFn: () => fetchOrgTasks(orgId, { status: "done", limit: 100 }),
    enabled: Boolean(orgId),
  });
  const leadsQuery = useQuery({
    queryKey: ["org-leads-min", orgId],
    queryFn: () => fetchOrgLeads(orgId) as Promise<Array<{ id: number; name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }>>,
    enabled: Boolean(orgId) && addOpen,
  });
  const leadOpts: LeadOpt[] = (Array.isArray(leadsQuery.data) ? leadsQuery.data : []).map((l) => {
    const nm = (l.name || [l.first_name, l.last_name].filter(Boolean).join(" ")).trim();
    const contact = (l.email || l.phone || "").trim();
    // Fall back to email/phone (then id) so unnamed leads are still identifiable.
    const name = nm ? (contact ? `${nm} · ${contact}` : nm) : (contact || `Lead #${l.id}`);
    return { id: l.id, name };
  });

  const open = useMemo(() => openQuery.data?.tasks ?? [], [openQuery.data]);
  const aiTasks = useMemo(() => open.filter((t) => t.source === "ai"), [open]);
  const completedToday = useMemo(
    () => (doneQuery.data?.tasks ?? []).filter((t) => isTodayLocal(t.updated_at)),
    [doneQuery.data],
  );

  const isUrgent = (t: TaskRecord) => dispPrio(t.priority) === "High" || fmtDue(t.due_at).overdue;
  const stats = {
    open: open.length,
    ai: aiTasks.length,
    urgent: open.filter(isUrgent).length,
    due: open.filter((t) => fmtDue(t.due_at).bucket === "today").length,
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["org-tasks", orgId] });
  const completeMut = useMutation({ mutationFn: (id: number) => updateTask(id, { status: "done" }), onSuccess: refresh });
  const dismissMut = useMutation({ mutationFn: (id: number) => updateTask(id, { status: "dismissed" }), onSuccess: refresh });
  const createMut = useMutation({
    mutationFn: (t: NewTask) => {
      let dueIso: string | null = null;
      if (t.due) dueIso = new Date(t.due).toISOString();
      else if (t.when === "today") { const d = new Date(); d.setHours(17, 0, 0, 0); dueIso = d.toISOString(); }
      return createTask({
        org_id: Number(orgId), title: t.title, type: TYPE_TO_DB[t.type] ?? "task",
        priority: PRIO_TO_DB[t.prio], due_at: dueIso, description: t.sub || null,
        lead_id: t.leadId,
      });
    },
    onSuccess: () => { refresh(); setAddOpen(false); },
  });
  const busy = completeMut.isPending || dismissMut.isPending;

  const matches = (t: TaskRecord) => {
    switch (filter) {
      case "all": return true;
      case "urgent": return isUrgent(t);
      case "ai": return t.source === "ai";
      case "today": return groupOf(t) === "today";
      case "upcoming": return groupOf(t) === "upcoming";
      default: return true;
    }
  };
  const filtered = open.filter(matches);
  const visible = filtered.slice(0, shown);
  const ownerLabel = (t: TaskRecord) => (t.user_id === currentUserId ? "Me" : t.owner_name || "Team");
  const loading = openQuery.isLoading;

  const FILTERS = [["all", "All"], ["urgent", "Urgent"], ["ai", "AI"], ["today", "Today"], ["upcoming", "Upcoming"]] as const;

  return (
    <div className="wc-page wc-fade">
      <div className="wc-pagehead">
        <div>
          <h1>Tasks</h1>
          <p>Your AI action center for follow-ups, appointments, and deal next steps.</p>
        </div>
        <div className="wc-pagehead-actions">
          <button className="wc-ghostbtn" onClick={() => setHowOpen(true)}><Icon name="sparkles" size={15} />How Tasks Work</button>
          <button className="wc-primary wc-split" onClick={() => setAddOpen(true)}><Icon name="plus" size={16} />Add Task<span className="wc-split-div" /><Icon name="chevronDown" size={14} /></button>
        </div>
      </div>

      <div className="wc-task-stats">
        {(["open", "ai", "urgent", "due"] as const).map((k) => {
          const m = STAT_META[k];
          return (
            <div className="wc-task-stat" key={k}>
              <span className="wc-task-stat-ic" style={{ color: m.fg, background: m.bg }}><Icon name={m.icon} size={18} /></span>
              <div><div className="wc-task-stat-v wc-mono">{stats[k]}</div><div className="wc-task-stat-l">{m.label}</div></div>
            </div>
          );
        })}
      </div>

      {aiTasks.length > 0 && (
        <div className="wc-tasksec">
          <div className="wc-aip-head">
            <span className="wc-aip-head-ic"><Icon name="sparkles" size={17} /></span>
            <span className="wc-aip-head-title">AI Priorities</span>
            <span className="wc-aip-head-sub">Tasks AI believes will have the biggest impact today.</span>
            <button className="wc-linkbtn wc-aip-viewall" onClick={() => setShowAllAi((s) => !s)}>{showAllAi ? "Show less" : `View all (${aiTasks.length})`}<Icon name={showAllAi ? "chevronUp" : "chevronRight"} size={14} /></button>
          </div>
          <div className="wc-aip-row">
            {(showAllAi ? aiTasks : aiTasks.slice(0, 3)).map((t) => (
              <AiPriorityCard key={t.id} task={t} busy={busy}
                onPrimary={() => navigate(primaryPath(t))} onOpen={() => navigate(leadConvPath(t.lead_id))}
                onDone={() => completeMut.mutate(t.id)} onDismiss={() => dismissMut.mutate(t.id)} />
            ))}
          </div>
        </div>
      )}

      <div className="wc-tasksec">
        <div className="wc-mytasks-head">
          <div className="wc-mytasks-l"><span className="wc-tasksec-title">My Tasks</span><span className="wc-tasksec-c">{filtered.length}</span></div>
          <div className="wc-seg wc-mytasks-view">
            <button className={view === "list" ? "is-on" : ""} onClick={() => setView("list")}><Icon name="list" size={14} />List</button>
            <button className={view === "board" ? "is-on" : ""} onClick={() => setView("board")}><Icon name="grid" size={14} />Board</button>
          </div>
          <div className="wc-mytasks-r">
            <div className="wc-pills">
              {FILTERS.map(([k, l]) => (
                <button key={k} className={"wc-pill" + (filter === k ? " is-on" : "")} onClick={() => { setFilter(k); setShown(6); }}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {view === "list" ? (
          <div className="wc-panel-card wc-reptable-card">
            <table className="wc-reptable wc-tasktable">
              <thead><tr><th className="wc-tcheck-col"><span className="wc-check wc-check-head" /></th><th>Task</th><th>Lead</th><th>Type</th><th>Priority</th><th>Due</th><th>Owner</th><th className="wc-tacts-col">Actions</th></tr></thead>
              <tbody>
                {visible.map((t) => {
                  const type = dispType(t.type);
                  const tt = TASK_TYPES[type];
                  const due = fmtDue(t.due_at);
                  const lead = t.lead_name;
                  return (
                    <tr key={t.id}>
                      <td><button className="wc-check" style={{ cursor: "pointer" }} disabled={busy} onClick={() => completeMut.mutate(t.id)} title="Mark done" /></td>
                      <td><div className="wc-tasktbl-title">{humanizeTaskText(t.title)}</div>{t.description && <div className="wc-tasktbl-sub">{humanizeTaskText(t.description)}</div>}</td>
                      <td><div className="wc-goalrow-agent">{lead ? <><span className="wc-agoal-lav">{initialsOf(lead)}</span>{lead}</> : "-"}</div></td>
                      <td><span className="wc-tasktbl-type" style={{ color: tt.fg, background: tt.bg }}><Icon name={tt.icon} size={12} />{type}</span></td>
                      <td><Prio p={dispPrio(t.priority)} /></td>
                      <td className={"wc-band-d" + (due.overdue ? " wc-overdue" : "")}>{due.label}</td>
                      <td className="wc-band-d">{ownerLabel(t)}</td>
                      <td><div className="wc-tasktbl-acts">
                        <button className="wc-tbtn wc-tbtn-box" style={{ cursor: "pointer" }} onClick={() => navigate(leadConvPath(t.lead_id))} title="Open"><Icon name="arrowUpRight" size={15} /></button>
                        <button className="wc-tbtn wc-tbtn-box wc-tbtn-done" style={{ cursor: "pointer" }} disabled={busy} onClick={() => completeMut.mutate(t.id)} title="Mark done"><Icon name="check" size={15} /></button>
                        <button className="wc-tbtn wc-tbtn-box" style={{ cursor: "pointer" }} disabled={busy} onClick={() => dismissMut.mutate(t.id)} title="Dismiss"><Icon name="x" size={15} /></button>
                      </div></td>
                    </tr>
                  );
                })}
                {!loading && visible.length === 0 && <tr><td colSpan={8}><div className="wc-task-empty">No tasks match this filter.</div></td></tr>}
                {loading && <tr><td colSpan={8}><div className="wc-task-empty">Loading tasks...</div></td></tr>}
              </tbody>
            </table>
            {shown < filtered.length && (
              <button className="wc-loadmore" onClick={() => setShown((s) => s + 6)}>Load more tasks<Icon name="chevronDown" size={15} /></button>
            )}
          </div>
        ) : (
          <div className="wc-taskboard">
            {([["today", "Today"], ["upcoming", "Upcoming"]] as const).map(([g, label]) => (
              <div className="wc-taskcol" key={g}>
                <div className="wc-taskcol-h">{label}<span className="wc-tasksec-c">{filtered.filter((t) => groupOf(t) === g).length}</span></div>
                {filtered.filter((t) => groupOf(t) === g).map((t) => {
                  const type = dispType(t.type);
                  const tt = TASK_TYPES[type];
                  const due = fmtDue(t.due_at);
                  return (
                    <div className="wc-taskcard" key={t.id}>
                      <div className="wc-taskcard-top"><span className="wc-tasktbl-type" style={{ color: tt.fg, background: tt.bg }}><Icon name={tt.icon} size={12} />{type}</span><Prio p={dispPrio(t.priority)} /></div>
                      <div className="wc-tasktbl-title">{humanizeTaskText(t.title)}</div>
                      {t.description && <div className="wc-tasktbl-sub">{humanizeTaskText(t.description)}</div>}
                      <div className="wc-taskcard-foot"><div className="wc-goalrow-agent">{t.lead_name ? <><span className="wc-agoal-lav">{initialsOf(t.lead_name)}</span>{t.lead_name}</> : "-"}</div><span className={"wc-band-d" + (due.overdue ? " wc-overdue" : "")}>{due.label}</span></div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {completedToday.length > 0 && (
        <div className="wc-tasksec">
          <div className="wc-aip-head">
            <span className="wc-aip-head-ic" style={{ color: "#0E9F6E", background: "#E4F7EF" }}><Icon name="checkCircle" size={17} /></span>
            <span className="wc-aip-head-title">Completed Today</span>
            <span className="wc-tasksec-c">{completedToday.length}</span>
            {completedToday.length > 3 && (
              <button className="wc-linkbtn wc-aip-viewall" onClick={() => setShowAllDone((s) => !s)}>{showAllDone ? "Show less" : "View all completed"}<Icon name={showAllDone ? "chevronUp" : "chevronRight"} size={14} /></button>
            )}
          </div>
          <div className="wc-done-row">
            {(showAllDone ? completedToday : completedToday.slice(0, 3)).map((c) => (
              <div className="wc-donecard" key={c.id}>
                <span className="wc-donecard-ic"><Icon name="checkCircle" size={18} /></span>
                <div className="wc-donecard-b"><div className="wc-donecard-t">{c.title}</div><div className="wc-donecard-l">{c.lead_name || "-"}</div></div>
                <span className="wc-donecard-time wc-mono">{fmtTime(c.updated_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {addOpen && <AddTaskModal onClose={() => setAddOpen(false)} onCreate={(t) => createMut.mutate(t)} leads={leadOpts} busy={createMut.isPending} />}
      {howOpen && <HowTasksWorkModal onClose={() => setHowOpen(false)} />}
    </div>
  );
}

export default function TasksPage() {
  return (
    <MainLayout title="Tasks">
      <div className="wcv2 min-h-[calc(100vh-4rem)] lg:-mx-4 lg:-mt-4">
        <TasksInner />
      </div>
    </MainLayout>
  );
}
