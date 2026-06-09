import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "./Icon";
import type { Tone } from "./tones";
import { fetchAiSettings, updateAiSettings, fetchAiKpis, fetchAiNextSteps, fetchAiActivityLog, fetchAiActionCenter, fetchAgentProfile, updateAgentProfile, fetchAiKnowledge, createAiKnowledge, updateAiKnowledge, deleteAiKnowledge, fetchAiQualifications, createAiQualification, updateAiQualification, deleteAiQualification, aiTestChat, fetchAiAgents, fetchAgentSystemPrompt, fetchAiRules, updateAiRules, fetchOrgQuietHours, fetchOrgTimezone, fetchMeBootstrap } from "../../helpers/backend";
import { AgentPage as AgentDetailPage } from "./AgentV2";
import { NimbusMascot, type MascotState } from "./NimbusMascot";
import { Wcv2Portal } from "./Portal";
import { HowItWorksModal } from "./HowItWorks";
import { AI_LIMITS } from "@/utils/aiLimits";
import { AI_QUERY_OPTS, useAiCommandCenterData } from "./aiData";

/* AI Command Center - ported from the "leads-remix-2" design bundle
   (assistant.jsx). UI-only: static sample data, local state only. Dead
   prototype tabs/data that AgentPage never rendered (AcWorkersTab,
   AcPerformanceTab, AcDonut, AcStat and their constants) were dropped to keep
   the lint clean. Inbound/Outbound tabs reuse the shared AgentPage. */

type GoFn = (key: string) => void;

interface AiKpis {
  total_leads: number; new_leads: number; qualified_leads: number; hot_leads: number;
  appointments_set: number; appointment_rate: number; response_rate: number;
  conversion_rate: number; deals_closed: number; pipeline_value: number;
  buyers_count: number; sellers_count: number; avg_price_point: number;
  leads_by_area: { area: string | null; count: number }[];
  // Distinct leads the AI touched TODAY (server-aggregated) - autopilot banner.
  ai_today: { conversations: number; records: number; moved: number };
}
interface NextStepItem { lead_id: number; name: string; action: string; score: number | null; intent: string | null; lead_type: string | null; area: string | null }
interface NextStepsData { items: NextStepItem[]; summary: { hot_need_response: number; ready_to_book: number; nurturing: number; missing_info: number } }
interface ActivityEvent { id: number; agent_key: string; event: string; lead_id: number | null; lead_label: string | null; detail: string | null; status: string; created_at: string }
interface AiAgentsData { ai_requests_month: number; ai_cost_month: number; agents: { activity_today: number; errors_24h: number }[] }

const EVENT_META: Record<string, { icon: string; tone: string; label: string }> = {
  "reply.sent": { icon: "message", tone: "blue", label: "AI replied to a lead" },
  "message.sent": { icon: "message", tone: "blue", label: "Message sent" },
  "message.failed": { icon: "message", tone: "red", label: "Message failed to send" },
  "message.skipped": { icon: "message", tone: "amber", label: "Message skipped" },
  "lead.updated": { icon: "file", tone: "green", label: "AI updated lead data" },
  "lead.qualified": { icon: "check", tone: "green", label: "Lead qualified" },
  "lead.booking_ready": { icon: "calendarCheck", tone: "violet", label: "Lead is booking-ready" },
  "appointment.proposed": { icon: "calendarCheck", tone: "violet", label: "Appointment proposed" },
  "lead.escalated": { icon: "zap", tone: "amber", label: "Escalated to agent" },
  "escalation.advanced": { icon: "flame", tone: "red", label: "Hot lead re-alerted" },
  "task.created": { icon: "tasks", tone: "blue", label: "Task created" },
  "deal.updated": { icon: "dollar", tone: "green", label: "Deal updated" },
};
function eventMeta(ev: string): { icon: string; tone: string; label: string } {
  return EVENT_META[ev] ?? { icon: "zap", tone: "blue", label: ev };
}
function timeAgo(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const TONE_FALLBACK: Tone = { fg: "#2563EB", bg: "#EAF1FE" };

const AC_TT: Record<string, Tone> = {
  red: { fg: "#DC2626", bg: "#FEE2E2" },
  amber: { fg: "#D97706", bg: "#FEF3C7" },
  blue: { fg: "#2563EB", bg: "#EAF1FE" },
  green: { fg: "#16A34A", bg: "#E8F8ED" },
  violet: { fg: "#7C3AED", bg: "#F2ECFE" },
  orange: { fg: "#EA580C", bg: "#FFF1E7" },
};


// Shimmer placeholder used while a tab's data is loading.
function Skeleton({ h = 13, w = "100%", r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="wc-skel" style={{ height: h, width: w, borderRadius: r }} />;
}
// Generic tab loading state - a couple of card placeholders. Used by every AI
// Command Center tab so nothing renders blank/empty while its query resolves.
function TabSkeleton() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="wc-panel-card pad" style={{ display: "grid", gap: 12 }}>
        <Skeleton h={18} w="38%" />
        <Skeleton /><Skeleton w="82%" /><Skeleton w="64%" />
      </div>
      <div className="wc-panel-card pad" style={{ display: "grid", gap: 12 }}>
        <Skeleton h={14} w="30%" />
        <Skeleton /><Skeleton w="74%" /><Skeleton w="50%" />
      </div>
    </div>
  );
}

