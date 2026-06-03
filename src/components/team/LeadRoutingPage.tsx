import { useState, useEffect } from "react";
import MainLayout from "../MainLayout";
import {
  GitFork,
  TrendingUp,
  AlarmClock,
  Zap,
  BarChart2,
  Plus,
  Play,
  Pause,
  Pencil,
  ChevronRight,
  Users2,
  Loader2,
  RefreshCw,
  Bell,
} from "lucide-react";
import "./brokerDesign.css";
import { BrokerHeader, BrokerPage, KpiStrip, type KpiItem } from "./brokerShared";

interface RoutingRule {
  id: string | number;
  condition: string;
  destination: string;
  destination_type?: "team" | "agent" | "office";
  active?: boolean;
  priority?: number;
}

interface RoutingConfig {
  rules?: RoutingRule[];
  assignment_method?: string;
  reroute_enabled?: boolean;
  reroute_minutes?: number;
  max_reroutes?: number;
  lead_cooldown_hours?: number;
  notify_agent?: boolean;
  recent_activity?: { text: string; time: string }[];
}

const ASSIGNMENT_METHODS = [
  { value: "round_robin", label: "Round Robin" },
  { value: "load_balance", label: "Load Balance" },
  { value: "priority", label: "Priority" },
  { value: "manual", label: "Manual Assignment" },
];

const destinationPill = (type?: string) =>
  type === "team" ? "lead" : type === "agent" ? "admin" : type === "office" ? "agent" : "isa";

