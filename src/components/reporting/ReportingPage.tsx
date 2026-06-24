import { useState, type CSSProperties } from "react";
import MainLayout from "@/components/MainLayout";
import { Icon } from "@/components/ai-v2/Icon";
import { TONES } from "@/components/ai-v2/tones";
import "@/components/ai-v2/prototype.css";

/* Reporting - Overview / Properties / Sources / Calling / SMS / Email / AI /
   Deals / Appointments / Agent Goals, ported pixel-for-pixel from the
   "leads-remix-2" design bundle (reporting.jsx). UI-only demo with sample data
   (no reporting backend yet). Renders through the prototype's .wc-* classes
   under the .wcv2 wrapper (prototype.css). */

// Custom-property inline style helper (the prototype sets `--stage` on dots).
const dot = (color: string): CSSProperties => ({ "--stage": color } as CSSProperties);

const REP_TABS = [
  { k: "overview", label: "Overview" },
  { k: "sources", label: "Lead Sources" },
  { k: "appts", label: "Appointments" },
  { k: "properties", label: "Properties" },
  { k: "calling", label: "Calling" },
  { k: "sms", label: "SMS" },
  { k: "email", label: "Email" },
  { k: "ai", label: "AI Performance" },
  { k: "closed", label: "Deals" },
  { k: "goals", label: "Agent Goals" },
];

interface Kpi { icon: string; label: string; value: string; delta: string; up?: boolean; tone: string }
const REP_KPIS: Kpi[] = [
  { icon: "dollar", label: "Pipeline Value", value: "$4.2M", delta: "+12% MoM", up: true, tone: "green" },
  { icon: "flame", label: "Hot Leads", value: "12", delta: "+4 today", up: true, tone: "orange" },
  { icon: "calendarCheck", label: "Appointments", value: "18", delta: "this month", tone: "indigo" },
  { icon: "trophy", label: "Closed Deals", value: "4", delta: "+1 MoM", up: true, tone: "emerald" },
  { icon: "trending", label: "Lead → Appt", value: "14.8%", delta: "+2.1%", up: true, tone: "teal" },
  { icon: "clock", label: "Avg Response", value: "42s", delta: "-1.8m vs manual", up: true, tone: "blue" },
  { icon: "bot", label: "AI Conversations", value: "432", delta: "active", tone: "violet" },
];

const CHART = [6, 9, 5, 11, 8, 13, 7, 12, 15, 10, 14, 9, 17, 18];

interface Source { name: string; leads: number; appts: number; closed: number; status: string; color: string; letter: string; desc: string }
const SOURCES: Source[] = [
  { name: "Zillow", leads: 45, appts: 6, closed: 2, status: "Connected", color: "#1E40AF", letter: "Z", desc: "Premier Agent leads" },
  { name: "Meta Ads", leads: 22, appts: 3, closed: 1, status: "Connected", color: "#1877F2", letter: "M", desc: "Facebook & Instagram forms" },
  { name: "Open House", leads: 18, appts: 5, closed: 1, status: "Connected", color: "#8B5CF6", letter: "O", desc: "Sign-in app" },
  { name: "Google PPC", leads: 16, appts: 2, closed: 0, status: "Connected", color: "#34A853", letter: "G", desc: "Search & Local Services Ads" },
  { name: "Website", leads: 14, appts: 2, closed: 1, status: "Connected", color: "#0D9488", letter: "W", desc: "acmerealty.com forms" },
  { name: "Referral", leads: 12, appts: 4, closed: 1, status: "Connected", color: "#D97706", letter: "R", desc: "Manual referral entry" },
  { name: "Manual Entry", leads: 8, appts: 1, closed: 0, status: "Connected", color: "#64748B", letter: "E", desc: "Added by agents" },
  { name: "Other", leads: 7, appts: 1, closed: 0, status: "Connected", color: "#475569", letter: "O", desc: "Uncategorized sources" },
];

// Shared row shape for the proportional "pipe bar" lists below.
interface BarRow { label: string; value: number; color: string }

interface Metric { icon: string; label: string; value: string; sub: string; tone: string; up?: boolean }
const AI_METRICS: Metric[] = [
  { icon: "bot", label: "AI Conversations", value: "432", sub: "this month", tone: "violet" },
  { icon: "zap", label: "Avg AI Response", value: "8s", sub: "vs 42s overall", tone: "amber" },
  { icon: "calendarCheck", label: "AI Appointments", value: "12", sub: "booked after AI", tone: "indigo" },
  { icon: "target", label: "AI Qualified Leads", value: "31", sub: "auto-qualified", tone: "teal" },
  { icon: "clock", label: "Hours Saved", value: "42", sub: "estimated this month", tone: "green" },
];

const CLOSED_METRICS: Metric[] = [
  { icon: "trophy", label: "Closed Deals", value: "4", sub: "this month", tone: "emerald" },
  { icon: "dollar", label: "Volume Closed", value: "$3.8M", sub: "gross sales", tone: "green" },
  { icon: "dollar", label: "Est. Commission", value: "$95K", sub: "2.5% avg", tone: "teal" },
  { icon: "trending", label: "Avg Deal Size", value: "$950K", sub: "per transaction", tone: "indigo" },
];
const CLOSINGS = [
  { addr: "123 Main St", city: "Burbank", price: "$1.2M" },
  { addr: "456 Oak Ave", city: "Glendale", price: "$850K" },
  { addr: "789 Sunset Blvd", city: "Pasadena", price: "$950K" },
  { addr: "1422 Maple St", city: "Burbank", price: "$805K" },
];

