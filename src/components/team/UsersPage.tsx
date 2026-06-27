import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import MainLayout from "../MainLayout";
import {
  Users,
  MessageSquare,
  CalendarCheck,
  Clock,
  TrendingUp,
  DollarSign,
  Download,
  Search,
  Loader2,
  UserPlus,
  X,
  Mail,
  Filter,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  UsersRound,
} from "lucide-react";
import "./brokerDesign.css";
import { Avatar, BrokerPage } from "./brokerShared";
import { initialsOf } from "./brokerUtils";

type UserRole = "Admin" | "Manager" | "Agent" | "ISA" | "Inactive";

interface OrgUser {
  id: string | number;
  name?: string;
  email?: string;
  role?: string;
  team?: string;
  team_name?: string;
  leads_count?: number;
  response_time?: string;
  status?: string;
  conversations?: number;
  appointments?: number;
  pipeline_value?: number;
  won_deals?: number;
  conversion_rate?: string;
  avatar?: string;
}

interface TeamSummary {
  id: string | number;
  name: string;
  member_count?: number;
  members?: { id: string | number }[];
  active_leads?: number;
  appointments?: number;
  conversion_rate?: string | number;
}

const normalizeRole = (raw?: string): UserRole => {
  const r = (raw ?? "").toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "manager" || r === "team lead" || r === "team_lead") return "Manager";
  if (r === "isa") return "ISA";
  if (r === "inactive") return "Inactive";
  return "Agent";
};

const pillFor = (r: UserRole) =>
  r === "Admin" ? "admin" : r === "Manager" ? "lead" : r === "Agent" ? "agent" : r === "ISA" ? "isa" : "inactive";

const fmtRate = (v?: string | number) => {
  if (v == null || v === "") return "-";
  const s = String(v);
  return s.endsWith("%") ? s : `${s}%`;
};

const TABS = ["All Users", "Agents", "ISAs", "Admins", "Inactive"] as const;
type Tab = (typeof TABS)[number];

const PAGE_SIZE = 10;

