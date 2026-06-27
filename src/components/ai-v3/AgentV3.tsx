import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "./Icon";
import { V3Portal } from "./Portal";
import { WorkflowWizard, type WizardLaunch, type WizardSeed } from "./WorkflowWizard";
import { BrowseTemplatesModal } from "./BrowseTemplatesModal";
import { TemplatesTab, type TplItem } from "./TemplatesTab";
import { OUTBOUND_TEMPLATES } from "./templatesData";
import { AISettings } from "./AISettings";
import {
  fetchAiAgents,
  updateAiAgent,
  fetchAiKpis,
  fetchAiWorkflows,
  updateAiWorkflow,
  createInboundResponder,
  fetchOrgAutomations,
  createAutomation,
  pauseAutomation,
  resumeAutomation,
  archiveAutomation,
  type AgentKey,
} from "../../helpers/backend";

/* AgentV3 — AI Agent page rebuilt to docs/updated-docs/ai-agent.jsx +
   ai-agent-page.prompt.md. Fully self-contained: own Icon, Portal, and scoped
   .wcv3 CSS (agentv3.css). Uses ONLY the shared backend API layer for live
   data — nothing from ai-v2. Phase 1: shell + Inbound. */

const AI_QUERY_OPTS = { staleTime: 30_000, refetchOnWindowFocus: false } as const;
type SubTab = "inbound" | "outbound" | "settings";

// ---- shared primitives (ported from prototype) -----------------------------

function PulseDot({ on, color }: { on: boolean; color?: string }) {
  return (
    <span className="wc-pdot" style={{ "--pdc": color || "var(--green)" } as React.CSSProperties}>
      <span className="wc-pdot-core" />
      {on && <span className="wc-pdot-ring" />}
    </span>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className={"wc-toggle" + (on ? " is-on" : "")} aria-pressed={on} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!on); }}>
      <span className="wc-toggle-knob" />
    </button>
  );
}

// ---- inbound: auto-routing panel (prototype §3b) ---------------------------

const AUTO_ROUTES: { from: string; to: string; icon: string }[] = [
  { from: "Buyer", to: "Buyer Nurture", icon: "home" },
  { from: "Seller", to: "Seller Nurture", icon: "building" },
  { from: "No Response", to: "Re-Engagement", icon: "refresh" },
  { from: "Appointment Intent", to: "Booking Flow", icon: "calendarCheck" },
  { from: "Agent Requested", to: "Human Takeover", icon: "user" },
];