const fmtUSD = (n: number) => "$" + n.toLocaleString("en-US");
const fmtMoney = (n: number) => (n >= 1000000 ? "$" + (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M" : "$" + Math.round(n / 1000) + "K");
const initialsOf = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

interface PersonalGoal { text: string; done: boolean }
interface AgentGoal {
  id: string; name: string; email: string;
  deals: number; upcoming: number; volume: number; earned: number; pending: number; goal: number;
  assignedLeads: number; conversations: number; appts: number;
  personal: PersonalGoal[];
  recentDeals: { addr: string; city: string; price: string; stage: string }[];
  recentAppts: { title: string; who: string; when: string }[];
  recentLeads: { name: string; src: string; stage: string; e: number; m: number; c: number }[];
}
const AGENT_GOALS: AgentGoal[] = [
  {
    id: "jv", name: "Jordan Brooks", email: "jordan@acmerealty.com",
    deals: 4, upcoming: 2, volume: 3800000, earned: 95000, pending: 38000, goal: 120000,
    assignedLeads: 12, conversations: 28, appts: 18,
    personal: [{ text: "Hit 5 closings before July", done: false }, { text: "Launch seller nurture campaign", done: true }],
    recentDeals: [{ addr: "123 Main St", city: "Burbank", price: "$1.2M", stage: "Closed" }, { addr: "1422 Maple St", city: "Burbank", price: "$805K", stage: "Under Contract" }],
    recentAppts: [{ title: "Buyer showing", who: "Anna L.", when: "Today 2:00 PM" }, { title: "Listing consult", who: "C. Hernandez", when: "Fri 10:30 AM" }],
    recentLeads: [{ name: "Brandon Kowalski", src: "Zillow", stage: "Hot", e: 2, m: 4, c: 1 }, { name: "Marisol Garcia", src: "Site form", stage: "Hot", e: 1, m: 3, c: 0 }],
  },
  {
    id: "sc", name: "Sarah Chen", email: "sarah@acmerealty.com",
    deals: 3, upcoming: 1, volume: 2400000, earned: 72000, pending: 24000, goal: 100000,
    assignedLeads: 9, conversations: 21, appts: 14,
    personal: [{ text: "Convert 3 open-house leads", done: false }],
    recentDeals: [{ addr: "456 Oak Ave", city: "Glendale", price: "$850K", stage: "Closed" }],
    recentAppts: [{ title: "Buyer consult", who: "Maria Lopez", when: "Fri 1:00 PM" }],
    recentLeads: [{ name: "Devon S.", src: "Zillow", stage: "Warm", e: 0, m: 2, c: 1 }],
  },
  {
    id: "mr", name: "Michael Ross", email: "michael@acmerealty.com",
    deals: 2, upcoming: 3, volume: 1600000, earned: 48000, pending: 60000, goal: 90000,
    assignedLeads: 7, conversations: 12, appts: 9,
    personal: [],
    recentDeals: [{ addr: "789 Sunset Blvd", city: "Pasadena", price: "$950K", stage: "Closed" }],
    recentAppts: [],
    recentLeads: [{ name: "The Pham family", src: "Referral", stage: "Warm", e: 1, m: 1, c: 0 }],
  },
  {
    id: "dw", name: "Dana Whitfield", email: "dana@acmerealty.com",
    deals: 1, upcoming: 0, volume: 640000, earned: 16000, pending: 0, goal: 0,
    assignedLeads: 4, conversations: 0, appts: 0,
    personal: [],
    recentDeals: [],
    recentAppts: [],
    recentLeads: [{ name: "Dan Corkill", src: "Referral", stage: "Lead", e: 2, m: 2, c: 1 }, { name: "Adam Veterans Electric", src: "Manual", stage: "Lead", e: 0, m: 0, c: 0 }],
  },
];

const CALL_METRICS: Metric[] = [
  { icon: "phone", label: "Total Calls", value: "318", sub: "this month", tone: "blue" },
  { icon: "clock", label: "Talk Time", value: "21h 04m", sub: "1,264 minutes", tone: "indigo" },
  { icon: "trending", label: "Connect Rate", value: "62%", sub: "198 of 318 answered", up: true, tone: "teal" },
  { icon: "calendarCheck", label: "Calls → Appt", value: "11%", sub: "34 appointments", up: true, tone: "green" },
  { icon: "message", label: "Voicemails", value: "74", sub: "auto-text sent", tone: "violet" },
  { icon: "zap", label: "Avg Call", value: "3m 58s", sub: "per connected call", tone: "amber" },
];
const CALL_CHART = [12, 18, 9, 22, 16, 27, 11, 24, 30, 19, 26, 14, 31, 36];
const CALL_OUTCOMES: BarRow[] = [
  { label: "Connected", value: 198, color: "#22C55E" },
  { label: "Voicemail", value: 74, color: "#6366F1" },
  { label: "No answer", value: 32, color: "#F59E0B" },
  { label: "Missed (inbound)", value: 14, color: "#EF4444" },
];
const CALL_AGENTS = [
  { name: "Jordan Brooks", calls: 142, talk: "9h 28m", connect: 64 },
  { name: "Sarah Chen", calls: 88, talk: "6h 12m", connect: 61 },
  { name: "Inbound AI", calls: 64, talk: "3h 40m", connect: 58 },
  { name: "Michael Ross", calls: 24, talk: "1h 44m", connect: 55 },
];

const PROP_METRICS: Metric[] = [
  { icon: "home", label: "Active Listings", value: "14", sub: "on market", tone: "blue" },
  { icon: "file", label: "Under Contract", value: "6", sub: "pending close", tone: "amber" },
  { icon: "trophy", label: "Sold (30d)", value: "4", sub: "$3.8M volume", up: true, tone: "emerald" },
  { icon: "clock", label: "Avg Days on Market", value: "21", sub: "-5 vs last mo.", up: true, tone: "teal" },
  { icon: "trending", label: "List-to-Sale", value: "98.4%", sub: "of asking price", up: true, tone: "green" },
];
const PROP_STATUS: BarRow[] = [
  { label: "Active", value: 14, color: "#3B82F6" },
  { label: "Under Contract", value: 6, color: "#F59E0B" },
  { label: "Sold", value: 4, color: "#22C55E" },
  { label: "Coming Soon", value: 3, color: "#8B5CF6" },
  { label: "Expired", value: 2, color: "#EF4444" },
];
interface Property { addr: string; city: string; price: string; status: string; dom: number; type: string }
const PROPERTIES: Property[] = [
  { addr: "1422 Maple St", city: "Burbank", price: "$805K", status: "Under Contract", dom: 12, type: "Single Family" },
  { addr: "88 Hillcrest Ave", city: "Glendale", price: "$1.2M", status: "Active", dom: 8, type: "Single Family" },
  { addr: "742 Oak Terrace", city: "Glendale", price: "$1.02M", status: "Coming Soon", dom: 0, type: "Townhome" },
  { addr: "123 Main St", city: "Burbank", price: "$1.2M", status: "Sold", dom: 18, type: "Single Family" },
  { addr: "456 Oak Ave", city: "Glendale", price: "$850K", status: "Sold", dom: 24, type: "Condo" },
  { addr: "55 Pasadena Hills Rd", city: "Pasadena", price: "$880K", status: "Active", dom: 31, type: "Single Family" },
  { addr: "1180 Cedar Ln", city: "Pasadena", price: "$1.18M", status: "Under Contract", dom: 15, type: "Single Family" },
];
const PROP_STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  Active: { fg: "#2563EB", bg: "#EAF1FE" }, "Under Contract": { fg: "#D97706", bg: "#FEF3C7" },
  Sold: { fg: "#16A34A", bg: "#E8F8ED" }, "Coming Soon": { fg: "#7C3AED", bg: "#F2ECFE" }, Expired: { fg: "#DC2626", bg: "#FEE2E2" },
};

const SMS_METRICS: Metric[] = [
  { icon: "message", label: "Sent", value: "1,204", sub: "this month", tone: "violet" },
  { icon: "check", label: "Delivered", value: "98.6%", sub: "1,187 delivered", up: true, tone: "green" },
  { icon: "refresh", label: "Replies", value: "221", sub: "18.4% reply rate", up: true, tone: "teal" },
  { icon: "zap", label: "Avg Reply Time", value: "6m 12s", sub: "first response", tone: "amber" },
  { icon: "x", label: "Opt-outs", value: "7", sub: "0.6% of sent", tone: "orange" },
];
const SMS_CHART = [38, 52, 41, 64, 49, 72, 33, 68, 81, 57, 74, 45, 88, 96];
const SMS_TYPES: BarRow[] = [
  { label: "AI auto-reply", value: 512, color: "#8B5CF6" },
  { label: "Follow-up sequence", value: 388, color: "#6366F1" },
  { label: "Manual / 1-on-1", value: 214, color: "#0EA5E9" },
  { label: "Appointment reminder", value: 90, color: "#14B8A6" },
];
const EMAIL_METRICS: Metric[] = [
  { icon: "mail", label: "Sent", value: "486", sub: "this month", tone: "amber" },
  { icon: "check", label: "Delivered", value: "96.2%", sub: "468 delivered", up: true, tone: "green" },
  { icon: "trending", label: "Open Rate", value: "42.8%", sub: "+3.1% vs last", up: true, tone: "teal" },
  { icon: "target", label: "Click Rate", value: "11.4%", sub: "of opened", up: true, tone: "indigo" },
  { icon: "x", label: "Bounces", value: "18", sub: "3.7% of sent", tone: "orange" },
];
const EMAIL_CHART = [14, 22, 9, 31, 18, 27, 12, 24, 36, 19, 29, 16, 33, 41];
const EMAIL_TYPES: BarRow[] = [
  { label: "Batch campaign", value: 214, color: "#D97706" },
  { label: "AI follow-up", value: 142, color: "#8B5CF6" },
  { label: "Manual / 1-on-1", value: 88, color: "#0EA5E9" },
  { label: "Listing alert", value: 42, color: "#14B8A6" },
];

const APPT_METRICS: Metric[] = [
  { icon: "calendarCheck", label: "Total Appointments", value: "41", sub: "this month", tone: "indigo" },
  { icon: "check", label: "Completed", value: "28", sub: "68% of total", up: true, tone: "green" },
  { icon: "clock", label: "Upcoming", value: "9", sub: "next 7 days", tone: "blue" },
  { icon: "x", label: "No-shows", value: "4", sub: "10% of total", tone: "orange" },
  { icon: "trophy", label: "Appt → Deal", value: "22%", sub: "booked to closed", up: true, tone: "emerald" },
];
const APPT_CHART = [2, 4, 1, 3, 5, 2, 4, 3, 6, 2, 5, 3, 7, 4];
const APPT_TYPES: BarRow[] = [
  { label: "Property Showing", value: 16, color: "#8B5CF6" },
  { label: "Buyer Consultation", value: 11, color: "#6366F1" },
  { label: "Listing Appointment", value: 8, color: "#0EA5E9" },
  { label: "Phone Call", value: 4, color: "#F59E0B" },
  { label: "Zoom Meeting", value: 2, color: "#14B8A6" },
];
const APPT_UPCOMING = [
  { title: "Buyer showing", who: "Anna L.", loc: "1422 Maple St", when: "Today 2:00 PM", agent: "Jordan Brooks", kind: "Showing" },
  { title: "Listing consult", who: "C. Hernandez", loc: "88 Hillcrest Ave", when: "Today 4:30 PM", agent: "Sarah Chen", kind: "Listing" },
  { title: "Buyer consultation", who: "Maria Lopez", loc: "Office", when: "Fri 1:00 PM", agent: "Jordan Brooks", kind: "Consult" },
  { title: "Zoom walkthrough", who: "The Pham family", loc: "Video call", when: "Fri 3:30 PM", agent: "Michael Ross", kind: "Zoom" },
  { title: "Final walkthrough", who: "Grace Holloway", loc: "1180 Cedar Ln", when: "Mon 11:00 AM", agent: "Sarah Chen", kind: "Showing" },
];

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

function Bars({ chart }: { chart: number[] }) {
  const max = Math.max(...chart);
  return (
    <div className="wc-chart">
      {chart.map((v, i) => (
        <div className="wc-chart-col" key={i}>
          <div className="wc-chart-bar" style={{ height: (v / max * 100) + "%" }}><span>{v}</span></div>
        </div>
      ))}
    </div>
  );
}

function PipeBars({ rows, countLabel }: { rows: BarRow[]; countLabel?: (r: BarRow) => string }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <>
      {rows.map((r) => (
        <div className="wc-pipe-row" key={r.label}>
          <div className="wc-pipe-top">
            <span className="wc-pipe-name"><span className="wc-col-dot" style={dot(r.color)} />{r.label}</span>
            <span className="wc-pipe-meta"><span className="wc-pipe-count">{countLabel ? countLabel(r) : Math.round(r.value / total * 100) + "%"}</span><b className="wc-mono">{r.value}</b></span>
          </div>
          <div className="wc-pipe-bar"><div style={{ width: (r.value / total * 100) + "%", background: r.color }} /></div>
        </div>
      ))}
    </>
  );
}

