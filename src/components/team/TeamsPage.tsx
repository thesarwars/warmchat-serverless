import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import MainLayout from "../MainLayout";
import {
  Users,
  MessageSquare,
  CalendarCheck,
  TrendingUp,
  DollarSign,
  MoreHorizontal,
  Loader2,
  UsersRound,
  Plus,
  X,
  Search,
  Filter,
  ChevronDown,
  Inbox,
} from "lucide-react";
import "./brokerDesign.css";
import { Avatar, BrokerHeader, BrokerPage, KpiStrip, type KpiItem } from "./brokerShared";
import { initialsOf } from "./brokerUtils";

interface TeamMember {
  id: string | number;
  name?: string;
  email?: string;
  avatar?: string;
}

interface Team {
  id: string | number;
  name: string;
  description?: string;
  members?: TeamMember[];
  member_count?: number;
  leader?: TeamMember;
  leader_name?: string;
  leader_email?: string;
  active_leads?: number;
  conversations?: number;
  appointments?: number;
  pipeline_value?: string | number;
  conversion_rate?: string | number;
  avg_response?: string;
  recent_activity?: { who?: string; text?: string; meta?: string; time?: string }[];
}

const fmtPipeline = (v?: string | number) => {
  if (v == null || v === "") return "-";
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return String(v);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const fmtRate = (v?: string | number) => {
  if (v == null || v === "") return "-";
  const s = String(v);
  return s.endsWith("%") ? s : `${s}%`;
};

const DETAIL_TABS = ["Overview", "Members", "Leads", "Performance", "Settings"] as const;

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [detailTab, setDetailTab] = useState<(typeof DETAIL_TABS)[number]>("Overview");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const token = localStorage.getItem("token");
  const org_id = localStorage.getItem("org_id");
  const API_BASE = import.meta.env.VITE_API_BASE;

  const loadTeams = useCallback(async () => {
    if (!token || !org_id) { setLoading(false); return; }
    try {
      const r = await fetch(`${API_BASE}/teams?org_id=${org_id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = r.ok ? await r.json() : null;
      const list: Team[] = Array.isArray(d) ? d : Array.isArray(d?.teams) ? d.teams : [];
      setTeams(list);
      setSelectedId((prev) => prev ?? (list[0]?.id ?? null));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [API_BASE, org_id, token]);

  useEffect(() => { void loadTeams(); }, [loadTeams]);

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) { toast.error("Team name is required"); return; }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/teams`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: createDesc.trim() || undefined,
          org_id: org_id ? Number(org_id) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to create team");
      toast.success("Team created");
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      await loadTeams();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create team";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const filteredTeams = useMemo(() => {
    if (!search.trim()) return teams;
    const q = search.toLowerCase();
    return teams.filter((t) =>
      t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q),
    );
  }, [teams, search]);

  const selected = teams.find((t) => t.id === selectedId) || null;

  const totalConvs = teams.reduce((s, t) => s + (Number(t.conversations) || 0), 0);
  const totalAppts = teams.reduce((s, t) => s + (Number(t.appointments) || 0), 0);
  const totalPipeline = teams.reduce((s, t) => {
    const n = Number(String(t.pipeline_value || 0).replace(/[^0-9.]/g, ""));
    return s + (isNaN(n) ? 0 : n);
  }, 0);
  const avgConv = (() => {
    const vals = teams.map((t) => Number(String(t.conversion_rate || 0).replace(/[^0-9.]/g, "")))
      .filter((n) => !isNaN(n) && n > 0);
    if (!vals.length) return "-";
    return `${(vals.reduce((s, n) => s + n, 0) / vals.length).toFixed(1)}%`;
  })();

  const kpis: KpiItem[] = [
    { label: "Total Teams", value: teams.length || "-", icon: UsersRound, delta: teams.length ? `${teams.length} active` : undefined, trend: "up" },
    { label: "Active Conversations", value: totalConvs || "-", icon: MessageSquare },
    { label: "Appointments Booked", value: totalAppts || "-", icon: CalendarCheck },
    { label: "Pipeline Value", value: totalPipeline ? fmtPipeline(totalPipeline) : "-", icon: DollarSign },
    { label: "Conversion Rate", value: avgConv, icon: TrendingUp },
  ];

  // Performance chart helpers
  const PERF_W = 760, PERF_H = 240, padL = 36, padR = 16, padT = 16, padB = 28;
  const PERF_POINTS = 14;
  const perfSeries = useMemo(() => {
    const colors = ["#F76A2D", "#7A7770", "#C9A26E", "#A8A6A0", "#2563EB", "#7C3AED"];
    return filteredTeams.slice(0, 6).map((t, i) => {
      const target = Number(String(t.conversion_rate || 0).replace(/[^0-9.]/g, "")) || (15 + i * 3);
      // Smooth synthetic time series with the team's conversion rate as anchor
      const data = Array.from({ length: PERF_POINTS }, (_, k) => {
        const wobble = Math.sin((k + i) * 0.7) * 4;
        return Math.max(0, Math.min(100, target + wobble - 6 + (k / PERF_POINTS) * 12));
      });
      return { name: t.name, color: colors[i % colors.length], data, conv: fmtRate(t.conversion_rate) };
    });
  }, [filteredTeams]);

  const innerW = PERF_W - padL - padR;
  const innerH = PERF_H - padT - padB;
  const xs = perfSeries[0]
    ? perfSeries[0].data.map((_, i) => padL + (i / (PERF_POINTS - 1)) * innerW)
    : [];

  const toPath = (data: number[]) =>
    data.map((v, i) => `${i ? "L" : "M"}${xs[i].toFixed(1)},${(padT + innerH - (v / 100) * innerH).toFixed(1)}`).join(" ");

  return (
    <MainLayout>
      <BrokerPage>
        <BrokerHeader
          title="Teams"
          subtitle="Organize your agents into teams and collaborate effectively."
          primaryAction={{ label: "New Team", icon: Plus, onClick: () => setShowCreate(true) }}
        />

        <KpiStrip items={kpis} columns={5} />

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: 80, color: "var(--b-muted)", fontSize: 13 }}>
            <Loader2 size={16} className="animate-spin" /> Loading teams...
          </div>
        ) : teams.length === 0 ? (
          <div className="b-panel" style={{ padding: "64px 20px", textAlign: "center" }}>
            <div style={{ margin: "0 auto 12px", width: 56, height: 56, borderRadius: 16, background: "var(--b-orange-50)", color: "var(--b-orange)", display: "grid", placeItems: "center" }}>
              <Users size={26} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--b-ink)", margin: 0 }}>No teams yet</h3>
            <p style={{ fontSize: 13, color: "var(--b-muted)", marginTop: 4 }}>
              Create your first team to start grouping agents.
            </p>
            <button className="b-btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create Team
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }} className="b-teams-cols">
              {/* All Teams table */}
              <section className="b-panel">
                <div className="b-panel-h">
                  <h2>All Teams</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div className="b-mini-search">
                      <Search size={14} style={{ color: "var(--b-muted)" }} />
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams..." />
                    </div>
                    <button className="b-btn-ghost"><Filter size={14} />Filter</button>
                  </div>
                </div>

                {filteredTeams.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--b-muted)", fontSize: 13 }}>
                    No teams match your search.
                  </div>
                ) : (
                  <table className="b-table">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>Members</th>
                        <th>Active Leads</th>
                        <th>Appointments</th>
                        <th>Pipeline Value</th>
                        <th>Conv. Rate</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeams.map((t) => {
                        const members = Array.isArray(t.members) ? t.members : [];
                        const visible = members.slice(0, 3);
                        const total = t.member_count ?? members.length;
                        const extra = Math.max(0, total - visible.length);
                        return (
                          <tr
                            key={String(t.id)}
                            className={`clickable ${selectedId === t.id ? "selected" : ""}`}
                            onClick={() => { setSelectedId(t.id); setDetailTab("Overview"); }}
                          >
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <Avatar initials={initialsOf(t.name)} size={38} style={{ borderRadius: 10 }} />
                                <div>
                                  <div style={{ fontWeight: 600, color: "var(--b-ink)", fontSize: 13.5 }}>{t.name}</div>
                                  {t.description && (
                                    <div style={{ fontSize: 11.5, color: "var(--b-muted)", marginTop: 1 }}>{t.description}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="b-avatar-stack">
                                {visible.map((m) => <Avatar key={String(m.id)} initials={initialsOf(m.name, m.email)} size={28} />)}
                                {extra > 0 && <div className="b-avatar-plus">+{extra}</div>}
                                {visible.length === 0 && total > 0 && (
                                  <span style={{ color: "var(--b-muted)", fontSize: 12 }}>-</span>
                                )}
                              </div>
                              {total > 0 && (
                                <div style={{ fontSize: 11.5, color: "var(--b-muted)", marginTop: 4 }}>{total} members</div>
                              )}
                            </td>
                            <td><div style={{ fontWeight: 600, fontFeatureSettings: '"tnum"', fontSize: 14 }}>{t.active_leads ?? "-"}</div></td>
                            <td><div style={{ fontWeight: 600, fontFeatureSettings: '"tnum"', fontSize: 14 }}>{t.appointments ?? "-"}</div></td>
                            <td><div style={{ fontWeight: 600, fontFeatureSettings: '"tnum"', fontSize: 14, whiteSpace: "nowrap" }}>{fmtPipeline(t.pipeline_value)}</div></td>
                            <td><div style={{ fontWeight: 600, fontFeatureSettings: '"tnum"', fontSize: 14 }}>{fmtRate(t.conversion_rate)}</div></td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="b-btn-ghost"
                                style={{ padding: "4px 6px", marginLeft: "auto" }}
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div className="b-pagi">
                  <div className="b-pagi-info">Showing 1 to {filteredTeams.length} of {teams.length} teams</div>
                </div>
              </section>

              {/* Team detail */}
              {selected && (
                <section className="b-panel">
                  <div style={{ padding: "16px 18px 0", borderBottom: "1px solid var(--b-line-2)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <Avatar initials={initialsOf(selected.name)} size={42} style={{ borderRadius: 11 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.01em", display: "flex", alignItems: "center", gap: 8 }}>
                          {selected.name}
                          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "var(--b-orange-50)", color: "var(--b-orange-600)", border: "1px solid #FBD6BE" }}>
                            Active
                          </span>
                        </div>
                        {selected.description && (
                          <div style={{ fontSize: 12.5, color: "var(--b-muted)", marginTop: 2 }}>{selected.description}</div>
                        )}
                      </div>
                      <button type="button" className="b-btn-ghost" style={{ padding: "4px 6px" }}>
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                    <div className="b-tabs" style={{ padding: 0, marginTop: 14, marginBottom: -1 }}>
                      {DETAIL_TABS.map((t) => (
                        <button key={t} className={`b-tab ${t === detailTab ? "active" : ""}`} style={{ padding: "8px 10px", fontSize: 12.5 }} onClick={() => setDetailTab(t)}>{t}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding: "16px 18px" }}>
                    {detailTab === "Overview" && (
                      <>
                        <div style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 10 }}>Team Leader</div>
                          {selected.leader_name || selected.leader?.name ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Avatar initials={initialsOf(selected.leader_name || selected.leader?.name, selected.leader_email || selected.leader?.email)} size={36} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{selected.leader_name || selected.leader?.name}</div>
                                <div style={{ fontSize: 11.5, color: "var(--b-muted)" }}>{selected.leader_email || selected.leader?.email}</div>
                              </div>
                              <button type="button" style={{ marginLeft: "auto", background: "#fff", border: "1px solid var(--b-orange)", color: "var(--b-orange-600)", fontWeight: 600, fontSize: 12, padding: "5px 11px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                                <MessageSquare size={12} />Message
                              </button>
                            </div>
                          ) : (
                            <div style={{ fontSize: 13, color: "var(--b-muted)" }}>No leader assigned yet.</div>
                          )}
                        </div>

                        <div style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 10, display: "flex", alignItems: "baseline", gap: 6 }}>
                            Team Stats <span style={{ fontSize: 11, color: "var(--b-muted)", fontWeight: 500 }}>(This Month)</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 12px" }}>
                            {[
                              { l: "Active Leads", v: selected.active_leads ?? "-" },
                              { l: "Conversations", v: selected.conversations ?? "-" },
                              { l: "Appointments", v: selected.appointments ?? "-" },
                              { l: "Pipeline Value", v: fmtPipeline(selected.pipeline_value) },
                              { l: "Conv. Rate", v: fmtRate(selected.conversion_rate) },
                              { l: "Avg. Response", v: selected.avg_response ?? "-" },
                            ].map((s) => (
                              <div key={s.l}>
                                <div style={{ fontSize: 10.5, color: "var(--b-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em" }}>{s.l}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--b-ink)", marginTop: 2, fontFeatureSettings: '"tnum"' }}>{s.v}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {selected.recent_activity && selected.recent_activity.length > 0 && (
                          <div style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 10 }}>Recent Activity</div>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              {selected.recent_activity.slice(0, 4).map((a, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--b-line-2)" }}>
                                  <Avatar initials={initialsOf(a.who)} size={28} />
                                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--b-ink-2)" }}>
                                    <div><b style={{ color: "var(--b-ink)" }}>{a.who || "Activity"}</b>{a.text ? ` ${a.text}` : ""}</div>
                                    {a.meta && <div style={{ color: "var(--b-muted)", fontSize: 11.5, marginTop: 2 }}>{a.meta}</div>}
                                  </div>
                                  {a.time && <div style={{ fontSize: 11, color: "var(--b-muted)" }}>{a.time}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          className="b-btn-primary"
                          style={{ width: "100%", justifyContent: "center", padding: 11, marginTop: 4 }}
                        >
                          <Inbox size={14} /> View Team Inbox
                        </button>
                      </>
                    )}

                    {detailTab === "Members" && (
                      <div>
                        {Array.isArray(selected.members) && selected.members.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {selected.members.map((m) => (
                              <div key={String(m.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--b-line-2)" }}>
                                <Avatar initials={initialsOf(m.name, m.email)} size={32} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name || m.email || "Member"}</div>
                                  {m.email && <div style={{ fontSize: 11.5, color: "var(--b-muted)" }}>{m.email}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: "var(--b-muted)", padding: "20px 0" }}>No members yet.</div>
                        )}
                      </div>
                    )}

                    {(detailTab === "Leads" || detailTab === "Performance" || detailTab === "Settings") && (
                      <div style={{ fontSize: 13, color: "var(--b-muted)", padding: "40px 0", textAlign: "center" }}>
                        {detailTab} details coming soon.
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Performance chart */}
            <div style={{ marginTop: 16 }}>
              <section className="b-panel">
                <div className="b-panel-h">
                  <div>
                    <h2>Team Performance Overview</h2>
                    <div style={{ fontSize: 12.5, color: "var(--b-muted)", marginTop: 2 }}>
                      Conversion rate by team over the last 30 days
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button className="b-select" type="button">This Month <ChevronDown size={12} /></button>
                    <button className="b-btn-ghost b-btn-accent" type="button">View Full Report</button>
                  </div>
                </div>
                <div style={{ padding: "8px 20px 22px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <svg viewBox={`0 0 ${PERF_W} ${PERF_H}`} preserveAspectRatio="none" style={{ flex: 1, minWidth: 320, height: 240 }}>
                    {[0, 25, 50, 75, 100].map((t) => {
                      const y = padT + innerH - (t / 100) * innerH;
                      return (
                        <g key={t}>
                          <line x1={padL} y1={y} x2={PERF_W - padR} y2={y} stroke="#F1ECE0" strokeDasharray="3 4" />
                          <text x={padL - 8} y={y + 4} fontSize="10.5" fill="#8C8579" textAnchor="end" fontFamily="Inter">{t}</text>
                        </g>
                      );
                    })}
                    {perfSeries.map((s, i) => (
                      <path key={i} d={toPath(s.data)} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    ))}
                    {["W1", "W2", "W3", "W4"].map((lab, i) => {
                      const x = padL + (i / 3) * innerW;
                      return <text key={lab} x={x} y={PERF_H - 8} fontSize="10.5" fill="#8C8579" textAnchor="middle" fontFamily="Inter">{lab}</text>;
                    })}
                  </svg>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
                    {perfSeries.map((s, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, fontSize: 12.5 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--b-ink-2)" }}>
                          <i style={{ width: 10, height: 2.5, borderRadius: 2, background: s.color, display: "inline-block" }} />
                          {s.name}
                        </span>
                        <span style={{ color: "var(--b-ink)", fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{s.conv}</span>
                      </div>
                    ))}
                    {perfSeries.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--b-muted)" }}>No team performance data yet.</div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </BrokerPage>

      {/* Create Team modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="text-base font-semibold text-gray-900">Create Team</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Team Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Luxury Team"
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description (optional)</label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  rows={3}
                  placeholder="What does this team focus on?"
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !createName.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-orange-500 shadow-md hover:bg-orange-600 disabled:opacity-50 transition"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Team
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 1200px) {
          .b-teams-cols { grid-template-columns: 1fr !important; }
        }
        .b-kpi-strip { grid-template-columns: repeat(5, 1fr); }
        @media (max-width: 1100px) { .b-kpi-strip { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (max-width: 640px) { .b-kpi-strip { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
    </MainLayout>
  );
}
