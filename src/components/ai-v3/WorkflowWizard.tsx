import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "./Icon";
import { V3Portal } from "./Portal";
import { fetchOrgLeads, fetchOrgTimezone } from "../../helpers/backend";
import { DEFAULT_STEP_SEND_TIME, isTimeInFutureToday, defaultFutureSendTime, formatZoneNow, formatSendTime } from "../../utils/workflowSchedule";

/* Create-Workflow wizard, ported from docs/updated-docs/ai-agent.jsx (§5).
   Self-contained (inline styles + Icon). Calls onLaunch with the assembled
   payload; the parent persists it via createAutomation. */

const AI_TONES = [
  { key: "professional", label: "Make professional" },
  { key: "shorter", label: "Make shorter" },
  { key: "friendlier", label: "Make friendlier" },
  { key: "appointment", label: "Appointment push" },
  { key: "followup", label: "Follow-up suggestion" },
];
function aiToneText(tone: string): { subject: string; text: string } {
  switch (tone) {
    case "professional": return { subject: "Following up on your home search", text: "Hi {{first_name}}, thanks for reaching out about your home search. I'd be glad to share a few options in {{area}} and answer any questions. When would be a good time for a brief call?" };
    case "shorter": return { subject: "Quick question", text: "Hi {{first_name}}, are you still looking for a home in {{area}}?" };
    case "friendlier": return { subject: "Great to connect!", text: "Hey {{first_name}}! So glad you're searching for a home in {{area}}. Want me to send over a few great options I think you'll love?" };
    case "appointment": return { subject: "Want to tour a few homes?", text: "Hi {{first_name}}, would you like to tour a few homes in {{area}} this week? I can set up a quick showing whenever works best for you." };
    case "followup": return { subject: "Just checking in", text: "Hi {{first_name}}, just checking in. Are you still looking for a home in {{area}}? No rush at all, happy to help whenever you're ready." };
    default: return { subject: "", text: "" };
  }
}

const WF_AUD_TYPES = ["Buyer", "Seller", "Investor", "Renter"];
const WF_AUD_STAGES = ["New Lead", "Contacted", "Engaged", "Qualified", "Appointment Set", "Active Client", "Under Contract", "Closed", "Lost"];
const STAGE_DOT: Record<string, string> = { "New Lead": "#FF6A3D", "Contacted": "#FFA630", "Engaged": "#3DBFF2", "Qualified": "#8B5CF6", "Appointment Set": "#0EA5E9", "Active Client": "#10B981", "Under Contract": "#F59E0B", "Closed": "#16A34A", "Lost": "#94A3B8" };
const WF_AUD_FILTERS = ["Hot Leads", "Needs Reply", "Appointment Ready", "Human Takeover", "No Response 7 Days"];

const toggleIn = (s: Set<string>, v: string) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; };

/** Human "when" for a scheduled follow-up: "Saturday, June 20 at 2:04 AM PST".
 * Falls back gracefully when the date/time is missing. */