function OverviewTab() {
  return (
    <div>
      <div className="wc-rep-kpis">{REP_KPIS.map((k) => <RepKpi key={k.label} k={k} />)}</div>
      <div className="wc-panel-card pad">
        <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="trending" size={17} /></span>Appointments booked · last 14 days</div>
        <Bars chart={CHART} />
      </div>
    </div>
  );
}

function CallingTab() {
  const maxAgent = Math.max(...CALL_AGENTS.map((a) => a.calls));
  return (
    <div>
      <div className="wc-rep-stats">{CALL_METRICS.map((m) => <StatCard key={m.label} m={m} />)}</div>
      <div className="wc-admin-grid">
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="phone" size={17} /></span>Calls placed · last 14 days</div>
          <Bars chart={CALL_CHART} />
        </div>
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="target" size={17} /></span>Call outcomes</div>
          <PipeBars rows={CALL_OUTCOMES} />
        </div>
      </div>
      <div className="wc-panel-card wc-reptable-card" style={{ marginTop: 14 }}>
        <table className="wc-reptable">
          <thead><tr><th>Caller</th><th>Calls</th><th>Talk time</th><th>Connect rate</th></tr></thead>
          <tbody>
            {CALL_AGENTS.map((a) => (
              <tr key={a.name}>
                <td>
                  <div className="wc-src-name">{a.name}</div>
                  <div className="wc-src-bar"><div style={{ width: (a.calls / maxAgent * 100) + "%" }} /></div>
                </td>
                <td className="wc-mono"><b>{a.calls}</b></td>
                <td className="wc-mono">{a.talk}</td>
                <td><span className="wc-src-pct">{a.connect}% connected</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourcesTab() {
  const max = Math.max(...SOURCES.map((s) => s.leads));
  const totalLeads = SOURCES.reduce((s, x) => s + x.leads, 0);
  const totalClosed = SOURCES.reduce((s, x) => s + x.closed, 0);
  return (
    <div>
      <div className="wc-rep-stats" style={{ marginBottom: 16 }}>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#2563EB", background: "#EAF1FE" }}><Icon name="zap" size={17} /></span><div className="wc-stat-label">Connected Sources</div><div className="wc-stat-val wc-mono">{SOURCES.length}</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#16A34A", background: "#E8F8ED" }}><Icon name="user" size={17} /></span><div className="wc-stat-label">Leads This Month</div><div className="wc-stat-val wc-mono">{totalLeads}</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#7C3AED", background: "#F2ECFE" }}><Icon name="trophy" size={17} /></span><div className="wc-stat-label">Closed Deals</div><div className="wc-stat-val wc-mono">{totalClosed}</div></div>
      </div>
      <div className="wc-srcgrid" style={{ marginBottom: 16 }}>
        {SOURCES.map((s) => (
          <div className="wc-srccard" key={s.name}>
            <div className="wc-srccard-top">
              <span className="wc-srccard-logo" style={{ background: s.color }}>{s.letter}</span>
              <div className="wc-srccard-id"><div className="wc-srccard-name">{s.name}</div><div className="wc-band-d">{s.desc}</div></div>
            </div>
            <div className="wc-srccard-foot">
              <span className="wc-srccard-leads"><b className="wc-mono">{s.leads}</b> leads / mo</span>
              <button className="wc-ghostbtn wc-sm">Manage</button>
            </div>
            <span className="wc-srccard-badge"><Icon name="checkCircle" size={13} />Connected</span>
          </div>
        ))}
      </div>
      <div className="wc-panel-card wc-reptable-card">
        <div className="wc-card-head"><div className="wc-card-h2">Source performance</div></div>
        <table className="wc-reptable">
          <thead><tr><th>Source</th><th>Leads</th><th>Appointments</th><th>Closed Deals</th><th>Volume</th></tr></thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name}>
                <td>
                  <div className="wc-goalrow-agent"><span className="wc-srccard-logo" style={{ width: 28, height: 28, fontSize: 13, borderRadius: 8, background: s.color }}>{s.letter}</span>{s.name}</div>
                  <div className="wc-src-bar" style={{ marginTop: 7 }}><div style={{ width: (s.leads / max * 100) + "%" }} /></div>
                </td>
                <td className="wc-mono"><b>{s.leads}</b></td>
                <td className="wc-mono">{s.appts}</td>
                <td className="wc-mono">{s.closed}</td>
                <td><span className="wc-src-pct">{Math.round(s.appts / s.leads * 100)}% → appt</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AiTab() {
  return (
    <div>
      <div className="wc-rep-stats">{AI_METRICS.map((m) => <StatCard key={m.label} m={m} />)}</div>
      <div className="wc-aiproof">
        <span className="wc-aiproof-ic"><Icon name="sparkles" size={18} /></span>
        <div><div className="wc-aiproof-t">WarmChats AI saved you ~42 hours this month</div><div className="wc-aiproof-d">That's roughly $2,940 of agent time at $70/hr - plus 12 appointments booked while you were away.</div></div>
      </div>
    </div>
  );
}

function ClosedTab() {
  return (
    <div className="wc-admin-grid">
      <div className="wc-admin-col">
        <div className="wc-rep-stats two">{CLOSED_METRICS.map((m) => <StatCard key={m.label} m={m} />)}</div>
      </div>
      <div className="wc-panel-card pad">
        <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="trophy" size={17} /></span>Recent closings</div>
        <div className="wc-closings">
          {CLOSINGS.map((c) => (
            <div className="wc-closing" key={c.addr}>
              <span className="wc-closing-ic"><Icon name="home" size={15} /></span>
              <div><div className="wc-closing-addr">{c.addr}</div><div className="wc-band-d">{c.city}</div></div>
              <span className="wc-mono wc-closing-price">{c.price}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PropertiesTab() {
  return (
    <div>
      <div className="wc-rep-stats">{PROP_METRICS.map((m) => <StatCard key={m.label} m={m} />)}</div>
      <div className="wc-admin-grid">
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="layers" size={17} /></span>Listings by status</div>
          <PipeBars rows={PROP_STATUS} />
        </div>
        <div className="wc-admin-col">
          <div className="wc-panel-card pad wc-bigstat">
            <div className="wc-stat-label">Total Listing Volume</div>
            <div className="wc-bigstat-val wc-mono">$11.4M</div>
            <div className="wc-stat-sub">across {PROPERTIES.length} properties</div>
          </div>
          <div className="wc-panel-card pad wc-bigstat alt">
            <div className="wc-stat-label">Avg List Price</div>
            <div className="wc-bigstat-val wc-mono">$1.02M</div>
            <div className="wc-stat-sub">+4.2% vs last month</div>
          </div>
        </div>
      </div>
      <div className="wc-panel-card wc-reptable-card" style={{ marginTop: 14 }}>
        <table className="wc-reptable">
          <thead><tr><th>Property</th><th>Type</th><th>Price</th><th>Days on Market</th><th>Status</th></tr></thead>
          <tbody>
            {PROPERTIES.map((p, i) => {
              const t = PROP_STATUS_TONE[p.status];
              return (
                <tr key={i}>
                  <td><div className="wc-goalrow-agent"><span className="wc-closing-ic"><Icon name="home" size={15} /></span><div><div className="wc-agoal-row-t">{p.addr}</div><div className="wc-band-d">{p.city}</div></div></div></td>
                  <td className="wc-band-d">{p.type}</td>
                  <td className="wc-mono"><b>{p.price}</b></td>
                  <td className="wc-mono">{p.dom === 0 ? "-" : p.dom + " days"}</td>
                  <td><span className="wc-cbadge" style={{ color: t.fg, background: t.bg }}>{p.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChannelReportTab({ icon, metrics, chart, chartLabel, types, typesLabel }: {
  icon: string; metrics: Metric[]; chart: number[]; chartLabel: string; types: BarRow[]; typesLabel: string;
}) {
  return (
    <div>
      <div className="wc-rep-stats">{metrics.map((m) => <StatCard key={m.label} m={m} />)}</div>
      <div className="wc-admin-grid">
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name={icon} size={17} /></span>{chartLabel}</div>
          <Bars chart={chart} />
        </div>
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="layers" size={17} /></span>{typesLabel}</div>
          <PipeBars rows={types} />
        </div>
      </div>
    </div>
  );
}

function ApptsReportTab() {
  return (
    <div>
      <div className="wc-rep-stats">{APPT_METRICS.map((m) => <StatCard key={m.label} m={m} />)}</div>
      <div className="wc-admin-grid">
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="calendarCheck" size={17} /></span>Appointments booked · last 14 days</div>
          <Bars chart={APPT_CHART} />
        </div>
        <div className="wc-panel-card pad">
          <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="layers" size={17} /></span>By type</div>
          <PipeBars rows={APPT_TYPES} />
        </div>
      </div>
      <div className="wc-panel-card" style={{ marginTop: 14 }}>
        <div className="wc-card-head"><div className="wc-card-h2">Upcoming appointments</div><span className="wc-band-d">{APPT_UPCOMING.length} scheduled</span></div>
        <div className="wc-agoal-list">
          {APPT_UPCOMING.map((a, i) => (
            <div className="wc-agoal-row" key={i}>
              <span className="wc-closing-ic"><Icon name="calendarCheck" size={15} /></span>
              <div className="wc-agoal-row-b"><div className="wc-agoal-row-t">{a.title} · {a.who}</div><div className="wc-band-d">{a.loc} · {a.agent}</div></div>
              <span className="wc-hot-tag">{a.kind}</span>
              <span className="wc-band-d" style={{ minWidth: 96, textAlign: "right" }}>{a.when}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GoalEditModal({ agent, year, onClose, onSave }: {
  agent: AgentGoal; year: number; onClose: () => void; onSave: (patch: { goal: number; personal: PersonalGoal[] }) => void;
}) {
  const [goal, setGoal] = useState<string | number>(agent.goal || "");
  const [personal, setPersonal] = useState<PersonalGoal[]>(() => agent.personal.map((p) => ({ ...p })));
  const setText = (i: number, v: string) => setPersonal((ps) => ps.map((p, idx) => (idx === i ? { ...p, text: v } : p)));
  const toggle = (i: number) => setPersonal((ps) => ps.map((p, idx) => (idx === i ? { ...p, done: !p.done } : p)));
  const remove = (i: number) => setPersonal((ps) => ps.filter((_, idx) => idx !== i));
  const add = () => setPersonal((ps) => [...ps, { text: "", done: false }]);
  return (
    <div className="wc-modal-scrim" onClick={onClose}>
      <div className="wc-modal" onClick={(e) => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="wc-modal-title" style={{ borderBottom: "none", fontSize: 20 }}>Agent Goals for {year}</div>
        <div className="wc-modal-lbl" style={{ marginTop: 16 }}>Commission Goal</div>
        <div className="wc-goalinput"><span>$</span><input className="wc-modal-input wc-mono" type="number" placeholder="0" value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
        <div className="wc-modal-lbl" style={{ marginTop: 20 }}>Personal Goals</div>
        <div className="wc-pgoals">
          {personal.map((p, i) => (
            <div className="wc-pgoal" key={i}>
              <span className="wc-pgoal-trophy"><Icon name="trophy" size={15} /></span>
              <input className="wc-pgoal-input" placeholder="Add a personal goal..." value={p.text} onChange={(e) => setText(i, e.target.value)} />
              <button className="wc-pgoal-del" onClick={() => remove(i)} title="Delete"><Icon name="trash" size={15} /></button>
              <button className={"wc-pgoal-check" + (p.done ? " is-on" : "")} onClick={() => toggle(i)}>{p.done && <Icon name="check" size={12} />}<span>Complete</span></button>
            </div>
          ))}
          {personal.length === 0 && <div className="wc-pgoal-empty">No personal goals yet.</div>}
        </div>
        <button className="wc-ghostbtn wc-sm" style={{ marginTop: 10 }} onClick={add}><Icon name="plus" size={14} />Add New Personal Goal</button>
        <div className="wc-modal-foot">
          <button className="wc-ghostbtn" onClick={onClose}>Cancel</button>
          <button className="wc-primary" onClick={() => onSave({ goal: Number(goal) || 0, personal: personal.filter((p) => p.text.trim()) })}>Save Goals</button>
        </div>
      </div>
    </div>
  );
}

function AgentGoalDetail({ agent, year, onBack, onEdit }: { agent: AgentGoal; year: number; onBack: () => void; onEdit: () => void }) {
  const pct = agent.goal ? Math.min(100, Math.round(agent.earned / agent.goal * 100)) : 0;
  const stats = [
    { v: agent.deals, l: "Closed Deals" },
    { v: fmtMoney(agent.volume), l: "Sales Volume" },
    { v: agent.assignedLeads, l: "Assigned Leads" },
    { v: agent.conversations, l: "Conversations" },
    { v: agent.appts, l: "Appointments" },
  ];
  return (
    <div className="wc-fade">
      <button className="wc-back" onClick={onBack}><Icon name="chevronDown" size={15} style={{ transform: "rotate(90deg)" }} />All agents</button>
      <div className="wc-panel-card pad wc-agoal-hero">
        <span className="wc-agoal-av">{initialsOf(agent.name)}</span>
        <div className="wc-agoal-id"><div className="wc-agoal-name">{agent.name}</div><div className="wc-agoal-email"><Icon name="mail" size={13} />{agent.email}</div></div>
        <div className="wc-agoal-stats">
          {stats.map((s) => <div className="wc-agoal-stat" key={s.l}><div className="wc-agoal-stat-v wc-mono">{s.v}</div><div className="wc-agoal-stat-l">{s.l}</div></div>)}
        </div>
      </div>
      <div className="wc-agoal-body">
        <div className="wc-panel-card pad wc-agoal-side">
          <div className="wc-card-head tight"><div className="wc-card-h2 sm">{year} Goals</div><button className="wc-linkbtn" onClick={onEdit}>Edit</button></div>
          <div className="wc-agoal-glabel">Agent Commission Goal</div>
          {agent.goal ? (
            <>
              <div className="wc-agoal-gbar"><div style={{ width: pct + "%" }} /></div>
              <div className="wc-agoal-gvals"><span className="wc-mono">{fmtUSD(agent.earned)}</span><span className="wc-mono">{fmtUSD(agent.goal)}</span></div>
            </>
          ) : <button className="wc-ghostbtn wc-full wc-sm" onClick={onEdit}>Set Goal</button>}
          <div className="wc-agoal-comm">
            <div><div className="wc-agoal-comm-v wc-mono">{fmtUSD(agent.earned)}</div><div className="wc-agoal-comm-l">Commission Earned</div></div>
            <div><div className="wc-agoal-comm-v wc-mono">{fmtUSD(agent.pending)}</div><div className="wc-agoal-comm-l">Pending Commission</div></div>
          </div>
          <div className="wc-agoal-glabel" style={{ marginTop: 18 }}>Personal Goals</div>
          {agent.personal.length === 0 ? <div className="wc-agoal-empty">No personal goals have been set</div> : (
            <div className="wc-agoal-pgoals">
              {agent.personal.map((p, i) => (
                <div className={"wc-agoal-pgoal" + (p.done ? " is-done" : "")} key={i}>
                  <span className={"wc-check" + (p.done ? " is-on" : "")}>{p.done && <Icon name="check" size={12} />}</span>
                  <span className="wc-agoal-pgoal-t">{p.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="wc-agoal-main">
          <div className="wc-panel-card">
            <div className="wc-card-head"><div className="wc-card-h2">Deals</div><button className="wc-linkbtn">View all deals</button></div>
            {agent.recentDeals.length === 0 ? <div className="wc-agoal-none">Agent has no recent deals</div> : (
              <div className="wc-agoal-list">
                {agent.recentDeals.map((d, i) => (
                  <div className="wc-agoal-row" key={i}>
                    <span className="wc-closing-ic"><Icon name="home" size={15} /></span>
                    <div className="wc-agoal-row-b"><div className="wc-agoal-row-t">{d.addr}</div><div className="wc-band-d">{d.city}</div></div>
                    <span className="wc-hot-tag">{d.stage}</span>
                    <span className="wc-mono wc-closing-price">{d.price}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="wc-panel-card">
            <div className="wc-card-head"><div className="wc-card-h2">Appointments</div><button className="wc-linkbtn">View all appointments</button></div>
            {agent.recentAppts.length === 0 ? <div className="wc-agoal-none">Agent has no recent appointments</div> : (
              <div className="wc-agoal-list">
                {agent.recentAppts.map((a, i) => (
                  <div className="wc-agoal-row" key={i}>
                    <span className="wc-closing-ic"><Icon name="calendarCheck" size={15} /></span>
                    <div className="wc-agoal-row-b"><div className="wc-agoal-row-t">{a.title}</div><div className="wc-band-d">{a.who}</div></div>
                    <span className="wc-band-d">{a.when}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="wc-panel-card">
            <div className="wc-card-head"><div className="wc-card-h2">Leads</div><button className="wc-linkbtn">View all leads</button></div>
            <div className="wc-agoal-list">
              {agent.recentLeads.map((l, i) => (
                <div className="wc-agoal-row" key={i}>
                  <span className="wc-agoal-lav">{initialsOf(l.name)}</span>
                  <div className="wc-agoal-row-b"><div className="wc-agoal-row-t">{l.name}</div><div className="wc-band-d">{l.src}</div></div>
                  <span className="wc-hot-tag">{l.stage}</span>
                  <div className="wc-agoal-counts">
                    <span><Icon name="mail" size={13} />{l.e}</span><span><Icon name="message" size={13} />{l.m}</span><span><Icon name="phone" size={13} />{l.c}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalsTab() {
  const [year, setYear] = useState(2026);
  const [agents, setAgents] = useState<AgentGoal[]>(() => AGENT_GOALS.map((a) => ({ ...a })));
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const cur = selected ? agents.find((a) => a.id === selected) : null;
  const saveGoals = (patch: { goal: number; personal: PersonalGoal[] }) => { setAgents((as) => as.map((a) => (a.id === selected ? { ...a, ...patch } : a))); setEditing(false); };

  if (cur) return (
    <>
      <AgentGoalDetail agent={cur} year={year} onBack={() => setSelected(null)} onEdit={() => setEditing(true)} />
      {editing && <GoalEditModal agent={cur} year={year} onClose={() => setEditing(false)} onSave={saveGoals} />}
    </>
  );

  return (
    <div>
      <div className="wc-goalbar">
        <div className="wc-goalbar-crumb"><span className="wc-card-h2">{year} Goals</span><Icon name="chevronRight" size={14} /><span className="wc-goalbar-team"><Icon name="users" size={14} />Acme Realty · {agents.length} team members</span></div>
        <div className="wc-yearsel">
          <button onClick={() => setYear((y) => y - 1)}><Icon name="chevronDown" size={15} style={{ transform: "rotate(90deg)" }} /></button>
          <span className="wc-mono">{year}</span>
          <button onClick={() => setYear((y) => y + 1)}><Icon name="chevronRight" size={15} /></button>
        </div>
      </div>
      <div className="wc-panel-card wc-reptable-card">
        <table className="wc-reptable wc-goaltable">
          <thead><tr><th>Agent</th><th>Deals</th><th>Upcoming Deals</th><th>Commission Earned</th><th>Commission Goal</th><th>Goal Progress</th></tr></thead>
          <tbody>
            {agents.map((a) => {
              const pct = a.goal ? Math.min(100, Math.round(a.earned / a.goal * 100)) : 0;
              return (
                <tr key={a.id} className="wc-goalrow" onClick={() => setSelected(a.id)}>
                  <td><div className="wc-goalrow-agent"><span className="wc-agoal-lav">{initialsOf(a.name)}</span>{a.name}</div></td>
                  <td className="wc-mono"><b>{a.deals}</b></td>
                  <td className="wc-mono">{a.upcoming}</td>
                  <td className="wc-mono">{fmtUSD(a.earned)}</td>
                  <td>{a.goal ? <span className="wc-mono">{fmtUSD(a.goal)}</span> : <span className="wc-linkbtn" onClick={(e) => { e.stopPropagation(); setSelected(a.id); }}>Set goal</span>}</td>
                  <td>
                    {a.goal ? <div className="wc-goalprog"><div className="wc-goalprog-bar"><div style={{ width: pct + "%" }} /></div><span className="wc-mono">{pct}%</span></div> : <span className="wc-band-d">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Reporting() {
  const [tab, setTab] = useState("overview");
  const cur = REP_TABS.find((t) => t.k === tab) ?? REP_TABS[0];
  return (
    <div className="wc-page wc-fade">
      <div className="wc-pagehead">
        <div>
          <div className="wc-eyebrow" style={{ color: "var(--accent-strong)", marginBottom: 6 }}>Reporting</div>
          <h1>{cur.label}</h1>
          <p>Track leads, conversations, appointments, pipeline, AI impact, and closed business.</p>
        </div>
        <div className="wc-pagehead-actions">
          <button className="wc-ghostbtn"><Icon name="users" size={15} />Everyone<Icon name="chevronDown" size={13} /></button>
          <button className="wc-ghostbtn"><Icon name="calendar" size={15} />This month<Icon name="chevronDown" size={13} /></button>
          <button className="wc-primary"><Icon name="download" size={15} />Export</button>
        </div>
      </div>

      <div className="wc-admin-tabs wc-rep-tabs">
        {REP_TABS.map((t) => <button key={t.k} className={"wc-dtab" + (tab === t.k ? " is-on" : "")} onClick={() => setTab(t.k)}>{t.label}</button>)}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "properties" && <PropertiesTab />}
      {tab === "calling" && <CallingTab />}
      {tab === "sms" && <ChannelReportTab icon="message" metrics={SMS_METRICS} chart={SMS_CHART} chartLabel="Texts sent · last 14 days" types={SMS_TYPES} typesLabel="By message type" />}
      {tab === "email" && <ChannelReportTab icon="mail" metrics={EMAIL_METRICS} chart={EMAIL_CHART} chartLabel="Emails sent · last 14 days" types={EMAIL_TYPES} typesLabel="By email type" />}
      {tab === "sources" && <SourcesTab />}
      {tab === "ai" && <AiTab />}
      {tab === "closed" && <ClosedTab />}
      {tab === "appts" && <ApptsReportTab />}
      {tab === "goals" && <GoalsTab />}
    </div>
  );
}

/* Reusable tab exports so the Admin control center can fold in Reporting
   (Overview / Messaging / Goals) without duplicating the design. */
export function RepOverviewTab() {
  return <OverviewTab />;
}
export function RepGoalsTab() {
  return <GoalsTab />;
}
export function RepMessagingTab() {
  return (
    <div>
      <ChannelReportTab icon="message" metrics={SMS_METRICS} chart={SMS_CHART} chartLabel="Texts sent · last 14 days" types={SMS_TYPES} typesLabel="By message type" />
      <div style={{ height: 22 }} />
      <ChannelReportTab icon="mail" metrics={EMAIL_METRICS} chart={EMAIL_CHART} chartLabel="Emails sent · last 14 days" types={EMAIL_TYPES} typesLabel="By email type" />
    </div>
  );
}

export default function ReportingPage() {
  return (
    <MainLayout title="Reporting">
      <div className="wcv2 min-h-[calc(100vh-4rem)] lg:-mx-4 lg:-mt-4">
        <Reporting />
      </div>
    </MainLayout>
  );
}
