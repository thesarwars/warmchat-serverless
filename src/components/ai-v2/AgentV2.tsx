import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "./Icon";
import { Wcv2Portal } from "./Portal";
import type { Tone } from "./tones";
import { fetchAiAgents, updateAiAgent, fetchAiLogs, fetchAiWorkflows, updateAiWorkflow, createAutomation, fetchAiKpis, fetchAiTemplates, seedAgentTemplates, createAiTemplate, updateAiTemplate, deleteAiTemplate, fetchOrgAutomations, pauseAutomation, resumeAutomation, archiveAutomation, fetchInboundResponders, createInboundResponder, updateInboundResponder, deleteInboundResponder, type AgentKey } from "../../helpers/backend";
import { AvailabilityEditor } from "../availability/AvailabilityEditor";
import { describeStep } from "@/utils/workflowSchedule";
import { AI_QUERY_OPTS } from "./aiData";
import {
  WorkflowWizard,
  TemplateGallery,
  InboundResponderModal,
  type WizardSeed,
  type WizardLaunch,
} from "./WizardV2";

/* Live backend shapes (GET /ai/agents, GET /ai/agents/:key/logs). The design's
   static AGENTS map below stays as the presentation scaffold (role/tagline/
   icons/workflows); only the live bits - enable state + activity log - are
   overlaid from these. */
interface LiveAgent { key: string; name: string; enabled: boolean; activity_today: number; errors_24h: number }
interface AgentsResp { master_enabled: boolean; agents: LiveAgent[] }
interface AiLogRow { id: number; event: string; lead_label: string | null; detail: string | null; status: string; created_at: string }
interface LiveWorkflow { key: string; name: string; trigger: { type: string | null; source: string | null }; action: string | null; outcome: string | null; enabled: boolean; position: number; runs_24h: number; governed?: number }
interface KpisLite { hot_leads: number; appointments_set: number; qualified_leads: number }

/** Format a D1 UTC timestamp ("YYYY-MM-DD HH:MM:SS" or ISO) as a local HH:MM:SS. */
function logTime(raw: string): string {
  const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour12: false });
}

/* AI Agent detail page (hero, stats, tabs: workflows/capabilities, templates,
   logs, settings) - ported from the "leads-remix-2" design bundle (agents.jsx).
   UI-only. Dead prototype helpers that AgentPage never rendered (PersonaTab,
   ConnectedItem, OB_STATS/OB_RECS, AGENT_TONE2) were dropped. */

type GoFn = (key: string) => void;

interface WfTemplate {
  name: string;
  icon: string;
  desc: string;
  seed: WizardSeed;
}
const WF_TEMPLATES: WfTemplate[] = [
  {
    name: "Speed-to-Lead", icon: "zap", desc: "Reply in 60s, then nudge at 1 & 3 days",
    seed: {
      name: "Speed-to-Lead", channel: "SMS", aud: "new", workflowKey: "o1",
      initial: "Hi {first_name}! Thanks for reaching out about your home search. Are you still looking in the area, or just browsing?",
      fus: [
        { after: 1, at: "", tz: "Pacific Time (PST/PDT)", body: "Just following up - happy to send a few listings that match what you want. Still interested?" },
        { after: 3, at: "", tz: "Pacific Time (PST/PDT)", body: "No rush! Whenever you're ready to look, I'm here. Want me to set up a quick call?" },
      ],
    },
  },
  {
    name: "Seller Nurture", icon: "home", desc: "CMA offer + market updates over 2 weeks",
    seed: {
      name: "Seller Nurture", channel: "Email", aud: "seller", workflowKey: "o4",
      initial: "Hi {first_name}, curious what your home is worth in today's market? I can put together a free, no-obligation valuation.",
      fus: [
        { after: 4, at: "", tz: "Pacific Time (PST/PDT)", body: "Here's how homes in your area have been selling lately - happy to walk you through it." },
        { after: 7, at: "", tz: "Pacific Time (PST/PDT)", body: "Still thinking about selling? Let's grab 15 minutes to map out your options." },
      ],
    },
  },
  {
    name: "Cold Re-engagement", icon: "refresh", desc: "Win back leads idle 90+ days",
    seed: {
      name: "Cold Re-engagement", channel: "SMS", aud: "all", workflowKey: "o3",
      initial: "Hi {first_name}! It's been a while - the market has shifted a lot. Want an updated list of homes in your range?",
      fus: [
        { after: 3, at: "", tz: "Pacific Time (PST/PDT)", body: "A few new listings just came up that fit what you wanted. Want me to send them over?" },
      ],
    },
  },
];

interface AgentStat {
  label: string;
  value: string;
  sub: string;
  tone: string;
}
interface AgentCapability {
  icon: string;
  title: string;
  desc: string;
}
interface AgentActivity {
  who: string;
  what: string;
  when: string;
}
interface AgentWorkflow {
  id: string;
  name: string;
  trigger: { type: string; source: string };
  action: string;
  outcome: string;
  live: boolean;
  runs: number;
  governed?: number;
}
interface AgentDef {
  id: string;
  name: string;
  role: string;
  color: string;
  icon: string;
  statusOn: boolean;
  tagline: string;
  metric: { label: string; value: string };
  metricSub: { label: string; value: string };
  stats: AgentStat[];
  capabilities?: AgentCapability[];
  workflows?: AgentWorkflow[];
  activity: AgentActivity[];
}