function AutoRoutePanel() {
  return (
    <div className="wc-autoroute">
      <div className="wc-autoroute-h">
        <span className="wc-autoroute-ic"><Icon name="route" size={17} /></span>
        <div>
          <div className="wc-autoroute-t">Leads route themselves</div>
          <div className="wc-band-d">Once the AI qualifies a conversation it sends the lead into the right flow automatically — you never move leads between Inbound and Outbound by hand.</div>
        </div>
      </div>
      <div className="wc-autoroute-grid">
        {AUTO_ROUTES.map((r) => (
          <div className="wc-autoroute-row" key={r.from}>
            <span className="wc-autoroute-from">{r.from}</span>
            <Icon name="arrowRight" size={14} className="wc-autoroute-arr" />
            <span className="wc-autoroute-to"><Icon name={r.icon} size={13} />{r.to}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- inbound: workflow row (prototype §3c) ---------------------------------

interface LiveWorkflow {
  key: string; name: string; enabled: boolean; runs_24h?: number;
  trigger?: { type?: string; source?: string }; action?: string; outcome?: string;
}

const stepBox = (blue: boolean): React.CSSProperties => ({ flex: 1, padding: "12px", background: blue ? "#E7F6FD" : "#F5F5F5", borderRadius: "8px", borderLeft: `3px solid ${blue ? "#0284C7" : "var(--ink-3)"}` });
const stepL = (blue: boolean): React.CSSProperties => ({ fontSize: "11px", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: blue ? "#0284C7" : "var(--ink-3)", marginBottom: "6px" });
const stepB: React.CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 };
const arrowCell: React.CSSProperties = { width: "24px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" };

function WorkflowRow({ w, isFirst, onToggle }: { w: LiveWorkflow; isFirst: boolean; onToggle: (on: boolean) => void }) {
  const [open, setOpen] = useState(isFirst);
  const trigger = [w.trigger?.type, w.trigger?.source].filter(Boolean).join(", ") || "New lead, Inbound message";
  return (
    <div className={"wc-wf" + (open ? " is-open" : "")}>
      <div className="wc-wf-row">
        <button className="wc-wf-main" onClick={() => setOpen((o) => !o)}>
          <Icon name="chevronRight" size={15} className="wc-wf-caret" style={open ? { transform: "rotate(90deg)" } : {}} />
          <span className="wc-wf-ic" style={{ color: "var(--blue)", background: "var(--blue-bg)" }}><Icon name="zap" size={15} /></span>
          <span className="wc-wf-name">{w.name}</span>
          {w.enabled && <span className="wc-pill-live"><PulseDot on />Live</span>}
          <span className="wc-wf-view">{open ? "Hide flow" : "View flow"}</span>
        </button>
        <Toggle on={w.enabled} onChange={onToggle} />
      </div>
      {open && (
        <div className="wc-wf-detail">
          <div style={{ marginBottom: "8px", marginLeft: "20px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: "12px" }}>How This Flow Works</div>
            <div style={{ display: "flex", gap: "16px", alignItems: "stretch" }}>
              <div style={stepBox(false)}>
                <div style={stepL(false)}>Step 1: Trigger</div>
                <div style={stepB}>{trigger}</div>
              </div>
              <div style={arrowCell}>→</div>
              <div style={stepBox(true)}>
                <div style={stepL(true)}>Step 2: AI Action</div>
                <div style={stepB}>{w.action || "Send instant welcome"}</div>
              </div>
              <div style={arrowCell}>→</div>
              <div style={stepBox(false)}>
                <div style={stepL(false)}>Step 3: Result</div>
                <div style={stepB}>{w.outcome || "Qualified → Book Appointment"}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Create Auto-Response modal (native, prototype §3d; wired to API) ------

interface Responder { id: number; name: string; trigger: string | null; keywords: string | null; tone: string | null; message: string; enabled: boolean }

const GOALS = ["Qualify Lead", "Book Appointment", "Re-Engage Lead", "Human Takeover"];
const TRIGGERS = ["New Lead", "Website Form", "Facebook Lead", "Zillow Lead", "Missed Call", "Custom…"];

const fieldLabel: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: "12px" };
const selectStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "13px", fontFamily: "inherit", boxSizing: "border-box", background: "var(--panel)", color: "var(--ink)" };

function AutoResponseModal({ initial, onClose, onSave }: { initial?: Responder | null; onClose: () => void; onSave: (d: { name: string; trigger: string; tone: string; message: string; keywords: string }) => void }) {
  const [goal, setGoal] = useState(initial?.name || "Qualify Lead");
  const customInit = !!initial && !TRIGGERS.includes(initial.trigger || "") && (initial.trigger || "") !== "";
  const [trigger, setTrigger] = useState(customInit ? "Custom…" : (initial?.trigger || "New Lead"));
  const [customTrigger, setCustomTrigger] = useState(customInit ? (initial?.trigger || "") : (initial?.keywords || ""));
  const [message, setMessage] = useState(initial?.message || "");
  const isCustom = trigger === "Custom…";
  const canSave = message.trim() !== "" || !isCustom;

  const save = () => {
    const triggerLabel = isCustom ? (customTrigger.trim() || "Custom trigger") : trigger;
    onSave({ name: goal, trigger: triggerLabel, tone: "Friendly", message: message.trim(), keywords: isCustom ? customTrigger.trim() : "" });
  };

  return (
    <V3Portal>
      <div className="wcv3-scrim" onClick={onClose}>
        <div style={{ background: "var(--panel)", borderRadius: "12px", padding: "24px", width: "90%", maxWidth: "600px", maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 800, color: "var(--ink)", margin: 0 }}>{initial ? "Edit Auto-Response" : "Create Auto-Response"}</h2>
            <button onClick={onClose} className="wc-iconbtn-sm" aria-label="Close"><Icon name="x" size={16} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <label style={fieldLabel}>Goal</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {GOALS.map((g) => (
                  <label key={g} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", borderRadius: "8px", border: "1px solid " + (goal === g ? "var(--accent-strong)" : "var(--line)"), background: goal === g ? "#FFF1E8" : "transparent", cursor: "pointer" }}>
                    <input type="radio" name="v3goal" checked={goal === g} onChange={() => setGoal(g)} style={{ cursor: "pointer", accentColor: "var(--accent-strong)" }} />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>{g}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={fieldLabel}>Trigger</label>
              <select value={trigger} onChange={(e) => setTrigger(e.target.value)} style={selectStyle}>
                {TRIGGERS.map((t) => <option key={t}>{t}</option>)}
              </select>
              {isCustom && (
                <div style={{ marginTop: "10px" }}>
                  <input type="text" value={customTrigger} onChange={(e) => setCustomTrigger(e.target.value)} autoFocus placeholder='e.g. Lead texts the word "TOUR"' style={selectStyle} />
                  <div style={{ fontSize: "12px", color: "var(--ink-3)", marginTop: "6px", lineHeight: 1.4 }}>Describe the phrase or condition that makes the AI auto-respond — a keyword, a question type, or an event.</div>
                </div>
              )}
            </div>

            <div>
              <label style={fieldLabel}>Response message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="e.g. Thanks for reaching out! I'd love to set up a tour — what day works best for you?" style={{ ...selectStyle, resize: "vertical", lineHeight: 1.5 }} />
              <div style={{ fontSize: "12px", color: "var(--ink-3)", marginTop: "6px", lineHeight: 1.4 }}>The AI sends this when the trigger fires. {isCustom ? "" : "Leave blank to let the AI write its own reply."}</div>
            </div>

            <div>
              <label style={fieldLabel}>AI Will</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {["Reply instantly", "Qualify the lead", "Build lead profile", "Detect appointment intent", "Book appointments", "Notify agent when needed"].map((a) => (
                  <div key={a} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--ink)" }}>
                    <Icon name="check" size={14} style={{ color: "var(--green)" }} />{a}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="wc-modal-foot">
            <button className="wc-ghostbtn" onClick={onClose}>Cancel</button>
            <button className="wc-primary" disabled={!canSave} onClick={save}><Icon name="check" size={14} />{initial ? "Save" : "Create"}</button>
          </div>
        </div>
      </div>
    </V3Portal>
  );
}

// ---- inbound body ----------------------------------------------------------

function InboundBody() {
  const qc = useQueryClient();
  const { data: wfData } = useQuery({ queryKey: ["ai-workflows", "inbound"], queryFn: () => fetchAiWorkflows("inbound") as Promise<{ workflows: LiveWorkflow[] }>, ...AI_QUERY_OPTS });
  const workflows = wfData?.workflows ?? [];
  const toggleWf = useMutation({
    mutationFn: (v: { id: string; on: boolean }) => updateAiWorkflow("inbound", v.id, v.on),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-workflows", "inbound"] }); qc.invalidateQueries({ queryKey: ["ai-agents"] }); },
  });

  const [creating, setCreating] = useState(false);
  const createMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => createInboundResponder(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inbound-responders"] }); setCreating(false); },
  });

  return (
    <div className="wc-v3-body">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
        <div className="wc-tabs">
          <button className="wc-tab is-on">Workflows <span className="wc-tab-c">{workflows.length}</span></button>
        </div>
        <button className="wc-primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />Create auto-response</button>
      </div>

      <AutoRoutePanel />

      <div className="wc-wf-list">
        {!wfData && <div className="wc-task-empty" style={{ padding: 16 }}>Loading workflows…</div>}
        {wfData && workflows.length === 0 && <div className="wc-task-empty" style={{ padding: 16 }}>No workflows configured.</div>}
        {workflows.map((w, i) => <WorkflowRow key={w.key} w={w} isFirst={i === 0} onToggle={(on) => toggleWf.mutate({ id: w.key, on })} />)}
      </div>

      {creating && <AutoResponseModal onClose={() => setCreating(false)} onSave={(d) => createMut.mutate(d)} />}
    </div>
  );
}

// ---- outbound: helpers (ported from prototype) -----------------------------

const TEMPLATE_CH: Record<string, { label: string; icon: string; bg: string; fg: string }> = {
  sms: { label: "SMS", icon: "message", bg: "#5BB4E3", fg: "#fff" },
  email: { label: "Email", icon: "mail", bg: "var(--accent)", fg: "#fff" },
};

function VarText({ text }: { text: string }) {
  return (
    <>
      {String(text).split(/(\{\{[^}]+\}\})/g).map((p, i) =>
        /^\{\{[^}]+\}\}$/.test(p) ? <span key={i} className="wc-tpl-var">{p}</span> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function ChannelPill({ channel, size }: { channel: string; size?: string }) {
  const c = TEMPLATE_CH[channel] || TEMPLATE_CH.sms;
  const big = size !== "sm";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: big ? 6 : 5, background: c.bg, color: c.fg, fontWeight: 700, fontSize: big ? 13 : 11, padding: big ? "5px 11px" : "3px 8px", borderRadius: 999, flex: "none", lineHeight: 1 }}>
      <Icon name={c.icon} size={big ? 14 : 12} />{c.label}
    </span>
  );
}

const FLOW_FALLBACK_SMS = [
  "Hi {{first_name}}, thanks for connecting! Is now a good time to chat about {{area}}?",
  "Hi {{first_name}}, just following up — happy to answer any questions you have.",
  "Hey {{first_name}}, a few new options came up that might be a great fit. Want me to send them over?",
  "Hi {{first_name}}, checking in — what does your timeline look like right now?",
  "Hey {{first_name}}, no rush at all. I'm here whenever you're ready to take the next step.",
  "Hi {{first_name}}, still happy to help whenever the time is right. Just reply anytime!",
];
const FLOW_DAY_NUMS = [0, 1, 3, 5, 7, 10, 14, 21];

/** "05:00" -> "5:00 AM", "13:30" -> "1:30 PM". Leaves already-formatted or
 * non-time strings ("Send instantly", "10:00 AM") untouched. */
function fmtClock12(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value || "").trim());
  if (!m) return value;
  let hour = Number(m[1]);
  const minute = m[2];
  const meridiem = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${meridiem}`;
}

interface CampaignFlowMsg { step: number; day: string; date: string; channel: string; text: string }

// A campaign card view-model derived from a real automation.
interface Campaign {
  id: number; name: string; icon: string; live: boolean; completed: boolean; status: string;
  channel: string; steps: number; updated: string;
  leads: string; reply: string; appts: string;
  trigger: { title: string; sub: string };
  outcomes: string[];
  messages: CampaignFlowMsg[];
}

interface OrgAutomation {
  id: number; name: string; status: string; channels?: string[];
  messages_sent?: number; pending?: number; reply_rate?: number; is_archived?: boolean;
  message?: string; opening_send_time?: string | null; created_at?: string;
  // `leads` from the org list endpoint is the RECIPIENTS ARRAY (objects), not a
  // count - the count lives in `contacts_sent`. Stringifying the array gave the
  // "[object Object]" the card used to show.
  leads?: unknown; contacts_sent?: number; converted_count?: number;
  followup_steps?: { delay_days?: number; message?: string; send_time?: string; channel?: string; subject?: string }[];
}

const relTime = (iso?: string): string => {
  if (!iso) return "recently";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "recently";
  const d = Date.now() - ms;
  if (d < 86_400_000) return "Today";
  if (d < 172_800_000) return "Yesterday";
  return `${Math.floor(d / 86_400_000)}d ago`;
};

function automationToCampaign(a: OrgAutomation): Campaign {
  const channels = a.channels && a.channels.length ? a.channels : ["sms"];
  const chanLabel = channels.map((c) => (c.toLowerCase() === "email" ? "Email" : "SMS")).filter((v, i, s) => s.indexOf(v) === i).join(" + ");
  const followups = a.followup_steps || [];
  const steps = 1 + followups.length;
  const live = (a.status || "").toLowerCase() === "running";
  // A Running workflow whose queue is fully drained (nothing pending, something
  // sent) is actually finished - surface "Completed" instead of a forever "Live".
  const completed = live && (a.pending ?? 0) === 0 && (a.messages_sent ?? 0) > 0;
  const openTime = (a.opening_send_time || "").trim();
  const msgs: CampaignFlowMsg[] = [
    { step: 1, day: "Day 0", date: openTime ? openTime : "Send instantly", channel: channels[0]?.toLowerCase() === "email" ? "Email" : "SMS", text: a.message || FLOW_FALLBACK_SMS[0] },
    ...followups.map((s, i) => ({
      step: i + 2,
      day: "Day " + (FLOW_DAY_NUMS[i + 1] ?? (s.delay_days ?? (i + 1) * 2)),
      date: (s.send_time || "10:00 AM"),
      channel: ((s.channel || channels[0] || "sms").toLowerCase() === "email" ? "Email" : "SMS"),
      text: s.message || FLOW_FALLBACK_SMS[(i + 1) % FLOW_FALLBACK_SMS.length],
    })),
  ];
  return {
    id: a.id, name: a.name || "Untitled workflow", icon: "send", live, completed, status: a.status || "Draft",
    channel: chanLabel, steps, updated: relTime(a.created_at),
    leads: String(a.contacts_sent ?? (Array.isArray(a.leads) ? a.leads.length : 0)),
    // reply_rate from /api/automations/org/:orgId is a 0..1 fraction
    // (repliedLeadCount/contactsSent); scale to a percent for display.
    reply: `${Math.round((a.reply_rate ?? 0) * 100)}%`,
    appts: String(a.converted_count ?? 0),
    trigger: { title: "Lead opts in", sub: "Enrolled into this sequence" },
    outcomes: ["Reply → Stop", "Appt intent → Notify", "No reply → End"],
    messages: msgs,
  };
}

// ---- outbound: campaign card (prototype §4b) -------------------------------

function CampaignCard({ w, onToggle, onDelete, onEdit }: { w: Campaign; onToggle: () => void; onDelete: () => void; onEdit: () => void }) {
  const [flow, setFlow] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <div className="wc-cmp">
      <div className="wc-cmp-main">
        <div className="wc-cmp-top">
          <div className="wc-cmp-id">
            <span className="wc-cmp-ic" style={{ color: "var(--accent-strong)", background: "var(--accent-soft)" }}><Icon name={w.icon} size={18} /></span>
            <div>
              <div className="wc-cmp-titlerow">
                <span className="wc-cmp-name">{w.name}</span>
                {w.completed
                  ? <span className="wc-pill-live" style={{ background: "#dcfce7", color: "#15803d" }}>Completed</span>
                  : w.live ? <span className="wc-pill-live"><PulseDot on />Live</span>
                  : <span className="wc-pill-draft">{w.status}</span>}
              </div>
              <div className="wc-cmp-sub">{w.channel} · {w.steps}-step sequence · Enrolled {w.updated}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
            <button className="wc-cmp-viewflow" onClick={() => setFlow((o) => !o)}>{flow ? "Hide flow" : "View flow"}</button>
            <Toggle on={w.live && !w.completed} onChange={onToggle} disabled={w.completed} />
            <div style={{ position: "relative" }}>
              <button className="wc-iconbtn-sm" onClick={() => setMenu((m) => !m)}>•••</button>
              {menu && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenu(false)} />
                  <div className="wc-cmp-menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { onEdit(); setMenu(false); }}><Icon name="pencil" size={15} />Edit</button>
                    <button className="is-del" onClick={() => { onDelete(); setMenu(false); }}><Icon name="trash" size={15} />Delete</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="wc-cmp-body">
          <div className="wc-cmp-boxes">
            <div className="wc-cmp-box">
              <div className="wc-cmp-box-l">Trigger</div>
              <div className="wc-cmp-box-t">{w.trigger.title}</div>
              <div className="wc-cmp-box-s">{w.trigger.sub}</div>
            </div>
            <span className="wc-cmp-arr"><Icon name="arrowRight" size={14} /></span>
            <button className="wc-cmp-box wc-cmp-box-follow" onClick={() => setFlow((o) => !o)} style={flow ? { background: "var(--accent-soft)", border: "2px solid var(--accent-strong)" } : undefined}>
              <div className="wc-cmp-box-l" style={flow ? { color: "var(--accent-strong)" } : undefined}>AI Follow-Up</div>
              <div className="wc-cmp-box-s">{w.steps}-step {w.channel} sequence</div>
            </button>
            <span className="wc-cmp-arr"><Icon name="arrowRight" size={14} /></span>
            <div className="wc-cmp-box">
              <div className="wc-cmp-box-l">Outcome</div>
              <ul className="wc-cmp-outcomes">
                {w.outcomes.map((o, i) => <li key={i}><Icon name="check" size={12} />{o}</li>)}
              </ul>
            </div>
          </div>
          <div className="wc-cmp-stats">
            <div className="wc-cmp-stat"><span className="wc-cmp-stat-v">{w.leads}</span><span className="wc-cmp-stat-l">Leads</span></div>
            <div className="wc-cmp-stat"><span className="wc-cmp-stat-v">{w.reply}</span><span className="wc-cmp-stat-l">Reply Rate</span></div>
            <div className="wc-cmp-stat"><span className="wc-cmp-stat-v">{w.appts}</span><span className="wc-cmp-stat-l">{w.appts === "1" ? "Appt" : "Appts"}</span></div>
            <div className="wc-cmp-stat"><span className="wc-cmp-status"><PulseDot on={w.live && !w.completed} />{w.completed ? "Completed" : w.live ? "Live" : "Draft"}</span><span className="wc-cmp-stat-l">{w.completed ? "Done" : w.live ? "Active" : "Not Active"}</span></div>
            <div className="wc-cmp-stat"><span className="wc-cmp-stat-l">Last Updated</span><span className="wc-cmp-updated">{w.updated}</span></div>
          </div>
        </div>
      </div>
      {flow && (
        <div className="wc-cmp-flow">
          <div className="wc-tpl-flow-h">
            <span>Send sequence · {w.messages.length} messages</span>
            <span className="wc-tpl-flow-tz"><Icon name="clock" size={12} />Times in the lead's timezone</span>
          </div>
          <div className="wc-tpl-steps">
            {w.messages.map((msg, i) => {
              const mch = (msg.channel || "SMS").toLowerCase();
              return (
                <div className="wc-tpl-step" key={i}>
                  <div className="wc-tpl-rail">
                    <span className="wc-tpl-node" style={{ background: (TEMPLATE_CH[mch] || TEMPLATE_CH.sms).bg }}>{msg.step}</span>
                    {i < w.messages.length - 1 && <span className="wc-tpl-line" />}
                  </div>
                  <div className="wc-tpl-step-body">
                    <div className="wc-tpl-step-meta">
                      <span className="wc-tpl-day">{msg.day}</span>
                      <span className="wc-tpl-dot">·</span>
                      {msg.date === "Send instantly"
                        ? <span className="wc-tpl-time is-instant"><Icon name="zap" size={12} />Send instantly</span>
                        : <span className="wc-tpl-time"><Icon name="clock" size={12} />{fmtClock12(msg.date)}</span>}
                      <ChannelPill channel={mch} size="sm" />
                    </div>
                    <div className="wc-tpl-step-text"><VarText text={msg.text} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// ---- outbound body ---------------------------------------------------------

function OutboundBody() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const orgId = localStorage.getItem("org_id") || "";
  const [tab, setTab] = useState<"workflows" | "templates">("workflows");
  const [confirmDel, setConfirmDel] = useState<Campaign | null>(null);
  const [wizard, setWizard] = useState(false);
  const [wizardSeed, setWizardSeed] = useState<WizardSeed | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [browse, setBrowse] = useState(false);
  // Templates tab list (client-side) + the "+ New template" wizard (template mode).
  const [tplList, setTplList] = useState<TplItem[]>(() => OUTBOUND_TEMPLATES as unknown as TplItem[]);
  const [tplWizard, setTplWizard] = useState(false);

  const { data } = useQuery({ queryKey: ["org-automations", orgId], queryFn: () => fetchOrgAutomations(orgId) as Promise<OrgAutomation[]>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const refresh = () => qc.invalidateQueries({ queryKey: ["org-automations", orgId] });
  const campaigns = (data ?? []).filter((a) => !a.is_archived).map(automationToCampaign);
  const pause = useMutation({ mutationFn: (id: number) => pauseAutomation(id), onSuccess: () => refresh() });
  const resume = useMutation({ mutationFn: (id: number) => resumeAutomation(id), onSuccess: () => refresh() });
  const archive = useMutation({ mutationFn: (id: number) => archiveAutomation(id), onSuccess: () => { refresh(); setConfirmDel(null); } });
  // "Add workflow" opens the in-page wizard; on launch we persist a real
  // automation. Leads enter outbound one at a time as they opt in (the filters
  // become auto-enrollment sources), so creating it just sets up the sequence.
  // Convert a follow-up's absolute date (YYYY-MM-DD from the wizard's date
  // picker) into the relative "days after enrollment" the backend stores:
  // today -> 0 (same day), tomorrow -> 1, etc. A lead enrolled today then gets
  // exactly the date the user picked (previously this ignored the date and used
  // the step index, so two follow-ups both dated "today" saved as Day 1 / Day 2).
  // Falls back to delayDays (templates) or the step index only when no date is set.
  const fuDelayDays = (f: { date?: string; delayDays?: number }, i: number): number => {
    if (f.date) {
      const [y, m, d] = f.date.split("-").map(Number);
      if (y && m && d) {
        const picked = new Date(y, m - 1, d).getTime();
        const n = new Date();
        const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
        return Math.max(0, Math.round((picked - today) / 86_400_000));
      }
    }
    return f.delayDays ?? (i + 1);
  };
  const createAuto = useMutation({
    mutationFn: (d: WizardLaunch) => createAutomation({
      name: d.name,
      // The Step-1 channel selection IS the campaign's channels (per-message
      // channel was removed - each message now sends on every channel a lead has).
      channels: d.channels,
      message: d.message,
      email_subject: d.emailSubject || undefined,
      // Separate opening EMAIL body (only set when both channels are on); blank
      // falls back to `message` server-side.
      email_body: d.emailBody || undefined,
      // "Send now" -> null (instant); "Send at a specific time" -> today at HH:MM
      // (account tz), applied per lead on its enrollment day by the scheduler.
      opening_send_time: d.timing === "scheduled" ? d.openingTime : null,
      sources: [...d.audType, ...d.audStage, ...d.audFilter],
      leads: d.leads,
      timing: d.leads.length > 0 ? "now" : undefined,
      followups: d.followups.map((f, i) => ({ delay_days: fuDelayDays(f, i), message: f.message, send_time: f.time, ...(f.email_body ? { email_body: f.email_body } : {}), ...(f.subject ? { subject: f.subject } : {}) })),
    }),
    onSuccess: () => { refresh(); setWizard(false); },
    // Reset the re-entrancy lock whether the create succeeded or failed so a
    // failed attempt can be retried (success unmounts the wizard anyway).
    onSettled: () => { creatingRef.current = false; },
  });
  // Synchronous guard: "Start Workflow" double-clicks fired two creates before
  // React re-rendered the disabled/pending state, making duplicate campaigns.
  const creatingRef = useRef(false);
  const handleWizardLaunch = (d: WizardLaunch) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    createAuto.mutate(d);
  };

  return (
    <div className="wc-v3-body">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div className="wc-tabs">
          <button className={"wc-tab" + (tab === "workflows" ? " is-on" : "")} onClick={() => setTab("workflows")}>Workflows <span className="wc-tab-c">{campaigns.length}</span></button>
          <button className={"wc-tab" + (tab === "templates" ? " is-on" : "")} onClick={() => setTab("templates")}>Templates</button>
        </div>
        {tab === "workflows" && (
          <div style={{ position: "relative" }}>
            <button className="wc-primary" onClick={() => setAddMenu((o) => !o)}><Icon name="plus" size={16} />Add workflow <Icon name="chevronDown" size={13} /></button>
            {addMenu && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setAddMenu(false)} />
                <div className="wc-addmenu">
                  <button className="wc-addmenu-item" onClick={() => { setAddMenu(false); setWizardSeed(null); setWizard(true); }}>
                    <span className="wc-addmenu-ic"><Icon name="plus" size={16} /></span>
                    <div><div className="wc-addmenu-t">Start from scratch</div><div className="wc-addmenu-d">Build a new automation step by step</div></div>
                  </button>
                  <button className="wc-addmenu-item" onClick={() => { setAddMenu(false); setBrowse(true); }}>
                    <span className="wc-addmenu-ic" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}><Icon name="layers" size={16} /></span>
                    <div><div className="wc-addmenu-t">Browse templates</div><div className="wc-addmenu-d">Start from one of your templates</div></div>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {tab === "workflows" ? (
        <div className="wc-cmp-list">
          {!data && <div className="wc-task-empty" style={{ padding: 16 }}>Loading workflows…</div>}
          {data && campaigns.length === 0 && <div className="wc-task-empty" style={{ padding: 16 }}>No outbound workflows yet. Click "Add workflow" to build one.</div>}
          {campaigns.map((w) => (
            <CampaignCard key={w.id} w={w}
              onToggle={() => (w.live ? pause.mutate(w.id) : resume.mutate(w.id))}
              onEdit={() => navigate(`/workflows/${w.id}`)}
              onDelete={() => setConfirmDel(w)} />
          ))}
        </div>
      ) : (
        <TemplatesTab list={tplList} setList={setTplList} onNew={() => setTplWizard(true)} />
      )}

      {wizard && <WorkflowWizard seed={wizardSeed} onClose={() => { setWizard(false); setWizardSeed(null); }} onLaunch={handleWizardLaunch} busy={createAuto.isPending} />}
      {tplWizard && <WorkflowWizard mode="template" onClose={() => setTplWizard(false)} onLaunch={() => {}} onSaveTemplate={(t) => { setTplList((prev) => [t as unknown as TplItem, ...prev]); setTplWizard(false); setTab("templates"); }} />}
      {browse && <BrowseTemplatesModal onClose={() => setBrowse(false)} onUse={(seed) => { setBrowse(false); setWizardSeed(seed); setWizard(true); }} />}

      {confirmDel && (
        <V3Portal>
          <div className="wcv3-scrim" onClick={() => setConfirmDel(null)}>
            <div style={{ background: "var(--panel)", borderRadius: 12, padding: 24, width: "90%", maxWidth: 420, boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
              <div className="wc-confirm">
                <span className="wc-confirm-ic"><Icon name="trash" size={20} /></span>
                <div className="wc-confirm-t">Delete workflow?</div>
                <div className="wc-confirm-d">"{confirmDel.name}" will be removed. This can't be undone.</div>
                <div className="wc-confirm-acts">
                  <button className="wc-ghostbtn" onClick={() => setConfirmDel(null)}>Cancel</button>
                  <button className="wc-confirm-del" disabled={archive.isPending} onClick={() => archive.mutate(confirmDel.id)}><Icon name="trash" size={15} />Delete</button>
                </div>
              </div>
            </div>
          </div>
        </V3Portal>
      )}
    </div>
  );
}

// ---- page shell ------------------------------------------------------------

interface AgentsResp { agents?: { key: string; enabled: boolean; activity_today?: number }[] }
interface KpisLite { hot_leads?: number; appointments_set?: number; qualified_leads?: number }

// URL <-> sub-tab mapping (?tab=inbound|outbound|aisettings).
const TAB_TO_PARAM: Record<SubTab, string> = { inbound: "inbound", outbound: "outbound", settings: "aisettings" };
const paramToTab = (p: string | null): SubTab => (p === "outbound" ? "outbound" : p === "aisettings" || p === "settings" ? "settings" : "inbound");

export function AgentV3() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const subTab = paramToTab(params.get("tab"));
  const setSubTab = (t: SubTab) => setParams({ tab: TAB_TO_PARAM[t] }, { replace: true });
  // Normalize a missing/invalid ?tab (e.g. legacy ?tab=overview) to the canonical value.
  useEffect(() => {
    if (params.get("tab") !== TAB_TO_PARAM[subTab]) setParams({ tab: TAB_TO_PARAM[subTab] }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const orgId = localStorage.getItem("org_id") || "";

  const { data: agentsData } = useQuery({ queryKey: ["ai-agents"], queryFn: () => fetchAiAgents() as Promise<AgentsResp>, ...AI_QUERY_OPTS });
  const { data: kpis } = useQuery({ queryKey: ["ai-kpis", orgId], queryFn: () => fetchAiKpis(orgId) as Promise<KpisLite>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });

  const agentKey: AgentKey = subTab === "outbound" ? "outbound" : "inbound";
  const live = agentsData?.agents?.find((a) => a.key === agentKey);
  const statusOn = live?.enabled ?? false;
  const toggleEnabled = useMutation({ mutationFn: (next: boolean) => updateAiAgent(agentKey, { enabled: next }), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agents"] }) });

  const isOutbound = subTab === "outbound";
  const stats = isOutbound
    ? [
        { label: "AI Actions Today", value: String(live?.activity_today ?? 0), desc: "logged events" },
        { label: "Hot Leads", value: String(kpis?.hot_leads ?? 0), desc: "across the org" },
        { label: "Appointments Set", value: String(kpis?.appointments_set ?? 0), desc: "active" },
        { label: "Qualified Leads", value: String(kpis?.qualified_leads ?? 0), desc: "this period" },
      ]
    : [
        { label: "Conversations Today", value: String(live?.activity_today ?? 0), desc: "active threads" },
        { label: "Qualified Leads", value: String(kpis?.qualified_leads ?? 0), desc: "this period" },
        { label: "Appointments Booked", value: String(kpis?.appointments_set ?? 0), desc: "this period" },
      ];

  return (
    <div className="wc-page wc-fade">
      <div className="wc-ai-subtabs">
        <button className={"wc-ai-subtab" + (subTab === "inbound" ? " is-on" : "")} onClick={() => setSubTab("inbound")}>Inbound</button>
        <button className={"wc-ai-subtab" + (subTab === "outbound" ? " is-on" : "")} onClick={() => setSubTab("outbound")}>Outbound</button>
        <button className={"wc-ai-subtab" + (subTab === "settings" ? " is-on" : "")} onClick={() => setSubTab("settings")}><Icon name="settings" size={14} />AI Settings</button>
      </div>

      {subTab !== "settings" && (
        <div className="wc-stats">
          <div className={"wc-stat-status" + (isOutbound ? " is-orange" : " is-blue")}>
            <div className="wc-stat-status-label">Status</div>
            <div className="wc-stat-status-on" style={{ color: isOutbound ? "var(--accent-strong)" : "var(--blue)" }}>
              <span className="wc-stat-status-dot" style={{ background: statusOn ? (isOutbound ? "var(--accent-strong)" : "var(--blue)") : "var(--ink-faint)" }} />
              {statusOn ? "ON" : "OFF"}
            </div>
            <Toggle on={statusOn} onChange={(v) => toggleEnabled.mutate(v)} disabled={toggleEnabled.isPending} />
          </div>
          {stats.map((s) => (
            <div className="wc-nstat" key={s.label}>
              <div className="wc-nstat-label">{s.label}</div>
              <div className="wc-nstat-v wc-mono">{s.value}</div>
              <div className="wc-nstat-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      )}

      {subTab === "inbound" && <InboundBody />}
      {subTab === "outbound" && <OutboundBody />}
      {subTab === "settings" && <AISettings />}
    </div>
  );
}
