import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ai-v2/Icon";
import { fetchAdminMessaging } from "@/helpers/backend";

/*
 * Admin ▸ Messaging tab - LIVE data from GET /api/dashboard/org/:id/messaging.
 * Segmented SMS / Email toggle → a channel report (5 KPI stat cards → bar chart
 * + by-type breakdown). Metric cards = current month; trend = last 14 days.
 * Uses the prototype's .wc-* classes.
 */

const TONES: Record<string, { fg: string; bg: string }> = {
  violet: { fg: "#7C3AED", bg: "#F2ECFE" },
  green: { fg: "#16A34A", bg: "#E8F8ED" },
  teal: { fg: "#0D9488", bg: "#E3F6F2" },
  amber: { fg: "#D97706", bg: "#FEF5E5" },
  orange: { fg: "#EA580C", bg: "#FFF3EA" },
  indigo: { fg: "#4F46E5", bg: "#ECEDFD" },
};
const TYPE_COLORS = ["#8B5CF6", "#6366F1", "#0EA5E9", "#14B8A6"];

interface Metric { icon: string; label: string; value: string; sub: string; tone: string }
interface TypeRow { label: string; value: number; color: string }

interface ChannelData {
  sent: number; delivered: number; delivered_pct: number;
  reply_rate?: number; replies?: number; avg_reply_seconds?: number | null;
  opt_outs?: number; opt_out_pct?: number;
  open_rate?: number; opened?: number; click_rate?: number; clicked?: number;
  bounces?: number; bounce_pct?: number;
  chart: number[]; types: { label: string; value: number }[];
}
interface MessagingData { sms: ChannelData; email: ChannelData }

// 372 -> "6m 12s", 42 -> "42s", null -> "—".
function fmtDur(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function StatCard({ m }: { m: Metric }) {
  const t = TONES[m.tone] || TONES.orange;
  return (
    <div className="wc-stat wc-repstat">
      <span className="wc-repstat-ic" style={{ color: t.fg, background: t.bg }}><Icon name={m.icon} size={17} /></span>
      <div className="wc-stat-label">{m.label}</div>
      <div className="wc-stat-val wc-mono">{m.value}</div>
      <div className="wc-stat-sub">{m.sub}</div>
    </div>
  );
}

function ChannelReportTab({ icon, metrics, chart, chartLabel, types, typesLabel }: {
  icon: string; metrics: Metric[]; chart: number[]; chartLabel: string; types: TypeRow[]; typesLabel: string;
}) {
  const max = Math.max(1, ...chart);
  const totalType = types.reduce((s, t) => s + t.value, 0) || 1;
  return (
    <div>
      <div className="wc-rep-stats">{metrics.map((m) => <StatCard key={m.label} m={m} />)}</div>
      <div className="wc-admin-grid">
        <div className="wc-panel-card pad wc-chartcard">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name={icon} size={17} /></span>{chartLabel}</div>
          <div className="wc-chart">
            {chart.map((v, i) => (
              <div className="wc-chart-col" key={i}>
                <div className="wc-chart-bar" style={{ height: (v / max * 100) + "%" }}><span>{v}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="layers" size={17} /></span>{typesLabel}</div>
          {types.every((t) => t.value === 0) && <div className="wc-band-d">No messages this month.</div>}
          {types.map((t) => (
            <div className="wc-pipe-row" key={t.label}>
              <div className="wc-pipe-top">
                <span className="wc-pipe-name"><span className="wc-col-dot" style={{ ["--stage" as string]: t.color } as CSSProperties} />{t.label}</span>
                <span className="wc-pipe-meta"><span className="wc-pipe-count">{Math.round(t.value / totalType * 100)}%</span><b className="wc-mono">{t.value}</b></span>
              </div>
              <div className="wc-pipe-bar"><div style={{ width: (t.value / totalType * 100) + "%", background: t.color }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminMessagingTab() {
  const [sub, setSub] = useState<"sms" | "email">("sms");
  const orgId = typeof window !== "undefined" ? Number(localStorage.getItem("org_id")) || 0 : 0;
  const { data, isLoading, isError } = useQuery<MessagingData>({
    queryKey: ["admin-messaging", orgId],
    queryFn: () => fetchAdminMessaging(orgId) as Promise<MessagingData>,
    enabled: orgId > 0,
  });

  const SUBS = [
    { k: "sms" as const, label: "SMS", icon: "message" },
    { k: "email" as const, label: "Email", icon: "mail" },
  ];

  if (isLoading || !data) {
    return <div className="wc-panel-card pad"><div className="wc-band-d">{isError ? "Couldn't load messaging stats." : "Loading messaging stats…"}</div></div>;
  }

  const s = data.sms;
  const e = data.email;
  const smsMetrics: Metric[] = [
    { icon: "message", label: "Sent", value: s.sent.toLocaleString(), sub: "this month", tone: "orange" },
    { icon: "check", label: "Delivered", value: s.delivered_pct + "%", sub: `${s.delivered.toLocaleString()} delivered`, tone: "orange" },
    { icon: "refresh", label: "Replies", value: (s.replies ?? 0).toLocaleString(), sub: `${s.reply_rate ?? 0}% reply rate`, tone: "orange" },
    { icon: "zap", label: "Avg Reply Time", value: fmtDur(s.avg_reply_seconds), sub: "first response", tone: "orange" },
    { icon: "x", label: "Opt-outs", value: (s.opt_outs ?? 0).toLocaleString(), sub: `${s.opt_out_pct ?? 0}% of sent`, tone: "orange" },
  ];
  const emailMetrics: Metric[] = [
    { icon: "mail", label: "Sent", value: e.sent.toLocaleString(), sub: "this month", tone: "orange" },
    { icon: "check", label: "Delivered", value: e.delivered_pct + "%", sub: `${e.delivered.toLocaleString()} delivered`, tone: "orange" },
    { icon: "trending", label: "Open Rate", value: (e.open_rate ?? 0) + "%", sub: `${(e.opened ?? 0).toLocaleString()} opened`, tone: "orange" },
    { icon: "target", label: "Click Rate", value: (e.click_rate ?? 0) + "%", sub: "of sent", tone: "orange" },
    { icon: "x", label: "Bounces", value: (e.bounces ?? 0).toLocaleString(), sub: `${e.bounce_pct ?? 0}% of sent`, tone: "orange" },
  ];
  const withColors = (types: { label: string; value: number }[]): TypeRow[] =>
    types.map((t, i) => ({ ...t, color: TYPE_COLORS[i % TYPE_COLORS.length] }));

  return (
    <div>
      <div className="wc-seg" style={{ marginBottom: 16, maxWidth: 360 }}>
        {SUBS.map((sv) => (
          <button key={sv.k} className={sub === sv.k ? "is-on" : ""} onClick={() => setSub(sv.k)}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", fontSize: 13.5, fontWeight: 700 }}>
            <Icon name={sv.icon} size={15} />{sv.label}
          </button>
        ))}
      </div>
      {sub === "sms" && <ChannelReportTab icon="message" metrics={smsMetrics} chart={s.chart} chartLabel="Texts sent · last 14 days" types={withColors(s.types)} typesLabel="By message type" />}
      {sub === "email" && <ChannelReportTab icon="mail" metrics={emailMetrics} chart={e.chart} chartLabel="Emails sent · last 14 days" types={withColors(e.types)} typesLabel="By email type" />}
    </div>
  );
}