const AGENTS: Record<string, AgentDef> = {
  assistant: {
    id: "assistant", name: "AI Agent", role: "Your control center", color: "violet", icon: "bot", statusOn: true,
    tagline: "Helps write replies, summarize leads, suggest next steps, improve tone, and assist inside the inbox.",
    metric: { label: "Suggestions today", value: "47" }, metricSub: { label: "Time saved this week", value: "3h 12m" },
    stats: [
      { label: "Suggestions today", value: "47", sub: "+12% vs yesterday", tone: "up" },
      { label: "Time saved (7d)", value: "3h 12m", sub: "~ $224 of agent time", tone: "info" },
      { label: "Draft acceptance", value: "82%", sub: "used with no edits", tone: "up" },
      { label: "Avg reply rating", value: "4.8/5", sub: "across 96 replies", tone: "info" },
    ],
    capabilities: [
      { icon: "sparkles", title: "Smart reply drafts", desc: "Generates 2-3 contextual replies inline in the inbox." },
      { icon: "message", title: "Lead summary", desc: "TL;DR of every conversation when you open a thread." },
      { icon: "zap", title: "Next-step coach", desc: "Suggests the highest-leverage action per lead." },
      { icon: "refresh", title: "Tone & polish", desc: "Rewrites your draft in your voice - friendly, firm, concise." },
    ],
    activity: [
      { who: "Drafted reply for", what: "Marisol G.", when: "2m ago" },
      { who: "Summarized thread with", what: "Brandon K.", when: "8m ago" },
      { who: "Suggested follow-up to", what: "The Pham family", when: "23m ago" },
      { who: "Polished email to", what: "C. Hernandez", when: "41m ago" },
    ],
  },
  inbound: {
    id: "inbound", name: "Inbound", role: "Handles leads that come to you", color: "blue", icon: "inbound", statusOn: true,
    tagline: "Responds to new leads, qualifies them, updates the CRM, and books appointments automatically.",
    metric: { label: "Conversations today", value: "28" }, metricSub: { label: "Booked this week", value: "11" },
    stats: [
      { label: "Conversations today", value: "28", sub: "+12% vs yesterday", tone: "up" },
      { label: "Leads qualified", value: "19", sub: "this week", tone: "info" },
      { label: "Appointments booked", value: "11", sub: "from 28 chats", tone: "up" },
      { label: "Avg response time", value: "38s", sub: "vs 42s overall", tone: "up" },
    ],
    workflows: [
      { id: "w1", name: "New lead -> instant reply", trigger: { type: "New lead", source: "Zillow, FB, Site" }, action: "AI replies within 60s, asks 3 qualifying questions", outcome: "Routes to inbox or books showing", live: true, runs: 34 },
      { id: "w2", name: "Lead replies -> qualify", trigger: { type: "Lead reply", source: "SMS / Email" }, action: "Detects intent, scores 1-5, updates pipeline stage", outcome: "Hot → owner, Warm → nurture, Cold → drip", live: true, runs: 22 },
      { id: "w3", name: "Missed call -> auto text", trigger: { type: "Missed call", source: "Business line" }, action: "Sends apology + offer to text back", outcome: "Conversation opened in inbox", live: true, runs: 6 },
      { id: "w4", name: "Website form -> create lead + respond", trigger: { type: "Form submit", source: "acmerealty.com" }, action: "Creates contact, replies with personalized note", outcome: "New lead · Pre-qualified", live: true, runs: 9 },
      { id: "w5", name: "Booking intent -> push appointment", trigger: { type: "Intent detected", source: "Any channel" }, action: "Offers calendar slots, confirms the time, notifies the agent", outcome: "Appointment proposed for the agent to confirm", live: true, runs: 0 },
    ],
    activity: [
      { who: "Replied to", what: "Devon S. · Zillow lead", when: "just now" },
      { who: "Qualified", what: "Anna L. as Hot", when: "4m ago" },
      { who: "Booked showing for", what: "1422 Maple St.", when: "17m ago" },
      { who: "Auto-text on missed call to", what: "(415) 555-0182", when: "32m ago" },
    ],
  },
  outbound: {
    id: "outbound", name: "Outbound", role: "Handles messages you send out", color: "orange", icon: "outbound", statusOn: true,
    tagline: "Runs follow-up workflows, nurtures old leads, and sends scheduled outreach to convert more conversations.",
    metric: { label: "In sequence", value: "412" }, metricSub: { label: "Reply rate (30d)", value: "18.4%" },
    stats: [
      { label: "In sequence", value: "412", sub: "active contacts", tone: "info" },
      { label: "Reply rate (30d)", value: "18.4%", sub: "+2.3% vs last", tone: "up" },
      { label: "Sent today", value: "96", sub: "across 3 workflows", tone: "info" },
      { label: "Re-engaged leads", value: "23", sub: "this month", tone: "up" },
    ],
    workflows: [
      { id: "o1", name: "Cold follow-up workflow", trigger: { type: "No reply", source: "After 48h" }, action: "5-step SMS sequence, AI-personalized per lead", outcome: "Pause on reply, route hot to inbox", live: true, runs: 87 },
      { id: "o2", name: "Open house follow-up", trigger: { type: "Open house visit", source: "Sign-in form" }, action: "Same-day thank-you + listing recap", outcome: "Books showing or adds to nurture", live: true, runs: 14 },
      { id: "o3", name: "Re-engagement workflow", trigger: { type: "Cold lead", source: "Idle 90+ days" }, action: "Market update + soft check-in", outcome: "Revives ~6% of cold list / mo.", live: true, runs: 41 },
      { id: "o4", name: "Seller nurture", trigger: { type: "Tag: Seller", source: "CRM" }, action: "Bi-weekly home value + market drip", outcome: "Top-of-mind until ready to list", live: false, runs: 0 },
      { id: "o5", name: "Buyer nurture", trigger: { type: "Tag: Buyer", source: "CRM" }, action: "Weekly new listings matched to criteria", outcome: "Showings requested in-line", live: true, runs: 28 },
    ],
    activity: [
      { who: "Sent step 3 to", what: '"Spring cold outreach"', when: "1m ago" },
      { who: "Paused sequence for", what: "J. Ortiz (replied)", when: "6m ago" },
      { who: "Started re-engagement on", what: "142 contacts", when: "1h ago" },
      { who: "Buyer match sent to", what: "38 leads", when: "3h ago" },
    ],
  },
};

const AGENT_TONE: Record<string, Tone> = {
  violet: { fg: "var(--violet)", bg: "var(--violet-bg)" },
  blue: { fg: "var(--blue)", bg: "var(--blue-bg)" },
  orange: { fg: "var(--accent-strong)", bg: "var(--accent-soft)" },
};

// On/off tile tone per agent: Inbound = Nimbus light blue (#5398cb on a pale
// #e7f6fd), Outbound = orange. Deliberately separate from AGENT_TONE.blue (the
// saturated #2f6ad0 used for flow nodes) so the tile matches the Nimbus mascot.
const AGENT_TILE_TONE: Record<string, Tone> = {
  inbound: { fg: "#5398cb", bg: "#e7f6fd" },
  outbound: { fg: "var(--accent)", bg: "var(--accent-soft)" },
  assistant: { fg: "var(--violet)", bg: "var(--violet-bg)" },
};

function PulseDot({ on, color }: { on: boolean; color?: string }) {
  return (
    <span className="wc-pdot">
      <span className="wc-pdot-core" style={{ background: on ? color || "var(--green)" : "var(--muted)" }} />
      {on && <span className="wc-pdot-ring" style={{ background: color || "var(--green)" }} />}
    </span>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      className={"wc-toggle" + (on ? " is-on" : "")}
      disabled={disabled}
      style={disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}}
      onClick={(e) => { e.stopPropagation(); if (disabled) return; onChange(!on); }}
    >
      <span className="wc-toggle-knob" />
    </button>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const col = tone === "up" ? "var(--green)" : "var(--ink-3)";
  return (
    <div className="wc-stat">
      <div className="wc-stat-label">{label}</div>
      <div className="wc-stat-val wc-mono">{value}</div>
      <div className="wc-stat-sub" style={{ color: col }}>{sub}</div>
    </div>
  );
}

