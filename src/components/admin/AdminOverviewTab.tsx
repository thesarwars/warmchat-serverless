import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ai-v2/Icon";
import { fetchAdminOverview } from "@/helpers/backend";

/*
 * Admin ▸ Overview tab - LIVE data from GET /api/dashboard/org/:id/overview
 * (aggregates over deal / lead / lead_appointment). Command center: 4 KPI cards
 * → bar chart + by-type breakdown → upcoming appointments → closed-deal stats +
 * recent closings. Rendered through the prototype's .wc-* classes.
 */

const TONES: Record<string, { fg: string; bg: string }> = {
  green: { fg: "#16A34A", bg: "#E8F8ED" },
  indigo: { fg: "#4F46E5", bg: "#ECEDFD" },
  teal: { fg: "#0D9488", bg: "#E3F6F2" },
  emerald: { fg: "#059669", bg: "#E6F7EF" },
};
const TYPE_COLORS = ["#8B5CF6", "#6366F1", "#0EA5E9", "#F59E0B", "#14B8A6"];

interface Kpi { icon: string; label: string; value: string; delta: string; up?: boolean; tone: string }
interface Metric { icon: string; label: string; value: string; sub: string; tone: string }

interface OverviewData {
  kpis: { pipeline_value: number; appointments: number; lead_to_appt: number; closed_deals: number };
  appt_chart: number[];
  appt_types: { label: string; value: number }[];
  appt_upcoming: { title: string; who: string; loc: string; when: string; agent: string; kind: string }[];
  closed: { deals: number; volume: number; commission: number; avg_deal: number };
  closings: { addr: string; city: string; price: number }[];
}

// Compact USD: 4_200_000 -> "$4.2M", 95_000 -> "$95K", 805_000 -> "$805K".
function fmtMoney(n: number): string {
  if (!n) return "$0";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return "$" + Math.round(n / 1_000) + "K";
  return "$" + n.toLocaleString("en-US");
}

// ISO -> "Today 2:00 PM" / "Tomorrow 4:30 PM" / "Mon 1:00 PM".
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const time = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(today)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  return `${d.toLocaleString("en-US", { weekday: "short" })} ${time}`;
}

function RepKpi({ k }: { k: Kpi }) {
  const t = TONES[k.tone];
  return (
    <div className="wc-kpi">
      <span className="wc-kpi-icon" style={{ color: t.fg, background: t.bg }}><Icon name={k.icon} size={17} /></span>
      <div className="wc-kpi-body">
        <div className="wc-kpi-label">{k.label}</div>
        <div className="wc-kpi-row"><span className="wc-kpi-val wc-mono">{k.value}</span><span className={"wc-kpi-delta" + (k.up ? " is-up" : "")}>{k.delta}</span></div>
      </div>
    </div>
  );
}

function StatCard({ m }: { m: Metric }) {
  const t = TONES[m.tone];
  return (
    <div className="wc-stat wc-repstat">
      <span className="wc-repstat-ic" style={{ color: t.fg, background: t.bg }}><Icon name={m.icon} size={17} /></span>
      <div className="wc-stat-label">{m.label}</div>
      <div className="wc-stat-val wc-mono">{m.value}</div>
      <div className="wc-stat-sub">{m.sub}</div>
    </div>
  );
}

