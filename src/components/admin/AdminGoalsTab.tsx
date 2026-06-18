import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Icon } from "@/components/ai-v2/Icon";
import { fetchAdminGoals, setAdminGoal } from "@/helpers/backend";

/*
 * Admin ▸ Goals tab - LIVE data from GET /api/dashboard/org/:id/goals?year=YYYY.
 * Commission/deals from won deals (attributed via lead.owner_id); per-agent
 * goals = the org annual target split across members. Owns its CSS via
 * <GoalsStyles/> (wg-* namespace). Embed bar + 4 KPIs + agent table + AI Goal
 * Coach + Pipeline Toward Goal.
 */

interface AgentRow { id: number; name: string; role: string; earned: number; goal: number; pct: number; status: string }
interface GoalsData {
  year: number; team_name: string; member_count: number; me: number; team_goal: number;
  kpis: { commission_earned: number; deals_closed: number; upcoming_deals: number; upcoming_value: number; goal_progress: number; goal_set: boolean };
  agents: AgentRow[];
  coach: { personal_goal: number; on_track: boolean; items: { icon: string; text: string }[] };
  pipeline: { closed_revenue: number; under_contract: number; active_pipeline: number };
}

const G_STATUS: Record<string, { fg: string; bg: string }> = {
  "On Track": { fg: "#0E9F6E", bg: "#E4F7EF" },
  "Behind": { fg: "#B45309", bg: "#FEF3C7" },
  "At Risk": { fg: "#DC2626", bg: "#FEE2E2" },
  "Set goal": { fg: "#878FA0", bg: "#F3F4F8" },
};
const COACH_TONES = [
  { fg: "#0E9F6E", bg: "#E4F7EF" },
  { fg: "#EA580C", bg: "#FEEBDD" },
  { fg: "#0EA5E9", bg: "#E7F6FD" },
];
const gInitials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const fmtUSD0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