function FlowNode({ kind, title, sub, tone, grow }: { kind: string; title: string; sub: string; tone: Tone; grow?: boolean }) {
  const labelColor = kind === "trigger" ? "var(--ink-3)" : kind === "action" ? tone.fg : "var(--green)";
  return (
    <div className={"wc-flownode" + (kind === "action" ? " is-action" : "") + (grow ? " grow" : "")}
      style={kind === "action" ? { background: tone.bg, borderColor: "transparent" } : {}}>
      <div className="wc-flownode-l" style={{ color: labelColor }}>{title}</div>
      <div className="wc-flownode-s">{sub}</div>
    </div>
  );
}

function Flow({ w, tone }: { w: AgentWorkflow; tone: Tone }) {
  return (
    <div className="wc-flow">
      <FlowNode kind="trigger" title={w.trigger.type} sub={w.trigger.source} tone={tone} />
      <span className="wc-flowarr"><Icon name="arrowRight" size={14} /></span>
      <FlowNode kind="action" title="AI action" sub={w.action} tone={tone} grow />
      <span className="wc-flowarr"><Icon name="arrowRight" size={14} /></span>
      <FlowNode kind="outcome" title="Outcome" sub={w.outcome} tone={tone} />
    </div>
  );
}

// Workflow cards whose feature is not built yet: shown as "Coming soon", toggle disabled.
const COMING_SOON_WORKFLOWS = new Set<string>(["w4"]);