export default function AdminOverviewTab() {
  const orgId = typeof window !== "undefined" ? Number(localStorage.getItem("org_id")) || 0 : 0;
  const { data, isLoading, isError } = useQuery<OverviewData>({
    queryKey: ["admin-overview", orgId],
    queryFn: () => fetchAdminOverview(orgId) as Promise<OverviewData>,
    enabled: orgId > 0,
  });

  if (isLoading || !data) {
    return <div className="wc-panel-card pad"><div className="wc-band-d">{isError ? "Couldn't load overview." : "Loading overview…"}</div></div>;
  }

  const REP_KPIS: Kpi[] = [
    { icon: "dollar", label: "Pipeline Value", value: fmtMoney(data.kpis.pipeline_value), delta: "open deals", tone: "green" },
    { icon: "calendarCheck", label: "Appointments", value: String(data.kpis.appointments), delta: "this month", tone: "indigo" },
    { icon: "trending", label: "Lead → Appt", value: data.kpis.lead_to_appt + "%", delta: "conversion", tone: "teal" },
    { icon: "trophy", label: "Closed Deals", value: String(data.kpis.closed_deals), delta: "this month", tone: "emerald" },
  ];
  const CLOSED_METRICS: Metric[] = [
    { icon: "trophy", label: "Closed Deals", value: String(data.closed.deals), sub: "this month", tone: "emerald" },
    { icon: "dollar", label: "Volume Closed", value: fmtMoney(data.closed.volume), sub: "gross sales", tone: "green" },
    { icon: "dollar", label: "Est. Commission", value: fmtMoney(data.closed.commission), sub: "this month", tone: "teal" },
    { icon: "trending", label: "Avg Deal Size", value: fmtMoney(data.closed.avg_deal), sub: "per transaction", tone: "indigo" },
  ];
  const apptMax = Math.max(1, ...data.appt_chart);
  const apptTotalType = data.appt_types.reduce((s, t) => s + t.value, 0) || 1;
  const upcoming = data.appt_upcoming;

  return (
    <div>
      <div className="wc-rep-kpis">{REP_KPIS.map((k) => <RepKpi key={k.label} k={k} />)}</div>

      <div className="wc-admin-grid">
        <div className="wc-panel-card pad wc-chartcard">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="calendarCheck" size={17} /></span>Appointments booked · last 14 days</div>
          <div className="wc-chart">
            {data.appt_chart.map((v, i) => (
              <div className="wc-chart-col" key={i}>
                <div className="wc-chart-bar" style={{ height: (v / apptMax * 100) + "%" }}><span>{v}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="layers" size={17} /></span>By type</div>
          {data.appt_types.length === 0 && <div className="wc-band-d">No appointments yet.</div>}
          {data.appt_types.map((t, i) => {
            const color = TYPE_COLORS[i % TYPE_COLORS.length];
            return (
              <div className="wc-pipe-row" key={t.label}>
                <div className="wc-pipe-top">
                  <span className="wc-pipe-name"><span className="wc-col-dot" style={{ ["--stage" as string]: color } as CSSProperties} />{t.label}</span>
                  <span className="wc-pipe-meta"><span className="wc-pipe-count">{Math.round(t.value / apptTotalType * 100)}%</span><b className="wc-mono">{t.value}</b></span>
                </div>
                <div className="wc-pipe-bar"><div style={{ width: (t.value / apptTotalType * 100) + "%", background: color }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="wc-panel-card" style={{ marginBottom: 16, marginTop: 16 }}>
        <div className="wc-card-head">
          <div><div className="wc-card-h2">Upcoming appointments</div></div>
          <span className="wc-band-d">{upcoming.length} scheduled</span>
        </div>
        <div className="wc-agoal-list">
          {upcoming.length === 0 && <div className="wc-band-d" style={{ padding: "4px 2px" }}>No upcoming appointments.</div>}
          {upcoming.slice(0, 3).map((a, i) => (
            <div className="wc-agoal-row" key={i}>
              <span className="wc-closing-ic"><Icon name="calendarCheck" size={15} /></span>
              <div className="wc-agoal-row-b"><div className="wc-agoal-row-t">{a.title} · {a.who}</div><div className="wc-band-d">{a.loc} · {a.agent}</div></div>
              <span className="wc-hot-tag">{a.kind}</span>
              <span className="wc-band-d" style={{ minWidth: 96, textAlign: "right" }}>{fmtWhen(a.when)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="wc-admin-grid" style={{ marginTop: 16 }}>
        <div className="wc-admin-col">
          <div className="wc-rep-stats two">{CLOSED_METRICS.map((m) => <StatCard key={m.label} m={m} />)}</div>
        </div>
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="trophy" size={17} /></span>Recent closings</div>
          <div className="wc-closings">
            {data.closings.length === 0 && <div className="wc-band-d">No closings yet.</div>}
            {data.closings.map((c, i) => (
              <div className="wc-closing" key={i}>
                <span className="wc-closing-ic"><Icon name="home" size={15} /></span>
                <div><div className="wc-closing-addr">{c.addr}</div><div className="wc-band-d">{c.city}</div></div>
                <span className="wc-mono wc-closing-price">{fmtMoney(c.price)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