function followupWhenLabel(date: string | undefined, time: string, timezone: string): string {
  const timeLabel = time ? (formatSendTime(time) || time) : "";
  let dayLabel = "";
  if (date) {
    const d = new Date(`${date}T00:00:00`);
    dayLabel = Number.isNaN(d.getTime())
      ? date
      : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  const head = dayLabel || "Follow-up";
  return `${head}${timeLabel ? ` at ${timeLabel}` : ""}${timezone ? ` ${timezone}` : ""}`;
}

export interface FollowUp { id: number; date?: string; time: string; timezone: string; channel: string; message: string; subject?: string; delayDays?: number }

function AIWriteMenu({ onPick }: { onPick: (tone: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#FFF1E8", color: "var(--accent-strong)", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}><Icon name="sparkles" size={15} />AI Write</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1200 }} />
          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 1201, minWidth: 230, padding: 6 }} onClick={(e) => e.stopPropagation()}>
            {AI_TONES.map((t) => (
              <button key={t.key} onClick={() => { onPick(t.key); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", border: "none", background: "none", cursor: "pointer", borderRadius: 8, fontSize: 14.5, fontWeight: 600, color: "var(--ink)", textAlign: "left" }}>
                <Icon name="sparkles" size={16} style={{ color: "var(--accent-strong)", flex: "none" }} />{t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const fuField: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 13, fontWeight: 600, color: "var(--ink)" };
const fuInput: React.CSSProperties = { border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", fontWeight: 600, color: "var(--ink)", background: "transparent", cursor: "pointer" };

function FollowUpSequence({ value, onChange, hasEmail }: { value: FollowUp[]; onChange: (v: FollowUp[]) => void; hasEmail: boolean }) {
  const set = (updater: (p: FollowUp[]) => FollowUp[]) => onChange(updater(value));
  const add = () => set((p) => [...p, { id: Date.now(), time: "09:00", timezone: "PST", channel: "sms", message: "" }]);
  const remove = (id: number) => set((p) => p.filter((f) => f.id !== id));
  const upd = (id: number, k: keyof FollowUp, v: string) => set((p) => p.map((f) => (f.id === id ? { ...f, [k]: v } : f)));
  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="clock" size={16} style={{ color: "var(--ink-3)" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Follow-Up Sequence</span>
          <span style={{ fontSize: 13, color: "var(--ink-3)" }}>(Optional)</span>
        </div>
        <button onClick={add} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent-strong)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Icon name="plus" size={14} />Add Follow-Up</button>
      </div>
      {value.length === 0 ? (
        <div style={{ padding: 20, border: "1.5px dashed var(--line)", borderRadius: 10, textAlign: "center", fontSize: 13, color: "var(--ink-3)" }}>No follow-ups yet. Add one to nudge leads who don't reply.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {value.map((f, i) => (
            <div key={f.id} style={{ padding: 16, border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)" }}>Follow-up {i + 1}</span>
                <div style={fuField}><Icon name="calendar" size={14} style={{ color: "var(--ink-3)" }} /><input type="date" value={f.date || ""} onChange={(e) => upd(f.id, "date", e.target.value)} style={fuInput} /></div>
                <div style={fuField}><Icon name="clock" size={14} style={{ color: "var(--ink-3)" }} /><input type="time" value={f.time} onChange={(e) => upd(f.id, "time", e.target.value)} style={fuInput} /></div>
                <select value={f.timezone} onChange={(e) => upd(f.id, "timezone", e.target.value)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", background: "var(--panel)", fontWeight: 600, color: "var(--ink)", cursor: "pointer" }}>
                  <option>PST</option><option>EST</option><option>CST</option><option>MST</option>
                </select>
                <button onClick={() => remove(f.id)} style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "grid", placeItems: "center" }}><Icon name="trash" size={14} style={{ color: "#ef4444" }} /></button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Sent on each lead's available channel{hasEmail ? "(s)" : ""}.</span>
                <div style={{ marginLeft: "auto" }}><AIWriteMenu onPick={(tone) => upd(f.id, "message", aiToneText(tone).text)} /></div>
              </div>
              {hasEmail && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>Subject</label>
                  <input type="text" value={f.subject || ""} onChange={(e) => upd(f.id, "subject", e.target.value)} placeholder="Enter email subject..." style={{ width: "100%", padding: "11px 13px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                </div>
              )}
              <textarea value={f.message} onChange={(e) => upd(f.id, "message", e.target.value)} placeholder="Write your follow-up message..." style={{ width: "100%", padding: 12, borderRadius: 8, border: "1.5px solid var(--accent-strong)", fontSize: 13, fontFamily: "inherit", minHeight: 80, resize: "vertical", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const chip = (on: boolean): React.CSSProperties => ({ padding: "8px 14px", borderRadius: 999, border: on ? "1.5px solid var(--accent-strong)" : "1.5px solid var(--line)", background: on ? "#FFF1E8" : "var(--panel)", color: on ? "var(--accent-strong)" : "var(--ink-2)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 });
const groupLbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-3)", marginBottom: 10 };

export interface WizardLaunch {
  name: string; channels: string[]; message: string; emailSubject: string;
  // timing: "instant" (send now) | "scheduled" (send today at openingTime).
  timing: string; openingTime: string; followups: FollowUp[];
  audType: string[]; audStage: string[]; audFilter: string[];
  // Hand-picked leads (Select-leads mode) to enroll + send to right away.
  leads: { id: number; name: string; phone: string; email: string }[];
}

interface OrgLead { id: number; name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; source?: string | null; lead_type?: string | null; status?: string | null; intent?: string | null }
const leadName = (l: OrgLead) => (l.name || [l.first_name, l.last_name].filter(Boolean).join(" ") || "Unnamed lead").trim();
const wfInitials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export interface WizardSeed { name?: string; channel?: string; message?: string; subject?: string; followups?: FollowUp[] }
/** A template built by the wizard in template mode (saved to the Templates tab). */
export interface WizardTemplate { id: string; channel: string; name: string; stage: string; sent: number; flow: Record<string, unknown>[] }

export function WorkflowWizard({ seed, onClose, onLaunch, mode = "workflow", onSaveTemplate, busy = false }: { seed?: WizardSeed | null; onClose: () => void; onLaunch: (d: WizardLaunch) => void; mode?: "workflow" | "template"; onSaveTemplate?: (t: WizardTemplate) => void; busy?: boolean }) {
  const isTpl = mode === "template";
  const lastStep = isTpl ? 2 : 3;
  const seedCh = seed?.channel === "email" ? "email" : "sms";
  const [step, setStep] = useState(1);
  const [name, setName] = useState(seed?.name || "");
  const [channels, setChannels] = useState<string[]>([seedCh]);
  // Channel is chosen ONCE in Step 1 (campaign-level). Each message is then sent
  // to every selected channel a lead actually has - no per-message channel choice.
  const hasEmail = channels.includes("email");
  const [message, setMessage] = useState(seed?.message || "");
  const [emailSubject, setEmailSubject] = useState(seed?.subject || "");
  const [timing, setTiming] = useState("instant");
  const [openingTime, setOpeningTime] = useState(DEFAULT_STEP_SEND_TIME);
  // Template-mode opening schedule (cosmetic - only the instant flag is saved).
  const [openingDate, setOpeningDate] = useState("");
  const [openingTz, setOpeningTz] = useState("PST");
  const [followups, setFollowups] = useState<FollowUp[]>(seed?.followups || []);
  const [audType, setAudType] = useState<Set<string>>(new Set());
  const [audStage, setAudStage] = useState<Set<string>>(new Set());
  const [audFilter, setAudFilter] = useState<Set<string>>(new Set());
  // Audience mode + hand-picked real leads.
  const [audMode, setAudMode] = useState<"select" | "filter">("select");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [leadSearch, setLeadSearch] = useState("");
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const orgId = localStorage.getItem("org_id") || "";
  const { data: tzData } = useQuery({ queryKey: ["org-timezone", orgId], queryFn: () => fetchOrgTimezone(orgId) as Promise<{ timezone?: string }>, enabled: Boolean(orgId) });
  const acctTz = (tzData as { timezone?: string } | undefined)?.timezone || "";
  const { data: leadsRaw } = useQuery({ queryKey: ["org-leads-min", orgId], queryFn: () => fetchOrgLeads(orgId) as Promise<OrgLead[]>, enabled: Boolean(orgId) });
  const leads: OrgLead[] = Array.isArray(leadsRaw) ? leadsRaw : [];
  const shownLeads = leadSearch.trim()
    ? leads.filter((l) => (leadName(l) + " " + (l.phone || l.email || "") + " " + (l.source || "")).toLowerCase().includes(leadSearch.trim().toLowerCase()))
    : leads;
  // Live preview of which existing leads match the chosen filters, so the user
  // can SEE who the filter targets (Lead type + Stage, plus Hot Leads via intent).
  // Behavioral filters that need joined data (Needs Reply, etc.) are noted as
  // applied at enrollment rather than guessed here.
  const matchedLeads = useMemo(() => {
    const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
    const alnum = (s: string | null | undefined) => norm(s).replace(/[^a-z0-9]/g, "");
    const types = [...audType].map(norm);
    const stages = [...audStage].map(alnum);
    const hotOnly = audFilter.has("Hot Leads");
    const HOT = new Set(["hot", "high intent", "high_intent", "high-intent", "interested"]);
    return leads.filter((l) => {
      if (types.length && !types.some((t) => norm(l.lead_type).includes(t))) return false;
      if (stages.length) {
        const st = alnum(l.status);
        if (!stages.some((s) => st === s || st.includes(s) || s.includes(st))) return false;
      }
      if (hotOnly && !HOT.has(norm(l.intent))) return false;
      return true;
    });
  }, [leads, audType, audStage, audFilter]);
  const toggleLead = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Pagination over the (search-)filtered list. All leads are loaded client-side,
  // so paging is a slice. Reset to page 1 whenever the filter or page size changes.
  useEffect(() => { setPage(1); }, [leadSearch, pageSize]);
  const totalFiltered = shownLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedLeads = shownLeads.slice(pageStart, pageStart + pageSize);
  const rangeFrom = totalFiltered === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + pageSize, totalFiltered);
  // Header checkbox acts on the CURRENT PAGE; the banner buttons handle all-filtered
  // / all-in-database so a 1,375-lead set isn't an all-or-nothing toggle.
  const pageIds = pagedLeads.map((l) => l.id);
  const pageAllSel = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const pageSomeSel = pageIds.some((id) => sel.has(id)) && !pageAllSel;
  const togglePage = () => setSel((s) => {
    const n = new Set(s);
    if (pageAllSel) pageIds.forEach((id) => n.delete(id));
    else pageIds.forEach((id) => n.add(id));
    return n;
  });
  const selectAllFiltered = () => setSel((s) => { const n = new Set(s); shownLeads.forEach((l) => n.add(l.id)); return n; });
  const selectAllInDatabase = () => setSel(new Set(leads.map((l) => l.id)));
  const clearSelection = () => setSel(new Set());
  const [pstNow, setPstNow] = useState("");
  useEffect(() => {
    const tick = () => setPstNow(new Date().toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) + " PST");
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv);
  }, []);

  const toggleChannel = (c: string) => setChannels((prev) => (prev.includes(c) ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev) : [...prev, c]));
  const canContinue = step > 1 || name.trim() !== "";

  const selectedLeads = leads.filter((l) => sel.has(l.id)).map((l) => ({ id: l.id, name: leadName(l), phone: l.phone || "", email: l.email || "" }));
  // Same-day scheduled opening must still be in the future (account tz) - block
  // launch otherwise so a lead enrolled today never gets a past-dated send.
  const openingPast = timing === "scheduled" && !isTimeInFutureToday(openingTime, acctTz);
  const launch = () => { if (openingPast || busy) return; onLaunch({ name: name.trim() || "New workflow", channels, message, emailSubject, timing, openingTime, followups, audType: [...audType], audStage: [...audStage], audFilter: [...audFilter], leads: audMode === "select" ? selectedLeads : [] }); };

  // Template mode: build a reusable template (opening + follow-ups) and hand it
  // back to the Templates tab. stage is CUSTOM, sent 0, day 0/1/2/... by index.
  const saveTemplate = () => {
    const ch = channels[0] || "sms";
    const flow: Record<string, unknown>[] = [
      ch === "email"
        ? { day: "Day 0", instant: timing === "instant", channel: "email", subject: emailSubject, body: message }
        : { day: "Day 0", instant: timing === "instant", channel: "sms", text: message },
    ];
    followups.forEach((f, idx) => {
      const fch = f.channel || "sms";
      flow.push(fch === "email"
        ? { day: "Day " + (idx + 1), channel: "email", subject: f.subject || "", body: f.message || "" }
        : { day: "Day " + (idx + 1), channel: "sms", text: f.message || "" });
    });
    onSaveTemplate?.({ id: "tpl" + Date.now(), channel: ch, name: name.trim() || "Untitled Template", stage: "CUSTOM", sent: 0, flow });
  };

  const channelLabel = channels.map((c) => (c === "sms" ? "SMS" : "Email")).join(" + ");
  const filterCount = audType.size + audStage.size + audFilter.size;

  return (
    <V3Portal>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
        <div style={{ background: "var(--panel)", borderRadius: 18, width: "100%", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "var(--shadow-lg)" }} onClick={(e) => e.stopPropagation()}>
          {/* Header + progress */}
          <div style={{ padding: "20px 28px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent-strong)", display: "grid", placeItems: "center" }}><Icon name={isTpl ? "layers" : "outbound"} size={18} /></span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>{isTpl ? "Create New Template" : "Create New Workflow"}</span>
              </div>
              <button onClick={onClose} className="wc-iconbtn-sm" aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {(isTpl ? [1, 2] : [1, 2, 3]).map((s) => (
                <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: s <= step ? "var(--accent-strong)" : "var(--line)" }} />
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "28px", overflowY: "auto" }}>
            {step === 1 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                  <div><h3 style={{ fontSize: 32, fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>{isTpl ? "Create New Template" : "Name & Channel"}</h3><p style={{ fontSize: 16, color: "var(--ink-3)", margin: 0 }}>{isTpl ? "Build a reusable sequence to save and use later" : "Name your workflow, pick a channel, and choose who to enroll"}</p></div>
                  <div style={{ fontSize: 16, color: "var(--ink-3)", fontWeight: 600 }}>Step 1 of {lastStep}</div>
                </div>
                {/* Name (left) + Channel (right) on one row; the name field is
                    sized down so the SMS/Email cards sit beside it. Wraps to two
                    stacked rows on a narrow viewport. "Who to enroll" stays full
                    width below both. */}
                <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 260px", minWidth: 240 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>{isTpl ? "Template Name" : "Workflow name"}</label>
                    <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} autoFocus placeholder={isTpl ? "New Lead Follow-Up" : "e.g. Buyer speed-to-lead"} style={{ width: "100%", height: 62, padding: "0 16px", borderRadius: 12, border: "2px solid var(--accent-strong)", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{name ? `${name.length}/80` : "Give it a clear name you'll recognize later."}</div>
                  </div>
                  <div style={{ flex: "1 1 340px", minWidth: 300 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>Choose Channel</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[{ k: "sms", t: "SMS", d: "Fast replies", icon: "message" }, { k: "email", t: "Email", d: "Rich content", icon: "mail" }].map((c) => {
                        const on = channels.includes(c.k);
                        return (
                          <button key={c.k} onClick={() => toggleChannel(c.k)} style={{ position: "relative", height: 62, display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "0 12px", borderRadius: 12, border: on ? "2px solid var(--accent-strong)" : "2px solid var(--line)", background: on ? "#FFF8F5" : "var(--panel)", cursor: "pointer", boxSizing: "border-box" }}>
                            <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: c.k === "sms" ? "#FFEDE3" : "#E7F4FB", color: c.k === "sms" ? "var(--accent-strong)" : "#0EA5E9", flex: "none" }}><Icon name={c.icon} size={17} /></span>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "var(--ink)", lineHeight: 1.2 }}>{c.t}</span>
                              <span style={{ display: "block", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.2 }}>{c.d}</span>
                            </span>
                            {on && <span style={{ marginLeft: "auto", width: 20, height: 20, borderRadius: "50%", background: "var(--accent-strong)", color: "#fff", display: "grid", placeItems: "center", flex: "none" }}><Icon name="check" size={12} /></span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Who to enroll - moved into Step 1 (under the channel choice) so
                    it's visible without scrolling into Step 2. The marginTop adds a
                    gap so it isn't visually attached to the SMS/Email cards.
                    Hidden in template mode - a template has no audience. */}
                {!isTpl && (
                <div style={{ padding: 20, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, marginTop: 24 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14 }}>
                    <Icon name="users" size={16} style={{ color: "var(--accent-strong)", marginTop: 2 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Who to enroll</div>
                      <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>Pick specific leads, or enroll everyone matching a filter.</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "var(--accent-strong)", background: "#FFF1E8", padding: "5px 12px", borderRadius: 999, whiteSpace: "nowrap" }}>{audMode === "filter" ? `${filterCount} filters` : `${sel.size} selected`}</span>
                  </div>

                  {/* mode toggle */}
                  <div style={{ display: "inline-flex", background: "var(--line-soft)", borderRadius: 10, padding: 3, gap: 3, marginBottom: 16 }}>
                    {([["select", "Select leads", "check"], ["filter", "Use filters", "filter"]] as const).map(([m, label, icon]) => (
                      <button key={m} onClick={() => setAudMode(m)} style={{ padding: "7px 16px", borderRadius: 7, border: "none", background: audMode === m ? "var(--panel)" : "transparent", color: audMode === m ? "var(--accent-strong)" : "var(--ink-2)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: audMode === m ? "var(--shadow-sm)" : "none" }}><Icon name={icon} size={14} />{label}</button>
                    ))}
                  </div>

                  {audMode === "select" ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 12, color: "var(--ink-3)" }}>
                        <Icon name="search" size={15} />
                        <input value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} placeholder="Search leads…" style={{ border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", width: "100%", color: "var(--ink)" }} />
                      </div>
                      {/* Bulk-select banner: page checkbox handles the current page;
                          these select across ALL filtered / all in the database. */}
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <button onClick={selectAllFiltered} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", cursor: "pointer" }}>Select all {totalFiltered.toLocaleString()}{leadSearch ? " filtered" : ""}</button>
                        {leadSearch.trim() && <button onClick={selectAllInDatabase} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", cursor: "pointer" }}>Select all {leads.length.toLocaleString()} in database</button>}
                        {sel.size > 0 && <button onClick={clearSelection} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "transparent", fontSize: 12.5, fontWeight: 700, color: "var(--ink-3)", cursor: "pointer" }}>Clear</button>}
                        <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 800, color: "var(--accent-strong)" }}>{sel.size.toLocaleString()} selected</span>
                      </div>
                      <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                        <button onClick={togglePage} style={{ width: "100%", display: "grid", gridTemplateColumns: "28px 1fr 110px 70px", alignItems: "center", gap: 12, padding: "11px 14px", background: "var(--line-soft)", border: "none", cursor: "pointer", textAlign: "left" }}>
                          <span style={{ width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", flex: "none", border: pageAllSel || pageSomeSel ? "none" : "2px solid var(--line)", background: pageAllSel || pageSomeSel ? "var(--accent)" : "var(--panel)" }}>{pageAllSel ? <Icon name="check" size={13} style={{ color: "#fff" }} /> : pageSomeSel ? <Icon name="minus" size={13} style={{ color: "#fff" }} /> : null}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-3)" }}>{pageAllSel ? "Deselect page" : "Select page"}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-3)" }}>Source</span>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-3)" }}>Type</span>
                        </button>
                        <div style={{ maxHeight: 360, overflowY: "auto" }}>
                          {!leadsRaw && <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>Loading leads…</div>}
                          {leadsRaw && totalFiltered === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>No leads {leadSearch ? `match "${leadSearch}"` : "yet"}.</div>}
                          {pagedLeads.map((l) => {
                            const on = sel.has(l.id);
                            const type = (l.lead_type || "").trim();
                            const seller = type.toLowerCase() === "seller";
                            return (
                              <button key={l.id} onClick={() => toggleLead(l.id)} style={{ width: "100%", display: "grid", gridTemplateColumns: "28px 1fr 110px 70px", alignItems: "center", gap: 12, padding: "11px 14px", background: on ? "var(--accent-soft)" : "var(--panel)", border: "none", borderTop: "1px solid var(--line)", cursor: "pointer", textAlign: "left" }}>
                                <span style={{ width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", flex: "none", border: on ? "none" : "2px solid var(--line)", background: on ? "var(--accent)" : "var(--panel)" }}>{on && <Icon name="check" size={13} style={{ color: "#fff" }} />}</span>
                                <span style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                                  <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#EEECE8", color: "#9A938A", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>{wfInitials(leadName(l))}</span>
                                  <span style={{ minWidth: 0 }}>
                                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leadName(l)}</span>
                                    <span style={{ display: "block", fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.phone || l.email || "—"}</span>
                                  </span>
                                </span>
                                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{l.source || "—"}</span>
                                <span>{type && <span style={{ fontSize: 11, fontWeight: 700, color: seller ? "var(--accent-strong)" : "var(--blue)", background: seller ? "var(--accent-soft)" : "var(--blue-bg)", padding: "3px 8px", borderRadius: 6 }}>{type}</span>}</span>
                              </button>
                            );
                          })}
                        </div>
                        {/* Pagination footer */}
                        {totalFiltered > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--line)", background: "var(--line-soft)", fontSize: 12.5, color: "var(--ink-2)" }}>
                            <span>Showing <strong>{rangeFrom.toLocaleString()}–{rangeTo.toLocaleString()}</strong> of <strong>{totalFiltered.toLocaleString()}</strong> leads</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              Page size
                              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", cursor: "pointer" }}>
                                {[100, 200, 300, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </span>
                            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 12.5, fontWeight: 700, color: safePage <= 1 ? "var(--ink-faint)" : "var(--ink-2)", cursor: safePage <= 1 ? "not-allowed" : "pointer" }}>Previous</button>
                              <span style={{ fontWeight: 700 }}>Page {safePage} of {totalPages}</span>
                              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel)", fontSize: 12.5, fontWeight: 700, color: safePage >= totalPages ? "var(--ink-faint)" : "var(--ink-2)", cursor: safePage >= totalPages ? "not-allowed" : "pointer" }}>Next</button>
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 12 }}><strong style={{ color: "var(--ink-2)" }}>{sel.size.toLocaleString()}</strong> of {leads.length.toLocaleString()} leads selected for enrollment.</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: 18 }}>
                        <div style={groupLbl}>Lead type</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {WF_AUD_TYPES.map((t) => { const on = audType.has(t); return <button key={t} onClick={() => setAudType((s) => toggleIn(s, t))} style={chip(on)}>{on && <Icon name="check" size={13} />}{t}</button>; })}
                        </div>
                      </div>
                      <div style={{ marginBottom: 18 }}>
                        <div style={groupLbl}>Stage</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {WF_AUD_STAGES.map((st) => { const on = audStage.has(st); return <button key={st} onClick={() => setAudStage((s) => toggleIn(s, st))} style={chip(on)}>{on ? <Icon name="check" size={13} /> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_DOT[st], flex: "none" }} />}{st}</button>; })}
                        </div>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <div style={groupLbl}>Filters</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {WF_AUD_FILTERS.map((f) => { const on = audFilter.has(f); return <button key={f} onClick={() => setAudFilter((s) => toggleIn(s, f))} style={chip(on)}><span style={{ width: 16, height: 16, borderRadius: 5, display: "grid", placeItems: "center", flex: "none", border: on ? "none" : "1.5px solid var(--line)", background: on ? "var(--accent-strong)" : "transparent" }}>{on && <Icon name="check" size={11} style={{ color: "#fff" }} />}</span>{f}</button>; })}
                        </div>
                      </div>
                      {/* Live preview of the leads matching the chosen filters. */}
                      <div style={{ marginBottom: 14, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ padding: "10px 14px", background: "var(--line-soft)", fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)" }}>
                          {!leadsRaw ? "Loading leads…" : `${matchedLeads.length} of ${leads.length} leads match these filters`}
                        </div>
                        <div style={{ maxHeight: 220, overflowY: "auto" }}>
                          {leadsRaw && matchedLeads.length === 0 ? (
                            <div style={{ padding: 20, textAlign: "center", color: "var(--ink-3)", fontSize: 13.5 }}>No leads match these filters yet.</div>
                          ) : (
                            matchedLeads.map((l) => {
                              const type = (l.lead_type || "").trim();
                              const seller = type.toLowerCase() === "seller";
                              return (
                                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: "1px solid var(--line)" }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                                    <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#EEECE8", color: "#9A938A", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>{wfInitials(leadName(l))}</span>
                                    <span style={{ minWidth: 0 }}>
                                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leadName(l)}</span>
                                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.phone || l.email || "—"}</span>
                                    </span>
                                  </span>
                                  <span>{type && <span style={{ fontSize: 11, fontWeight: 700, color: seller ? "var(--accent-strong)" : "var(--blue)", background: seller ? "var(--accent-soft)" : "var(--blue-bg)", padding: "3px 8px", borderRadius: 6 }}>{type}</span>}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 12, padding: "14px 16px", background: "#fff8f5", border: "1px solid #ffd9c2", borderRadius: 12, alignItems: "flex-start" }}>
                        <Icon name="filter" size={16} style={{ color: "var(--accent-strong)", flex: "none", marginTop: 2 }} />
                        <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>Leads matching these filters are enrolled automatically as they opt in. {filterCount ? "" : "(no filter — everyone)"}</div>
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                  <div><h3 style={{ fontSize: 32, fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>Craft Your Message</h3><p style={{ fontSize: 16, color: "var(--ink-3)", margin: 0 }}>{isTpl ? "Write the message and follow-up sequence" : "Write the message sequence"}</p></div>
                  <div style={{ fontSize: 16, color: "var(--ink-3)", fontWeight: 600 }}>Step 2 of {lastStep}</div>
                </div>

                {isTpl && (
                  <div style={{ padding: 20, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8 }}>Channel</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{channelLabel}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8 }}>Enrollment</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>As leads opt in</div>
                    </div>
                  </div>
                )}

                {/* Message card */}
                <div style={{ padding: 20, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <Icon name="sparkles" size={15} style={{ color: "var(--accent-strong)" }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Initial Message</span>
                    <span style={{ fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 3 }}><Icon name="clock" size={12} />{pstNow}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Sent on each lead's available channel{channels.length > 1 ? "s (SMS and/or Email)" : ` (${channelLabel})`}.</span>
                    <div style={{ marginLeft: "auto" }}><AIWriteMenu onPick={(tone) => { const d = aiToneText(tone); setMessage(d.text); if (hasEmail) setEmailSubject(d.subject); }} /></div>
                  </div>
                  {hasEmail && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>Subject</label>
                      <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Enter email subject..." style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                    </div>
                  )}
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={hasEmail ? "Write your message..." : "Write your message..."} style={{ width: "100%", padding: 16, borderRadius: 10, border: "2px solid var(--accent-strong)", fontSize: 14, fontFamily: "inherit", minHeight: 150, resize: "vertical", boxSizing: "border-box", outline: "none" }} />
                  <div style={{ textAlign: "right", fontSize: 12, color: "var(--ink-3)", marginTop: 12 }}>{message.length} chars · {Math.max(1, Math.ceil(message.length / 160))}/5 segments</div>
                  <div style={{ marginTop: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>When to send the opening</label>
                    <div style={{ display: "inline-flex", background: "var(--line-soft)", borderRadius: 10, padding: 3, gap: 3 }}>
                      {(isTpl ? [["instant", "Instant"], ["scheduled", "At a time"]] : [["instant", "Send now"], ["scheduled", "Send at a specific time"]]).map(([k, l]) => (
                        <button key={k} onClick={() => {
                          setTiming(k);
                          if (!isTpl && k === "scheduled" && !isTimeInFutureToday(openingTime, acctTz)) setOpeningTime(defaultFutureSendTime(acctTz) || openingTime);
                        }} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: timing === k ? "var(--panel)" : "transparent", color: timing === k ? "var(--accent-strong)" : "var(--ink-2)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{l}</button>
                      ))}
                    </div>
                    {timing === "scheduled" && (isTpl ? (
                      // Template mode: date + time + timezone (cosmetic; only instant is saved).
                      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={fuField}>
                          <Icon name="calendar" size={14} style={{ color: "var(--ink-3)" }} />
                          <input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} style={fuInput} />
                        </div>
                        <div style={fuField}>
                          <Icon name="clock" size={14} style={{ color: "var(--ink-3)" }} />
                          <input type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} style={fuInput} />
                        </div>
                        <select value={openingTz} onChange={(e) => setOpeningTz(e.target.value)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", background: "var(--panel)", fontWeight: 600, color: "var(--ink)", cursor: "pointer" }}>
                          <option>PST</option><option>EST</option><option>CST</option><option>MST</option>
                        </select>
                      </div>
                    ) : (
                      // Workflow mode: same-day "Today at" with future-time validation.
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Today at</span>
                          <div style={fuField}>
                            <Icon name="clock" size={14} style={{ color: "var(--ink-3)" }} />
                            <input type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} style={fuInput} />
                          </div>
                          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                            {acctTz ? `account time · now ${formatZoneNow(acctTz)}` : "account time"}
                          </span>
                        </div>
                        {openingPast && (
                          <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "#E11D48" }}>
                            That time has already passed today. Pick a later time, or choose "Send now".
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <FollowUpSequence value={followups} onChange={setFollowups} hasEmail={hasEmail} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
                  <div><h3 style={{ fontSize: 32, fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>Review & Launch</h3><p style={{ fontSize: 16, color: "var(--ink-3)", margin: 0 }}>Double-check your workflow before launching</p></div>
                  <div style={{ fontSize: 16, color: "var(--ink-3)", fontWeight: 600 }}>Step 3 of 3</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                  {[
                    { icon: "users", label: "Enrollment", value: audMode === "select" ? String(sel.size) : "Filter", desc: audMode === "select" ? "leads selected" : "auto-enroll" },
                    { icon: "message", label: "Channel", value: channelLabel, desc: channels.length > 1 ? "channels" : "channel" },
                    { icon: "clock", label: "Follow-ups", value: String(followups.length), desc: "messages" },
                    { icon: "checkCircle", label: "Stop Rules", value: "Reply + Appt", desc: "2 rules active" },
                  ].map((s, i) => (
                    <div key={i} style={{ padding: 18, borderRadius: 14, border: "1px solid var(--line)", background: "var(--panel)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-3)", marginBottom: 12 }}><Icon name={s.icon} size={15} /><span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</span></div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", marginBottom: 4, lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{s.desc}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: 20, background: "var(--line-soft)", borderRadius: 14 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-3)", margin: "0 0 16px" }}>Message Flow — How This Workflow Runs</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[{ tag: "Opening message", subject: hasEmail ? emailSubject : "", body: message, when: timing === "instant" ? "Sent immediately" : `Sending at ${formatSendTime(openingTime) || openingTime} ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}` },
                      ...followups.map((f, i) => ({ tag: `Follow-up ${i + 1}`, subject: hasEmail ? (f.subject || "") : "", body: f.message, when: followupWhenLabel(f.date, f.time, f.timezone) })),
                    ].map((m, i) => {
                      const emailOnly = hasEmail && !channels.includes("sms");
                      return (
                        <div key={i} style={{ padding: 16, background: "var(--panel)", borderRadius: 12, border: "1px solid var(--line)", display: "flex", gap: 14, alignItems: "flex-start" }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: emailOnly ? "#E7F4FB" : "#FFEDE3", color: emailOnly ? "#0EA5E9" : "var(--accent-strong)", display: "grid", placeItems: "center", flex: "none" }}><Icon name={emailOnly ? "mail" : "message"} size={18} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{m.tag}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, background: "#FFEDE3", color: "var(--accent-strong)" }}>{channelLabel}</span>
                            </div>
                            {m.subject ? <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)", marginTop: 6 }}>Subject: {m.subject}</div> : null}
                            <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.body ? `"${m.body}"` : <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>No message written yet</span>}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}><Icon name="clock" size={13} />{m.when}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ padding: 16, background: "var(--panel)", borderRadius: 12, border: "1px solid var(--line)", display: "flex", gap: 14, alignItems: "center" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: "#DCFCE7", color: "#16A34A", display: "grid", placeItems: "center", flex: "none" }}><Icon name="checkCircle" size={18} /></div>
                      <div><div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Workflow stops</div><div style={{ fontSize: 13, color: "var(--ink-3)" }}>when lead replies or when appointment booked</div></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "16px 28px", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {step > 1 ? <button className="wc-ghostbtn" onClick={() => setStep((s) => s - 1)}>Back</button> : <span />}
            {step < lastStep
              ? <button className="wc-primary" disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>Continue<Icon name="arrowRight" size={15} /></button>
              : isTpl
                ? <button className="wc-primary" onClick={saveTemplate}><Icon name="check" size={15} />Save Template</button>
                : <button className="wc-primary" disabled={openingPast || busy} onClick={launch}><Icon name="outbound" size={15} />{busy ? "Starting…" : "Start Workflow"}</button>}
          </div>
        </div>
      </div>
    </V3Portal>
  );
}