export default function LeadRoutingPage() {
  const [config, setConfig] = useState<RoutingConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [assignmentMethod, setAssignmentMethod] = useState("round_robin");
  const [rerouteEnabled, setRerouteEnabled] = useState(false);
  const [rerouteMinutes, setRerouteMinutes] = useState(30);
  const [maxReroutes, setMaxReroutes] = useState(3);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [notifyAgent, setNotifyAgent] = useState(true);

  const token = localStorage.getItem("token");
  const org_id = localStorage.getItem("org_id");
  const API_BASE = import.meta.env.VITE_API_BASE;

  useEffect(() => {
    if (!token || !org_id) { setLoading(false); return; }
    fetch(`${API_BASE}/lead-routing?org_id=${org_id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RoutingConfig | null) => {
        if (d) {
          setConfig(d);
          if (d.assignment_method) setAssignmentMethod(d.assignment_method);
          if (d.reroute_enabled != null) setRerouteEnabled(d.reroute_enabled);
          if (d.reroute_minutes != null) setRerouteMinutes(d.reroute_minutes);
          if (d.max_reroutes != null) setMaxReroutes(d.max_reroutes);
          if (d.lead_cooldown_hours != null) setCooldownHours(d.lead_cooldown_hours);
          if (d.notify_agent != null) setNotifyAgent(d.notify_agent);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rules: RoutingRule[] = config?.rules ?? [];

  const toggleRule = (id: string | number) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            rules: (prev.rules ?? []).map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
          }
        : prev,
    );
  };

  const activeRules = rules.filter((r) => r.active !== false).length;

  const kpis: KpiItem[] = [
    { label: "Leads Routed", value: "-", icon: GitFork },
    { label: "Routed Successfully", value: "-", icon: TrendingUp },
    { label: "Avg Routing Time", value: "-", icon: AlarmClock },
    { label: "Active Rules", value: activeRules || "-", icon: Zap },
    { label: "Leads Escalated", value: "-", icon: BarChart2 },
  ];

  return (
    <MainLayout>
      <BrokerPage>
        <BrokerHeader
          title="Lead Routing"
          subtitle="Configure how new leads are assigned across teams and agents."
          primaryAction={{ label: "Edit Workflow", icon: Pencil }}
        />

        <KpiStrip items={kpis} columns={5} />

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: 80, color: "var(--b-muted)", fontSize: 13 }}>
            <Loader2 size={16} className="animate-spin" /> Loading routing config...
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }} className="b-teams-cols">
            <section className="b-panel">
              <div className="b-panel-h">
                <h2>Routing Workflow</h2>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "var(--b-orange-50)", color: "var(--b-orange-600)", border: "1px solid #FBD6BE", fontSize: 11, fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--b-orange)" }} />
                  Active
                </span>
              </div>

              <div style={{ padding: "8px 20px 18px" }}>
                {rules.length === 0 ? (
                  <div style={{ border: "1px dashed #DCD6C6", borderRadius: 12, padding: "32px 20px", textAlign: "center" }}>
                    <div style={{ margin: "0 auto 12px", width: 44, height: 44, borderRadius: 12, background: "var(--b-orange-50)", color: "var(--b-orange)", display: "grid", placeItems: "center" }}>
                      <GitFork size={20} />
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--b-ink)" }}>No routing rules yet</div>
                    <div style={{ fontSize: 12.5, color: "var(--b-muted)", marginTop: 4 }}>
                      Add your first rule to start automatically assigning leads.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {rules.map((rule, i) => {
                      const isActive = rule.active !== false;
                      return (
                        <div key={String(rule.id)} style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--b-orange)", color: "#fff", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(247,106,45,.28)" }}>
                              {i + 1}
                            </div>
                            {i < rules.length - 1 && (
                              <div style={{ width: 1, flex: 1, background: "var(--b-line)", marginTop: 4, minHeight: 20 }} />
                            )}
                          </div>
                          <div style={{
                            flex: 1,
                            borderRadius: 12,
                            border: isActive ? "1px solid #FBD6BE" : "1px solid var(--b-line-2)",
                            background: isActive ? "#FFF8F2" : "var(--b-soft)",
                            opacity: isActive ? 1 : 0.7,
                            padding: 14,
                            display: "grid",
                            gridTemplateColumns: "1fr auto 1fr auto",
                            alignItems: "center",
                            gap: 12,
                          }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--b-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>If</div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{rule.condition || "-"}</div>
                            </div>
                            <ChevronRight size={16} style={{ color: "var(--b-muted)" }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--b-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Then route to</div>
                              <span className={`b-pill ${destinationPill(rule.destination_type)}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <Users2 size={11} />
                                {rule.destination || "-"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleRule(rule.id)}
                              title={isActive ? "Pause rule" : "Activate rule"}
                              className="b-btn-ghost"
                              style={{ padding: "6px 8px" }}
                            >
                              {isActive ? <Pause size={13} /> : <Play size={13} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <button type="button" className="b-dashed" style={{ marginTop: 12, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}>
                  <Plus size={14} /> Add New Rule
                </button>
              </div>
            </section>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <section className="b-panel">
                <div className="b-panel-h">
                  <h2>Routing Settings</h2>
                </div>
                <div style={{ padding: "4px 20px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 6 }}>Assignment Method</label>
                    <select
                      value={assignmentMethod}
                      onChange={(e) => setAssignmentMethod(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "1px solid var(--b-line)", background: "#fff", color: "var(--b-ink)" }}
                    >
                      {ASSIGNMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--b-ink)" }}>Auto Re-Route</div>
                      <div style={{ fontSize: 11.5, color: "var(--b-muted)" }}>Re-assign if agent doesn't respond</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rerouteEnabled}
                      onClick={() => setRerouteEnabled((v) => !v)}
                      className={`b-toggle ${rerouteEnabled ? "on" : "off"}`}
                    />
                  </div>

                  {rerouteEnabled && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                      <RefreshCw size={14} style={{ color: "var(--b-muted)", marginBottom: 9 }} />
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 4 }}>Re-route after (minutes)</label>
                        <input
                          type="number" min={5} max={1440}
                          value={rerouteMinutes}
                          onChange={(e) => setRerouteMinutes(Number(e.target.value))}
                          style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "1px solid var(--b-line)" }}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 6 }}>Max Re-Routes</label>
                    <input
                      type="number" min={0} max={10}
                      value={maxReroutes}
                      onChange={(e) => setMaxReroutes(Number(e.target.value))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "1px solid var(--b-line)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 6 }}>Lead Cooldown (hours)</label>
                    <input
                      type="number" min={0} max={720}
                      value={cooldownHours}
                      onChange={(e) => setCooldownHours(Number(e.target.value))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: 13, borderRadius: 8, border: "1px solid var(--b-line)" }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Bell size={14} style={{ color: "var(--b-muted)" }} />
                      <div style={{ fontSize: 13, fontWeight: 500 }}>Notify Agent on Assignment</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifyAgent}
                      onClick={() => setNotifyAgent((v) => !v)}
                      className={`b-toggle ${notifyAgent ? "on" : "off"}`}
                    />
                  </div>

                  <button type="button" className="b-btn-primary" style={{ justifyContent: "center", width: "100%", padding: "10px 14px" }}>
                    Save Settings
                  </button>
                </div>
              </section>

              <section className="b-panel">
                <div className="b-panel-h">
                  <h2>Real-time Activity</h2>
                </div>
                <div style={{ padding: "0 20px 18px" }}>
                  {(config?.recent_activity ?? []).length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--b-muted)" }}>No recent routing events.</div>
                  ) : (
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
                      {(config?.recent_activity ?? []).slice(0, 5).map((a, i) => (
                        <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--b-line-2)", fontSize: 13 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--b-orange)", flex: "0 0 auto" }} />
                          <span style={{ flex: 1, color: "var(--b-ink-2)" }}>{a.text}</span>
                          <span style={{ fontSize: 11.5, color: "var(--b-muted)" }}>{a.time}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </BrokerPage>

      <style>{`
        @media (max-width: 1200px) {
          .b-teams-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </MainLayout>
  );
}