function GoalsStyles() {
  return <style>{`
    .wg-embed{min-width:0}
    .wg-sub{display:flex;align-items:center;gap:7px;font-size:14px;color:var(--ink-2);margin:0}
    .wg-sub .wc-icon{color:var(--ink-3)}
    .wg-dot{color:var(--ink-3)}
    .wg-embedbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}
    /* year dropdown (host classes not in prototype.css - provided here) */
    .wc-rangescrim{position:fixed;inset:0;z-index:40}
    .wc-rangemenu{position:absolute;top:48px;right:0;z-index:50;background:var(--panel);border:1px solid var(--line);border-radius:11px;box-shadow:0 18px 50px rgba(20,24,38,.15);padding:6px;display:flex;flex-direction:column;gap:2px}
    .wc-rangeitem{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-radius:8px;font-size:13.5px;font-weight:600;color:var(--ink-2);width:100%;text-align:left}
    .wc-rangeitem:hover{background:var(--line-soft);color:var(--ink)}
    .wc-rangeitem.is-on{color:var(--accent-strong)}
    .wc-rangeitem .wc-icon{color:var(--accent)}
    .wg-yearwrap{position:relative}
    .wg-yearsel{display:inline-flex;align-items:center;gap:9px;height:42px;padding:0 14px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-size:14px;font-weight:600;color:var(--ink);box-shadow:var(--shadow-sm)}
    .wg-yearsel:hover{border-color:#D9D5CE}
    .wg-yearsel .wc-icon:first-child{color:var(--ink-3)}
    .wg-yearsel .wc-icon:last-child{color:var(--ink-3)}
    /* KPI row */
    .wg-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
    .wg-kpi{display:flex;gap:14px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px 18px 16px;box-shadow:var(--shadow-sm);transition:.14s}
    .wg-kpi:hover{box-shadow:var(--shadow);transform:translateY(-1px)}
    .wg-kpi-ic{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;flex:none}
    .wg-kpi-body{min-width:0}
    .wg-kpi-val{font-size:27px;font-weight:800;letter-spacing:-.02em;line-height:1.05;color:var(--ink)}
    .wg-kpi-label{font-size:14px;color:var(--ink-2);font-weight:600;margin-top:3px}
    .wg-kpi-foot{margin-top:10px;font-size:12.5px;font-weight:600}
    .wg-up{display:inline-flex;align-items:center;gap:5px;color:#0E9F6E}
    .wg-foot-violet{color:#7C5CFC;font-weight:700}
    .wg-foot-green{color:#0E9F6E;font-weight:700}
    /* main grid */
    .wg-grid{display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:start;margin-bottom:16px}
    /* left column stacks the agent table + pipeline beside the AI Goal Coach */
    .wg-left{display:flex;flex-direction:column;gap:16px;min-width:0}
    .wg-tablecard{padding:8px 6px 6px}
    .wg-table{width:100%;border-collapse:collapse}
    .wg-table thead th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);padding:14px 16px 12px}
    .wg-table thead th:nth-child(3),.wg-table thead th:nth-child(4){padding-left:0}
    .wg-table tbody tr{border-top:1px solid var(--line-soft)}
    .wg-table tbody td{padding:16px;vertical-align:middle}
    .wg-agent{display:flex;align-items:center;gap:13px}
    .wg-av{width:42px;height:42px;border-radius:50%;background:#EFEDE8;color:#8C857B;display:grid;place-items:center;font-size:13px;font-weight:700;flex:none}
    .wg-agent-name{font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
    .wg-agent-role{font-size:12.5px;color:var(--ink-3);margin-top:2px}
    .wg-prog-cell{width:210px}
    .wg-prog-pct{font-size:15px;font-weight:700;color:var(--ink);margin-bottom:8px}
    .wg-prog-bar{height:7px;border-radius:99px;background:#EBE8E2;overflow:hidden;max-width:160px}
    .wg-prog-bar>div{height:100%;border-radius:99px;background:var(--accent)}
    .wg-money{font-size:15px;font-weight:700;color:var(--ink);white-space:nowrap}
    .wg-setgoal{font-size:13.5px;font-weight:600;color:var(--ink-3)}
    .wg-status-col{text-align:right;width:110px}
    .wg-badge{display:inline-flex;align-items:center;font-size:12px;font-weight:700;padding:5px 11px;border-radius:99px;white-space:nowrap}
    /* AI coach */
    .wg-coach{padding:20px}
    .wg-coach-head{display:flex;align-items:center;gap:10px;margin-bottom:18px}
    .wg-coach-spark{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#7C5CFC;background:#EEEAFE;flex:none}
    .wg-coach-title{font-size:16px;font-weight:800;letter-spacing:-.01em;flex:1}
    .wg-info{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;color:var(--ink-3);border:1px solid var(--line);flex:none}
    .wg-info:hover{background:var(--line-soft);color:var(--ink-2)}
    .wg-coach-status{display:flex;align-items:flex-start;gap:12px;margin-bottom:18px}
    .wg-coach-check{color:#0E9F6E;flex:none;margin-top:1px}
    .wg-coach-h{font-size:16px;font-weight:800;letter-spacing:-.01em;color:var(--ink)}
    .wg-coach-p{font-size:13.5px;color:var(--ink-2);margin-top:2px}
    .wg-coach-div{height:1px;background:var(--line);margin:0 -20px 18px}
    .wg-coach-goal{font-size:14px;color:var(--ink-2);margin-bottom:14px}
    .wg-coach-goal b{color:var(--ink);font-weight:800}
    .wg-coach-list{display:flex;flex-direction:column;gap:14px;margin-bottom:20px}
    .wg-coach-item{display:flex;align-items:center;gap:12px}
    .wg-coach-iic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none}
    .wg-coach-itxt{font-size:14px;font-weight:600;color:var(--ink)}
    .wg-action{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:48px;border-radius:12px;border:1.5px solid var(--accent);background:var(--panel);color:var(--accent-strong);font-size:15px;font-weight:700;transition:.14s}
    .wg-action:hover{background:var(--accent-soft)}
    /* pipeline */
    .wg-pipe{padding:20px 24px 22px}
    .wg-pipe-head{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:800;letter-spacing:-.01em;margin-bottom:18px}
    .wg-pipe-row{display:grid;grid-template-columns:repeat(3,1fr)}
    .wg-pipe-cell{display:flex;align-items:center;gap:14px;padding:4px 28px}
    .wg-pipe-cell+.wg-pipe-cell{border-left:1px solid var(--line-soft)}
    .wg-pipe-cell:first-child{padding-left:0}
    .wg-pipe-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;flex:none}
    .wg-pipe-label{font-size:13.5px;color:var(--ink-2);font-weight:600}
    .wg-pipe-val{font-size:23px;font-weight:800;letter-spacing:-.02em;color:var(--ink);margin-top:2px}
    @media (max-width:1180px){
      .wg-kpis{grid-template-columns:repeat(2,1fr)}
      .wg-grid{grid-template-columns:1fr}
    }
  `}</style>;
}