function WorkflowRow({ w, tone, onToggle }: { w: AgentWorkflow; tone: Tone; onToggle: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const comingSoon = COMING_SOON_WORKFLOWS.has(w.id);
  return (
    <div className={"wc-wf" + (open ? " is-open" : "")}>
      <div className="wc-wf-row">
        <button className="wc-wf-main" onClick={() => setOpen((o) => !o)}>
          <Icon name="chevronRight" size={15} className="wc-wf-caret" style={open ? { transform: "rotate(90deg)" } : {}} />
          <span className="wc-wf-name" style={{ overflowWrap: "anywhere", minWidth: 0 }}>{w.name}</span>
          {comingSoon
            ? <span className="wc-pill-draft">Coming soon</span>
            : w.live
              ? <span className="wc-pill-live"><PulseDot on />Live</span>
              : <span className="wc-pill-draft">Draft</span>}
          <span className="wc-wf-view">{open ? "Hide flow" : "View flow"}</span>
        </button>
        <Toggle on={comingSoon ? false : w.live} onChange={onToggle} disabled={comingSoon} />
      </div>
      {open && (
        <div className="wc-wf-seq">
          <Flow w={w} tone={tone} />
          {comingSoon && (
            <div className="wc-task-empty" style={{ padding: "12px 14px", marginTop: 10 }}>
              Coming soon - this workflow is not available yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LogsTab({ agentKey }: { agentKey: AgentKey }) {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["ai-logs", agentKey],
    queryFn: () => fetchAiLogs(agentKey, { limit: 40 }) as Promise<{ logs: AiLogRow[] }>,
    ...AI_QUERY_OPTS,
  });
  const rows = data?.logs ?? [];
  return (
    <div className="wc-panel-card">
      <div className="wc-card-head">
        <div className="wc-card-h2">Activity log</div>
        <div className="wc-logs-actions">
          <button className="wc-iconbtn-sm" title="Refresh" onClick={() => refetch()} disabled={isFetching}><Icon name="refresh" size={15} /></button>
        </div>
      </div>
      <div className="wc-logs">
        {rows.map((r) => {
          const ok = r.status === "ok";
          // For non-ok rows the cron leads `detail` with the reason ("why it
          // did not send"); show that prominently and tint it.
          const who = ok ? (r.lead_label || r.detail || "") : (r.detail || r.lead_label || "");
          const tint = r.status === "error" ? "var(--danger, #dc2626)" : r.status === "warn" ? "var(--warn, #b45309)" : undefined;
          return (
            <div className="wc-log" key={r.id} title={r.detail || ""}>
              <span className={"wc-log-dot" + (ok ? "" : " is-skip")} />
              <span className="wc-log-t wc-mono">{logTime(r.created_at)}</span>
              <span className="wc-log-ev">{r.event}</span>
              <span className="wc-log-who" style={tint ? { color: tint } : undefined}>{who}</span>
            </div>
          );
        })}
        {rows.length === 0 && <div className="wc-task-empty" style={{ padding: "18px" }}>No activity yet. Turn the agent on - actions will appear here as they happen.</div>}
      </div>
    </div>
  );
}

interface ApiTemplate {
  id: number; title: string; content: string; channel: string | null;
  category_id: number; category_name: string | null; sent_count: number; agent: string | null;
}
function chChip(ch: string | null): { cls: string; icon: string; label: string } {
  const v = (ch || "").toLowerCase();
  if (v === "email") return { cls: "ch-email", icon: "mail", label: "Email" };
  if (v === "style") return { cls: "ch-sms", icon: "sparkles", label: "Guide" };
  return { cls: "ch-sms", icon: "message", label: "SMS" };
}

function AgentTemplatesTab({ agent }: { agent: AgentDef }) {
  const qc = useQueryClient();
  // "agent" = this agent's curated library; "all" surfaces every template in the
  // org incl. legacy/unassigned ones (agent IS NULL) created in the old library.
  const [scope, setScope] = useState<"agent" | "all">("agent");
  // Seed the curated library on first visit (idempotent + silent), then refetch.
  useEffect(() => {
    seedAgentTemplates().then(() => qc.invalidateQueries({ queryKey: ["ai-templates", agent.id] })).catch(() => {});
  }, [agent.id, qc]);
  const { data } = useQuery({ queryKey: ["ai-templates", agent.id, scope], queryFn: () => fetchAiTemplates(scope === "all" ? "all" : agent.id) as Promise<{ templates: ApiTemplate[] }>, ...AI_QUERY_OPTS });
  const templates = data?.templates ?? [];
  const categories: [number, string][] = Array.from(
    new Map(templates.filter((t) => t.category_id).map((t) => [t.category_id, t.category_name || "Category"] as [number, string])).entries(),
  );

  const [view, setView] = useState<ApiTemplate | null>(null);
  const [edit, setEdit] = useState<ApiTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", channel: "sms", category_id: 0 });

  const refresh = () => qc.invalidateQueries({ queryKey: ["ai-templates", agent.id] });
  const del = useMutation({ mutationFn: (id: number) => deleteAiTemplate(id), onSuccess: () => refresh() });
  const saveEdit = useMutation({
    mutationFn: (t: ApiTemplate) => updateAiTemplate(t.id, { title: t.title, content: t.content, channel: t.channel }),
    onSuccess: () => { refresh(); setEdit(null); },
  });
  const create = useMutation({
    mutationFn: () => createAiTemplate({ title: form.title.trim(), content: form.content.trim(), channel: form.channel, category_id: form.category_id, agent: agent.id }),
    onSuccess: () => { refresh(); setCreating(false); setForm({ title: "", content: "", channel: "sms", category_id: 0 }); },
  });
  const openCreate = () => { setForm({ title: "", content: "", channel: "sms", category_id: categories[0]?.[0] ?? 0 }); setCreating(true); };

  return (
    <div>
      <div className="wc-tpl-head">
        <span className="wc-band-d">{templates.length} templates &middot; variables like <code className="wc-tplvar">{"{{first_name}}"}</code> fill in automatically</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="wc-seg sm">
            <button className={scope === "agent" ? "is-on" : ""} onClick={() => setScope("agent")}>This agent</button>
            <button className={scope === "all" ? "is-on" : ""} onClick={() => setScope("all")}>All</button>
          </div>
          <button className="wc-primary wc-sm" onClick={openCreate}><Icon name="plus" size={14} />New template</button>
        </div>
      </div>
      <div className="wc-tplgrid">
        {templates.map((t) => { const c = chChip(t.channel); return (
          <div className="wc-tplcard" key={t.id}>
            <div className="wc-tplcard-top">
              <span className={"wc-tplch " + c.cls}><Icon name={c.icon} size={13} />{c.label}</span>
              <span className="wc-tplcard-name">{t.title}</span>
              <button className="wc-iconbtn-sm" title="Edit template" onClick={() => setEdit({ ...t })}><Icon name="pencil" size={14} /></button>
              <button className="wc-iconbtn-sm wc-danger" title="Delete template" onClick={() => del.mutate(t.id)}><Icon name="trash" size={14} /></button>
            </div>
            <div className="wc-tplcard-use">{t.category_name || "Template"}{t.sent_count ? ` · ${t.sent_count} sent` : ""}</div>
            <div className="wc-tplcard-first"><span className="wc-tplcard-flabel">Message</span>{t.content}</div>
            <button className="wc-tplcard-flow" onClick={() => setView(t)}><Icon name="layers" size={13} />View template</button>
          </div>
        ); })}
        {templates.length === 0 && <div className="wc-band-d" style={{ padding: 16 }}>No templates yet - create one with the button above.</div>}
      </div>

      {view && (
        <Wcv2Portal>
        <div className="wc-modal-scrim" onClick={() => setView(null)}>
          <div className="wc-tplflow" onClick={(e) => e.stopPropagation()}>
            <button className="wc-modal-x" onClick={() => setView(null)}><Icon name="x" size={18} /></button>
            <div className="wc-tplflow-head">
              <span className={"wc-tplch " + chChip(view.channel).cls}><Icon name={chChip(view.channel).icon} size={13} />{chChip(view.channel).label}</span>
              <div><h2 className="wc-tplflow-title">{view.title}</h2><p className="wc-tplflow-sub">{view.category_name || "Template"}{view.sent_count ? ` · ${view.sent_count} sent` : ""}</p></div>
            </div>
            <div className="wc-pcomp-bub" style={{ whiteSpace: "pre-wrap" }}>{view.content}</div>
            <div className="wc-tplflow-foot"><button className="wc-ghostbtn" onClick={() => setView(null)}>Close</button><button className="wc-primary" onClick={() => { setEdit({ ...view }); setView(null); }}><Icon name="pencil" size={14} />Edit</button></div>
          </div>
        </div>
        </Wcv2Portal>
      )}

      {edit && (
        <Wcv2Portal>
        <div className="wc-modal-scrim" onClick={() => setEdit(null)}>
          <div className="wc-tplflow" onClick={(e) => e.stopPropagation()}>
            <button className="wc-modal-x" onClick={() => setEdit(null)}><Icon name="x" size={18} /></button>
            <div className="wc-tplflow-head"><div><h2 className="wc-tplflow-title">Edit template</h2></div></div>
            <div className="wc-modal-lbl">Title</div>
            <input className="wc-modal-input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <div className="wc-modal-lbl" style={{ marginTop: 12 }}>Channel</div>
            <div className="wc-seg"><button className={edit.channel === "sms" ? "is-on" : ""} onClick={() => setEdit({ ...edit, channel: "sms" })}>SMS</button><button className={edit.channel === "email" ? "is-on" : ""} onClick={() => setEdit({ ...edit, channel: "email" })}>Email</button></div>
            <div className="wc-modal-lbl" style={{ marginTop: 12 }}>Message</div>
            <textarea className="wc-wz-msg" style={{ minHeight: 110 }} value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
            <div className="wc-tplflow-foot"><button className="wc-ghostbtn" onClick={() => setEdit(null)}>Cancel</button><button className="wc-primary" disabled={saveEdit.isPending} onClick={() => saveEdit.mutate(edit)}><Icon name="check" size={14} />Save</button></div>
          </div>
        </div>
        </Wcv2Portal>
      )}

      {creating && (
        <Wcv2Portal>
        <div className="wc-modal-scrim" onClick={() => setCreating(false)}>
          <div className="wc-tplflow" onClick={(e) => e.stopPropagation()}>
            <button className="wc-modal-x" onClick={() => setCreating(false)}><Icon name="x" size={18} /></button>
            <div className="wc-tplflow-head"><div><h2 className="wc-tplflow-title">New template</h2></div></div>
            <div className="wc-modal-lbl">Title</div>
            <input className="wc-modal-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
            <div className="wc-modal-lbl" style={{ marginTop: 12 }}>Channel</div>
            <div className="wc-seg"><button className={form.channel === "sms" ? "is-on" : ""} onClick={() => setForm({ ...form, channel: "sms" })}>SMS</button><button className={form.channel === "email" ? "is-on" : ""} onClick={() => setForm({ ...form, channel: "email" })}>Email</button></div>
            {categories.length > 0 && (
              <>
                <div className="wc-modal-lbl" style={{ marginTop: 12 }}>Category</div>
                <select className="wc-modal-input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>
                  {categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </>
            )}
            <div className="wc-modal-lbl" style={{ marginTop: 12 }}>Message</div>
            <textarea className="wc-wz-msg" style={{ minHeight: 110 }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <div className="wc-tplflow-foot"><button className="wc-ghostbtn" onClick={() => setCreating(false)}>Cancel</button><button className="wc-primary" disabled={!form.title.trim() || !form.content.trim() || !form.category_id || create.isPending} onClick={() => create.mutate()}><Icon name="check" size={14} />Create</button></div>
          </div>
        </div>
        </Wcv2Portal>
      )}
    </div>
  );
}

// Reusable settings building blocks
function SetSection({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="wc-panel-card pad wc-setsec">
      <div className="wc-setsec-h">{title}{sub && <span className="wc-band-d">{sub}</span>}</div>
      {children}
    </div>
  );
}

function InboundSettingsTab() {
  return (
    <div className="wc-obset">
      <SetSection title="Booking Availability" sub="The hours the AI can book into - one source of truth, shared with the Calendar and Settings">
        <AvailabilityEditor heading="Bookable hours" />
      </SetSection>
    </div>
  );
}

interface OrgAutomation {
  id: number; name: string; type: string; status: string; channels: string[];
  messages_sent: number; reply_rate: number; is_archived: boolean;
  message: string; opening_send_time?: string | null; created_at?: string; created?: string;
  followup_steps: { delay_days?: number; message?: string; send_time?: string }[];
}

// Outbound workflows ARE the org's real automations (automation table). Each row
// expands to show every step (opening message + follow-ups with their delays),
// and a workflow created via the wizard shows up here immediately.
function OutboundWorkflowList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const orgId = localStorage.getItem("org_id") || "";
  const { data } = useQuery({ queryKey: ["org-automations", orgId], queryFn: () => fetchOrgAutomations(orgId) as Promise<OrgAutomation[]>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const list = data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["org-automations", orgId] });
  const pause = useMutation({ mutationFn: (id: number) => pauseAutomation(id), onSuccess: () => refresh() });
  const resume = useMutation({ mutationFn: (id: number) => resumeAutomation(id), onSuccess: () => refresh() });
  // Launching a Draft only flips its status to Running - it never bulk-enrolls
  // an audience. Leads enter an outbound workflow one at a time as they opt in
  // (an intake form / integration), never by mass-adding a saved lead list, so
  // a freshly launched workflow simply waits for opted-in leads to arrive.
  const launch = useMutation({
    mutationFn: (id: number) => resumeAutomation(id),
    onSuccess: () => refresh(),
  });
  const archive = useMutation({ mutationFn: (id: number) => archiveAutomation(id), onSuccess: () => { refresh(); setConfirmDel(null); } });
  const [open, setOpen] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: number; name: string } | null>(null);
  return (
    <div className="wc-wf-list">
      {list.map((a) => {
        const running = (a.status || "").toLowerCase() === "running";
        const isDraft = (a.status || "").toLowerCase() === "draft";
        // Follow-up dates are anchored to when the workflow was created (its
        // schedule from that point), while the opening is instant unless it was
        // given an explicit send time.
        const createdBase = a.created_at || a.created ? new Date(a.created_at || a.created || "") : undefined;
        const openTime = (a.opening_send_time || "").trim() || null;
        const steps = [
          { day: 0, body: a.message || "", send_time: openTime, instant: !openTime },
          ...((a.followup_steps || []).map((s) => ({ day: Number(s.delay_days) || 0, body: s.message || "", send_time: s.send_time ?? null, instant: false }))),
        ];
        const isOpen = open === a.id;
        return (
          <div className={"wc-wf" + (isOpen ? " is-open" : "")} key={a.id}>
            <div className="wc-wf-row">
              <button className="wc-wf-main" onClick={() => setOpen(isOpen ? null : a.id)}>
                <Icon name="chevronRight" size={15} className="wc-wf-caret" style={isOpen ? { transform: "rotate(90deg)" } : {}} />
                <span className="wc-wf-name" style={{ overflowWrap: "anywhere", minWidth: 0 }}>{a.name || "Untitled workflow"}</span>
                {running ? <span className="wc-pill-live"><PulseDot on />Live</span> : <span className="wc-pill-draft">{a.status || "Draft"}</span>}
                <span className="wc-wf-runs">&middot; {a.messages_sent ?? 0} sent &middot; {Math.round(a.reply_rate ?? 0)}% reply &middot; {steps.length} step{steps.length === 1 ? "" : "s"}</span>
                <span className="wc-wf-view">{isOpen ? "Hide steps" : "View steps"}</span>
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {running
                  ? <button className="wc-ghostbtn wc-sm" disabled={pause.isPending} onClick={() => pause.mutate(a.id)}><Icon name="pause" size={13} fill />Pause</button>
                  : isDraft
                    ? <button className="wc-ghostbtn wc-sm" disabled={launch.isPending} onClick={() => launch.mutate(a.id)}><Icon name="play" size={13} fill />Launch</button>
                    : <button className="wc-ghostbtn wc-sm" disabled={resume.isPending} onClick={() => resume.mutate(a.id)}><Icon name="play" size={13} fill />Resume</button>}
                <button className="wc-iconbtn-sm" title="Edit in builder" onClick={() => navigate(`/workflows/${a.id}`)}><Icon name="pencil" size={15} /></button>
                <button className="wc-iconbtn-sm wc-danger" title="Remove workflow" onClick={() => setConfirmDel({ id: a.id, name: a.name || "Untitled workflow" })}><Icon name="trash" size={15} /></button>
              </div>
            </div>
            {isOpen && (
              <div className="wc-wf-seq">
                <div className="wc-tplflow-body">
                  {steps.map((s, j) => {
                    const sc = describeStep(s.day, s.send_time, { instant: s.instant, base: createdBase });
                    const chan = (a.channels || []).join(", ") || "sms";
                    return (
                      <div className="wc-tplflow-step" key={j}>
                        <div className="wc-tplflow-rail"><span className="wc-tplflow-num">{j + 1}</span>{j < steps.length - 1 && <span className="wc-tplflow-line" />}</div>
                        <div className="wc-tplflow-card">
                          <div className="wc-tplflow-meta">
                            <span className="wc-tplflow-day">{sc.dayLabel}</span>
                            <span className="wc-band-d">{sc.instant ? `sends right away (~${sc.timeLabel}) · ${chan}` : `${sc.dateLabel} · ${sc.timeLabel} · ${chan}`}</span>
                          </div>
                          <div className="wc-tplflow-msg">{s.body || "(no message)"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {list.length === 0 && <div className="wc-task-empty" style={{ padding: 16 }}>No workflows yet. Use "Add workflow" to create one - it shows up here right away.</div>}

      {confirmDel && (
        <Wcv2Portal>
          <div className="wc-modal-scrim" onClick={() => setConfirmDel(null)}>
            <div className="wc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="wc-card-h2" style={{ marginBottom: 8 }}>Remove workflow?</div>
              <div className="wc-band-d" style={{ marginBottom: 18 }}>This archives <strong>{confirmDel.name}</strong> and stops its follow-ups. You can recreate it later, but it will no longer run.</div>
              <div className="wc-modal-foot">
                <button className="wc-ghostbtn" onClick={() => setConfirmDel(null)}>No, keep it</button>
                <button className="wc-primary" disabled={archive.isPending} onClick={() => archive.mutate(confirmDel.id)}><Icon name="trash" size={14} />Yes, remove</button>
              </div>
            </div>
          </div>
        </Wcv2Portal>
      )}
    </div>
  );
}

interface Responder { id: number; name: string; trigger: string | null; keywords: string | null; tone: string | null; message: string; enabled: boolean }

// Custom inbound auto-responders (real CRUD -> /api/ai/responders). Created ones
// show here immediately, are editable + removable, and the AI applies them
// (injected into the inbound system prompt by buildAgentSystemPrompt).
function InboundResponderList() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["inbound-responders"], queryFn: () => fetchInboundResponders() as Promise<{ responders: Responder[] }>, ...AI_QUERY_OPTS });
  const responders = data?.responders ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["inbound-responders"] });
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<Responder | null>(null);
  const [confirmDel, setConfirmDel] = useState<Responder | null>(null);
  const createMut = useMutation({ mutationFn: (d: Record<string, unknown>) => createInboundResponder(d), onSuccess: () => { refresh(); setCreating(false); } });
  const updateMut = useMutation({ mutationFn: (v: { id: number; d: Record<string, unknown> }) => updateInboundResponder(v.id, v.d), onSuccess: () => { refresh(); setEdit(null); } });
  const delMut = useMutation({ mutationFn: (id: number) => deleteInboundResponder(id), onSuccess: () => { refresh(); setConfirmDel(null); } });
  const toggle = useMutation({ mutationFn: (v: { id: number; enabled: boolean }) => updateInboundResponder(v.id, { enabled: v.enabled }), onSuccess: () => refresh() });

  return (
    <div style={{ marginTop: 20 }}>
      <div className="wc-tpl-head">
        <span className="wc-band-d">Custom auto-responses &middot; the AI uses these when an inbound message matches.</span>
        <button className="wc-primary wc-sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} />Add auto-response</button>
      </div>
      <div className="wc-wf-list">
        {responders.map((r) => (
          <div className="wc-wf" key={r.id}>
            <div className="wc-wf-row">
              <button className="wc-wf-main" onClick={() => setEdit(r)}>
                <span className="wc-wf-name" style={{ overflowWrap: "anywhere", minWidth: 0 }}>{r.name}</span>
                {r.enabled ? <span className="wc-pill-live"><PulseDot on />Live</span> : <span className="wc-pill-draft">Off</span>}
                <span className="wc-wf-runs">&middot; {r.trigger || "Custom trigger"}{r.keywords ? ` · ${r.keywords}` : ""}</span>
                <span className="wc-wf-view">Edit</span>
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Toggle on={r.enabled} onChange={(v) => toggle.mutate({ id: r.id, enabled: v })} />
                <button className="wc-iconbtn-sm" title="Edit" onClick={() => setEdit(r)}><Icon name="pencil" size={15} /></button>
                <button className="wc-iconbtn-sm wc-danger" title="Remove" onClick={() => setConfirmDel(r)}><Icon name="trash" size={15} /></button>
              </div>
            </div>
            <div style={{ padding: "0 16px 12px", fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)", overflowWrap: "anywhere", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{r.message}</div>
          </div>
        ))}
        {responders.length === 0 && <div className="wc-task-empty" style={{ padding: 16 }}>No custom auto-responses yet. Add one and the AI will use it on matching inbound messages.</div>}
      </div>

      {creating && <InboundResponderModal onClose={() => setCreating(false)} onSave={(d) => createMut.mutate({ name: d.name, trigger: d.trigger, tone: d.tone, message: d.message, keywords: d.keywords })} />}
      {edit && <InboundResponderModal initial={edit} onClose={() => setEdit(null)} onSave={(d) => updateMut.mutate({ id: edit.id, d: { name: d.name, trigger: d.trigger, tone: d.tone, message: d.message, keywords: d.keywords } })} />}
      {confirmDel && (
        <Wcv2Portal>
          <div className="wc-modal-scrim" onClick={() => setConfirmDel(null)}>
            <div className="wc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="wc-card-h2" style={{ marginBottom: 8 }}>Remove auto-response?</div>
              <div className="wc-band-d" style={{ marginBottom: 18 }}>This deletes <strong>{confirmDel.name}</strong>. The AI will stop using it.</div>
              <div className="wc-modal-foot">
                <button className="wc-ghostbtn" onClick={() => setConfirmDel(null)}>No, keep it</button>
                <button className="wc-primary" disabled={delMut.isPending} onClick={() => delMut.mutate(confirmDel.id)}><Icon name="trash" size={14} />Yes, remove</button>
              </div>
            </div>
          </div>
        </Wcv2Portal>
      )}
    </div>
  );
}

export function AgentPage({ agentId, masterEnabled = true }: { agentId: string; go?: GoFn; masterEnabled?: boolean }) {
  const base = AGENTS[agentId] || AGENTS.assistant;
  const [agent, setAgent] = useState<AgentDef>(base);
  const tone = AGENT_TONE[agent.color];
  const tileTone = AGENT_TILE_TONE[agent.id] || AGENT_TILE_TONE.assistant;
  const hasWf = !!agent.workflows;
  // Per-agent sub-tab lives in the URL (?sub=) so it is shareable and survives
  // refresh, without remounting the page when it changes.
  const [searchParams, setSearchParams] = useSearchParams();
  const sub = searchParams.get("sub");
  const tab = sub || (hasWf ? "workflows" : "capabilities");
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams);
    p.set("sub", t);
    setSearchParams(p, { replace: true });
  };
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSeed, setWizardSeed] = useState<WizardSeed | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [toast, setToast] = useState("");
  // Close the "Add workflow" menu on an outside click (NOT on mouse-leave,
  // which closed it the instant the cursor drifted off).
  // The menu is portaled to <body> (anchored to the button) so the tab bar's
  // overflow-x:auto can't clip it. menuPos holds the fixed-position coords.
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const openAddMenu = () => {
    const r = addBtnRef.current?.getBoundingClientRect();
    // Document-relative coords (include scroll) so the portaled menu scrolls
    // WITH the page and stays anchored to the button, instead of pinning to the
    // viewport like position:fixed did.
    if (r) setMenuPos({ top: r.bottom + window.scrollY + 6, right: Math.max(8, window.innerWidth - r.right) });
    setAddMenuOpen(true);
  };
  useEffect(() => {
    if (!addMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!addBtnRef.current?.contains(t) && !addMenuRef.current?.contains(t)) setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addMenuOpen]);
  useEffect(() => {
    const a = AGENTS[agentId] || AGENTS.assistant;
    setAgent(a);
    // The active sub-tab is URL-driven (?sub=); switching agents from the
    // command center clears ?sub, so it falls back to the default automatically.
  }, [agentId]);

  // Live per-agent on/off state (3-level control - the per-agent layer). The
  // hero pill + Pause/Activate button reflect and drive ai_agent_state.enabled
  // (inbound also mirrors auto_response_settings.enabled in the route).
  const qc = useQueryClient();
  const { data: agentsData, isPending: agentsLoading } = useQuery({ queryKey: ["ai-agents"], queryFn: () => fetchAiAgents() as Promise<AgentsResp>, ...AI_QUERY_OPTS });
  const live = agentsData?.agents?.find((a) => a.key === agentId);
  const liveOn = live ? live.enabled : agent.statusOn;
  const orgId = localStorage.getItem("org_id") || "";
  const { data: kpis } = useQuery({ queryKey: ["ai-kpis", orgId], queryFn: () => fetchAiKpis(orgId) as Promise<KpisLite>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const liveStats = [
    { label: "AI actions today", value: String(live?.activity_today ?? 0), sub: "logged events", tone: "up" },
    { label: "Hot leads", value: String(kpis?.hot_leads ?? 0), sub: "across the org", tone: "up" },
    { label: "Appointments set", value: String(kpis?.appointments_set ?? 0), sub: "active", tone: "info" },
    { label: "Qualified leads", value: String(kpis?.qualified_leads ?? 0), sub: "this period", tone: "info" },
  ];
  const toggleEnabled = useMutation({
    mutationFn: (next: boolean) => updateAiAgent(agentId as AgentKey, { enabled: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agents"] }),
  });

  // Live workflow cards (lazily materialized server-side). Inbound toggles
  // mirror onto auto_response_settings; outbound persist on ai_workflow.
  const { data: wfData } = useQuery({
    queryKey: ["ai-workflows", agentId],
    queryFn: () => fetchAiWorkflows(agentId as AgentKey) as Promise<{ workflows: LiveWorkflow[] }>,
    enabled: hasWf,
    ...AI_QUERY_OPTS,
  });
  const liveWorkflows: AgentWorkflow[] = (wfData?.workflows ?? []).map((w) => ({
    id: w.key, name: w.name,
    trigger: { type: w.trigger?.type ?? "", source: w.trigger?.source ?? "" },
    action: w.action ?? "", outcome: w.outcome ?? "", live: w.enabled, runs: w.runs_24h ?? 0,
    governed: w.governed ?? 0,
  }));
  // Only ever show REAL workflow cards (from ai_workflow, lazily materialized
  // server-side). No hardcoded fallback - render a loading state until the
  // fetch resolves so fake sample cards never flash.
  const wfToShow: AgentWorkflow[] = liveWorkflows;
  const toggleWf = useMutation({
    mutationFn: (v: { id: string; on: boolean }) => updateAiWorkflow(agentId as AgentKey, v.id, v.on),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-workflows", agentId] }); qc.invalidateQueries({ queryKey: ["ai-agents"] }); qc.invalidateQueries({ queryKey: ["availability"] }); },
  });

  // Outbound wizard -> create a real automation DEFINITION only. It never
  // bulk-enrolls a lead list: leads enter an outbound workflow one at a time as
  // they opt in (an intake form / integration), so creating a workflow just
  // sets up the template and leaves it ready to receive opted-in leads. The
  // cron only ever sends what has been queued, so a workflow with no enrolled
  // leads simply does nothing until a lead opts in.
  const flashToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4500); };
  const createAuto = useMutation({
    mutationFn: async (d: WizardLaunch) => {
      const res = await createAutomation({
        name: d.name,
        channels: [d.channel.toLowerCase()],
        message: d.initial,
        email_subject: d.channel === "Email" ? d.name : undefined,
        opening_send_time: d.opening_send_time,
        sources: [d.audience],
        leads: [],
        attachments: d.attachments,
        followups: d.followups.map((f) => ({ delay_days: Number(f.after) || 1, message: f.body, send_time: f.send_time })),
        timing: d.timing,
        ...(d.workflowKey ? { workflow_key: d.workflowKey } : {}),
      }) as { id?: number } | undefined;
      const id = Number(res?.id);
      // Show the new workflow IMMEDIATELY by writing it straight into the cache -
      // a refetch right after the insert can hit a D1 read replica that doesn't
      // have the new row yet. The onSuccess invalidate reconciles real counts.
      if (Number.isInteger(id)) {
        const optimistic: OrgAutomation = {
          id, name: d.name, type: d.channel, status: "Running",
          channels: [d.channel.toLowerCase()], messages_sent: 0, reply_rate: 0, is_archived: false,
          message: d.initial, opening_send_time: d.opening_send_time,
          created_at: new Date().toISOString(),
          followup_steps: d.followups.map((f) => ({ delay_days: Number(f.after) || 1, message: f.body, send_time: f.send_time })),
        };
        qc.setQueryData<OrgAutomation[]>(["org-automations", orgId], (old) =>
          old?.some((a) => a.id === id) ? old : [optimistic, ...(old ?? [])]);
      }
    },
    onSuccess: (_res, d) => {
      const name = d.name || "New workflow";
      flashToast(
        masterEnabled && liveOn
          ? `Workflow "${name}" created. Leads start receiving it as they opt in.`
          : `Workflow "${name}" created. Turn the Outbound agent on, and leads start receiving it as they opt in.`,
      );
      qc.invalidateQueries({ queryKey: ["org-automations", orgId] });
    },
    onError: () => flashToast("Could not create the workflow"),
  });

  if (agentsLoading) return (
    <div className="wc-page wc-fade" style={{ display: "grid", gap: 14 }}>
      <div className="wc-panel-card pad" style={{ display: "grid", gap: 12 }}>
        <span className="wc-skel" style={{ height: 20, width: "40%", borderRadius: 8 }} />
        <span className="wc-skel" style={{ height: 13, borderRadius: 8 }} />
        <span className="wc-skel" style={{ height: 13, width: "75%", borderRadius: 8 }} />
        <span className="wc-skel" style={{ height: 13, width: "55%", borderRadius: 8 }} />
      </div>
    </div>
  );
  return (
    <div className="wc-page wc-agent wc-fade" key={agentId}>

      {/* When the global master AI switch is off, the whole agent is locked: its
          controls are grayed out and non-interactive regardless of the per-agent
          state, with a notice telling the user to turn AI on first. */}
      {!masterEnabled && (
        <div className="wc-ac-autopilot is-off" style={{ marginBottom: 16 }}>
          <span className="wc-ac-ap-ic"><Icon name="lock" size={15} /></span>
          <div className="wc-ac-ap-text"><strong>AI is off.</strong> The master Auto-pilot switch is off, so the {agent.name} agent and its settings are locked. Turn AI on from the Overview tab to configure it.</div>
        </div>
      )}

      <div
        aria-disabled={!masterEnabled}
        style={!masterEnabled ? { opacity: 0.5, pointerEvents: "none", userSelect: "none" } : undefined}
      >
      {/* The agent's on/off lives as a compact tile at the head of the KPI strip
          (the old full-width hero was removed). Tone is the agent's color when on
          - Inbound = secondary blue, Outbound = orange - and gray when off. */}
      <div className="wc-stats wc-stats-agent">
        <div className="wc-agtog" data-on={liveOn} style={{ "--atone": tileTone.fg, "--atone-bg": tileTone.bg } as React.CSSProperties}>
          <div className="wc-agtog-name">{agent.name}</div>
          <div className="wc-agtog-status"><span className="wc-agtog-dot" />{liveOn ? "On" : "Off"}</div>
          <Toggle on={liveOn} onChange={(v) => toggleEnabled.mutate(v)} disabled={toggleEnabled.isPending || !masterEnabled} />
        </div>
        {liveStats.map((s, i) => <Stat key={i} label={s.label} value={s.value} sub={s.sub} tone={s.tone} />)}
      </div>

      <div className="wc-agent-body">
        <div>
          <div className="wc-tabs">
            {hasWf && <button className={"wc-tab" + (tab === "workflows" ? " is-on" : "")} onClick={() => setTab("workflows")}>Workflows{agent.id === "inbound" && <span className="wc-tab-c">{wfToShow.length}</span>}</button>}
            {!hasWf && <button className={"wc-tab" + (tab === "capabilities" ? " is-on" : "")} onClick={() => setTab("capabilities")}>Capabilities <span className="wc-tab-c">{agent.capabilities?.length}</span></button>}
            <button className={"wc-tab" + (tab === "templates" ? " is-on" : "")} onClick={() => setTab("templates")}>Templates</button>
            <button className={"wc-tab" + (tab === "logs" ? " is-on" : "")} onClick={() => setTab("logs")}>Logs</button>
            {agent.id === "inbound" && <button className={"wc-tab" + (tab === "settings" ? " is-on" : "")} onClick={() => setTab("settings")}><Icon name="calendar" size={14} />Availability</button>}
            <div className="wc-tabs-spacer" />
            {tab === "workflows" && agent.id !== "inbound" && (
              <div className="wc-addwrap">
                <button ref={addBtnRef} className="wc-primary wc-sm" onClick={() => (addMenuOpen ? setAddMenuOpen(false) : openAddMenu())}><Icon name="plus" size={14} />Add workflow<Icon name="chevronDown" size={13} /></button>
                {addMenuOpen && menuPos && (
                  <Wcv2Portal>
                  <div className="wc-addmenu" ref={addMenuRef} style={{ position: "absolute", top: menuPos.top, right: menuPos.right }}>
                    <button className="wc-addmenu-item" onClick={() => { setWizardSeed(null); setWizardOpen(true); setAddMenuOpen(false); }}>
                      <span className="wc-addmenu-ic"><Icon name="plus" size={15} /></span>
                      <div><div className="wc-addmenu-t">Start from scratch</div><div className="wc-addmenu-d">Build a new workflow step by step</div></div>
                    </button>
                    <button className="wc-addmenu-item" onClick={() => { setGalleryOpen(true); setAddMenuOpen(false); }}>
                      <span className="wc-addmenu-ic" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}><Icon name="layers" size={15} /></span>
                      <div><div className="wc-addmenu-t">Browse templates</div><div className="wc-addmenu-d">Start from a proven follow-up sequence</div></div>
                    </button>
                    <div className="wc-addmenu-label">Quick start</div>
                    {WF_TEMPLATES.map((t) => (
                      <button key={t.name} className="wc-addmenu-item" onClick={() => { setWizardSeed(t.seed); setWizardOpen(true); setAddMenuOpen(false); }}>
                        <span className="wc-addmenu-ic" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}><Icon name={t.icon} size={15} /></span>
                        <div><div className="wc-addmenu-t">{t.name}</div><div className="wc-addmenu-d">{t.desc}</div></div>
                      </button>
                    ))}
                  </div>
                  </Wcv2Portal>
                )}
              </div>
            )}
          </div>

          {tab === "workflows" && (agent.id === "outbound"
            ? <OutboundWorkflowList />
            : (
              <>
                <div className="wc-wf-list">
                  {wfToShow.map((w) => <WorkflowRow key={w.id} w={w} tone={tone} onToggle={(on) => toggleWf.mutate({ id: w.id, on })} />)}
                  {!wfData && <div className="wc-task-empty" style={{ padding: 16 }}>Loading workflows...</div>}
                  {wfData && wfToShow.length === 0 && <div className="wc-task-empty" style={{ padding: 16 }}>No workflows configured.</div>}
                </div>
                <InboundResponderList />
              </>
            ))}
          {tab === "capabilities" && (
            <div className="wc-caps">
              {(agent.capabilities ?? []).map((cap, i) => (
                <div className="wc-cap" key={i}>
                  <span className="wc-cap-icon" style={{ color: tone.fg, background: tone.bg }}><Icon name={cap.icon} size={18} /></span>
                  <div className="wc-cap-title">{cap.title}</div>
                  <div className="wc-cap-desc">{cap.desc}</div>
                </div>
              ))}
            </div>
          )}
          {tab === "templates" && <AgentTemplatesTab agent={agent} />}
          {tab === "settings" && agent.id === "inbound" && <InboundSettingsTab />}
          {tab === "logs" && <LogsTab agentKey={agent.id as AgentKey} />}
        </div>

        <aside className="wc-agent-side">
          <div className="wc-suggest">
            <div className="wc-suggest-h"><Icon name="sparkles" size={13} />SUGGESTION</div>
            <div className="wc-suggest-t">
              {agent.id === "inbound" && "Your Zillow leads convert 2.4x higher when replied to in under 60 seconds - try expanding qualifying questions to 4 to improve scoring."}
              {agent.id === "outbound" && "Buyer nurture is getting 23% replies. Consider a Seller variant - you have 86 untouched seller tags."}
              {agent.id === "assistant" && "Turn on tone matching to learn your voice. After 5 edits, the Assistant's drafts get accepted 70% more often."}
            </div>
          </div>
        </aside>
      </div>
      </div>
      {galleryOpen && <TemplateGallery onClose={() => setGalleryOpen(false)} onPick={(seed) => { setGalleryOpen(false); setWizardSeed(seed); setWizardOpen(true); }} />}
      {wizardOpen && <WorkflowWizard agentName={agent.name} seed={wizardSeed} onClose={() => setWizardOpen(false)} onLaunch={(d) => { setWizardOpen(false); createAuto.mutate(d); }} />}
      {toast && <div className="wc-wz-toast"><Icon name="checkCircle" size={16} />{toast}</div>}
    </div>
  );
}