// Sub-tab state backed by the URL (?sub=) so switching a sub-tab updates the
// URL and is remembered on reload / back-forward. Falls back to `def` when the
// current ?sub doesn't belong to this tab (the parent clears ?sub on a main-tab
// switch, so sub values never leak across tabs).
function useSubTab(allowed: string[], def: string): [string, (s: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("sub");
  const cur = raw && allowed.includes(raw) ? raw : def;
  const set = (s: string) => {
    const p = new URLSearchParams(params);
    p.set("sub", s);
    setParams(p);
  };
  return [cur, set];
}

function AcOverviewTab({ go }: { go: GoFn }) {
  const orgId = localStorage.getItem("org_id") || "";
  const { data: kpis, isPending: kpisLoading } = useQuery({ queryKey: ["ai-kpis", orgId], queryFn: () => fetchAiKpis(orgId) as Promise<AiKpis>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const { data: next } = useQuery({ queryKey: ["ai-next-steps", orgId], queryFn: () => fetchAiNextSteps(orgId) as Promise<NextStepsData>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const { data: act } = useQuery({ queryKey: ["ai-activity-overview", orgId], queryFn: () => fetchAiActivityLog(orgId, { limit: 8 }) as Promise<{ events: ActivityEvent[] }>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });

  const stages: { icon: string; label: string; value: number; color: string }[] = [
    { icon: "flame", label: "Hot Leads", value: kpis?.hot_leads ?? 0, color: "#DC2626" },
    { icon: "checkCircle", label: "Qualified", value: kpis?.qualified_leads ?? 0, color: "#2563EB" },
    { icon: "calendarCheck", label: "Appointments", value: kpis?.appointments_set ?? 0, color: "#F97316" },
    { icon: "star", label: "New Leads", value: kpis?.new_leads ?? 0, color: "#7C3AED" },
    { icon: "user", label: "Buyers", value: kpis?.buyers_count ?? 0, color: "#16A34A" },
    { icon: "home", label: "Sellers", value: kpis?.sellers_count ?? 0, color: "#94A3B8" },
  ];
  const priority = next?.items ?? [];
  const summary = next?.summary;
  const feed = act?.events ?? [];
  const updated = feed.filter((f) => ["lead.updated", "lead.qualified", "deal.updated", "appointment.proposed"].includes(f.event)).slice(0, 6);

  if (kpisLoading) return <TabSkeleton />;
  return (
    <div className="wc-ov">
      <div className="wc-ac-sec"><span className="wc-ac-sec-ic" style={{ color: "#0EA5E9", background: "#E0F2FE" }}><Icon name="barChart" size={15} /></span>AI Pipeline Intelligence</div>
      <div className="wc-ov-stages">
        {stages.map((st) => (
          <button className="wc-ov-stage" key={st.label} onClick={() => go("leads")}>
            <span className="wc-ov-stage-ic" style={{ color: st.color, background: st.color + "1a" }}><Icon name={st.icon} size={16} /></span>
            <div className="wc-ov-stage-tx"><span className="wc-ov-stage-v wc-mono">{st.value}</span><span className="wc-ov-stage-l">{st.label}</span></div>
          </button>
        ))}
      </div>

      <div className="wc-ac-grid2" style={{ marginTop: 22 }}>
        <div className="wc-panel-card">
          <div className="wc-card-head"><div className="wc-card-h2">Today's Priority Queue</div><button className="wc-linkbtn" onClick={() => go("inbox")}>View all</button></div>
          <div className="wc-ac-pqlist">
            {priority.map((p) => {
              const t = p.intent === "hot" ? { fg: "#DC2626", bg: "#FEE2E2" } : { fg: "#2563EB", bg: "#EAF1FE" };
              return (
                <div className="wc-ov-pq" key={p.lead_id}>
                  <div className="wc-ov-pq-top"><span className="wc-ov-pq-name">{p.name}</span><span className="wc-cbadge" style={{ color: t.fg, background: t.bg }}>{p.intent === "hot" ? "Hot" : (p.lead_type || "Lead")}</span></div>
                  <div className="wc-ov-pq-reason">{p.action}{p.area ? ` · ${p.area}` : ""}{p.score != null ? ` · score ${p.score}` : ""}</div>
                  <div className="wc-ov-pq-acts">
                    <button className="wc-primary wc-sm" onClick={() => go("inbox")}><Icon name="message" size={13} />Open</button>
                    <button className="wc-ghostbtn wc-sm" onClick={() => go("calls")}><Icon name="phone" size={13} />Call</button>
                    <button className="wc-ghostbtn wc-sm" onClick={() => go("leads")}><Icon name="user" size={13} />Lead</button>
                  </div>
                </div>
              );
            })}
            {priority.length === 0 && <div className="wc-task-empty" style={{ padding: 16 }}>No priorities yet - the AI surfaces leads here as they heat up.</div>}
          </div>
        </div>

        <div className="wc-ov-briefcol">
          <div className="wc-panel-card pad wc-ac-brief">
            <div className="wc-ac-brief-h"><Icon name="sparkles" size={14} />AI Daily Brief</div>
            <p className="wc-ov-brieftext">Your AI is on it: <strong>{kpis?.hot_leads ?? 0} hot leads</strong>, <strong>{kpis?.appointments_set ?? 0} appointments</strong>, <strong>{kpis?.qualified_leads ?? 0} qualified</strong>, and <strong>${(kpis?.pipeline_value ?? 0).toLocaleString("en-US")}</strong> in pipeline.</p>
            <div className="wc-ov-brieflist">
              {summary && [
                `${summary.hot_need_response} hot leads need a response`,
                `${summary.ready_to_book} ready to book`,
                `${summary.nurturing} being nurtured`,
                `${summary.missing_info} need more info`,
              ].map((b, i) => <div className="wc-ov-briefrow" key={i}><Icon name="check" size={13} />{b}</div>)}
            </div>
          </div>
          <div className="wc-panel-card pad">
            <div className="wc-card-h2 sm" style={{ marginBottom: 10 }}>Jump back in</div>
            <div className="wc-ov-quick">
              <button className="wc-ov-qbtn" onClick={() => go("inbox")}><span className="wc-ov-qic" style={{ color: "#7C3AED", background: "#F2ECFE" }}><Icon name="message" size={15} /></span>Open inbox</button>
              <button className="wc-ov-qbtn" onClick={() => go("leads")}><span className="wc-ov-qic" style={{ color: "#DC2626", background: "#FEE2E2" }}><Icon name="flame" size={15} /></span>Review hot leads<span className="wc-ov-qcount">{kpis?.hot_leads ?? 0}</span></button>
              <button className="wc-ov-qbtn" onClick={() => go("calendar")}><span className="wc-ov-qic" style={{ color: "#0EA5E9", background: "#E0F2FE" }}><Icon name="calendarCheck" size={15} /></span>Appointments<span className="wc-ov-qcount">{kpis?.appointments_set ?? 0}</span></button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="wc-panel-card pad">
          <div className="wc-card-h2 sm" style={{ marginBottom: 14 }}><Icon name="sparkles" size={14} /> What AI Updated Today</div>
          <div className="wc-ov-updated">
            {updated.map((u) => { const m = eventMeta(u.event); return <div className="wc-ov-uprow" key={u.id}><span className="wc-ov-up-ic"><Icon name={m.icon} size={14} /></span>{m.label}{u.lead_label ? ` - ${u.lead_label}` : ""}</div>; })}
            {updated.length === 0 && <div className="wc-band-d">No CRM updates yet today.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ActionReady { lead_id: number; name: string; intent: string | null; score: number | null; status: string | null; action: string | null }
interface ActionUrgent { escalation_id: number; lead_id: number; name: string; reason: string; level: number }
interface ActionOpp { lead_id: number; name: string; action: string | null; score: number | null }
interface ActionCenterData {
  ready: ActionReady[]; urgent: ActionUrgent[]; opportunities: ActionOpp[];
  counts: { ready: number; urgent: number; opportunities: number };
}


function PersonaChips({ options, value, onChange, multi }: { options: string[]; value: string | string[]; onChange: (v: string | string[]) => void; multi?: boolean }) {
  const sel: string[] = Array.isArray(value) ? value : [value];
  const toggle = (o: string) => {
    if (multi && Array.isArray(value)) onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
    else onChange(o);
  };
  return (
    <div className="wc-pchips">
      {options.map((o) => <button key={o} className={"wc-pchip" + (sel.includes(o) ? " is-on" : "")} onClick={() => toggle(o)}>{multi && <span className={"wc-pchk" + (sel.includes(o) ? " is-on" : "")}>{sel.includes(o) && <Icon name="check" size={10} />}</span>}{o}</button>)}
    </div>
  );
}

function PField({ label, value, onChange, max = AI_LIMITS.profileShort }: { label: string; value: string; onChange?: (v: string) => void; max?: number }) {
  return (
    <div className="wc-pfield">
      <label>{label}</label>
      <input className="wc-modal-input" value={value} readOnly={!onChange} maxLength={max} onChange={(e) => onChange?.(e.target.value)} />
      {onChange && <div style={{ fontSize: 10.5, color: value.length >= max ? "#DC2626" : "var(--ink-3)", textAlign: "right", marginTop: 2 }}>{value.length}/{max}</div>}
    </div>
  );
}

interface AgentProfileData {
  agent_name?: string | null; brokerage_name?: string | null; license_number?: string | null;
  phone?: string | null; email?: string | null; website?: string | null;
  service_areas?: string | null; years_experience?: number | string | null; languages?: string | null;
  avg_price_point?: string | null; calendar_link?: string | null; specialties?: string | null; persona_json?: string | null;
  buyer_commission?: string | null; seller_commission?: string | null; min_commission_rules?: string | null;
  current_listings?: string | null; past_sales?: string | null;
  preferred_lender?: string | null; preferred_title_escrow?: string | null;
}
function profileArr(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.map(String); } catch { /* */ }
  return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
}
function profileStr(raw: string | null | undefined): string {
  if (!raw) return "";
  try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.join(", "); } catch { /* */ }
  return String(raw);
}

function AcSettingsTab() {
  const qc = useQueryClient();
  const { data: profile, isPending: profileLoading } = useQuery({ queryKey: ["agent-profile"], queryFn: () => fetchAgentProfile() as Promise<AgentProfileData>, ...AI_QUERY_OPTS });
  const [sec, setSec] = useSubTab(["identity", "comm", "qualify", "behavior", "rules", "faqs", "training"], "identity");
  const [idy, setIdy] = useState({ agent_name: "", brokerage_name: "", phone: "", email: "", website: "", service_areas: "", years_experience: "", languages: "", avg_price_point: "", calendar_link: "", property_types: "", buyer_commission: "", seller_commission: "", min_commission_rules: "", current_listings: "", past_sales: "", preferred_lender: "", preferred_title_escrow: "" });
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [voice, setVoice] = useState("Warm & Professional");
  const [length, setLength] = useState("Short");
  const [emoji, setEmoji] = useState("Rarely");
  const [humor, setHumor] = useState("Light");
  const [timing, setTiming] = useState("Natural Delay (30 seconds)");
  const [qual, setQual] = useState("Balanced Qualification");
  const [goals, setGoals] = useState<string[]>(["Book Appointments", "Collect Information"]);
  const [persist, setPersist] = useState("High");
  const SECTIONS = [
    { k: "identity", label: "Identity", icon: "user" },
    { k: "comm", label: "Communication", icon: "message" },
    { k: "qualify", label: "Qualifications", icon: "check" },
    { k: "behavior", label: "Behavior", icon: "zap" },
    { k: "rules", label: "Rules", icon: "lock" },
    { k: "faqs", label: "FAQs", icon: "inbox" },
    { k: "training", label: "Training", icon: "sparkles" },
  ];
  const qualDesc = qual === "Aggressive Qualification" ? "Ask timeline, budget, financing, and motivation quickly." : qual === "Relationship First" ? "Build rapport before qualifying." : "Mix rapport with timely qualifying questions.";
  const persistDesc: Record<string, string> = { Low: "Follow up for 14 days", Medium: "Follow up for 30 days", High: "Follow up for 90 days", "Very High": "Long-term nurture until lead opts out" };

  useEffect(() => {
    if (!profile) return;
    setIdy({
      agent_name: profile.agent_name || "", brokerage_name: profile.brokerage_name || "",
      phone: profile.phone || "", email: profile.email || "",
      website: profile.website || "", service_areas: profileStr(profile.service_areas),
      years_experience: profile.years_experience != null ? String(profile.years_experience) : "",
      languages: profileStr(profile.languages), avg_price_point: profile.avg_price_point || "",
      calendar_link: profile.calendar_link || "", property_types: "",
      buyer_commission: profile.buyer_commission || "", seller_commission: profile.seller_commission || "",
      min_commission_rules: profile.min_commission_rules || "", current_listings: profile.current_listings || "",
      past_sales: profile.past_sales || "", preferred_lender: profile.preferred_lender || "",
      preferred_title_escrow: profile.preferred_title_escrow || "",
    });
    setSpecialties(profileArr(profile.specialties));
    if (profile.persona_json) {
      try {
        const pj = JSON.parse(profile.persona_json) as Record<string, unknown>;
        if (typeof pj.voice === "string") setVoice(pj.voice);
        if (typeof pj.length === "string") setLength(pj.length);
        if (typeof pj.emoji === "string") setEmoji(pj.emoji);
        if (typeof pj.humor === "string") setHumor(pj.humor);
        if (typeof pj.timing === "string") setTiming(pj.timing);
        if (typeof pj.qual === "string") setQual(pj.qual);
        if (Array.isArray(pj.goals)) setGoals(pj.goals.map(String));
        if (typeof pj.persist === "string") setPersist(pj.persist);
        if (typeof pj.property_types === "string") setIdy((p) => ({ ...p, property_types: pj.property_types as string }));
      } catch { /* keep defaults */ }
    }
  }, [profile]);

  const setField = (k: keyof typeof idy) => (v: string) => setIdy((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => updateAgentProfile({
      agent_name: idy.agent_name, brokerage_name: idy.brokerage_name,
      phone: idy.phone, email: idy.email, website: idy.website, service_areas: idy.service_areas,
      years_experience: idy.years_experience, languages: idy.languages, avg_price_point: idy.avg_price_point,
      calendar_link: idy.calendar_link, specialties,
      buyer_commission: idy.buyer_commission, seller_commission: idy.seller_commission,
      min_commission_rules: idy.min_commission_rules, current_listings: idy.current_listings,
      past_sales: idy.past_sales, preferred_lender: idy.preferred_lender,
      preferred_title_escrow: idy.preferred_title_escrow,
      persona_json: { voice, length, emoji, humor, timing, qual, goals, persist, property_types: idy.property_types },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agent-profile"] }); toast.success("AI profile saved"); },
  });

  if (profileLoading) return <TabSkeleton />;
  return (
    <div className="wc-persona2">
      <div className="wc-ac-autopilot" style={{ marginBottom: 16 }}>
        <span className="wc-ac-ap-ic"><Icon name="bot" size={15} /></span>
        <div className="wc-ac-ap-text"><strong>This is your AI's Knowledge Profile.</strong> WarmChats represents your business - it pulls from these fields and never guesses. Missing info? It asks the lead a safe follow-up or says you'll confirm.</div>
      </div>
      <div className="wc-psecnav">
        {SECTIONS.map((x) => <button key={x.k} className={"wc-psecbtn" + (sec === x.k ? " is-on" : "")} onClick={() => setSec(x.k)}><Icon name={x.icon} size={15} />{x.label}</button>)}
      </div>

      {sec === "identity" && (
        <div className="wc-ac-grid2">
          <div className="wc-panel-card pad">
            <div className="wc-card-h2 sm" style={{ marginBottom: 14 }}>Profile</div>
            <div className="wc-pgrid2">
              <PField label="Agent name" value={idy.agent_name} onChange={setField("agent_name")} />
              <PField label="Brokerage name" value={idy.brokerage_name} onChange={setField("brokerage_name")} />
              <PField label="Phone number" value={idy.phone} onChange={setField("phone")} />
              <PField label="Email" value={idy.email} onChange={setField("email")} />
              <PField label="Website" value={idy.website} onChange={setField("website")} />
            </div>
          </div>
          <div className="wc-panel-card pad">
            <div className="wc-card-h2 sm" style={{ marginBottom: 14 }}>Expertise</div>
            <div className="wc-pgrid2">
              <PField label="Service areas" value={idy.service_areas} onChange={setField("service_areas")} />
              <PField label="Property types" value={idy.property_types} onChange={setField("property_types")} />
              <PField label="Years of experience" value={idy.years_experience} onChange={setField("years_experience")} />
              <PField label="Languages spoken" value={idy.languages} onChange={setField("languages")} />
              <PField label="Average price point" value={idy.avg_price_point} onChange={setField("avg_price_point")} />
              <PField label="Booking link" value={idy.calendar_link} onChange={setField("calendar_link")} />
            </div>
            <div className="wc-pfield" style={{ marginTop: 12 }}><label>Specialties</label></div>
            <PersonaChips multi options={["Buyers", "Sellers", "Investors", "Luxury", "First-time buyers"]} value={specialties} onChange={(v) => setSpecialties(v as string[])} />
          </div>
          <div className="wc-panel-card pad">
            <div className="wc-card-h2 sm" style={{ marginBottom: 14 }}>Commission &amp; track record</div>
            <div className="wc-pgrid2">
              <PField label="Buyer commission" value={idy.buyer_commission} onChange={setField("buyer_commission")} />
              <PField label="Seller commission" value={idy.seller_commission} onChange={setField("seller_commission")} />
              <PField label="Current listings" value={idy.current_listings} onChange={setField("current_listings")} max={AI_LIMITS.profileLong} />
              <PField label="Past sales" value={idy.past_sales} onChange={setField("past_sales")} max={AI_LIMITS.profileLong} />
            </div>
            <div className="wc-pfield" style={{ marginTop: 12 }}>
              <label>Commission rules / minimums</label>
              <textarea className="wc-wz-msg" style={{ minHeight: 56 }} maxLength={AI_LIMITS.profileLong} value={idy.min_commission_rules} onChange={(e) => setField("min_commission_rules")(e.target.value)} />
              <div style={{ fontSize: 10.5, color: idy.min_commission_rules.length >= AI_LIMITS.profileLong ? "#DC2626" : "var(--ink-3)", textAlign: "right", marginTop: 2 }}>{idy.min_commission_rules.length}/{AI_LIMITS.profileLong}</div>
            </div>
          </div>
          <div className="wc-panel-card pad">
            <div className="wc-card-h2 sm" style={{ marginBottom: 14 }}>Preferred vendors</div>
            <div className="wc-pgrid2">
              <PField label="Preferred lender" value={idy.preferred_lender} onChange={setField("preferred_lender")} />
              <PField label="Preferred title / escrow" value={idy.preferred_title_escrow} onChange={setField("preferred_title_escrow")} />
            </div>
          </div>
        </div>
      )}

      {sec === "comm" && (
        <div className="wc-psecbody">
          <div className="wc-panel-card pad">
            <div className="wc-pblk"><div className="wc-card-h2 sm">Voice</div><PersonaChips options={["Friendly & Casual", "Warm & Professional", "Luxury & White Glove", "Direct & Concise", "Highly Consultative"]} value={voice} onChange={(v) => setVoice(v as string)} /></div>
            <div className="wc-pblk"><div className="wc-card-h2 sm">Message length</div><PersonaChips options={["Very Short", "Short", "Medium", "Detailed"]} value={length} onChange={(v) => setLength(v as string)} /></div>
            <div className="wc-pblk"><div className="wc-card-h2 sm">Emoji usage</div><PersonaChips options={["None", "Rarely", "Moderate", "Frequent"]} value={emoji} onChange={(v) => setEmoji(v as string)} /></div>
            <div className="wc-pblk"><div className="wc-card-h2 sm">Humor</div><PersonaChips options={["Never", "Light", "Moderate"]} value={humor} onChange={(v) => setHumor(v as string)} /></div>
            <div className="wc-pblk"><div className="wc-card-h2 sm">Response timing</div><PersonaChips options={["Immediate", "Natural Delay (30 seconds)", "Randomized Human-Like Timing"]} value={timing} onChange={(v) => setTiming(v as string)} /></div>
          </div>
        </div>
      )}

      {sec === "behavior" && (
        <div className="wc-psecbody">
          <div className="wc-panel-card pad">
            <div className="wc-pblk"><div className="wc-card-h2 sm">Qualification style</div><PersonaChips options={["Aggressive Qualification", "Balanced Qualification", "Relationship First"]} value={qual} onChange={(v) => setQual(v as string)} />
              <div className="wc-band-d" style={{ marginTop: 8 }}>{qualDesc}</div>
            </div>
            <div className="wc-pblk"><div className="wc-card-h2 sm">Lead goals</div><PersonaChips multi options={["Book Appointments", "Schedule Calls", "Collect Information", "Nurture Long-Term", "Seller Consultations"]} value={goals} onChange={(v) => setGoals(v as string[])} /></div>
            <div className="wc-pblk"><div className="wc-card-h2 sm">Follow-up persistence</div><PersonaChips options={["Low", "Medium", "High", "Very High"]} value={persist} onChange={(v) => setPersist(v as string)} />
              <div className="wc-band-d" style={{ marginTop: 8 }}>{persistDesc[persist]}</div>
            </div>
          </div>
        </div>
      )}

      {sec === "qualify" && <QualificationsSection />}

      {sec === "rules" && <RulesSection />}

      {sec === "faqs" && <FaqsSection />}

      {sec === "training" && <TrainingSection />}

      {(sec === "identity" || sec === "comm" || sec === "behavior") && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="wc-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            <Icon name="check" size={15} />{save.isPending ? "Saving..." : "Save AI profile"}
          </button>
        </div>
      )}
    </div>
  );
}

interface KbEntry { id: number; category: string; question: string | null; answer: string | null; source: string | null; enabled: boolean; position: number }
interface KbTestResult { reply: string; confidence: number; intent_tag: string; urgency: string }

// Training - the Test AI sandbox (moved here from its own tab). Message the AI
// like a lead would and see how it replies. The assembled system prompt below is
// a debug view, shown ONLY to the platform admin (jv@jovrealestate.com).
const ADMIN_EMAIL = "jv@jovrealestate.com";
function TrainingSection() {
  const orgId = localStorage.getItem("org_id") || "";
  const [testInput, setTestInput] = useState("");
  const [lastSent, setLastSent] = useState("");
  const [testResult, setTestResult] = useState<KbTestResult | null>(null);
  // AI operational metrics (moved here from the Overview tab): actions today,
  // requests + cost this month, errors in 24h. Data is already returned by
  // /api/ai/agents - no stub numbers.
  const { data: ops } = useQuery({ queryKey: ["ai-agents-ops", orgId], queryFn: () => fetchAiAgents() as Promise<AiAgentsData>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const actionsToday = (ops?.agents ?? []).reduce((s, a) => s + (a.activity_today || 0), 0);
  const errors24h = (ops?.agents ?? []).reduce((s, a) => s + (a.errors_24h || 0), 0);
  const opsStats: { icon: string; label: string; value: string; color: string }[] = [
    { icon: "zap", label: "AI actions today", value: String(actionsToday), color: "#2563EB" },
    { icon: "sparkles", label: "AI requests (mo)", value: String(ops?.ai_requests_month ?? 0), color: "#7C3AED" },
    { icon: "flame", label: "Errors (24h)", value: String(errors24h), color: errors24h > 0 ? "#DC2626" : "#94A3B8" },
    { icon: "dollar", label: "Est. cost (mo)", value: "$" + (ops?.ai_cost_month ?? 0).toFixed(2), color: "#16A34A" },
  ];
  const testChat = useMutation({
    mutationFn: (msg: string) => aiTestChat({ message: msg }) as unknown as Promise<KbTestResult>,
    onSuccess: (data, msg) => { setTestResult(data); setLastSent(msg); setTestInput(""); },
  });
  // The raw system prompt is admin-only - gate both the fetch and the UI on it.
  const { data: me } = useQuery({ queryKey: ["me_bootstrap"], queryFn: () => fetchMeBootstrap() });
  const isAdmin = (me?.profile?.email as string | undefined) === ADMIN_EMAIL;
  const { data: promptData, isPending: promptLoading } = useQuery({
    queryKey: ["agent-system-prompt", "inbound"],
    queryFn: () => fetchAgentSystemPrompt("inbound") as Promise<{ prompt: string }>,
    enabled: isAdmin,
    ...AI_QUERY_OPTS,
  });
  const promptTxt = promptData?.prompt || "";
  const tokens = Math.ceil(promptTxt.length / 4); // ~4 chars/token (GPT-style estimate)
  const big = tokens > 4096;

  return (
    <div>
      <div className="wc-ac-grid2">
        <div className="wc-panel-card pad">
          <div className="wc-card-h2 sm" style={{ marginBottom: 12 }}>Test your AI</div>
          <div className="wc-band-d" style={{ marginBottom: 12 }}>Message it like a lead would - it replies using your real profile, persona, and FAQs.</div>
          <textarea className="wc-wz-msg" style={{ minHeight: 90 }} placeholder="e.g. What areas do you cover? I'm looking around $500k." value={testInput} onChange={(e) => setTestInput(e.target.value)} />
          <div className="wc-kt-tests" style={{ marginTop: 10 }}>
            {["What areas do you cover?", "Are you available this week?", "What's your commission?"].map((q) => <button key={q} className="wc-kt-testq" onClick={() => setTestInput(q)}>{q}</button>)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="wc-primary wc-sm" disabled={!testInput.trim() || testChat.isPending} onClick={() => testChat.mutate(testInput.trim())}><Icon name="sparkles" size={14} />{testChat.isPending ? "Thinking..." : "Send to AI"}</button>
          </div>
        </div>
        <div className="wc-panel-card pad">
          <div className="wc-pcomp-lbl">Your message</div>
          <div className="wc-pcomp-bub" style={{ marginBottom: 12 }}>{lastSent || "Send a message to see how the AI replies."}</div>
          <div className="wc-pcomp-lbl" style={{ color: "var(--accent-strong)" }}>AI response</div>
          <div className="wc-pcomp-bub is-ai">{testResult?.reply || "..."}</div>
          {testResult && (
            <div className="wc-kt-testmeta">
              <span><span className="wc-band-d">Intent</span> {testResult.intent_tag}</span>
              <span><span className="wc-band-d">Urgency</span> {testResult.urgency}</span>
              <span><span className="wc-band-d">Confidence</span> <b className="wc-mono" style={{ color: testResult.confidence >= 80 ? "#16A34A" : "#EA580C" }}>{testResult.confidence}%</b></span>
            </div>
          )}
        </div>
      </div>

      <div className="wc-ac-sec" style={{ marginTop: 18 }}><span className="wc-ac-sec-ic" style={{ color: "#2563EB", background: "#EAF1FE" }}><Icon name="zap" size={15} /></span>AI Operations</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 560 }}>
        {opsStats.map((st) => (
          <div className="wc-ov-stage" key={st.label} style={{ cursor: "default" }}>
            <span className="wc-ov-stage-ic" style={{ color: st.color, background: st.color + "1a" }}><Icon name={st.icon} size={16} /></span>
            <div className="wc-ov-stage-tx"><span className="wc-ov-stage-v wc-mono">{st.value}</span><span className="wc-ov-stage-l">{st.label}</span></div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="wc-panel-card pad" style={{ marginTop: 14 }}>
          <div className="wc-card-h2 sm" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>AI system prompt
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "#DC2626", background: "#FEE2E2", padding: "2px 8px", borderRadius: 999 }}><Icon name="lock" size={11} />Admin only</span>
          </div>
          <div className="wc-band-d" style={{ marginBottom: 10 }}>Exactly what the inbound agent is told - base rules + role + your knowledge profile, persona, FAQs, and guardrails. Only visible to the platform admin.</div>
          {!promptLoading && promptTxt && (
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", fontSize: 12, fontWeight: 600, margin: "0 0 10px" }}>
              <span style={{ color: big ? "#DC2626" : "rgb(249 115 22)" }}>~{tokens.toLocaleString()} tokens</span>
              <span style={{ color: "var(--ink-3)" }}>{promptTxt.length.toLocaleString()} characters</span>
              <span style={{ color: "var(--ink-3)" }}>{promptTxt.trim().split(/\s+/).length.toLocaleString()} words</span>
              {big && <span style={{ color: "#DC2626" }}>- large prompt, trim knowledge/rules to keep it lean</span>}
            </div>
          )}
          <pre className="wc-pcomp-bub" style={{ whiteSpace: "pre-wrap", maxHeight: "60vh", overflowY: "auto", fontFamily: "ui-monospace, monospace", fontSize: 12.5, lineHeight: 1.5 }}>{promptLoading ? "Loading..." : (promptTxt || "Could not load the prompt.")}</pre>
        </div>
      )}
    </div>
  );
}

// Small add-input row used under the original Always-mention / Never-say chip
// lists (the chips keep their is-ok / is-bad design; this just adds an "add"
// affordance, since the original UI was view+remove only).
function AddRow({ onAdd, placeholder }: { onAdd: (v: string) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  const submit = () => { if (input.trim()) { onAdd(input); setInput(""); } };
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <input className="wc-modal-input" placeholder={placeholder} maxLength={AI_LIMITS.ruleItem} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />
      <button className="wc-ghostbtn wc-sm" disabled={!input.trim()} onClick={submit}><Icon name="plus" size={13} />Add</button>
    </div>
  );
}

// Rules - brand + escalation rules (always_say / never_say / escalation_keywords
// / escalate_no_listings), persisted to auto_response_settings via /api/ai/rules.
// Moved out of the old Knowledge Base into AI Settings. Always/Never are chip
// lists (add + remove-with-confirm); Escalate is a predefined checklist plus
// custom phrases.
const ESC_OPTIONS = [
  "Wants to buy now", "Wants to sell now", "Requests phone call", "Requests showing",
  "Wants listing appointment", "Wants to make an offer", "Lead is upset",
  "Commission questions", "Financing questions", "Legal or compliance questions",
  "Contract questions", "Negotiation questions", "AI confidence is low",
];
function RulesSection() {
  const qc = useQueryClient();
  const { data: rulesData } = useQuery({
    queryKey: ["ai-rules"],
    queryFn: () => fetchAiRules() as Promise<{ always_say: string[]; never_say: string[]; escalation_keywords: string[]; escalate_no_listings: boolean }>,
    ...AI_QUERY_OPTS,
  });
  const saveRules = useMutation({
    mutationFn: (d: Partial<{ always_say: string[]; never_say: string[]; escalation_keywords: string[]; escalate_no_listings: boolean }>) => updateAiRules(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-rules"] }),
  });
  const noListingsEscalate = rulesData?.escalate_no_listings ?? true;
  type RuleField = "always_say" | "never_say" | "escalation_keywords";
  const ruleList = (f: RuleField): string[] => rulesData?.[f] ?? [];
  const addRule = (f: RuleField, value: string) => {
    const v = value.trim();
    if (!v) return;
    const cur = ruleList(f);
    if (cur.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    saveRules.mutate({ [f]: [...cur, v] });
  };
  // Removal uses a UI confirm modal (no browser confirm()).
  const [pendingRemove, setPendingRemove] = useState<{ field: RuleField; value: string } | null>(null);
  const removeRule = (f: RuleField, value: string) => setPendingRemove({ field: f, value });
  const confirmRemove = () => {
    if (!pendingRemove) return;
    saveRules.mutate({ [pendingRemove.field]: ruleList(pendingRemove.field).filter((x) => x !== pendingRemove.value) });
    setPendingRemove(null);
  };
  // Escalation checklist helpers: a predefined option is "on" when it's in
  // escalation_keywords; toggling adds/removes it (no confirm - it's a toggle).
  const escSelected = (o: string) => ruleList("escalation_keywords").some((x) => x.toLowerCase() === o.toLowerCase());
  const toggleEscOption = (o: string) => {
    const cur = ruleList("escalation_keywords");
    saveRules.mutate({ escalation_keywords: escSelected(o) ? cur.filter((x) => x.toLowerCase() !== o.toLowerCase()) : [...cur, o] });
  };
  const customEsc = ruleList("escalation_keywords").filter((k) => !ESC_OPTIONS.some((o) => o.toLowerCase() === k.toLowerCase()));

  return (
    <div>
      <div className="wc-ac-grid2">
        <div className="wc-panel-card pad">
          <div className="wc-card-h2 sm" style={{ marginBottom: 10 }}>Always mention</div>
          <div className="wc-ptags">
            {ruleList("always_say").map((a) => <span className="wc-ptag is-ok" key={a}>{a}<button onClick={() => removeRule("always_say", a)} title="Remove"><Icon name="x" size={11} /></button></span>)}
            {ruleList("always_say").length === 0 && <span className="wc-band-d">None yet.</span>}
          </div>
          <AddRow onAdd={(v) => addRule("always_say", v)} placeholder="e.g. Free home valuation" />
          <div className="wc-card-h2 sm" style={{ margin: "18px 0 10px" }}>Never say</div>
          <div className="wc-ptags">
            {ruleList("never_say").map((a) => <span className="wc-ptag is-bad" key={a}>{a}<button onClick={() => removeRule("never_say", a)} title="Remove"><Icon name="x" size={11} /></button></span>)}
            {ruleList("never_say").length === 0 && <span className="wc-band-d">None yet.</span>}
          </div>
          <AddRow onAdd={(v) => addRule("never_say", v)} placeholder="e.g. Guaranteed results" />
          <div className="wc-band-d" style={{ marginTop: 14 }}>These shape every AI reply. Fair Housing is always enforced automatically.</div>
        </div>
        <div className="wc-panel-card pad">
          <div className="wc-card-h2 sm" style={{ marginBottom: 6 }}>Escalate to agent when</div>
          <div className="wc-band-d" style={{ marginBottom: 12 }}>If an incoming message matches one of these, the AI hands the lead off to you (flags the lead and notifies you so you can take over).</div>
          <div className="wc-notlist">
            {ESC_OPTIONS.map((o) => {
              const on = escSelected(o);
              return <button key={o} className="wc-escrow" onClick={() => toggleEscOption(o)}><span className={"wc-pchk" + (on ? " is-on" : "")}>{on && <Icon name="check" size={11} />}</span>{o}</button>;
            })}
          </div>
          {customEsc.length > 0 && (
            <div className="wc-ptags" style={{ marginTop: 12 }}>
              {customEsc.map((k) => <span className="wc-ptag" key={k}>{k}<button onClick={() => removeRule("escalation_keywords", k)} title="Remove"><Icon name="x" size={11} /></button></span>)}
            </div>
          )}
          <AddRow onAdd={(v) => addRule("escalation_keywords", v)} placeholder="Add a custom phrase, e.g. call me" />
          <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <button className="wc-escrow" onClick={() => saveRules.mutate({ escalate_no_listings: !noListingsEscalate })}>
              <span className={"wc-pchk" + (noListingsEscalate ? " is-on" : "")}>{noListingsEscalate && <Icon name="check" size={11} />}</span>
              No listings loaded - escalate when listings or pricing come up
            </button>
            <div className="wc-band-d" style={{ marginTop: 6 }}>On by default. When you have no property inventory, the AI will not search or quote prices - it hands the lead to you the moment they ask about specific homes or pricing.</div>
          </div>
        </div>
      </div>

      {pendingRemove && (
        <Wcv2Portal>
          <div className="wc-modal-scrim" onClick={() => setPendingRemove(null)}>
            <div className="wc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="wc-card-h2" style={{ marginBottom: 8 }}>Remove this rule?</div>
              <div className="wc-band-d" style={{ marginBottom: 18 }}>
                Remove <strong>{pendingRemove.value}</strong> from {pendingRemove.field === "always_say" ? "Always mention" : pendingRemove.field === "never_say" ? "Never say" : "escalation triggers"}? The AI will stop using it.
              </div>
              <div className="wc-modal-foot">
                <button className="wc-ghostbtn" onClick={() => setPendingRemove(null)}>Cancel</button>
                <button className="wc-primary" onClick={confirmRemove}><Icon name="trash" size={14} />Remove</button>
              </div>
            </div>
          </div>
        </Wcv2Portal>
      )}
    </div>
  );
}

// FAQs - one merged list of question/answer pairs the AI answers verbatim. The
// backend feeds EVERY enabled knowledge entry into the system prompt regardless
// of category, so the old buyer/seller/custom split is collapsed into a single
// list here (existing entries of any category still show); new ones are stored
// under "faq".
function FaqsSection() {
  const qc = useQueryClient();
  const { data: kbData, isPending } = useQuery({ queryKey: ["ai-knowledge"], queryFn: () => fetchAiKnowledge() as Promise<{ entries: KbEntry[] }>, ...AI_QUERY_OPTS });
  const entries = kbData?.entries ?? [];
  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editQ, setEditQ] = useState("");
  const [editA, setEditA] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
  const createKb = useMutation({
    mutationFn: () => createAiKnowledge({ category: "faq", question: newQ.trim(), answer: newA.trim() }),
    onSuccess: () => { invalidate(); setNewQ(""); setNewA(""); setAdding(false); },
  });
  const updateKb = useMutation({
    mutationFn: (v: { id: number; question: string; answer: string }) => updateAiKnowledge(v.id, { question: v.question.trim(), answer: v.answer.trim() }),
    onSuccess: () => { invalidate(); setEditId(null); },
  });
  const delKb = useMutation({ mutationFn: (id: number) => deleteAiKnowledge(id), onSuccess: () => invalidate() });
  const startEdit = (e: KbEntry) => { setEditId(e.id); setEditQ(e.question || ""); setEditA(e.answer || ""); setAdding(false); };
  const atMax = entries.length >= AI_LIMITS.faqMaxEntries;

  if (isPending) return <TabSkeleton />;
  return (
    <div className="wc-panel-card pad">
      <div className="wc-card-head tight">
        <div>
          <div className="wc-card-h2 sm">Frequently Asked Questions</div>
          <div className="wc-band-d" style={{ marginTop: 2 }}>Your AI answers these instantly in the exact words you approve.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: atMax ? "#DC2626" : "var(--ink-3)" }}>{entries.length}/{AI_LIMITS.faqMaxEntries}</span>
          <button className="wc-primary wc-sm" disabled={atMax} onClick={() => { setAdding((a) => !a); setEditId(null); }}><Icon name="plus" size={14} />Add FAQ</button>
        </div>
      </div>
      {atMax && <div className="wc-band-d" style={{ marginBottom: 10, color: "#DC2626" }}>You have reached the max of {AI_LIMITS.faqMaxEntries} FAQs. Delete some to add more.</div>}
      {adding && (
        <div className="wc-panel-card pad" style={{ marginBottom: 12, background: "linear-gradient(169deg, #f9731603, #f973160a)" }}>
          <div className="wc-modal-lbl">Question / topic</div>
          <input className="wc-modal-input" maxLength={AI_LIMITS.faqQuestion} placeholder="e.g. Do you help first-time buyers?" value={newQ} onChange={(e) => setNewQ(e.target.value)} />
          <div style={{ fontSize: 10.5, color: newQ.length >= AI_LIMITS.faqQuestion ? "#DC2626" : "var(--ink-3)", textAlign: "right", marginTop: 2 }}>{newQ.length}/{AI_LIMITS.faqQuestion}</div>
          <div className="wc-modal-lbl" style={{ marginTop: 10 }}>Answer the AI should give</div>
          <textarea className="wc-wz-msg" style={{ minHeight: 70 }} maxLength={AI_LIMITS.faqAnswer} value={newA} onChange={(e) => setNewA(e.target.value)} />
          <div style={{ fontSize: 10.5, color: newA.length >= AI_LIMITS.faqAnswer ? "#DC2626" : "var(--ink-3)", textAlign: "right", marginTop: 2 }}>{newA.length}/{AI_LIMITS.faqAnswer}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button className="wc-ghostbtn wc-sm" onClick={() => { setAdding(false); setNewQ(""); setNewA(""); }}>Cancel</button>
            <button className="wc-primary wc-sm" disabled={!newQ.trim() || !newA.trim() || createKb.isPending} onClick={() => createKb.mutate()}><Icon name="check" size={13} />Save FAQ</button>
          </div>
        </div>
      )}
      <div className="wc-kt-qa">
        {entries.map((c) => editId === c.id ? (
          <div className="wc-panel-card pad" key={c.id} style={{ marginBottom: 12, background: "linear-gradient(169deg, #f9731603, #f973160a)" }}>
            <div className="wc-modal-lbl">Question / topic</div>
            <input className="wc-modal-input" maxLength={AI_LIMITS.faqQuestion} value={editQ} onChange={(e) => setEditQ(e.target.value)} />
            <div className="wc-modal-lbl" style={{ marginTop: 10 }}>Answer the AI should give</div>
            <textarea className="wc-wz-msg" style={{ minHeight: 70 }} maxLength={AI_LIMITS.faqAnswer} value={editA} onChange={(e) => setEditA(e.target.value)} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <button className="wc-ghostbtn wc-sm wc-danger" disabled={delKb.isPending} onClick={() => delKb.mutate(c.id)}><Icon name="trash" size={13} />Delete</button>
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button className="wc-ghostbtn wc-sm" onClick={() => setEditId(null)}>Cancel</button>
                <button className="wc-primary wc-sm" disabled={!editA.trim() || updateKb.isPending} onClick={() => updateKb.mutate({ id: c.id, question: editQ, answer: editA })}><Icon name="check" size={13} />Save</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="wc-kt-qaitem" key={c.id}>
            <div className="wc-kt-q" style={{ alignItems: "flex-start" }}><Icon name="message" size={14} /><span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{c.question}</span><button className="wc-iconbtn-sm" style={{ marginLeft: "auto" }} title="Edit" onClick={() => startEdit(c)}><Icon name="pencil" size={13} /></button></div>
            <div className="wc-kt-a" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.answer}</div>
          </div>
        ))}
        {entries.length === 0 && <div className="wc-band-d">No FAQs yet. Add one so the AI can answer common questions accurately.</div>}
      </div>
    </div>
  );
}

// Lead-type qualification questions (AI Settings -> Qualifications). FAQ-style
// CRUD, but each row is a question the AI asks to qualify a lead, scoped to a
// lead type via applies_to. Injected into the inbound system prompt by
// buildAgentSystemPrompt so the agent asks the right questions, one at a time.
interface QualEntry { id: number; applies_to: string; question: string; guidance: string | null; enabled: boolean; position: number }
const QUAL_APPLIES: { value: string; label: string }[] = [
  { value: "all", label: "All leads" },
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "renter", label: "Renter" },
  { value: "open_house", label: "Open house" },
];
const qualLabel = (v: string) => QUAL_APPLIES.find((x) => x.value === v)?.label || "All leads";
// Badge colors mirror the Leads screen lead-type pills (leadTypePillClass:
// Buyer=sky, Seller=orange, Renter=cyan). Tailwind utilities no-op inside .wcv2,
// so these are the equivalent palette hex values applied inline.
const APPLIES_BADGE: Record<string, { bg: string; fg: string }> = {
  all: { bg: "#F3F4F6", fg: "#4B5563" },        // gray-100 / gray-600
  buyer: { bg: "#E0F2FE", fg: "#0369A1" },      // sky-100 / sky-700
  seller: { bg: "#FFEDD5", fg: "#C2410C" },     // orange-100 / orange-700
  renter: { bg: "#CFFAFE", fg: "#0E7490" },     // cyan-100 / cyan-700
  open_house: { bg: "#EDE9FE", fg: "#6D28D9" }, // violet-100 / violet-700
};
const appliesBadge = (v: string) => APPLIES_BADGE[v] || APPLIES_BADGE.all;

// The lead fields the AI can write via its update_lead tool (aiOrchestrator.ts).
// Shown as an in-tab guide so users know which variables their guidance can map
// answers to. Keep in sync with the update_lead tool's parameter list.
const SAVABLE_FIELDS: { name: string; desc: string }[] = [
  { name: "area", desc: "City, neighborhood, or ZIP they want" },
  { name: "price_range", desc: "Budget or target price" },
  { name: "timeline", desc: "How soon they plan to buy, sell, or move" },
  { name: "pre_approved", desc: "Whether they are pre-approved (yes / no)" },
  { name: "financing_status", desc: "Financing details - cash, lender, etc." },
  { name: "bedrooms", desc: "Number of bedrooms" },
  { name: "bathrooms", desc: "Number of bathrooms" },
  { name: "property_type", desc: "Single family, condo, townhouse, etc." },
  { name: "property_address", desc: "The property's address (sellers)" },
  { name: "occupancy_status", desc: "Owner-occupied, rented, or vacant" },
  { name: "motivation", desc: "Why they are buying or selling" },
  { name: "seller_price_expectations", desc: "What the seller hopes to get" },
];

function AppliesChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="wc-pchips">
      {QUAL_APPLIES.map((o) => <button key={o.value} type="button" className={"wc-pchip" + (value === o.value ? " is-on" : "")} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

function QualificationsSection() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["ai-qualifications"], queryFn: () => fetchAiQualifications() as Promise<{ entries: QualEntry[] }>, ...AI_QUERY_OPTS });
  const entries = data?.entries ?? [];
  const [adding, setAdding] = useState(false);
  const [newApplies, setNewApplies] = useState("all");
  const [newQ, setNewQ] = useState("");
  const [newG, setNewG] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editApplies, setEditApplies] = useState("all");
  const [editQ, setEditQ] = useState("");
  const [editG, setEditG] = useState("");
  const [showFields, setShowFields] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai-qualifications"] });
  const createQ = useMutation({
    mutationFn: () => createAiQualification({ applies_to: newApplies, question: newQ.trim(), guidance: newG.trim() }),
    onSuccess: () => { invalidate(); setNewQ(""); setNewG(""); setNewApplies("all"); setAdding(false); },
  });
  const updateQ = useMutation({
    mutationFn: (v: { id: number; applies_to: string; question: string; guidance: string }) => updateAiQualification(v.id, { applies_to: v.applies_to, question: v.question.trim(), guidance: v.guidance.trim() }),
    onSuccess: () => { invalidate(); setEditId(null); },
  });
  const delQ = useMutation({ mutationFn: (id: number) => deleteAiQualification(id), onSuccess: () => invalidate() });
  const startEdit = (e: QualEntry) => { setEditId(e.id); setEditApplies(e.applies_to || "all"); setEditQ(e.question || ""); setEditG(e.guidance || ""); setAdding(false); };
  const atMax = entries.length >= AI_LIMITS.qualificationMaxEntries;

  if (isPending) return <TabSkeleton />;
  return (
    <div className="wc-panel-card pad">
      <div className="wc-card-head tight">
        <div>
          <div className="wc-card-h2 sm">Qualification questions</div>
          <div className="wc-band-d" style={{ marginTop: 2 }}>Questions the AI asks to qualify a lead - one at a time, only the ones relevant to the lead's type.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: atMax ? "#DC2626" : "var(--ink-3)" }}>{entries.length}/{AI_LIMITS.qualificationMaxEntries}</span>
          <button className="wc-primary wc-sm" disabled={atMax} onClick={() => { setAdding((a) => !a); setEditId(null); }}><Icon name="plus" size={14} />Add question</button>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <button className="wc-ghostbtn wc-sm" onClick={() => setShowFields((s) => !s)}><Icon name={showFields ? "chevronDown" : "chevronRight"} size={13} />Which fields can the AI save to?</button>
        {showFields && (
          <div style={{ marginTop: 10, border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", background: "var(--surface-2, #FAFAFA)" }}>
            <div className="wc-band-d" style={{ marginBottom: 10 }}>In a question's guidance, tell the AI which of these lead fields to save the answer to (e.g. "Save the answer to price_range"). The AI writes them to the lead's CRM record as it learns them.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "8px 16px" }}>
              {SAVABLE_FIELDS.map((f) => (
                <div key={f.name} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700, color: "var(--accent-strong)" }}>{f.name}</code>
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{f.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {atMax && <div className="wc-band-d" style={{ marginBottom: 10, color: "#DC2626" }}>You have reached the max of {AI_LIMITS.qualificationMaxEntries} qualification questions. Delete some to add more.</div>}
      {adding && (
        <div className="wc-panel-card pad" style={{ marginBottom: 12, background: "linear-gradient(169deg, #f9731603, #f973160a)" }}>
          <div className="wc-modal-lbl">Applies to</div>
          <AppliesChips value={newApplies} onChange={setNewApplies} />
          <div className="wc-modal-lbl" style={{ marginTop: 10 }}>Question to ask</div>
          <input className="wc-modal-input" maxLength={AI_LIMITS.qualificationQuestion} placeholder="e.g. What price range are you hoping to stay around?" value={newQ} onChange={(e) => setNewQ(e.target.value)} />
          <div style={{ fontSize: 10.5, color: newQ.length >= AI_LIMITS.qualificationQuestion ? "#DC2626" : "var(--ink-3)", textAlign: "right", marginTop: 2 }}>{newQ.length}/{AI_LIMITS.qualificationQuestion}</div>
          <div className="wc-modal-lbl" style={{ marginTop: 10 }}>Guidance for the AI (optional)</div>
          <textarea className="wc-wz-msg" style={{ minHeight: 60 }} maxLength={AI_LIMITS.qualificationGuidance} placeholder="e.g. Save the answer to price_range (see the field list above)." value={newG} onChange={(e) => setNewG(e.target.value)} />
          <div style={{ fontSize: 10.5, color: newG.length >= AI_LIMITS.qualificationGuidance ? "#DC2626" : "var(--ink-3)", textAlign: "right", marginTop: 2 }}>{newG.length}/{AI_LIMITS.qualificationGuidance}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button className="wc-ghostbtn wc-sm" onClick={() => { setAdding(false); setNewQ(""); setNewG(""); setNewApplies("all"); }}>Cancel</button>
            <button className="wc-primary wc-sm" disabled={!newQ.trim() || createQ.isPending} onClick={() => createQ.mutate()}><Icon name="check" size={13} />Save question</button>
          </div>
        </div>
      )}
      <div className="wc-kt-qa">
        {entries.map((c) => editId === c.id ? (
          <div className="wc-panel-card pad" key={c.id} style={{ marginBottom: 12, background: "linear-gradient(169deg, #f9731603, #f973160a)" }}>
            <div className="wc-modal-lbl">Applies to</div>
            <AppliesChips value={editApplies} onChange={setEditApplies} />
            <div className="wc-modal-lbl" style={{ marginTop: 10 }}>Question to ask</div>
            <input className="wc-modal-input" maxLength={AI_LIMITS.qualificationQuestion} value={editQ} onChange={(e) => setEditQ(e.target.value)} />
            <div className="wc-modal-lbl" style={{ marginTop: 10 }}>Guidance for the AI (optional)</div>
            <textarea className="wc-wz-msg" style={{ minHeight: 60 }} maxLength={AI_LIMITS.qualificationGuidance} value={editG} onChange={(e) => setEditG(e.target.value)} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <button className="wc-ghostbtn wc-sm wc-danger" disabled={delQ.isPending} onClick={() => delQ.mutate(c.id)}><Icon name="trash" size={13} />Delete</button>
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button className="wc-ghostbtn wc-sm" onClick={() => setEditId(null)}>Cancel</button>
                <button className="wc-primary wc-sm" disabled={!editQ.trim() || updateQ.isPending} onClick={() => updateQ.mutate({ id: c.id, applies_to: editApplies, question: editQ, guidance: editG })}><Icon name="check" size={13} />Save</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="wc-kt-qaitem" key={c.id}>
            <div className="wc-kt-q" style={{ alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: appliesBadge(c.applies_to).bg, color: appliesBadge(c.applies_to).fg }}>{qualLabel(c.applies_to)}</span>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{c.question}</span>
              <button className="wc-iconbtn-sm" style={{ marginLeft: "auto" }} title="Edit" onClick={() => startEdit(c)}><Icon name="pencil" size={13} /></button>
            </div>
            {c.guidance && <div className="wc-kt-a" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.guidance}</div>}
          </div>
        ))}
        {entries.length === 0 && <div className="wc-band-d">No qualification questions yet. Add one so the AI knows what to ask buyers, sellers, and renters.</div>}
      </div>
    </div>
  );
}

const EVENT_CATEGORY: Record<string, string> = {
  "reply.sent": "Conversations", "message.sent": "Conversations", "message.failed": "Alerts",
  "lead.qualified": "Qualifications", "lead.booking_ready": "Appointments", "appointment.proposed": "Appointments",
  "lead.updated": "CRM Updates", "deal.updated": "CRM Updates", "task.created": "Tasks",
  "lead.escalated": "Alerts", "escalation.advanced": "Alerts",
};

function AcActivityTab({ go }: { go: GoFn }) {
  const orgId = localStorage.getItem("org_id") || "";
  const filters = ["All Activity", "Conversations", "Qualifications", "Appointments", "CRM Updates", "Tasks", "Alerts"];
  const [filter, setFilter] = useSubTab(filters, "All Activity");
  const { data: kpis } = useQuery({ queryKey: ["ai-kpis", orgId], queryFn: () => fetchAiKpis(orgId) as Promise<AiKpis>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const { data: act, isPending: actLoading } = useQuery({ queryKey: ["ai-activity-feed", orgId], queryFn: () => fetchAiActivityLog(orgId, { limit: 40 }) as Promise<{ events: ActivityEvent[] }>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const { data: action } = useQuery({ queryKey: ["ai-action-center", orgId], queryFn: () => fetchAiActionCenter(orgId) as Promise<ActionCenterData>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const { data: next } = useQuery({ queryKey: ["ai-next-steps", orgId], queryFn: () => fetchAiNextSteps(orgId) as Promise<NextStepsData>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });

  const feed = act?.events ?? [];
  const visible = feed.filter((f) => filter === "All Activity" ? true : (EVENT_CATEGORY[f.event] || "") === filter);
  const needs = action?.urgent ?? [];
  const tasks = next?.items ?? [];
  const convs = feed.filter((f) => f.event === "reply.sent" || f.event === "message.sent").length;

  const kbox = [
    { icon: "message", label: "Conversations", value: convs, tone: "blue" },
    { icon: "flame", label: "Hot Leads", value: kpis?.hot_leads ?? 0, tone: "orange" },
    { icon: "calendarCheck", label: "Appointments", value: kpis?.appointments_set ?? 0, tone: "violet" },
    { icon: "check", label: "Qualified", value: kpis?.qualified_leads ?? 0, tone: "green" },
  ];
  const summary = [
    { icon: "message", v: convs, l: "Conversations" }, { icon: "flame", v: kpis?.hot_leads ?? 0, l: "Hot Leads" },
    { icon: "calendarCheck", v: kpis?.appointments_set ?? 0, l: "Appointments" }, { icon: "target", v: kpis?.qualified_leads ?? 0, l: "Qualified" },
  ];

  if (actLoading) return <TabSkeleton />;
  return (
    <div className="wc-actf">
      <div className="wc-aac-kpis" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        {kbox.map((k) => { const t = AC_TT[k.tone] ?? TONE_FALLBACK; return (
          <div className="wc-aac-kpi" key={k.label}><span className="wc-aac-kpi-ic" style={{ color: t.fg, background: t.bg }}><Icon name={k.icon} size={16} /></span><div><div className="wc-aac-kpi-v wc-mono">{k.value}</div><div className="wc-aac-kpi-l">{k.label}</div></div></div>
        ); })}
      </div>

      <div className="wc-ac-grid2">
        <div>
          <div className="wc-ac-sec"><span className="wc-ac-sec-ic" style={{ color: "#DC2626", background: "#FEE2E2" }}><Icon name="flame" size={15} /></span>Needs Attention<span className="wc-ac-sec-c">{needs.length} urgent</span></div>
          <div className="wc-panel-card">
            {needs.map((n) => (
              <div className="wc-mir" key={n.escalation_id}>
                <span className="wc-need-icon" style={{ background: "#FEE2E2", color: "#DC2626" }}><Icon name="flame" size={16} /><span className="wc-need-flag" /></span>
                <div className="wc-mir-body"><div className="wc-mir-top"><span className="wc-mir-name">{n.reason}</span><span className="wc-urgent">LEVEL {n.level}</span></div><div className="wc-mir-meta">{n.name}</div></div>
                <button className="wc-primary wc-sm" onClick={() => go("inbox")}>Open</button>
              </div>
            ))}
            {needs.length === 0 && <div className="wc-task-empty" style={{ padding: 18 }}>Nothing urgent right now.</div>}
          </div>

          <div className="wc-ac-sec" style={{ marginTop: 22 }}><span className="wc-ac-sec-ic" style={{ color: "#2563EB", background: "#EAF1FE" }}><Icon name="zap" size={15} /></span>AI Activity</div>
          <div className="wc-actf-filters">
            {filters.map((f) => <button key={f} className={"wc-taskfilter" + (filter === f ? " is-on" : "")} onClick={() => setFilter(f)}>{f}</button>)}
          </div>
          <div className="wc-panel-card">
            <div className="wc-actf-feed">
              {visible.map((f) => { const m = eventMeta(f.event); const t = AC_TT[m.tone] ?? TONE_FALLBACK; const bad = f.status === "error" || f.status === "warn"; return (
                <div className="wc-actf-row" key={f.id} title={f.detail || ""}>
                  <span className="wc-actf-ic" style={{ color: t.fg, background: t.bg }}><Icon name={m.icon} size={14} /></span>
                  <div className="wc-actf-b">
                    <div className="wc-actf-top"><span className="wc-actf-text">{m.label}</span><span className="wc-actf-time">{timeAgo(f.created_at)}</span></div>
                    <div className="wc-actf-who">
                      {f.lead_label ? <span>{f.lead_label}</span> : null}
                      {f.detail ? <span style={bad ? { color: t.fg } : undefined}>{f.lead_label ? " · " : ""}{f.detail.slice(0, 120)}</span> : null}
                    </div>
                  </div>
                </div>
              ); })}
              {visible.length === 0 && <div className="wc-task-empty">No activity in this filter.</div>}
            </div>
          </div>
        </div>

        <div>
          <div className="wc-panel-card pad">
            <div className="wc-card-h2 sm" style={{ marginBottom: 12 }}>AI Summary &middot; Today</div>
            <div className="wc-actf-summary">
              {summary.map((s) => <div className="wc-actf-sumrow" key={s.l}><Icon name={s.icon} size={15} /><span className="wc-mono wc-actf-sumv">{s.v}</span><span className="wc-actf-suml">{s.l}</span></div>)}
            </div>
          </div>
          <div className="wc-panel-card pad" style={{ marginTop: 14 }}>
            <div className="wc-card-h2 sm" style={{ marginBottom: 12 }}>AI Tasks</div>
            <div className="wc-actf-tasks">
              {tasks.map((t) => <button className="wc-actf-task" key={t.lead_id} onClick={() => go("tasks")}><span className="wc-check" /><span>{t.action} - {t.name}</span></button>)}
              {tasks.length === 0 && <div className="wc-band-d">No AI tasks yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// True only on a desktop-class pointer (fine pointer + wide viewport). The
// animated robot mascot tracks the mouse, so it is mounted only here; touch /
// narrow screens fall back to the static bot icon.
function useIsDesktop(): boolean {
  const query = "(min-width: 761px) and (pointer: fine)";
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

// Re-render once a minute so the quiet-hours boundary (e.g. 9pm) flips the robot
// to sleeping without needing a page refresh.
function useMinuteTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

// Current hour (0-23) in the given IANA zone; falls back to the browser hour
// when the zone is missing or invalid. Used so the hero robot sleeps on the
// account's clock, matching the org-timezone quiet-hours guard on the backend.
function orgHourNow(timezone: string | null | undefined): number {
  if (timezone) {
    try {
      const h = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(new Date());
      const n = parseInt(h, 10);
      // Intl can return "24" for midnight in hour12:false - normalize to 0.
      if (Number.isFinite(n)) return n % 24;
    } catch {
      // invalid zone - fall through to browser-local hour
    }
  }
  return new Date().getHours();
}

export function AgentPage({ go }: { go: GoFn }) {
  // Each command-center tab is its own URL (?tab=...) so it is shareable and
  // back/forward works - but the page component stays mounted, so switching
  // tabs never remounts or refetches everything (React Query cache persists).
  const [searchParams, setSearchParams] = useSearchParams();
  const [howOpen, setHowOpen] = useState(false);
  const tab = searchParams.get("tab") || "overview";
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", t);
    p.delete("sub"); // leaving inbound/outbound clears the per-agent sub-tab
    setSearchParams(p, { replace: true });
  };
  // Global master switch (3-level control - top layer). Reflects + drives
  // app_settings.ai_master_enabled; turning it off pauses every agent.
  const qc = useQueryClient();
  const orgId = localStorage.getItem("org_id") || "";
  // Load every tab's data once on page entry; switching tabs reuses the cache
  // (AI_QUERY_OPTS) and the Refresh button is the only thing that reloads it.
  useAiCommandCenterData(orgId);
  const { data: settings, isLoading: settingsLoading } = useQuery({ queryKey: ["ai-settings"], queryFn: () => fetchAiSettings() as Promise<{ master_enabled: boolean }>, ...AI_QUERY_OPTS });
  const masterOn = settings?.master_enabled ?? false;
  // "What the AI did today" for the autopilot banner - distinct leads per
  // category, aggregated SERVER-SIDE (rides on the same real KPI endpoint as the
  // Daily Brief, so it is accurate at any volume; the activity-log list endpoint
  // caps at 100 rows and would undercount a busy day). Shares the ["ai-kpis"]
  // cache with the Overview tab, so this adds no extra request.
  const { data: apKpis, isLoading: apKpisLoading } = useQuery({ queryKey: ["ai-kpis", orgId], queryFn: () => fetchAiKpis(orgId) as Promise<AiKpis>, enabled: Boolean(orgId), ...AI_QUERY_OPTS });
  const apConversations = apKpis?.ai_today?.conversations ?? 0;
  const apRecords = apKpis?.ai_today?.records ?? 0;
  const apMoved = apKpis?.ai_today?.moved ?? 0;
  const apAny = apConversations + apRecords + apMoved > 0;
  // The autopilot card shows a skeleton until we know the master state and (when
  // on) the day's counts - so it never flashes "paused"/"0" before the data lands.
  const apLoading = settingsLoading || (masterOn && apKpisLoading);
  const toggleMaster = useMutation({
    mutationFn: (next: boolean) => updateAiSettings({ master_enabled: next }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-settings"] }); qc.invalidateQueries({ queryKey: ["ai-agents"] }); },
  });
  // Quiet-hours window for the hero robot: when the current local hour is
  // outside the org's send window the mascot sleeps (animated "z z z").
  const isDesktop = useIsDesktop();
  useMinuteTick();
  const { data: quietHours } = useQuery({
    queryKey: ["org-quiet-hours", orgId],
    queryFn: () => fetchOrgQuietHours(orgId) as Promise<{ start: number; end: number }>,
    enabled: Boolean(orgId) && isDesktop,
    ...AI_QUERY_OPTS,
  });
  // Quiet hours are evaluated in the org/workspace timezone (the same zone the
  // backend send-guard uses), NOT the agent's browser - otherwise an agent in a
  // daytime zone keeps the robot awake while it is the middle of the night for
  // the account. Falls back to the browser zone only when the org has none.
  const { data: orgTz } = useQuery({
    queryKey: ["org-timezone", orgId],
    queryFn: () => fetchOrgTimezone(orgId) as Promise<{ timezone: string | null }>,
    enabled: Boolean(orgId) && isDesktop,
    ...AI_QUERY_OPTS,
  });
  const nowHour = orgHourNow(orgTz?.timezone);
  const inQuietHours = quietHours ? nowHour < quietHours.start || nowHour >= quietHours.end : false;
  // The hero companion mirrors the global AI state: off when the master switch is
  // off, asleep during org quiet hours, otherwise awake and tracking the cursor.
  const mascotState: MascotState = !masterOn ? "off" : inQuietHours ? "sleeping" : "awake";
  // The master switch is "busy" while we are still resolving its state (initial
  // settings fetch) or applying a toggle - the button shows a spinner so the user
  // can tell on/off is being loaded, not just defaulting to off.
  const masterBusy = settingsLoading || toggleMaster.isPending;
  const tabs = [
    { k: "overview", label: "Overview" },
    { k: "inbound", label: "Inbound" },
    { k: "outbound", label: "Outbound" },
    { k: "settings", label: "AI Settings" },
  ];
  return (
    <div className="wc-page wc-fade">
      <div className="wc-ac-hero">
        <span className="wc-ac-hero-glow" aria-hidden />
        <div className="wc-ac-hero-id">
          {isDesktop
            ? <NimbusMascot state={mascotState} />
            : <span className="wc-ac-hero-ic"><Icon name="bot" size={24} /></span>}
          <div className="wc-ac-hero-main">
            <div className="wc-ac-hero-eyebrow">WarmChats Intelligence</div>
            <div className="wc-ac-hero-top"><h1 className="wc-ac-hero-name">Nimbus</h1><span className={"wc-statuspill" + (masterOn ? " is-live" : "")}><span className="wc-pdot"><span className="wc-pdot-core" style={{ background: masterOn ? "var(--green)" : "var(--muted)" }} />{masterOn && <span className="wc-pdot-ring" style={{ background: "var(--green)" }} />}</span>{masterOn ? "Live" : "Paused"}</span></div>
            <p className="wc-ac-hero-sub">Your AI companion - monitoring leads, booking appointments, updating your CRM, and telling you where to step in.</p>
            <div className="wc-ac-hero-acts">
              {/* AI on/off is the autopilot toggle in the card to the right - no
                  redundant Pause/Resume button here. The data reloads on every
                  page entry, so no manual Refresh button is needed. */}
              <button className="wc-ghostbtn wc-sm" onClick={() => go("inbox")}><Icon name="message" size={15} />Open inbox</button>
              <button className="wc-primary wc-sm" onClick={() => setHowOpen(true)}><Icon name="sparkles" size={15} />How It Works</button>
            </div>
          </div>
          <div className={"wc-ac-autopilot" + (masterOn ? "" : " is-off")}>
            <div className="wc-ac-ap-head">
              <span className="wc-ac-ap-ic"><Icon name="sparkles" size={15} /></span>
              {settingsLoading
                ? <Skeleton h={32} w={132} r={8} />
                : <button
                    className="wc-ap-actbtn"
                    aria-pressed={masterOn}
                    disabled={masterBusy}
                    onClick={() => toggleMaster.mutate(!masterOn)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                      cursor: masterBusy ? "default" : "pointer",
                      background: masterOn ? "var(--accent, #f97316)" : "#fff",
                      color: masterOn ? "#fff" : "#64748b",
                      border: masterOn ? "1px solid var(--accent, #f97316)" : "1px solid #0f172a",
                      opacity: masterBusy ? 0.6 : 1,
                    }}
                  >
                    <Icon name={masterOn ? "pause" : "sparkles"} size={14} fill={masterOn} />
                    {masterOn ? "Pause AI" : "Activate AI"}
                  </button>}
            </div>
            <div className="wc-ac-ap-text">
              {apLoading
                ? <span style={{ display: "block" }}><Skeleton h={11} w="92%" /><span style={{ display: "block", height: 7 }} /><Skeleton h={11} w="78%" /><span style={{ display: "block", height: 7 }} /><Skeleton h={11} w="60%" /></span>
                : !masterOn
                  ? <><strong>Auto-pilot is paused.</strong> Turn AI on and it will keep your CRM updated automatically - replying, qualifying, and moving leads between stages.</>
                  : <><strong>Your CRM is updating itself.</strong> Today the AI handled <b>{apConversations} conversation{apConversations === 1 ? "" : "s"}</b>, updated <b>{apRecords} lead record{apRecords === 1 ? "" : "s"}</b>, and moved <b>{apMoved} lead{apMoved === 1 ? "" : "s"}</b> between stages{apAny ? " - no manual work." : " so far today."}</>}
            </div>
          </div>
        </div>
      </div>

      <div className="wc-tabs wc-ac-tabs">
        {tabs.map((t) => <button key={t.k} className={"wc-tab" + (tab === t.k ? " is-on" : "")} onClick={() => setTab(t.k)}>{t.label}</button>)}
      </div>

      {tab === "overview" && <AcOverviewTab go={go} />}
      {tab === "inbound" && <AgentDetailPage agentId="inbound" go={go} masterEnabled={masterOn} />}
      {tab === "outbound" && <AgentDetailPage agentId="outbound" go={go} masterEnabled={masterOn} />}
      {tab === "settings" && <AcSettingsTab />}

      {howOpen && <HowItWorksModal onClose={() => setHowOpen(false)} />}
    </div>
  );
}