export default function AdminGoalsTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [yopen, setYopen] = useState(false);
  const orgId = typeof window !== "undefined" ? Number(localStorage.getItem("org_id")) || 0 : 0;

  const { data, isLoading, isError } = useQuery<GoalsData>({
    queryKey: ["admin-goals", orgId, year],
    queryFn: () => fetchAdminGoals(orgId, year) as Promise<GoalsData>,
    enabled: orgId > 0,
  });

  // Set-goal modal state. target 0 = whole workspace; otherwise an agent's id.
  const [editing, setEditing] = useState<{ target: number; amount: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const openGoal = (target: number) => {
    const current = target === 0 ? (data?.team_goal ?? 0) : (data?.agents.find((a) => a.id === target)?.goal ?? 0);
    setEditing({ target, amount: current ? String(current) : "" });
  };
  const saveGoal = async () => {
    if (!editing) return;
    const amount = Math.max(0, Math.round(Number(editing.amount.replace(/[^0-9.]/g, "")) || 0));
    setSaving(true);
    try {
      await setAdminGoal(orgId, { user_id: editing.target, year, commission_goal: amount });
      toast.success("Goal saved");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["admin-goals", orgId, year] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save goal");
    } finally {
      setSaving(false);
    }
  };

  const years = [year, year - 1, year - 2].filter((y, i, a) => a.indexOf(y) === i);
  const targetName = editing
    ? editing.target === 0 ? "Whole workspace"
      : (data?.agents.find((a) => a.id === editing.target)?.name || "Agent") + (editing.target === data?.me ? " (you)" : "")
    : "";

  return (
    <div className="wg-embed wc-fade">
      <GoalsStyles />

      <div className="wg-embedbar">
        <p className="wg-sub"><Icon name="users" size={15} />{data?.team_name || "Workspace"} <span className="wg-dot">·</span> {data?.member_count ?? 0} team member{(data?.member_count ?? 0) === 1 ? "" : "s"}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="wc-primary wc-sm" disabled={!data} onClick={() => openGoal(0)}><Icon name="target" size={14} />Set goals</button>
          <div className="wg-yearwrap">
            <button className="wg-yearsel" onClick={() => setYopen((o) => !o)}>
              <Icon name="calendar" size={16} /><span className="wc-mono">{year}</span><Icon name="chevronDown" size={15} />
            </button>
            {yopen && (
              <>
                <div className="wc-rangescrim" onClick={() => setYopen(false)} />
                <div className="wc-rangemenu" style={{ minWidth: 130 }}>
                  {years.map((y) => (
                    <button key={y} className={"wc-rangeitem" + (y === year ? " is-on" : "")} onClick={() => { setYear(y); setYopen(false); }}>
                      <span className="wc-mono">{y}</span>{y === year && <Icon name="check" size={14} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="wc-panel-card pad"><div className="wg-sub">{isError ? "Couldn't load goals." : "Loading goals…"}</div></div>
      ) : (
        <GoalsBody data={data} navigate={navigate} onSetGoal={openGoal} />
      )}

      {editing && data && (
        <div className="wc-modal-scrim" onClick={() => !saving && setEditing(null)}>
          <div className="wc-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <button className="wc-modal-x" onClick={() => setEditing(null)}><Icon name="x" size={16} /></button>
            <div className="wc-modal-title">Set goal · {year}</div>
            <div className="wc-modal-crumb"><span className="wg-sub">Commission target for the year.</span></div>
            <div className="wc-modal-fieldfull">
              <div className="wc-modal-lbl">Who</div>
              <select className="wc-modal-input wc-modal-select" value={editing.target}
                onChange={(e) => setEditing({ target: Number(e.target.value), amount: editing.amount })}>
                <option value={0}>Whole workspace (team)</option>
                {data.agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.id === data.me ? " (you)" : ""}</option>
                ))}
              </select>
            </div>
            <div className="wc-modal-fieldfull">
              <div className="wc-modal-lbl">Commission goal (USD) — {targetName}</div>
              <input className="wc-modal-input" inputMode="numeric" value={editing.amount} autoFocus
                onChange={(e) => setEditing({ target: editing.target, amount: e.target.value })}
                placeholder="e.g. 120000" />
            </div>
            <div className="wc-modal-foot">
              <button className="wc-ghostbtn wc-sm" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button className="wc-primary wc-sm" onClick={saveGoal} disabled={saving}>{saving ? "Saving…" : "Save goal"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalsBody({ data, navigate, onSetGoal }: { data: GoalsData; navigate: (p: string) => void; onSetGoal: (target: number) => void }) {
  const k = data.kpis;
  const KPIS = [
    { icon: "dollar", fg: "#EA580C", bg: "#FEEBDD", value: fmtUSD0(k.commission_earned), label: "Commission Earned",
      foot: <span className="wg-foot-green">{data.year} total</span> },
    { icon: "briefcase", fg: "#0E9F6E", bg: "#E4F7EF", value: String(k.deals_closed), label: "Deals Closed",
      foot: <span className="wg-foot-green">won this year</span> },
    { icon: "calendar", fg: "#7C5CFC", bg: "#EEEAFE", value: String(k.upcoming_deals), label: "Upcoming Deals",
      foot: <span className="wg-foot-violet">{fmtUSD0(k.upcoming_value)} potential</span> },
    { icon: "target", fg: "#0EA5E9", bg: "#E7F6FD", value: k.goal_set ? k.goal_progress + "%" : "—", label: "Goal Progress",
      foot: k.goal_set ? <span className="wg-foot-green">{k.goal_progress >= 70 ? "On track" : "Keep pushing"}</span> : <span className="wg-setgoal">No goal set</span> },
  ];

  return (
    <>
      <div className="wg-kpis">
        {KPIS.map((kp) => (
          <div className="wg-kpi" key={kp.label}>
            <span className="wg-kpi-ic" style={{ color: kp.fg, background: kp.bg }}><Icon name={kp.icon} size={22} /></span>
            <div className="wg-kpi-body">
              <div className="wg-kpi-val wc-mono">{kp.value}</div>
              <div className="wg-kpi-label">{kp.label}</div>
              <div className="wg-kpi-foot">{kp.foot}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="wg-grid">
        <div className="wg-left">
        <div className="wc-panel-card wg-tablecard">
          <table className="wg-table">
            <thead>
              <tr><th>Agent</th><th>Progress</th><th>Earned</th><th>Goal</th><th className="wg-status-col"></th></tr>
            </thead>
            <tbody>
              {data.agents.length === 0 && (
                <tr><td colSpan={5}><div className="wg-sub" style={{ padding: "8px 6px" }}>No team members yet.</div></td></tr>
              )}
              {data.agents.map((a, i) => {
                const st = G_STATUS[a.status] || G_STATUS["Set goal"];
                return (
                  <tr key={a.name + i}>
                    <td>
                      <div className="wg-agent">
                        <span className="wg-av">{gInitials(a.name)}</span>
                        <div><div className="wg-agent-name">{a.name}</div><div className="wg-agent-role">{a.role}</div></div>
                      </div>
                    </td>
                    <td className="wg-prog-cell">
                      <div className="wg-prog-pct wc-mono">{a.pct}%</div>
                      <div className="wg-prog-bar"><div style={{ width: a.pct + "%" }} /></div>
                    </td>
                    <td className="wg-money wc-mono">{fmtUSD0(a.earned)}</td>
                    <td className="wg-money wc-mono">
                      <button onClick={() => onSetGoal(a.id)} title="Set goal"
                        style={{ font: "inherit", color: a.goal ? "var(--ink)" : "var(--accent-strong)", fontWeight: 700, textDecoration: a.goal ? "none" : "underline", cursor: "pointer" }}>
                        {a.goal ? fmtUSD0(a.goal) : "Set goal"}
                      </button>
                    </td>
                    <td className="wg-status-col"><span className="wg-badge" style={{ color: st.fg, background: st.bg }}>{a.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="wc-panel-card wg-pipe">
          <div className="wg-pipe-head">Pipeline Toward Goal<button className="wg-info" title="Pipeline contributing toward your annual goal"><Icon name="info" size={14} /></button></div>
          <div className="wg-pipe-row">
            {[
              { icon: "checkCircle", fg: "#0E9F6E", bg: "#E4F7EF", label: "Closed Revenue", value: data.pipeline.closed_revenue },
              { icon: "handshake", fg: "#0EA5E9", bg: "#E7F6FD", label: "Under Contract", value: data.pipeline.under_contract },
              { icon: "filter", fg: "#7C5CFC", bg: "#EEEAFE", label: "Active Pipeline", value: data.pipeline.active_pipeline },
            ].map((p, i) => (
              <div className="wg-pipe-cell" key={i}>
                <span className="wg-pipe-ic" style={{ color: p.fg, background: p.bg }}><Icon name={p.icon} size={20} /></span>
                <div><div className="wg-pipe-label">{p.label}</div><div className="wg-pipe-val wc-mono">{fmtUSD0(p.value)}</div></div>
              </div>
            ))}
          </div>
        </div>
        </div>{/* wg-left */}

        <div className="wc-panel-card wg-coach">
          <div className="wg-coach-head">
            <span className="wg-coach-spark"><Icon name="sparkles" size={18} /></span>
            <span className="wg-coach-title">AI Goal Coach</span>
            <button className="wg-info" title="How this is calculated"><Icon name="info" size={15} /></button>
          </div>
          <div className="wg-coach-status">
            <span className="wg-coach-check" style={{ color: data.coach.on_track ? "#0E9F6E" : "#EA580C" }}>
              <Icon name={data.coach.on_track ? "checkCircle" : "trending"} size={22} />
            </span>
            <div>
              <div className="wg-coach-h">{data.coach.on_track ? "You're on track!" : "Push to hit your goal"}</div>
              <div className="wg-coach-p">{data.coach.on_track ? "Keep up the momentum." : "A few more wins will get you there."}</div>
            </div>
          </div>
          <div className="wg-coach-div" />
          <div className="wg-coach-goal">
            {data.coach.personal_goal > 0
              ? <>To hit your <b>{fmtUSD0(data.coach.personal_goal)}</b> personal goal:</>
              : <>Set a team goal to unlock personal targets:</>}
          </div>
          <div className="wg-coach-list">
            {data.coach.items.map((c, i) => {
              const t = COACH_TONES[i % COACH_TONES.length];
              return (
                <div className="wg-coach-item" key={i}>
                  <span className="wg-coach-iic" style={{ color: t.fg, background: t.bg }}><Icon name={c.icon} size={16} /></span>
                  <span className="wg-coach-itxt">{c.text}</span>
                </div>
              );
            })}
          </div>
          <button className="wg-action" onClick={() => navigate("/tasks")}>View Action Plan<Icon name="arrowRight" size={17} /></button>
        </div>
      </div>
    </>
  );
}