export default function UsersPage() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [tab, setTab] = useState<Tab>("All Users");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Representative");
  const [inviting, setInviting] = useState(false);

  const token = localStorage.getItem("token");
  const org_id = localStorage.getItem("org_id");
  const API_BASE = import.meta.env.VITE_API_BASE;

  const loadUsers = useCallback(async () => {
    if (!token) { setLoadingUsers(false); return; }
    try {
      const r = await fetch(`${API_BASE}/auth/users`, { headers: { Authorization: `Bearer ${token}` } });
      const d = r.ok ? await r.json() : null;
      const list: OrgUser[] = Array.isArray(d) ? d : Array.isArray(d?.users) ? d.users : [];
      setUsers(list);
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false);
    }
  }, [API_BASE, token]);

  const loadTeams = useCallback(async () => {
    if (!token || !org_id) { setLoadingTeams(false); return; }
    try {
      const r = await fetch(`${API_BASE}/teams?org_id=${org_id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = r.ok ? await r.json() : null;
      const list: TeamSummary[] = Array.isArray(d) ? d : Array.isArray(d?.teams) ? d.teams : [];
      setTeams(list);
    } catch {
      // ignore
    } finally {
      setLoadingTeams(false);
    }
  }, [API_BASE, org_id, token]);

  useEffect(() => {
    void loadUsers();
    void loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) { toast.error("Email is required"); return; }
    setInviting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to send invite");
      toast.success(`Invite sent to ${email}`);
      setShowInvite(false);
      setInviteEmail("");
      setInviteRole("Representative");
      void loadUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send invite";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  };

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const role = normalizeRole(u.role);
      if (tab === "Agents" && role !== "Agent") return false;
      if (tab === "ISAs" && role !== "ISA") return false;
      if (tab === "Admins" && role !== "Admin" && role !== "Manager") return false;
      if (tab === "Inactive" && (u.status || "").toLowerCase() === "active") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (u.name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, tab, search]);

  useEffect(() => { setPage(1); }, [tab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const pageNumbers = useMemo(() => {
    const out: number[] = [];
    const span = 5;
    let start = Math.max(1, page - Math.floor(span / 2));
    const end = Math.min(totalPages, start + span - 1);
    start = Math.max(1, end - span + 1);
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }, [page, totalPages]);

  // Live roll-ups across the org's users (each row carries its own aggregates
  // from GET /api/auth/users). Response time needs message-latency tracking we
  // don't compute yet, so it stays "-" rather than showing a fabricated number.
  const fmtMoney = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n}`;
  const sumConvs = users.reduce((s, u) => s + (Number(u.conversations) || 0), 0);
  const sumAppts = users.reduce((s, u) => s + (Number(u.appointments) || 0), 0);
  const sumPipeline = users.reduce((s, u) => s + (Number(u.pipeline_value) || 0), 0);
  const totalLeads = users.reduce((s, u) => s + (Number(u.leads_count) || 0), 0);
  const totalWon = users.reduce((s, u) => s + (Number(u.won_deals) || 0), 0);
  const kpis = [
    { label: "Total Agents", icon: Users, value: users.length || "-" },
    { label: "Active Conversations", icon: MessageSquare, value: sumConvs || "-" },
    { label: "Appointments Booked", icon: CalendarCheck, value: sumAppts || "-" },
    { label: "Avg. Response Time", icon: Clock, value: "-" },
    { label: "Pipeline Value", icon: DollarSign, value: sumPipeline ? fmtMoney(sumPipeline) : "-" },
    { label: "Conversion Rate", icon: TrendingUp, value: totalLeads > 0 ? `${Math.round((totalWon / totalLeads) * 100)}%` : "-" },
  ];

  const exportCsv = () => {
    const cols = ["name", "email", "role", "team", "leads_count", "response_time", "status"];
    const rows = filtered.map((u) =>
      cols.map((c) => `"${String((u as unknown as Record<string, unknown>)[c] ?? "").replace(/"/g, '""')}"`).join(","),
    );
    const csv = [cols.join(","), ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <MainLayout>
      <BrokerPage>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 3px", fontSize: 24, lineHeight: 1.2, fontWeight: 600, color: "var(--b-ink)", letterSpacing: "-.01em" }}>
              Brokerage Overview
            </h1>
            <div style={{ fontSize: 13.5, color: "var(--b-muted)" }}>
              Manage your agents, ISAs, and admins.
            </div>
          </div>
          <button type="button" className="b-btn-primary" onClick={() => setShowInvite(true)}>
            <Plus size={14} /> Add User
          </button>
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10, marginBottom: 16 }} className="b-kpi-strip-6">
          {kpis.map((k, i) => {
            const Icon = k.icon;
            return (
              <div key={i} className="b-kpi">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="b-kpi-ico"><Icon size={18} /></div>
                  <div className="b-kpi-label">{k.label}</div>
                </div>
                <div className="b-kpi-val">{k.value}</div>
              </div>
            );
          })}
        </div>

        {/* Two-column: Users table + Teams snippet */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }} className="b-dash-cols">
          <section className="b-panel">
            <div className="b-panel-h">
              <h2>Users</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="b-mini-search">
                  <Search size={14} style={{ color: "var(--b-muted)" }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." />
                </div>
                <button className="b-btn-ghost"><Filter size={14} /></button>
                <button className="b-btn-ghost" onClick={exportCsv}><Download size={14} />Export</button>
              </div>
            </div>

            <div className="b-tabs">
              {TABS.map((t) => (
                <button key={t} type="button" className={`b-tab ${t === tab ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>

            {loadingUsers ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "60px 20px", color: "var(--b-muted)", fontSize: 13 }}>
                <Loader2 size={16} className="animate-spin" /> Loading users...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--b-muted)", fontSize: 13 }}>
                {users.length === 0
                  ? "No users yet. Invite teammates to get started."
                  : "No users match the selected filter."}
              </div>
            ) : (
              <table className="b-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Team</th>
                    <th>Leads</th>
                    <th>Response Time</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((u) => {
                    const role = normalizeRole(u.role);
                    const statusRaw = (u.status || "").toLowerCase();
                    const status = statusRaw === "active" ? "active" : statusRaw === "away" ? "away" : "offline";
                    return (
                      <tr key={String(u.id)}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Avatar initials={initialsOf(u.name, u.email)} size={34} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: "var(--b-ink)", fontSize: 13.5 }}>{u.name || "-"}</div>
                              <div style={{ fontSize: 12, color: "var(--b-muted)" }}>{u.email || ""}</div>
                            </div>
                          </div>
                        </td>
                        <td><span className={`b-pill ${pillFor(role)}`}>{role}</span></td>
                        <td style={{ color: "var(--b-ink-2)" }}>{u.team_name || u.team || "-"}</td>
                        <td style={{ fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{u.leads_count ?? "-"}</td>
                        <td style={{ color: "var(--b-ink-2)", fontFeatureSettings: '"tnum"' }}>{u.response_time ?? "-"}</td>
                        <td><span className={`b-status ${status}`}>{u.status || "Offline"}</span></td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="b-btn-ghost"
                            style={{ padding: "4px 6px", marginLeft: "auto" }}
                            aria-label="Row actions"
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

            {filtered.length > 0 && (
              <div className="b-pagi">
                <div className="b-pagi-info">
                  Showing {pageStart + 1} to {Math.min(filtered.length, pageStart + PAGE_SIZE)} of {filtered.length} users
                </div>
                <div className="b-pages">
                  <button className="b-page arrow" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft size={14} />
                  </button>
                  {pageNumbers.map((n) => (
                    <button key={n} className={`b-page ${n === page ? "active" : ""}`} onClick={() => setPage(n)}>{n}</button>
                  ))}
                  <button className="b-page arrow" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Teams snippet panel - real data from /teams */}
          <section className="b-panel">
            <div className="b-panel-h">
              <h2>Teams</h2>
              <button className="b-btn-ghost b-btn-accent" type="button" onClick={() => { window.location.href = "/team/teams"; }}>
                <Plus size={14} /> New Team
              </button>
            </div>
            <div style={{ padding: "8px 12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {loadingTeams ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 20px", color: "var(--b-muted)", fontSize: 13 }}>
                  <Loader2 size={16} className="animate-spin" /> Loading teams...
                </div>
              ) : teams.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--b-muted)", fontSize: 13 }}>
                  No teams yet.
                </div>
              ) : (
                teams.slice(0, 5).map((t) => {
                  const members = t.member_count ?? (Array.isArray(t.members) ? t.members.length : 0);
                  return (
                    <div key={String(t.id)} style={{ padding: 14, border: "1px solid var(--b-line-2)", borderRadius: 12, background: "#FDFCF8" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--b-orange-50)", color: "var(--b-orange)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                          <UsersRound size={18} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--b-ink)" }}>{t.name}</div>
                          <div style={{ fontSize: 11.5, color: "var(--b-muted)" }}>{members} {members === 1 ? "Member" : "Members"}</div>
                        </div>
                        <button type="button" style={{ marginLeft: "auto", width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: 6, border: 0, background: "transparent", color: "var(--b-muted)", cursor: "pointer" }}>
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--b-line)" }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: "var(--b-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em" }}>Active Leads</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--b-ink)", marginTop: 2, fontFeatureSettings: '"tnum"' }}>{t.active_leads ?? "-"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10.5, color: "var(--b-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em" }}>Appointments</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--b-ink)", marginTop: 2, fontFeatureSettings: '"tnum"' }}>{t.appointments ?? "-"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10.5, color: "var(--b-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em" }}>Conversion</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--b-ink)", marginTop: 2, fontFeatureSettings: '"tnum"' }}>{fmtRate(t.conversion_rate)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </BrokerPage>

      {/* Invite User modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="text-base font-semibold text-gray-900">Invite User</h3>
              <button
                type="button"
                onClick={() => setShowInvite(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="agent@brokerage.com"
                    autoFocus
                    className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                >
                  <option value="Manager">Manager</option>
                  <option value="Representative">Representative (Agent)</option>
                  <option value="Guest">Guest</option>
                </select>
                <p className="mt-1.5 text-xs text-gray-500">
                  Managers can invite teammates and view all leads; Representatives are agents.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowInvite(false)}
                disabled={inviting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-orange-500 shadow-md hover:bg-orange-600 disabled:opacity-50 transition"
              >
                {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 1400px) {
          .b-kpi-strip-6 { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 700px) {
          .b-kpi-strip-6 { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 1200px) {
          .b-dash-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </MainLayout>
  );
}
