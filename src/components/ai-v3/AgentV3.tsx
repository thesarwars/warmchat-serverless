import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "./Icon";
import { V3Portal } from "./Portal";
import { WorkflowWizard, type WizardLaunch, type WizardSeed } from "./WorkflowWizard";
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
  fetchAiTemplates,
  seedAgentTemplates,
  createAiTemplate,
  updateAiTemplate,
  deleteAiTemplate,
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

interface CampaignFlowMsg { step: number; day: string; date: string; channel: string; text: string }

// A campaign card view-model derived from a real automation.
interface Campaign {
  id: number; name: string; icon: string; live: boolean; status: string;
  channel: string; steps: number; updated: string;
  leads: string; reply: string; appts: string;
  trigger: { title: string; sub: string };
  outcomes: string[];
  messages: CampaignFlowMsg[];
}

interface OrgAutomation {
  id: number; name: string; status: string; channels?: string[];
  messages_sent?: number; reply_rate?: number; is_archived?: boolean;
  message?: string; opening_send_time?: string | null; created_at?: string;
  leads?: number; converted_count?: number;
  followup_steps?: { delay_days?: number; message?: string; send_time?: string }[];
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
  const openTime = (a.opening_send_time || "").trim();
  const msgs: CampaignFlowMsg[] = [
    { step: 1, day: "Day 0", date: openTime ? openTime : "Send instantly", channel: channels[0]?.toLowerCase() === "email" ? "Email" : "SMS", text: a.message || FLOW_FALLBACK_SMS[0] },
    ...followups.map((s, i) => ({
      step: i + 2,
      day: "Day " + (FLOW_DAY_NUMS[i + 1] ?? (s.delay_days ?? (i + 1) * 2)),
      date: (s.send_time || "10:00 AM"),
      channel: "SMS",
      text: s.message || FLOW_FALLBACK_SMS[(i + 1) % FLOW_FALLBACK_SMS.length],
    })),
  ];
  return {
    id: a.id, name: a.name || "Untitled workflow", icon: "send", live, status: a.status || "Draft",
    channel: chanLabel, steps, updated: relTime(a.created_at),
    leads: String(a.leads ?? 0),
    reply: `${Math.round(a.reply_rate ?? 0)}%`,
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
                {w.live ? <span className="wc-pill-live"><PulseDot on />Live</span> : <span className="wc-pill-draft">{w.status}</span>}
              </div>
              <div className="wc-cmp-sub">{w.channel} · {w.steps}-step sequence · Enrolled {w.updated}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
            <button className="wc-cmp-viewflow" onClick={() => setFlow((o) => !o)}>{flow ? "Hide flow" : "View flow"}</button>
            <Toggle on={w.live} onChange={onToggle} />
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
            <div className="wc-cmp-stat"><span className="wc-cmp-status"><PulseDot on={w.live} />{w.live ? "Live" : "Draft"}</span><span className="wc-cmp-stat-l">{w.live ? "Active" : "Not Active"}</span></div>
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
                        : <span className="wc-tpl-time"><Icon name="clock" size={12} />{msg.date}</span>}
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

// ---- outbound: Templates tab (real /ai/templates) --------------------------

interface ApiTemplate { id: number; title: string; content: string; subject: string | null; channel: string | null; category_name?: string | null }

function TemplateModal({ initial, onClose, onSave }: { initial?: ApiTemplate | null; onClose: () => void; onSave: (d: { title: string; content: string; channel: string; subject: string }) => void }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [channel, setChannel] = useState((initial?.channel as string) || "sms");
  const [subject, setSubject] = useState(initial?.subject || "");
  const [content, setContent] = useState(initial?.content || "");
  const can = title.trim() !== "" && content.trim() !== "";
  return (
    <V3Portal>
      <div className="wcv3-scrim" onClick={onClose}>
        <div style={{ background: "var(--panel)", borderRadius: 14, padding: 24, width: "90%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: "var(--ink)" }}>{initial ? "Edit template" : "New template"}</h2>
            <button onClick={onClose} className="wc-iconbtn-sm" aria-label="Close"><Icon name="x" size={16} /></button>
          </div>
          <label className="wc-modal-lbl">Name</label>
          <input className="wc-modal-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Buyer follow-up" autoFocus />
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
            <span className="wc-modal-lbl" style={{ margin: 0 }}>Channel</span>
            <div style={{ display: "inline-flex", background: "var(--line-soft)", borderRadius: 10, padding: 3, gap: 3 }}>
              {["sms", "email"].map((ch) => (
                <button key={ch} onClick={() => setChannel(ch)} style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: channel === ch ? "var(--panel)" : "transparent", color: channel === ch ? "var(--accent-strong)" : "var(--ink-2)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Icon name={ch === "sms" ? "message" : "mail"} size={14} />{ch === "sms" ? "SMS" : "Email"}</button>
              ))}
            </div>
          </div>
          {channel === "email" && (<><label className="wc-modal-lbl">Subject</label><input className="wc-modal-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject…" style={{ marginBottom: 14 }} /></>)}
          <label className="wc-modal-lbl">Message</label>
          <textarea className="wc-set-ta" style={{ minHeight: 120 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Use {{first_name}}, {{area}}, {{agent_name}}…" />
          <div className="wc-modal-foot">
            <button className="wc-ghostbtn" onClick={onClose}>Cancel</button>
            <button className="wc-primary" disabled={!can} onClick={() => onSave({ title: title.trim(), content: content.trim(), channel, subject: subject.trim() })}>{initial ? "Save" : "Create template"}</button>
          </div>
        </div>
      </div>
    </V3Portal>
  );
}

function TemplatesTab() {
  const qc = useQueryClient();
  useEffect(() => { seedAgentTemplates().then(() => qc.invalidateQueries({ queryKey: ["ai-templates-v3"] })).catch(() => {}); }, [qc]);
  const { data } = useQuery({ queryKey: ["ai-templates-v3"], queryFn: () => fetchAiTemplates("outbound") as Promise<{ templates: ApiTemplate[] }>, ...AI_QUERY_OPTS });
  const templates = data?.templates ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["ai-templates-v3"] });
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<ApiTemplate | null>(null);
  const [confirmDel, setConfirmDel] = useState<ApiTemplate | null>(null);
  const createMut = useMutation({ mutationFn: (d: { title: string; content: string; channel: string; subject: string }) => createAiTemplate({ ...d, agent: "outbound" }), onSuccess: () => { refresh(); setCreating(false); } });
  const updateMut = useMutation({ mutationFn: (v: { id: number; d: { title: string; content: string; channel: string; subject: string } }) => updateAiTemplate(v.id, v.d), onSuccess: () => { refresh(); setEdit(null); } });
  const delMut = useMutation({ mutationFn: (id: number) => deleteAiTemplate(id), onSuccess: () => { refresh(); setConfirmDel(null); } });

  return (
    <div>
      <div className="wc-tpl-head">
        <span className="wc-band-d">{templates.length} template{templates.length === 1 ? "" : "s"} · variables like <span className="wc-tpl-var">{"{{first_name}}"}</span> fill in automatically</span>
        <button className="wc-primary wc-sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} />New template</button>
      </div>
      <div className="wc-tpl-grid">
        {!data && <div className="wc-task-empty" style={{ padding: 16 }}>Loading templates…</div>}
        {data && templates.length === 0 && <div className="wc-task-empty" style={{ padding: 16 }}>No templates yet.</div>}
        {templates.map((t) => {
          const ch = (t.channel || "sms").toLowerCase();
          return (
            <div className="wc-tpl-card" key={t.id}>
              <div className="wc-tpl-card-top">
                <ChannelPill channel={ch} size="sm" />
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button className="wc-iconbtn-sm" title="Edit" onClick={() => setEdit(t)}><Icon name="pencil" size={14} /></button>
                  <button className="wc-iconbtn-sm wc-danger" title="Delete" onClick={() => setConfirmDel(t)}><Icon name="trash" size={14} /></button>
                </div>
              </div>
              <div className="wc-tpl-card-title">{t.title}</div>
              {t.category_name && <div className="wc-tpl-card-meta">{t.category_name}</div>}
              <div className="wc-tpl-card-preview">
                {ch === "email" && t.subject && <div style={{ fontWeight: 700, color: "var(--ink-2)", marginBottom: 4 }}>Subject: {t.subject}</div>}
                <VarText text={t.content} />
              </div>
            </div>
          );
        })}
      </div>
      {creating && <TemplateModal onClose={() => setCreating(false)} onSave={(d) => createMut.mutate(d)} />}
      {edit && <TemplateModal initial={edit} onClose={() => setEdit(null)} onSave={(d) => updateMut.mutate({ id: edit.id, d })} />}
      {confirmDel && (
        <V3Portal>
          <div className="wcv3-scrim" onClick={() => setConfirmDel(null)}>
            <div style={{ background: "var(--panel)", borderRadius: 12, padding: 24, width: "90%", maxWidth: 420, boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
              <div className="wc-confirm">
                <span className="wc-confirm-ic"><Icon name="trash" size={20} /></span>
                <div className="wc-confirm-t">Delete template?</div>
                <div className="wc-confirm-d">"{confirmDel.title}" will be removed.</div>
                <div className="wc-confirm-acts">
                  <button className="wc-ghostbtn" onClick={() => setConfirmDel(null)}>Cancel</button>
                  <button className="wc-confirm-del" disabled={delMut.isPending} onClick={() => delMut.mutate(confirmDel.id)}><Icon name="trash" size={15} />Delete</button>
                </div>
              </div>
            </div>
          </div>
        </V3Portal>
      )}
    </div>
  );
}

// ---- outbound: Browse Templates modal (real templates → seed wizard) -------

function BrowseTemplatesModal({ onClose, onUse }: { onClose: () => void; onUse: (seed: WizardSeed) => void }) {
  const { data } = useQuery({ queryKey: ["ai-templates-v3"], queryFn: () => fetchAiTemplates("outbound") as Promise<{ templates: ApiTemplate[] }>, ...AI_QUERY_OPTS });
  const templates = data?.templates ?? [];
  return (
    <V3Portal>
      <div className="wcv3-scrim" onClick={onClose}>
        <div style={{ background: "var(--panel)", borderRadius: 16, width: "100%", maxWidth: 760, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--accent-strong)" }}>Create Workflow From Template</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)", margin: "4px 0 0" }}>Choose a Template</h2>
            </div>
            <button onClick={onClose} className="wc-iconbtn-sm" aria-label="Close"><Icon name="x" size={16} /></button>
          </div>
          <div style={{ padding: 20, overflowY: "auto" }}>
            <div className="wc-tpl-grid">
              {!data && <div className="wc-task-empty" style={{ padding: 16 }}>Loading templates…</div>}
              {data && templates.length === 0 && <div className="wc-task-empty" style={{ padding: 16 }}>No templates yet. Create one in the Templates tab.</div>}
              {templates.map((t) => {
                const ch = (t.channel || "sms").toLowerCase();
                return (
                  <div className="wc-tpl-card" key={t.id}>
                    <div className="wc-tpl-card-top"><ChannelPill channel={ch} size="sm" /></div>
                    <div className="wc-tpl-card-title">{t.title}</div>
                    {t.category_name && <div className="wc-tpl-card-meta">{t.category_name}</div>}
                    <div className="wc-tpl-card-preview"><VarText text={t.content} /></div>
                    <button className="wc-primary wc-sm" style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                      onClick={() => onUse({ name: t.title, channel: ch, message: t.content, subject: t.subject || "" })}>
                      Use template
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </V3Portal>
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

  const { data } = useQuery({ queryKey: ["org-automations", orgId], queryFn: () => fetchOrgAutomations(orgId) as Promise<OrgAutomation[]>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const refresh = () => qc.invalidateQueries({ queryKey: ["org-automations", orgId] });
  const campaigns = (data ?? []).filter((a) => !a.is_archived).map(automationToCampaign);
  const pause = useMutation({ mutationFn: (id: number) => pauseAutomation(id), onSuccess: () => refresh() });
  const resume = useMutation({ mutationFn: (id: number) => resumeAutomation(id), onSuccess: () => refresh() });
  const archive = useMutation({ mutationFn: (id: number) => archiveAutomation(id), onSuccess: () => { refresh(); setConfirmDel(null); } });
  // "Add workflow" opens the in-page wizard; on launch we persist a real
  // automation. Leads enter outbound one at a time as they opt in (the filters
  // become auto-enrollment sources), so creating it just sets up the sequence.
  const createAuto = useMutation({
    mutationFn: (d: WizardLaunch) => createAutomation({
      name: d.name,
      channels: d.channels,
      message: d.message,
      email_subject: d.emailSubject || undefined,
      opening_send_time: d.timing === "instant" ? null : undefined,
      sources: [...d.audType, ...d.audStage, ...d.audFilter],
      leads: d.leads,
      timing: d.leads.length > 0 ? "now" : undefined,
      followups: d.followups.map((f, i) => ({ delay_days: i + 1, message: f.message, send_time: f.time })),
    }),
    onSuccess: () => { refresh(); setWizard(false); },
  });

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
        <TemplatesTab />
      )}

      {wizard && <WorkflowWizard seed={wizardSeed} onClose={() => { setWizard(false); setWizardSeed(null); }} onLaunch={(d) => createAuto.mutate(d)} />}
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
