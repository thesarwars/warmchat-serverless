import { useState, useEffect, useMemo } from "react";
import MainLayout from "../MainLayout";
import {
  Building2,
  Users,
  MessageSquare,
  CalendarCheck,
  DollarSign,
  MoreHorizontal,
  MapPin,
  Phone,
  Mail,
  Clock,
  Loader2,
  Search,
  Filter,
} from "lucide-react";
import "./brokerDesign.css";
import { BrokerHeader, BrokerPage, KpiStrip, type KpiItem } from "./brokerShared";

interface Office {
  id: string | number;
  name: string;
  location?: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone?: string;
  teams_count?: number;
  agents_count?: number;
  active_leads?: number;
  conversations?: number;
  appointments?: number;
  pipeline_value?: string | number;
  conversion_rate?: string | number;
  top_teams?: { name: string; leads: number }[];
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

const PALETTE = ["#F76A2D", "#C9A26E", "#A8A6A0", "#7A7770", "#2563EB", "#7C3AED"];

function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  const sliceData = slices.reduce<{ dash: number; offset: number }[]>((acc, s) => {
    const dash = (s.value / total) * circ;
    const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].dash;
    acc.push({ dash, offset });
    return acc;
  }, []);
  return (
    <svg viewBox="0 0 100 100" style={{ width: 110, height: 110 }}>
      {slices.map((s, i) => {
        const { dash, offset } = sliceData[i];
        const gap = circ - dash;
        return (
          <circle
            key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth="18"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r - 9} fill="white" />
    </svg>
  );
}

function LineChart({ series }: { series: { label: string; values: number[]; color: string }[] }) {
  const W = 760, H = 240, padL = 36, padR = 16, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const yTicks = [0, max / 4, max / 2, (3 * max) / 4, max].map((v) => Math.round(v));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 240 }}>
      {yTicks.map((t, i) => {
        const y = padT + innerH - (t / max) * innerH;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#F1ECE0" strokeDasharray="3 4" />
            <text x={padL - 8} y={y + 4} fontSize="10.5" fill="#8C8579" textAnchor="end" fontFamily="Inter">{t}</text>
          </g>
        );
      })}
      {series.map((s) => {
        const n = s.values.length;
        const d = s.values
          .map((v, i) => {
            const x = padL + (i / Math.max(n - 1, 1)) * innerW;
            const y = padT + innerH - (v / max) * innerH;
            return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
        return <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </svg>
  );
}

export default function OfficesPage() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [search, setSearch] = useState("");

  const token = localStorage.getItem("token");
  const org_id = localStorage.getItem("org_id");
  const API_BASE = import.meta.env.VITE_API_BASE;

  useEffect(() => {
    if (!token || !org_id) { setLoading(false); return; }
    fetch(`${API_BASE}/offices?org_id=${org_id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: Office[] = Array.isArray(d) ? d : Array.isArray(d?.offices) ? d.offices : [];
        setOffices(list);
        setSelectedId(list[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return offices;
    const q = search.toLowerCase();
    return offices.filter((o) =>
      o.name.toLowerCase().includes(q) ||
      (o.location || "").toLowerCase().includes(q) ||
      (o.address || "").toLowerCase().includes(q),
    );
  }, [offices, search]);

  const selected = offices.find((o) => o.id === selectedId) || null;

  const totalAgents = offices.reduce((s, o) => s + (o.agents_count ?? 0), 0);
  const totalConvs = offices.reduce((s, o) => s + (o.conversations ?? 0), 0);
  const totalAppts = offices.reduce((s, o) => s + (o.appointments ?? 0), 0);
  const totalPipeline = offices.reduce((s, o) => {
    const n = Number(String(o.pipeline_value || 0).replace(/[^0-9.]/g, ""));
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  const kpis: KpiItem[] = [
    { label: "Total Offices", value: offices.length || "-", icon: Building2 },
    { label: "Total Agents", value: totalAgents || "-", icon: Users },
    { label: "Active Conversations", value: totalConvs || "-", icon: MessageSquare },
    { label: "Appointments", value: totalAppts || "-", icon: CalendarCheck },
    { label: "Pipeline Value", value: totalPipeline ? fmtPipeline(totalPipeline) : "-", icon: DollarSign },
  ];

  // Real office pipeline values only (flat reference line in $M). We don't track
  // pipeline history, and offices aren't yet linked to agents/leads, so this is
  // empty until that data exists - no synthetic trend is ever drawn.
  const lineSeries = filtered.slice(0, 5)
    .map((o, i) => ({ o, i, pv: Number(String(o.pipeline_value || 0).replace(/[^0-9.]/g, "")) || 0 }))
    .filter((x) => x.pv > 0)
    .map(({ o, i, pv }) => ({
      label: o.name,
      values: Array.from({ length: 12 }, () => pv / 1_000_000),
      color: PALETTE[i % PALETTE.length],
    }));

  const donutSlices = filtered.slice(0, 5).map((o, i) => ({
    label: o.name,
    value: o.active_leads ?? 0,
    color: PALETTE[i % PALETTE.length],
  })).filter((s) => s.value > 0);

  return (
    <MainLayout>
      <BrokerPage>
        <BrokerHeader
          title="Offices"
          subtitle="Overview of all brokerage office locations and performance."
          primaryAction={{ label: "Add Office", icon: Building2 }}
        />

        <KpiStrip items={kpis} columns={5} />

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: 80, color: "var(--b-muted)", fontSize: 13 }}>
            <Loader2 size={16} className="animate-spin" /> Loading offices...
          </div>
        ) : offices.length === 0 ? (
          <div className="b-panel" style={{ padding: "64px 20px", textAlign: "center" }}>
            <div style={{ margin: "0 auto 12px", width: 56, height: 56, borderRadius: 16, background: "var(--b-orange-50)", color: "var(--b-orange)", display: "grid", placeItems: "center" }}>
              <Building2 size={26} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--b-ink)", margin: 0 }}>No offices yet</h3>
            <p style={{ fontSize: 13, color: "var(--b-muted)", marginTop: 4 }}>
              Office locations will appear here once added to your organization.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }} className="b-teams-cols">
              <section className="b-panel">
                <div className="b-panel-h">
                  <h2>All Offices</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="b-mini-search">
                      <Search size={14} style={{ color: "var(--b-muted)" }} />
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search offices..." />
                    </div>
                    <button className="b-btn-ghost"><Filter size={14} />Filter</button>
                  </div>
                </div>
                <table className="b-table">
                  <thead>
                    <tr>
                      <th>Office</th>
                      <th>Teams</th>
                      <th>Agents</th>
                      <th>Active Leads</th>
                      <th>Pipeline</th>
                      <th>Conv. Rate</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => (
                      <tr
                        key={String(o.id)}
                        className={`clickable ${selectedId === o.id ? "selected" : ""}`}
                        onClick={() => setSelectedId(o.id)}
                      >
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--b-orange-50)", color: "var(--b-orange)", display: "grid", placeItems: "center" }}>
                              <Building2 size={18} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{o.name}</div>
                              {(o.location || o.address) && (
                                <div style={{ fontSize: 11.5, color: "var(--b-muted)", marginTop: 1 }}>{o.location || o.address}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td><div style={{ fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{o.teams_count ?? "-"}</div></td>
                        <td><div style={{ fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{o.agents_count ?? "-"}</div></td>
                        <td><div style={{ fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{o.active_leads ?? "-"}</div></td>
                        <td><div style={{ fontWeight: 600, fontFeatureSettings: '"tnum"', whiteSpace: "nowrap" }}>{fmtPipeline(o.pipeline_value)}</div></td>
                        <td><div style={{ fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{fmtRate(o.conversion_rate)}</div></td>
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
                    ))}
                  </tbody>
                </table>
                <div className="b-pagi">
                  <div className="b-pagi-info">Showing 1 to {filtered.length} of {offices.length} offices</div>
                </div>
              </section>

              {selected && (
                <section className="b-panel">
                  <div style={{ padding: "16px 18px 0", borderBottom: "1px solid var(--b-line-2)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--b-orange-50)", color: "var(--b-orange)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                        <Building2 size={20} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.01em" }}>{selected.name}</div>
                        {(selected.location || selected.address) && (
                          <div style={{ fontSize: 12.5, color: "var(--b-muted)", marginTop: 2 }}>{selected.location || selected.address}</div>
                        )}
                      </div>
                      <button type="button" className="b-btn-ghost" style={{ padding: "4px 6px" }}>
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: "16px 18px" }}>
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 10 }}>Contact Details</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--b-ink-2)" }}>
                        {(selected.address || selected.location) && (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <MapPin size={14} style={{ color: "var(--b-muted)", marginTop: 2, flex: "0 0 auto" }} />
                            <span>{selected.address || selected.location}</span>
                          </div>
                        )}
                        {selected.phone && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Phone size={14} style={{ color: "var(--b-muted)", flex: "0 0 auto" }} />
                            <span>{selected.phone}</span>
                          </div>
                        )}
                        {selected.email && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Mail size={14} style={{ color: "var(--b-muted)", flex: "0 0 auto" }} />
                            <span>{selected.email}</span>
                          </div>
                        )}
                        {selected.timezone && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Clock size={14} style={{ color: "var(--b-muted)", flex: "0 0 auto" }} />
                            <span>{selected.timezone}</span>
                          </div>
                        )}
                        {!(selected.address || selected.location || selected.phone || selected.email || selected.timezone) && (
                          <span style={{ color: "var(--b-muted)" }}>No contact details added yet.</span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 10, display: "flex", alignItems: "baseline", gap: 6 }}>
                        Office Stats <span style={{ fontSize: 11, color: "var(--b-muted)", fontWeight: 500 }}>(This Month)</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 12px" }}>
                        {[
                          { l: "Teams", v: selected.teams_count ?? "-" },
                          { l: "Agents", v: selected.agents_count ?? "-" },
                          { l: "Active Leads", v: selected.active_leads ?? "-" },
                          { l: "Pipeline", v: fmtPipeline(selected.pipeline_value) },
                          { l: "Conv. Rate", v: fmtRate(selected.conversion_rate) },
                          { l: "Appointments", v: selected.appointments ?? "-" },
                        ].map((s) => (
                          <div key={s.l}>
                            <div style={{ fontSize: 10.5, color: "var(--b-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em" }}>{s.l}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--b-ink)", marginTop: 2, fontFeatureSettings: '"tnum"' }}>{s.v}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {Array.isArray(selected.top_teams) && selected.top_teams.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--b-ink-2)", marginBottom: 10 }}>Top Teams</div>
                        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                          {selected.top_teams.slice(0, 3).map((t, i) => (
                            <li key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--b-orange-50)", color: "var(--b-orange-600)", fontWeight: 700, fontSize: 11, display: "grid", placeItems: "center" }}>
                                {i + 1}
                              </span>
                              <span style={{ flex: 1, fontWeight: 500 }}>{t.name}</span>
                              <span style={{ fontFeatureSettings: '"tnum"', color: "var(--b-muted)" }}>{t.leads} leads</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }} className="b-teams-cols">
              <section className="b-panel">
                <div className="b-panel-h">
                  <div>
                    <h2>Office Pipeline Overview</h2>
                    <div style={{ fontSize: 12.5, color: "var(--b-muted)", marginTop: 2 }}>
                      Pipeline value by office
                    </div>
                  </div>
                </div>
                <div style={{ padding: "8px 20px 22px" }}>
                  {lineSeries.length > 0 ? (
                    <>
                      <LineChart series={lineSeries} />
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                        {lineSeries.map((s) => (
                          <div key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--b-ink-2)" }}>
                            <span style={{ width: 10, height: 2.5, borderRadius: 2, background: s.color }} />
                            {s.label}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: "var(--b-muted)", fontSize: 13 }}>No data yet.</div>
                  )}
                </div>
              </section>

              <section className="b-panel">
                <div className="b-panel-h">
                  <div>
                    <h2>Active Leads by Office</h2>
                    <div style={{ fontSize: 12.5, color: "var(--b-muted)", marginTop: 2 }}>
                      Distribution across offices
                    </div>
                  </div>
                </div>
                <div style={{ padding: "8px 20px 22px" }}>
                  {donutSlices.length > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                      <DonutChart slices={donutSlices} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 160 }}>
                        {donutSlices.map((s) => (
                          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
                            <span style={{ flex: 1, color: "var(--b-ink-2)" }}>{s.label}</span>
                            <span style={{ fontFeatureSettings: '"tnum"', fontWeight: 600 }}>{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: "var(--b-muted)", fontSize: 13 }}>No active leads recorded.</div>
                  )}
                </div>
              </section>
            </div>
          </>
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
