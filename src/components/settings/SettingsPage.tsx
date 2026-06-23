import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MainLayout from "@/components/MainLayout";
import { Icon } from "@/components/ai-v2/Icon";
import { TONES } from "@/components/ai-v2/tones";
import { TimezonePicker } from "@/components/TimezonePicker";
import "@/components/ai-v2/prototype.css";
import { validateBusinessAddress } from "@/utils/addressValidator";
import { clearStoredAuthState } from "@/utils/authSession";
import {
  disableWebPush,
  enableWebPush,
  getCurrentSubscription,
  isWebPushSupported,
} from "@/utils/webPush";
import { notificationUnblockSteps } from "@/utils/browserDetect";
import {
  canPromptPwaInstall,
  isPwaInstalled,
  openInstallGuide,
  subscribePwaInstall,
  triggerPwaInstall,
} from "@/utils/pwaInstall";
import { ROLES } from "@/constants/roles";
import { callingApi } from "@/api/calling";
import {
  PLAN_LIMITS,
  PLAN_PRICE,
  buildUsageRows,
  formatPlanLabel,
  resolvePlanName,
  type NotificationSettings,
  type ProfileResponse,
  type SettingKey,
} from "@/components/settings/profileShared";
import {
  changePassword,
  deleteAccount,
  fetchMeBootstrap,
  fetchOrgQuietHours,
  fetchOrgTimezone,
  fetchSendingAddress,
  openBillingPortal,
  fetchPaymentMethods,
  patchNotificationSettings,
  patchOrgQuietHours,
  patchOrgTimezone,
  saveProfileMe,
  saveSendingPrefix,
  sendTestNotification,
  fetchComplianceSummary,
  fetchOrgUsers,
  fetchOrgTeams,
  fetchOffices,
  createOffice,
  deleteOffice,
  fetchOrgDealDefaults,
  putOrgDealDefaults,
} from "@/helpers/backend";
import {
  type CardState,
  type ConnectedAccountsPayload,
  type EmailCard,
  type EmailMode,
  type FixAction,
  type SmsCard,
  type TeamMemberAccount,
  disconnectBusinessEmail,
  disconnectGmail,
  disconnectSms,
  fetchConnectedAccounts,
  fetchTeamConnectedAccounts,
  patchChannelDefaults,
  refreshTelnyxStatus,
  startGmailConnect,
  verifyEmailDns,
} from "@/api/connectedAccounts";
import {
  type ApiKey,
  INTEGRATION_API_BASE,
  createApiKey,
  fetchApiKeys,
  revokeApiKey,
} from "@/api/integrations";

/* Settings (/settings) - ported from the "leads-remix-2" design bundle
   (admin.jsx). Tab order: Workspace Settings, Billing & Usage, Organization
   (custom-brokerage only), Lead Exchange (custom-brokerage only), Compliance,
   Action Plans (coming soon), Integrations (coming soon). The active tab lives
   in the ?tab= query param so it stays linkable / survives reload. Workspace
   Settings (profile, notifications, channels, timezone, quiet hours, security),
   Billing & Usage, Compliance, and Organization (Users/Teams/Offices) are wired
   to the real backend. Lead Exchange + Action Plans + Integrations are still
   design-only (Action Plans + Integrations carry a "coming soon" cover). Renders
   through the prototype's .wc-* classes under the .wcv2 wrapper (prototype.css). */

const ADMIN_TABS = [
  { k: "workspace", label: "Workspace Settings" },
  { k: "billing", label: "Billing & Usage" },
  { k: "org", label: "Organization" },
  { k: "exchange", label: "Lead Exchange" },
  { k: "compliance", label: "Compliance" },
  { k: "plans", label: "Action Plans" },
  { k: "integrations", label: "Integrations" },
];
// Tabs only shown on the Custom Brokerage plan.
const BROKER_ONLY_TABS = new Set(["org", "exchange"]);

const ADMIN_BLURB: Record<string, string> = {
  org: "Manage users, teams, offices, and how new leads are routed across your organization.",
  exchange: "Shared lead pools your agents can claim and convert. Tap any lead to see AI insights.",
  plans: "Build automated follow-up playbooks that trigger on lead events and run multi-step outreach.",
  integrations: "Connect WarmChats to your CRM, calendar, dialer, and the tools your team already uses.",
  billing: "Manage your plan, payment method, usage, and invoices.",
  compliance: "Everyone who has opted out of SMS or email, or been manually blocked. Outbound is refused automatically.",
  workspace: "Profile, notifications, channels, timezone, quiet hours, and security.",
};

interface ExKpi { icon: string; label: string; value: string; sub: string; tone: string }
const EX_KPIS: ExKpi[] = [
  { icon: "users", label: "Total Pools", value: "8", sub: "Active lead pools", tone: "violet" },
  { icon: "user", label: "Leads Available", value: "317", sub: "Ready to claim", tone: "green" },
  { icon: "flame", label: "Hot Opportunities", value: "62", sub: "High intent leads", tone: "orange" },
  { icon: "target", label: "Claimed Today", value: "23", sub: "By your agents", tone: "blue" },
];
const EX_STATUS: Record<string, { fg: string; bg: string; icon: string }> = {
  Hot: { fg: "#DC2626", bg: "#FEE2E2", icon: "flame" },
  Warm: { fg: "#D97706", bg: "#FEF3C7", icon: "flame" },
  Cold: { fg: "#2563EB", bg: "#EAF1FE", icon: "trending" },
  Nurturing: { fg: "#7C3AED", bg: "#F2ECFE", icon: "sparkles" },
};
interface ExLead {
  id: string; name: string; city: string; type: string; score: number; act: string; src: string; status: string;
  summary: string; rec: string; recCta: string; activity: { t: string; ev: string; d: string }[];
}
const EX_LEADS: ExLead[] = [
  { id: "js", name: "John Smith", city: "Fresno, CA", type: "Buyer", score: 92, act: "5m ago", src: "Website Form", status: "Hot",
    summary: "John is looking for a 4 bed, 2 bath home in Fresno between $450k-$550k. Pre-approved and wants to buy within the next 60 days. He asked about school districts and neighborhoods.",
    rec: "High intent buyer. Call within 5 minutes for best results.", recCta: "Call Now",
    activity: [{ t: "5m ago", ev: "Form Submitted", d: "Website Form" }, { t: "7m ago", ev: "AI Auto Reply Sent", d: "Asked about preferences" }, { t: "12m ago", ev: "Email Opened", d: "Property Recommendations" }] },
  { id: "sj", name: "Sarah Jones", city: "Clovis, CA", type: "Seller", score: 88, act: "1h ago", src: "Zillow", status: "Warm",
    summary: "Sarah is considering listing her Clovis home in the next 3 months. Wants a valuation and a sense of the current market before committing.",
    rec: "Send a CMA and offer a no-pressure listing consult.", recCta: "Send CMA",
    activity: [{ t: "1h ago", ev: "Replied to text", d: "Zillow" }, { t: "2h ago", ev: "AI Auto Reply Sent", d: "Valuation offer" }] },
  { id: "mb", name: "Mike Brown", city: "Fresno, CA", type: "Buyer", score: 76, act: "Yesterday", src: "Google Ads", status: "Warm",
    summary: "Mike is an early-stage buyer browsing 3-bed homes. Budget and timeline not yet confirmed.",
    rec: "Qualify budget and timeline before nurturing.", recCta: "Qualify",
    activity: [{ t: "Yesterday", ev: "Clicked ad", d: "Google Ads" }] },
  { id: "kt", name: "Katie Taylor", city: "Madera, CA", type: "Seller", score: 72, act: "Yesterday", src: "Facebook Lead Ad", status: "Nurturing",
    summary: "Katie filled out a Facebook lead form about home value. Long-term seller, likely 6+ months out.",
    rec: "Add to the seller nurture sequence.", recCta: "Add to sequence",
    activity: [{ t: "Yesterday", ev: "Form Submitted", d: "Facebook Lead Ad" }] },
  { id: "rw", name: "Robert Wilson", city: "Fresno, CA", type: "Buyer", score: 68, act: "2d ago", src: "Realtor.com", status: "Cold",
    summary: "Robert inquired about a single listing on Realtor.com and has not responded since.",
    rec: "Send a re-engagement message with similar homes.", recCta: "Re-engage",
    activity: [{ t: "2d ago", ev: "Inquiry", d: "Realtor.com" }] },
  { id: "al", name: "Amanda Lee", city: "Clovis, CA", type: "Buyer", score: 64, act: "2d ago", src: "Website Form", status: "Cold",
    summary: "Amanda browsed listings and submitted a general inquiry. No budget captured.",
    rec: "Send qualifying questions to warm her up.", recCta: "Qualify",
    activity: [{ t: "2d ago", ev: "Form Submitted", d: "Website Form" }] },
  { id: "dl", name: "David Lopez", city: "Fresno, CA", type: "Seller", score: 61, act: "3d ago", src: "Zillow", status: "Nurturing",
    summary: "David is a potential seller researching the market. Not ready to list yet.",
    rec: "Keep in the monthly market-update drip.", recCta: "Add to drip",
    activity: [{ t: "3d ago", ev: "Viewed listing", d: "Zillow" }] },
];

interface IntItem { name: string; desc: string; color: string; letter: string; on: boolean }
const INTEGRATIONS: { cat: string; items: IntItem[] }[] = [
  { cat: "CRM & Lead Sources", items: [
    { name: "Zillow Premier Agent", desc: "Sync leads from Zillow & Trulia", color: "#1E40AF", letter: "Z", on: true },
    { name: "Follow Up Boss", desc: "Two-way CRM contact sync", color: "#0F172A", letter: "F", on: false },
    { name: "Salesforce", desc: "Enterprise CRM sync", color: "#00A1E0", letter: "S", on: false },
  ] },
  { cat: "Calendar & Scheduling", items: [
    { name: "Google Calendar", desc: "Two-way appointment sync", color: "#4285F4", letter: "G", on: true },
    { name: "Outlook Calendar", desc: "Sync Microsoft 365 events", color: "#0078D4", letter: "O", on: false },
    { name: "Calendly", desc: "Let leads self-book showings", color: "#006BFF", letter: "C", on: true },
  ] },
  { cat: "Communication", items: [
    { name: "Telnyx", desc: "10DLC SMS & voice", color: "#00C46A", letter: "T", on: true },
    { name: "Twilio", desc: "SMS & programmable voice", color: "#F22F46", letter: "T", on: false },
    { name: "Slack", desc: "Lead & deal alerts in Slack", color: "#611F69", letter: "S", on: true },
  ] },
  { cat: "Automation", items: [
    { name: "Zapier", desc: "Connect 6,000+ apps", color: "#FF4F00", letter: "Z", on: true },
    { name: "Webhooks", desc: "Push events to any endpoint", color: "#64748B", letter: "W", on: false },
    { name: "API access", desc: "Build on the WarmChats API", color: "#EA580C", letter: "A", on: true },
  ] },
];

interface ActionPlan { name: string; trigger: string; steps: number; channels: string[]; enrolled: number; on: boolean; color: string; desc: string }
const ACTION_PLANS: ActionPlan[] = [
  { name: "New Zillow lead", trigger: "Lead created · Source = Zillow", steps: 5, channels: ["SMS", "Email"], enrolled: 34, on: true, color: "#1E40AF", desc: "Instant text + 4 follow-ups over 7 days until they reply." },
  { name: "Speed-to-lead (all sources)", trigger: "Any new lead", steps: 3, channels: ["SMS"], enrolled: 62, on: true, color: "#EA580C", desc: "Reply within 60 seconds, then nudge at 1h and 24h." },
  { name: "Seller valuation nurture", trigger: "Form = Home Value", steps: 6, channels: ["Email", "SMS"], enrolled: 18, on: true, color: "#8B5CF6", desc: "CMA offer, market updates, and a listing-consult invite." },
  { name: "Post-showing follow-up", trigger: "Appointment completed", steps: 4, channels: ["SMS", "Email"], enrolled: 11, on: true, color: "#0D9488", desc: "Same-day recap, similar listings, and a check-in." },
  { name: "Cold lead re-engagement", trigger: "No activity 90 days", steps: 5, channels: ["SMS", "Email"], enrolled: 142, on: false, color: "#D97706", desc: "Win back idle leads with a market update + soft check-in." },
  { name: "Birthday & anniversary", trigger: "Date matches", steps: 1, channels: ["SMS"], enrolled: 86, on: true, color: "#DB2777", desc: "Automatic personal touch to stay top-of-mind." },
];

const ORG_SUBTABS = [
  { k: "users", label: "Users", icon: "user" },
  { k: "teams", label: "Teams", icon: "users" },
  { k: "offices", label: "Offices", icon: "building" },
  { k: "routing", label: "Lead Routing", icon: "zap" },
];
const ORG_ROLE_TONE: Record<string, { fg: string; bg: string }> = {
  Owner: { fg: "#7C3AED", bg: "#F2ECFE" },
  Manager: { fg: "#2563EB", bg: "#EAF1FE" },
  Representative: { fg: "#0D9488", bg: "#E3F6F2" },
  Guest: { fg: "#6B7280", bg: "#F3F4F6" },
};
interface RoutingRule { name: string; cond: string; then: string; on: boolean }
const ROUTING_RULES: RoutingRule[] = [
  { name: "Zillow buyer leads", cond: "Source is Zillow", then: "Round-robin → Buyers team", on: true },
  { name: "Seller / valuation requests", cond: "Form is Home Value", then: "Assign → Listings team", on: true },
  { name: "Spanish-speaking leads", cond: "Language is Spanish", then: "Assign → Joseph Velasquez", on: true },
  { name: "After-hours inbound", cond: "Outside business hours", then: "Assign → Inside Sales (ISA)", on: true },
  { name: "High-value ($1M+)", cond: "Budget over $1M", then: "Notify + assign → Joseph Velasquez", on: false },
];

function AdmToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={"wc-toggle" + (on ? " is-on" : "")} onClick={() => onChange(!on)}><span className="wc-toggle-knob" /></button>;
}

function UsageBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = Math.min(100, (used / cap) * 100);
  return (
    <div className="wc-usage">
      <div className="wc-usage-top"><span>{label}</span><span className="wc-mono">{used.toLocaleString()} / {cap.toLocaleString()}</span></div>
      <div className="wc-usage-bar"><div style={{ width: Math.max(pct, 1.5) + "%" }} /></div>
    </div>
  );
}

function Card({ icon, title, children, className }: { icon: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"wc-panel-card pad wc-admincard " + (className || "")}>
      <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name={icon} size={17} /></span>{title}</div>
      {children}
    </div>
  );
}

const orgInitials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

interface OrgUserRow { id: number; name: string | null; email: string; role_name: string | null }
interface OrgTeamRow { id: number; name: string; description: string | null; leader_name: string | null; member_count: number }
interface OrgOfficeRow { id: number; name: string; address: string | null; is_primary: boolean; agents_count: number }

function OrgSection({ initialSub }: { initialSub?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { orgId } = useBoot();
  const [sub, setSub] = useState(initialSub || "users");
  // Routing is design-only (no backend) - shown behind a coming-soon cover.
  const [rules] = useState<RoutingRule[]>(() => ROUTING_RULES.map((r) => ({ ...r })));

  const usersQ = useQuery({ queryKey: ["org-users"], queryFn: fetchOrgUsers, enabled: sub === "users" });
  const teamsQ = useQuery({ queryKey: ["org-teams", orgId], queryFn: () => fetchOrgTeams(orgId ?? 0), enabled: sub === "teams" && Boolean(orgId) });
  const officesQ = useQuery({ queryKey: ["org-offices", orgId], queryFn: () => fetchOffices(orgId ?? 0), enabled: sub === "offices" && Boolean(orgId) });
  const users = (usersQ.data as { users?: OrgUserRow[] } | undefined)?.users ?? [];
  const teams = (teamsQ.data as { teams?: OrgTeamRow[] } | undefined)?.teams ?? [];
  const offices = (officesQ.data as { offices?: OrgOfficeRow[] } | undefined)?.offices ?? [];

  const [showAddOffice, setShowAddOffice] = useState(false);
  const [officeName, setOfficeName] = useState("");
  const [officeAddr, setOfficeAddr] = useState("");
  const [officePrimary, setOfficePrimary] = useState(false);
  const [savingOffice, setSavingOffice] = useState(false);
  const addOffice = async () => {
    if (!officeName.trim()) { toast.error("Office name is required"); return; }
    setSavingOffice(true);
    try {
      await createOffice({ name: officeName.trim(), address: officeAddr.trim(), is_primary: officePrimary, org_id: orgId ?? undefined });
      toast.success("Office added");
      setOfficeName(""); setOfficeAddr(""); setOfficePrimary(false); setShowAddOffice(false);
      void qc.invalidateQueries({ queryKey: ["org-offices", orgId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to add office"); }
    finally { setSavingOffice(false); }
  };
  const removeOffice = async (id: number) => {
    if (!window.confirm("Delete this office?")) return;
    try { await deleteOffice(id); void qc.invalidateQueries({ queryKey: ["org-offices", orgId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to delete office"); }
  };

  const headerAction = sub === "users"
    ? <button className="wc-primary wc-sm" onClick={() => navigate("/team/users")}><Icon name="plus" size={14} />Manage users</button>
    : sub === "teams"
      ? <button className="wc-primary wc-sm" onClick={() => navigate("/team/teams")}><Icon name="plus" size={14} />Manage teams</button>
      : sub === "offices"
        ? <button className="wc-primary wc-sm" onClick={() => setShowAddOffice((v) => !v)}><Icon name="plus" size={14} />Add office</button>
        : null;

  return (
    <div className="wc-panel-card pad wc-admincard wc-orgcard">
      <div className="wc-admincard-h" style={{ marginBottom: 4 }}><span className="wc-admincard-ic"><Icon name="users" size={17} /></span>Organization</div>
      <div className="wc-orgtabs">
        <div className="wc-orgtabs-l">
          {ORG_SUBTABS.map((t) => (
            <button key={t.k} className={"wc-orgtab" + (sub === t.k ? " is-on" : "")} onClick={() => setSub(t.k)}>
              <Icon name={t.icon} size={17} />{t.label}
            </button>
          ))}
        </div>
        {headerAction}
      </div>

      {sub === "users" && (
        <div className="wc-orgtable-wrap">
          <table className="wc-reptable">
            <thead><tr><th>User</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {usersQ.isLoading && users.length === 0 ? (
                <tr><td colSpan={3} className="wc-band-d" style={{ textAlign: "center", padding: "18px 0" }}>Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={3} className="wc-band-d" style={{ textAlign: "center", padding: "18px 0" }}>No users yet.</td></tr>
              ) : users.map((u) => {
                const rt = ORG_ROLE_TONE[u.role_name || "Guest"] || ORG_ROLE_TONE.Guest;
                return (
                  <tr key={u.id}>
                    <td><div className="wc-goalrow-agent"><span className="wc-agoal-lav">{orgInitials(u.name || u.email)}</span><div><div className="wc-agoal-row-t">{u.name || "-"}</div></div></div></td>
                    <td className="wc-band-d">{u.email}</td>
                    <td><span className="wc-cbadge" style={{ color: rt.fg, background: rt.bg }}>{u.role_name || "Guest"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sub === "teams" && (
        <div className="wc-orggrid">
          {teamsQ.isLoading && teams.length === 0 ? (
            <div className="wc-band-d">Loading...</div>
          ) : teams.length === 0 ? (
            <div className="wc-band-d">No teams yet. Use Manage teams to create one.</div>
          ) : teams.map((t) => (
            <div className="wc-orgitem" key={t.id}>
              <div className="wc-orgitem-top"><span className="wc-orgitem-dot" style={{ background: "var(--accent)" }} /><span className="wc-orgitem-name">{t.name}</span></div>
              <div className="wc-orgitem-meta">{t.leader_name ? <><span className="wc-agoal-lav" style={{ width: 22, height: 22, fontSize: 9 }}>{orgInitials(t.leader_name)}</span>Lead · {t.leader_name}</> : (t.description || "No lead set")}</div>
              <div className="wc-orgitem-stats"><div><b className="wc-mono">{t.member_count}</b><span>members</span></div></div>
            </div>
          ))}
        </div>
      )}

      {sub === "offices" && (
        <>
          {showAddOffice ? (
            <div className="wc-admin-band" style={{ flexWrap: "wrap", gap: 8 }}>
              <input className="wc-modal-input" placeholder="Office name" value={officeName} onChange={(e) => setOfficeName(e.target.value)} style={{ flex: "1 1 150px" }} />
              <input className="wc-modal-input" placeholder="Address" value={officeAddr} onChange={(e) => setOfficeAddr(e.target.value)} style={{ flex: "2 1 200px" }} />
              <label className="wc-band-d" style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={officePrimary} onChange={(e) => setOfficePrimary(e.target.checked)} />Primary</label>
              <button className="wc-primary wc-sm" onClick={() => void addOffice()} disabled={savingOffice}>{savingOffice ? "Saving..." : "Save office"}</button>
            </div>
          ) : null}
          <div className="wc-orggrid">
            {officesQ.isLoading && offices.length === 0 ? (
              <div className="wc-band-d">Loading...</div>
            ) : offices.length === 0 ? (
              <div className="wc-band-d">No offices yet. Add your first office.</div>
            ) : offices.map((o) => (
              <div className="wc-orgitem" key={o.id}>
                <div className="wc-orgitem-top"><span className="wc-orgitem-ic"><Icon name="building" size={15} /></span><span className="wc-orgitem-name">{o.name}</span>{o.is_primary ? <span className="wc-cbadge" style={{ color: "#16A34A", background: "#E8F8ED" }}>Primary</span> : null}<button className="wc-task-open" title="Delete office" onClick={() => void removeOffice(o.id)}><Icon name="trash" size={15} /></button></div>
                {o.address ? <div className="wc-orgitem-meta"><Icon name="pin" size={13} />{o.address}</div> : null}
                <div className="wc-orgitem-stats"><div><b className="wc-mono">{o.agents_count}</b><span>agents</span></div></div>
              </div>
            ))}
          </div>
        </>
      )}

      {sub === "routing" && (
        <ComingSoonCover>
          <div className="wc-routelist">
            {rules.map((r, i) => (
              <div className={"wc-route" + (r.on ? "" : " is-off")} key={i}>
                <span className="wc-route-ic"><Icon name="zap" size={15} /></span>
                <div className="wc-route-b">
                  <div className="wc-route-name">{r.name}</div>
                  <div className="wc-route-flow"><span className="wc-route-when">{r.cond}</span><Icon name="arrowRight" size={13} /><span className="wc-route-then">{r.then}</span></div>
                </div>
                <AdmToggle on={r.on} onChange={() => undefined} />
              </div>
            ))}
          </div>
        </ComingSoonCover>
      )}
    </div>
  );
}

function OrganizationTab({ orgSub }: { orgSub?: string }) {
  return <OrgSection key={orgSub || "users"} initialSub={orgSub} />;
}

function LeadExchangeTab() {
  const [tab, setTab] = useState("all");
  const [sel, setSel] = useState("js");
  const [claimed, setClaimed] = useState<Set<string>>(() => new Set());
  const tabs = [{ k: "all", label: "All Pools" }, { k: "mine", label: "My Claimed Leads" }, { k: "attn", label: "Needs Attention" }];
  const rows = EX_LEADS.filter((l) => (tab === "all" ? true : tab === "mine" ? claimed.has(l.id) : l.status === "Hot" || l.status === "Warm"));
  const cur = EX_LEADS.find((l) => l.id === sel);
  const claim = (id: string) => setClaimed((s) => { const n = new Set(s); n.add(id); return n; });

  return (
    <div className="wc-exch">
      <div className="wc-exch-main">
        <div className="wc-exch-head">
          <div><div className="wc-exch-title"><Icon name="users" size={18} />Lead Pools</div><div className="wc-band-d">Shared lead pools your agents can claim and convert.</div></div>
          <button className="wc-primary wc-sm"><Icon name="plus" size={14} />Create Pool</button>
        </div>
        <div className="wc-rep-stats" style={{ marginBottom: 16 }}>
          {EX_KPIS.map((k) => { const t = TONES[k.tone]; return (
            <div className="wc-stat wc-repstat" key={k.label}><span className="wc-repstat-ic" style={{ color: t.fg, background: t.bg }}><Icon name={k.icon} size={17} /></span><div className="wc-stat-label">{k.label}</div><div className="wc-stat-val wc-mono">{k.value}</div><div className="wc-stat-sub">{k.sub}</div></div>
          ); })}
        </div>
        <div className="wc-tasktabs" style={{ margin: "0 0 14px" }}>
          {tabs.map((t) => <button key={t.k} className={"wc-dtab" + (tab === t.k ? " is-on" : "")} onClick={() => setTab(t.k)}>{t.label}</button>)}
        </div>
        <div className="wc-panel-card wc-reptable-card">
          <table className="wc-reptable wc-exchtable">
            <thead><tr><th>Lead</th><th>Score</th><th>Intent</th><th>Last Activity</th><th>AI Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((l) => {
                const st = EX_STATUS[l.status];
                const isClaimed = claimed.has(l.id);
                return (
                  <tr key={l.id} className={"wc-exchrow" + (sel === l.id ? " is-sel" : "")} onClick={() => setSel(l.id)}>
                    <td><div className="wc-goalrow-agent"><span className="wc-agoal-lav">{l.name.split(" ").map((w) => w[0]).join("")}</span><div><div className="wc-agoal-row-t">{l.name}</div><div className="wc-band-d">{l.city} · {l.type}</div></div></div></td>
                    <td><span className="wc-exch-score">{l.score}</span></td>
                    <td><span className="wc-exch-intent"><Icon name={l.type === "Buyer" ? "home" : "building2"} size={14} />{l.type}</span></td>
                    <td><div className="wc-agoal-row-t" style={{ fontSize: 13 }}>{l.act}</div><div className="wc-band-d">{l.src}</div></td>
                    <td><span className="wc-cbadge" style={{ color: st.fg, background: st.bg }}><Icon name={st.icon} size={12} />{l.status}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="wc-exch-acts">
                        <button className={isClaimed ? "wc-ghostbtn wc-sm" : "wc-primary wc-sm"} disabled={isClaimed} onClick={() => claim(l.id)}>{isClaimed ? "Claimed" : "Claim"}</button>
                        <button className="wc-iconbtn-sm"><Icon name="more" size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6}><div className="wc-task-empty">No leads in this view.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {cur && (
        <aside className="wc-exch-side">
          <div className="wc-exch-sidehead">
            <span className="wc-intel-av">{cur.name.split(" ").map((w) => w[0]).join("")}</span>
            <div className="wc-exch-sideid"><div className="wc-intel-name">{cur.name}</div><div className="wc-intel-last">{cur.city}</div></div>
            <div className="wc-exch-scorebig"><span className="wc-mono">{cur.score}</span><small>AI Score</small></div>
          </div>
          <div className="wc-exch-tags">
            <span className="wc-hot-tag">{cur.type}</span>
            <span className="wc-cbadge" style={{ color: EX_STATUS[cur.status].fg, background: EX_STATUS[cur.status].bg }}><Icon name={EX_STATUS[cur.status].icon} size={11} />{cur.status}</span>
            <span className="wc-hot-tag">{cur.src}</span>
          </div>
          <div className="wc-aisummary" style={{ marginTop: 14 }}>
            <div className="wc-aisummary-h"><Icon name="sparkles" size={13} />AI Summary</div>
            <p>{cur.summary}</p>
          </div>
          <div className="wc-exch-rec">
            <div className="wc-aisummary-h" style={{ color: "var(--ink-2)" }}><Icon name="target" size={13} />Recommended Action</div>
            <p className="wc-band-t" style={{ fontWeight: 600, margin: "0 0 10px" }}>{cur.rec}</p>
            <button className="wc-ghostbtn wc-sm wc-full" style={{ color: "var(--accent-strong)", borderColor: "#FBE0CC" }}><Icon name="phone" size={14} />{cur.recCta}</button>
          </div>
          <div className="wc-intel-sec" style={{ marginTop: 16 }}>
            <div className="wc-intel-sech">Activity</div>
            <div className="wc-actfeed">
              {cur.activity.map((a, i) => (
                <div className="wc-actitem" key={i}><span className="wc-actdot" style={{ background: "var(--accent)" }} /><div><div className="wc-acttext"><strong>{a.ev}</strong></div><div className="wc-band-d">{a.d}</div><div className="wc-actwhen wc-mono">{a.t}</div></div></div>
              ))}
            </div>
          </div>
          <button className="wc-primary wc-full" style={{ marginTop: 8 }} disabled={claimed.has(cur.id)} onClick={() => claim(cur.id)}>{claimed.has(cur.id) ? "Claimed" : "Claim Lead"}</button>
          <button className="wc-ghostbtn wc-full" style={{ marginTop: 8 }}>View Full Profile</button>
        </aside>
      )}
    </div>
  );
}

function IntegrationsTab() {
  const [conn, setConn] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    INTEGRATIONS.forEach((g) => g.items.forEach((it) => { m[it.name] = it.on; }));
    return m;
  });
  const toggle = (name: string) => setConn((c) => ({ ...c, [name]: !c[name] }));
  const total = Object.keys(conn).length;
  const active = Object.values(conn).filter(Boolean).length;
  return (
    <div>
      <div className="wc-rep-stats" style={{ marginBottom: 18 }}>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#16A34A", background: "#E8F8ED" }}><Icon name="checkCircle" size={17} /></span><div className="wc-stat-label">Connected</div><div className="wc-stat-val wc-mono">{active}</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#2563EB", background: "#EAF1FE" }}><Icon name="layers" size={17} /></span><div className="wc-stat-label">Available</div><div className="wc-stat-val wc-mono">{total}</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#EA580C", background: "var(--accent-soft)" }}><Icon name="zap" size={17} /></span><div className="wc-stat-label">Events / day</div><div className="wc-stat-val wc-mono">1.2k</div></div>
      </div>
      {INTEGRATIONS.map((g) => (
        <div className="wc-intgroup" key={g.cat}>
          <div className="wc-intgroup-h">{g.cat}</div>
          <div className="wc-intgrid">
            {g.items.map((it) => {
              const on = conn[it.name];
              return (
                <div className={"wc-intcard" + (on ? " is-on" : "")} key={it.name}>
                  <div className="wc-intcard-top">
                    <span className="wc-intcard-logo" style={{ background: it.color }}>{it.letter}</span>
                    <div className="wc-intcard-id"><div className="wc-intcard-name">{it.name}</div><div className="wc-band-d">{it.desc}</div></div>
                  </div>
                  <div className="wc-intcard-foot">
                    {on ? <span className="wc-intcard-status"><Icon name="checkCircle" size={13} />Connected</span> : <span className="wc-band-d">Not connected</span>}
                    <button className={on ? "wc-ghostbtn wc-sm" : "wc-primary wc-sm"} onClick={() => toggle(it.name)}>{on ? "Disconnect" : "Connect"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionPlansTab() {
  const [plans, setPlans] = useState<ActionPlan[]>(() => ACTION_PLANS.map((p) => ({ ...p })));
  const toggle = (i: number) => setPlans((ps) => ps.map((p, idx) => (idx === i ? { ...p, on: !p.on } : p)));
  const active = plans.filter((p) => p.on).length;
  const enrolled = plans.reduce((s, p) => s + (p.on ? p.enrolled : 0), 0);
  return (
    <div>
      <div className="wc-rep-stats" style={{ marginBottom: 16 }}>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#EA580C", background: "var(--accent-soft)" }}><Icon name="zap" size={17} /></span><div className="wc-stat-label">Active Plans</div><div className="wc-stat-val wc-mono">{active}</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#2563EB", background: "#EAF1FE" }}><Icon name="user" size={17} /></span><div className="wc-stat-label">Leads Enrolled</div><div className="wc-stat-val wc-mono">{enrolled}</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#16A34A", background: "#E8F8ED" }}><Icon name="trending" size={17} /></span><div className="wc-stat-label">Reply Rate</div><div className="wc-stat-val wc-mono">19%</div></div>
      </div>
      <div className="wc-planhead">
        <span className="wc-band-d">{plans.length} action plans · steps run automatically on each trigger</span>
        <button className="wc-primary wc-sm"><Icon name="plus" size={14} />New action plan</button>
      </div>
      <div className="wc-aplist">
        {plans.map((p, i) => (
          <div className={"wc-apcard" + (p.on ? "" : " is-off")} key={p.name}>
            <span className="wc-apcard-bar" style={{ background: p.color }} />
            <div className="wc-apcard-b">
              <div className="wc-apcard-top">
                <span className="wc-apcard-name">{p.name}</span>
                {p.channels.map((c) => <span key={c} className={"wc-tplch ch-" + c.toLowerCase()}><Icon name={c === "Email" ? "mail" : "message"} size={11} />{c}</span>)}
              </div>
              <div className="wc-apcard-desc">{p.desc}</div>
              <div className="wc-apcard-meta">
                <span><Icon name="zap" size={13} />{p.trigger}</span>
                <span><Icon name="list" size={13} />{p.steps} steps</span>
                <span><Icon name="user" size={13} />{p.enrolled} enrolled</span>
              </div>
            </div>
            <div className="wc-apcard-actions">
              <button className="wc-iconbtn-sm" title="Edit plan"><Icon name="pencil" size={15} /></button>
              <AdmToggle on={p.on} onChange={() => toggle(i)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Wired Workspace Settings + Billing tabs.                              *
 * Cards below pull real data from the same endpoints the old page uses. *
 * ------------------------------------------------------------------ */

interface BootOrg { id?: number; name?: string; plan?: string; subscription_status?: string }
interface BootProfile {
  user?: { name?: string; email?: string; business_address?: string | null };
  org?: BootOrg | null;
  organization?: BootOrg | null;
  plan?: { name?: string; limits?: Record<string, unknown> };
  role?: string | null;
}
interface BootBilling { plan?: string | null; subscription_status?: string | null; plan_started_at?: string | null }

// Shared bootstrap read. React Query dedupes the ["me_bootstrap"] key, so every
// card calling this hits one network fetch. Same key the old page invalidates.
function useBoot() {
  const q = useQuery({ queryKey: ["me_bootstrap"], queryFn: fetchMeBootstrap });
  const profile = (q.data?.profile ?? null) as unknown as BootProfile | null;
  const billing = (q.data?.billing ?? null) as unknown as BootBilling | null;
  const orgId = profile?.org?.id ?? null;
  const role = profile?.role ?? null;
  const canManage = role === ROLES.OWNER || role === ROLES.MANAGER;
  return { q, profile, billing, orgId, role, canManage };
}

const CONN_STATE_TONE: Record<CardState, { fg: string; bg: string; label: string }> = {
  not_connected: { fg: "#6B7280", bg: "#F3F4F6", label: "Not connected" },
  connected: { fg: "#16A34A", bg: "#E8F8ED", label: "Connected" },
  error: { fg: "#D97706", bg: "#FEF3C7", label: "Needs action" },
};
function ConnPill({ state }: { state: CardState }) {
  const t = CONN_STATE_TONE[state];
  return <span className="wc-cbadge" style={{ color: t.fg, background: t.bg }}>{t.label}</span>;
}

function FixActions({ actions }: { actions: FixAction[] }) {
  if (!actions.length) return null;
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      {actions.map((a) => (
        <div key={a.code} className="wc-band-d" style={{ display: "flex", gap: 6, color: "#92400E" }}>
          <Icon name="zap" size={13} />
          <span>{a.message}{a.href ? <a href={a.href} style={{ marginLeft: 4, fontWeight: 600, color: "var(--accent-strong)" }}>Fix</a> : null}</span>
        </div>
      ))}
    </div>
  );
}

function ReadyRow({ label, ready }: { label: string; ready: boolean }) {
  return <div><span>{label}</span><b className={ready ? "ok" : ""}>{ready ? "Ready" : "Not ready"}</b></div>;
}

const DEFAULT_NOTIF: NotificationSettings = {
  notify_sms_inbound: true,
  notify_email_inbound: true,
  notify_calls: true,
  notify_appointments: true,
  notify_billing: true,
  notify_system: true,
  notify_ai_reply: true,
  notify_via_web_push: true,
  notify_via_mobile_push: true,
  notify_via_email_digest: false,
  notify_in_app_toast: true,
  notify_sound: true,
};
const NOTIF_ITEMS: { key: SettingKey; label: string; desc: string }[] = [
  { key: "notify_sms_inbound", label: "Lead messages (SMS)", desc: "New inbound text messages from leads" },
  { key: "notify_email_inbound", label: "Lead messages (email)", desc: "New inbound emails and replies from leads" },
  { key: "notify_calls", label: "Calls", desc: "Incoming, missed calls, and voicemail" },
  { key: "notify_appointments", label: "Appointments", desc: "Bookings, reschedules, cancellations, reminders" },
  { key: "notify_billing", label: "Billing", desc: "Payment issues, plan changes, quota warnings" },
  { key: "notify_system", label: "System", desc: "SMS / domain registration status, campaigns, other system events" },
  { key: "notify_ai_reply", label: "AI replies", desc: "When an AI agent auto-replies to a lead on your behalf" },
  { key: "notify_in_app_toast", label: "In-app toasts", desc: "Show pop-up toasts inside the app" },
  { key: "notify_sound", label: "Sound", desc: "Play a chime when a new notification arrives" },
  { key: "notify_via_web_push", label: "Browser push", desc: "Deliver via OS notifications when the tab isn't focused" },
  { key: "notify_via_mobile_push", label: "Mobile push", desc: "Deliver on installed mobile devices" },
  { key: "notify_via_email_digest", label: "Email digest", desc: "Get periodic summary emails (when enabled)" },
];

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => i);
function formatHour(h: number): string {
  if (h === 0) return "12 AM (midnight)";
  if (h === 24) return "12 AM (midnight, next day)";
  if (h === 12) return "12 PM (noon)";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// Current wall-clock time + 0-23 hour in the given IANA zone, or null when the
// zone is missing/invalid. Used to show a live workspace clock next to the
// quiet-hours window so the configured zone is unambiguous.
function formatZoneClock(timezone: string, at: Date): { time: string; hour: number } | null {
  if (!timezone) return null;
  try {
    const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(at);
    const h = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(at), 10);
    return { time, hour: Number.isFinite(h) ? h % 24 : 0 };
  } catch {
    return null;
  }
}

// Custom Brokerage is sales-led - "Book demo" opens this Calendly (same link
// the onboarding + pricing pages use).
const BROKERAGE_DEMO_URL = "https://calendly.com/velasquezjojo7/30min";

// Plan comparison cards. Price + the "current" badge derive from real billing;
// the feature bullets are static marketing copy (they describe the plans).
const PLAN_CARDS: { key: string; name: string; tag: string; feats: string[]; locked?: string[]; overages?: [string, string][] }[] = [
  { key: "free_channel", name: "Free", tag: "Best for agents testing AI follow-up",
    feats: ["1 seat", "Centralized lead inbox", "Email outreach only", "500 emails / month", "AI email writer (limited credits)", "1 follow-up sequence (3 steps)", "Auto-response (email, basic rules)"],
    locked: ["SMS outreach", "AI auto-replies", "Advanced sequences", "Campaign automation"] },
  { key: "starter", name: "Starter", tag: "Best for new agents",
    feats: ["1 seat", "1,250 SMS / month", "10,000 emails / month", "2,500 AI messages", "1,000 calling minutes", "AI instant reply", "Lead inbox", "Templates"],
    overages: [["Extra SMS", "$0.015"], ["Extra emails", "$0.002"], ["Extra AI messages", "$0.002"], ["Extra calling minutes", "$0.015"]] },
  { key: "growth", name: "Growth", tag: "Best for active agents",
    feats: ["1 seat", "2,500 SMS / month", "20,000 emails / month", "15,000 AI messages", "3,750 calling minutes", "AI follow-up sequences", "Campaign automation", "Appointment alerts", "Advanced templates"],
    overages: [["Extra SMS", "$0.015"], ["Extra emails", "$0.002"], ["Extra AI messages", "$0.002"], ["Extra calling minutes", "$0.015"]] },
  { key: "custom_brokerage", name: "Custom Brokerage", tag: "For teams and brokerages scaling lead conversion with AI",
    feats: ["Multi-agent onboarding", "Team management", "AI follow-up automation", "Shared templates", "Priority support", "Custom onboarding", "Volume pricing"] },
];

export function ProfileCard() {
  const qc = useQueryClient();
  const location = useLocation();
  const { profile } = useBoot();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [about, setAbout] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [seeded, setSeeded] = useState(false);
  const addressRef = useRef<HTMLTextAreaElement>(null);
  const [highlightAddress, setHighlightAddress] = useState(false);
  useEffect(() => {
    if (!profile || seeded) return;
    setName(profile.user?.name || "");
    setCompanyName(profile.org?.name || "");
    setAbout("");
    setBusinessAddress(profile.user?.business_address || "");
    setSeeded(true);
  }, [profile, seeded]);

  // Deep-link from the "Add address" banner (/settings?tab=workspace
  // #business-address): once the profile has loaded, scroll the field into view
  // and flash a ring around it. Re-runs on hash change so re-clicking the
  // banner re-triggers the highlight.
  useEffect(() => {
    if (location.hash !== "#business-address" || !seeded) return;
    const t = window.setTimeout(() => {
      const el = addressRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
      setHighlightAddress(true);
      window.setTimeout(() => setHighlightAddress(false), 2800);
    }, 250);
    return () => window.clearTimeout(t);
  }, [location.hash, seeded]);

  const addressError = useMemo(
    () => (businessAddress.trim() ? validateBusinessAddress(businessAddress) : null),
    [businessAddress],
  );
  const save = useMutation({
    // company_name + about are accepted but ignored server-side (no backing
    // columns) - same as the old page; we send them for forward-compat.
    mutationFn: () => saveProfileMe({ name, company_name: companyName, about, business_address: businessAddress }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me_bootstrap"] }); toast.success("Profile updated"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Unable to update profile"),
  });
  const onSave = () => {
    if (!businessAddress.trim()) { toast.error("Business mailing address is required."); return; }
    if (addressError) { toast.error(addressError); return; }
    save.mutate();
  };
  const addressMissing = !businessAddress.trim();

  return (
    <Card icon="user" title="Profile">
      <div className="wc-formgrid">
        <div className="wc-modal-field"><div className="wc-modal-lbl">Full Name</div><input className="wc-modal-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="wc-modal-field"><div className="wc-modal-lbl">Brokerage Name</div><input className="wc-modal-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
      </div>
      <div className="wc-modal-fieldfull"><div className="wc-modal-lbl">About the company</div><textarea className="wc-modal-textarea" value={about} onChange={(e) => setAbout(e.target.value)} placeholder="What do you offer? Who do you serve?" /></div>
      <div className="wc-modal-fieldfull" id="business-address" style={{ scrollMarginTop: 96 }}>
        <div className="wc-modal-lbl">Business mailing address</div>
        <textarea
          ref={addressRef}
          className="wc-modal-textarea"
          value={businessAddress}
          onChange={(e) => setBusinessAddress(e.target.value)}
          placeholder="123 Main St, Suite 4, Springfield, IL 62701"
          style={
            addressError
              ? { borderColor: "#F43F5E" }
              : highlightAddress
                ? { borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-soft)" }
                : undefined
          }
        />
        {addressError ? (
          <div className="wc-band-d" style={{ color: "#E11D48", marginTop: 4 }}>{addressError}</div>
        ) : addressMissing ? (
          <div className="wc-band-d" style={{ color: "#92400E", marginTop: 4 }}>Missing - required by CAN-SPAM. Marketing emails will not send until this is filled in.</div>
        ) : (
          <div className="wc-band-d" style={{ marginTop: 4 }}>Shown in the footer of every marketing email you send through WarmChats.</div>
        )}
      </div>
      <div className="wc-formfoot"><button className="wc-primary" onClick={onSave} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save changes"}</button></div>
    </Card>
  );
}

export function NotificationsCard() {
  const { q } = useBoot();
  const serverSettings = q.data?.notification_settings as Partial<NotificationSettings> | undefined;
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIF);
  const [seeded, setSeeded] = useState(false);
  const timers = useRef<Partial<Record<SettingKey, number>>>({});

  useEffect(() => {
    if (!serverSettings || seeded) return;
    setSettings((prev) => ({ ...prev, ...serverSettings }));
    setSeeded(true);
  }, [serverSettings, seeded]);
  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach((id) => { if (id) window.clearTimeout(id); }); };
  }, []);

  const persist = async (key: SettingKey, value: boolean) => {
    try {
      await patchNotificationSettings({ [key]: value });
    } catch (e) {
      setSettings((p) => ({ ...p, [key]: !value }));
      toast.error(e instanceof Error ? e.message : "Failed to update preference");
    }
  };
  const toggle = (key: SettingKey) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const value = next[key];
      const existing = timers.current[key];
      if (existing) window.clearTimeout(existing);
      timers.current[key] = window.setTimeout(() => { void persist(key, value); delete timers.current[key]; }, 300);
      return next;
    });
  };

  // Browser push on this device.
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    if (!isWebPushSupported()) { setPermission("unsupported"); return; }
    setPermission(Notification.permission);
    getCurrentSubscription()
      .then((sub) => setPushSubscribed(!!sub && Notification.permission === "granted"))
      .catch(() => setPushSubscribed(false));
  }, []);
  const enablePush = async () => {
    if (!isWebPushSupported()) { toast.error("Browser notifications are not supported in this browser"); return; }
    setPushBusy(true);
    try {
      await enableWebPush();
      setPushSubscribed(true);
      setPermission("granted");
      if (!settings.notify_via_web_push) {
        setSettings((prev) => ({ ...prev, notify_via_web_push: true }));
        void persist("notify_via_web_push", true);
      }
      toast.success("Browser notifications enabled");
    } catch (err: unknown) {
      const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
      setPermission(perm);
      if (perm === "denied") toast.error("Browser notifications are blocked. Open browser site settings to allow them.");
      else if (perm === "default") toast("Notification prompt closed. Click Enable again when you're ready.");
      else toast.error(err instanceof Error ? err.message : "Could not enable browser notifications");
    } finally {
      setPushBusy(false);
    }
  };
  const disablePush = async () => {
    setPushBusy(true);
    try {
      await disableWebPush();
      setPushSubscribed(false);
      toast.success("Browser notifications disabled");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not disable browser notifications");
    } finally {
      setPushBusy(false);
    }
  };
  const permissionLabel = (() => {
    if (permission === "unsupported") return "Browser push not supported on this device.";
    if (permission === "denied") return "Notifications are blocked. Open browser site settings to allow.";
    if (permission === "default") return "Permission not requested yet.";
    return pushSubscribed ? "This device is subscribed for push notifications." : "Permission granted but not subscribed - click Enable.";
  })();

  return (
    <Card icon="bell" title="Notification Settings">
      <div className="wc-notlist">
        {NOTIF_ITEMS.map((n) => (
          <div className="wc-notrow" key={n.key}>
            <div><div className="wc-notrow-l">{n.label}</div><div className="wc-notrow-d">{n.desc}</div></div>
            <AdmToggle on={settings[n.key]} onChange={() => toggle(n.key)} />
          </div>
        ))}
      </div>

      <div className="wc-admin-band">
        <div>
          <div className="wc-band-t">Browser notifications on this device</div>
          <div className="wc-band-d">{permissionLabel}</div>
          {permission === "denied" ? <div className="wc-band-d" style={{ marginTop: 4 }}>{notificationUnblockSteps()}</div> : null}
        </div>
        <button
          className={pushSubscribed ? "wc-ghostbtn wc-sm" : "wc-primary wc-sm"}
          onClick={() => void (pushSubscribed ? disablePush() : enablePush())}
          disabled={pushBusy || !isWebPushSupported() || permission === "denied"}
        >
          {pushSubscribed ? "Disable" : "Enable"}
        </button>
      </div>

      <TestNotificationRows />
      <InstallAppCard />
    </Card>
  );
}

function TestNotificationRows() {
  const [busy, setBusy] = useState<string | null>(null);
  const send = async (kind: "sms" | "call") => {
    setBusy(kind);
    try {
      await sendTestNotification(kind === "call" ? { type: "call" } : {});
      toast.success(kind === "call" ? "Test call sent. Answer or decline it from the toast or your device." : "Test notification sent. Check the bell, this tab, and any installed device.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send test notification");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="wc-admin-band">
        <div><div className="wc-band-t">Send a test notification</div><div className="wc-band-d">Fires a notification end-to-end so you can verify the bell, in-app toast, sound, and OS push on every signed-in device.</div></div>
        <button className="wc-primary wc-sm" onClick={() => void send("sms")} disabled={busy !== null}><Icon name="arrowUpRight" size={14} />Send test</button>
      </div>
      <div className="wc-admin-band">
        <div><div className="wc-band-t">Send a test call notification</div><div className="wc-band-d">Fires a test incoming-call alert with Answer and Decline buttons. No real call is placed.</div></div>
        <button className="wc-primary wc-sm" onClick={() => void send("call")} disabled={busy !== null}><Icon name="phone" size={14} />Send test call</button>
      </div>
    </>
  );
}

function InstallAppCard() {
  const [hasPrompt, setHasPrompt] = useState(canPromptPwaInstall());
  const [installed, setInstalled] = useState(isPwaInstalled());
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribePwaInstall(() => { setHasPrompt(canPromptPwaInstall()); setInstalled(isPwaInstalled()); }), []);
  const onInstall = async () => {
    setBusy(true);
    try {
      const outcome = await triggerPwaInstall();
      if (outcome === "accepted") toast.success("Installing WarmChats...");
      else if (outcome === "dismissed") toast("Install cancelled");
      else toast.error("Install isn't available in this browser right now.");
    } finally {
      setBusy(false);
    }
  };
  const status = installed
    ? "Installed - you're running the app version."
    : hasPrompt
      ? "Add WarmChats to your home screen or desktop for full notification support."
      : "On iPhone / iPad, tap the Share icon in Safari and choose Add to Home Screen. On desktop you can usually install from the address bar.";
  return (
    <div className="wc-admin-band">
      <div>
        <div className="wc-band-t">Install WarmChats as an app</div>
        <div className="wc-band-d">{status}</div>
        {!installed ? <button className="wc-ghostbtn wc-sm" style={{ marginTop: 8 }} onClick={() => openInstallGuide()}>Show install guide</button> : null}
      </div>
      {!installed ? <button className="wc-primary wc-sm" onClick={() => void onInstall()} disabled={busy || !hasPrompt}><Icon name="download" size={14} />Install</button> : null}
    </div>
  );
}

export function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const m = useMutation({
    mutationFn: () => changePassword({ current_password: current, new_password: next }),
    onSuccess: () => { toast.success("Password updated"); setCurrent(""); setNext(""); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Unable to change password"),
  });
  const onSave = () => { if (!current || !next) { toast.error("Please fill both password fields"); return; } m.mutate(); };
  return (
    <Card icon="lock" title="Password">
      <div className="wc-modal-fieldfull"><div className="wc-modal-lbl">Current password</div><input className="wc-modal-input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div className="wc-modal-fieldfull"><div className="wc-modal-lbl">New password</div><input className="wc-modal-input" type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
      <div className="wc-formfoot"><button className="wc-primary" onClick={onSave} disabled={m.isPending}>{m.isPending ? "Saving..." : "Update password"}</button></div>
    </Card>
  );
}

function ApiKeysCard({ token, orgId }: { token: string; orgId: number }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setKeys(await fetchApiKeys(token, orgId)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load keys"); }
    finally { setLoading(false); }
  }, [token, orgId]);
  useEffect(() => { void load(); }, [load]);

  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copied`); }
    catch { toast.error("Copy failed - select and copy manually"); }
  };
  const create = async () => {
    setCreating(true);
    try { const { secret } = await createApiKey(token, orgId, name.trim() || "Zapier"); setNewSecret(secret); setName(""); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to create key"); }
    finally { setCreating(false); }
  };
  const revoke = async (id: number) => {
    setRevoking(id);
    try { await revokeApiKey(token, id); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to revoke key"); }
    finally { setRevoking(null); }
  };
  const active = keys.filter((k) => !k.revoked_at);

  return (
    <Card icon="zap" title="API & Integrations">
      <div className="wc-band-d" style={{ marginBottom: 8 }}>Connect WarmChats to Zapier and other tools. Generate a key, then paste it when connecting. API base URL:</div>
      <div className="wc-conn-addr"><span className="wc-mono" style={{ overflowWrap: "anywhere" }}>{INTEGRATION_API_BASE}</span><button className="wc-ghostbtn wc-sm" onClick={() => void copy(INTEGRATION_API_BASE, "API URL")}>Copy</button></div>

      {newSecret ? (
        <div className="wc-admin-band" style={{ background: "#FEF3C7", borderColor: "#FDE68A" }}>
          <div style={{ minWidth: 0 }}>
            <div className="wc-band-t" style={{ color: "#92400E" }}>Copy this key now - it will not be shown again</div>
            <div className="wc-mono wc-band-d" style={{ overflowWrap: "anywhere" }}>{newSecret}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="wc-primary wc-sm" onClick={() => void copy(newSecret, "API key")}>Copy</button>
            <button className="wc-ghostbtn wc-sm" onClick={() => setNewSecret(null)}>Done</button>
          </div>
        </div>
      ) : null}

      <div className="wc-formgrid" style={{ marginTop: 12, alignItems: "end" }}>
        <div className="wc-modal-field"><div className="wc-modal-lbl">Key name</div><input className="wc-modal-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zapier - ManyChat" /></div>
        <div className="wc-modal-field" style={{ justifyContent: "flex-end" }}><button className="wc-primary" onClick={() => void create()} disabled={creating}>{creating ? "Generating..." : "Generate key"}</button></div>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div className="wc-band-d">Loading keys...</div>
        ) : active.length === 0 ? (
          <div className="wc-band-d">No API keys yet. Generate one to connect Zapier.</div>
        ) : (
          <table className="wc-reptable">
            <thead><tr><th>Name</th><th>Key</th><th>Last used</th><th></th></tr></thead>
            <tbody>
              {active.map((k) => (
                <tr key={k.id}>
                  <td className="wc-agoal-row-t">{k.name}</td>
                  <td><code className="wc-mono wc-band-d">{k.key_prefix}...</code></td>
                  <td className="wc-band-d">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                  <td><button className="wc-ghostbtn wc-sm wc-danger" onClick={() => void revoke(k.id)} disabled={revoking === k.id}>{revoking === k.id ? "..." : "Revoke"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function TeamCard({ members }: { members: TeamMemberAccount[] }) {
  return (
    <Card icon="users" title="Team accounts">
      <table className="wc-reptable">
        <thead><tr><th>Member</th><th>Email</th><th>SMS</th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id}>
              <td><div className="wc-agoal-row-t">{m.name || "-"}</div><div className="wc-band-d">{m.role || ""}</div></td>
              <td className="wc-band-d">{m.email_summary.connected ? (m.email_summary.address || m.email_summary.provider || "Connected") : "Not connected"}</td>
              <td className="wc-band-d">{m.sms_summary.connected ? m.sms_summary.phone_number : (m.sms_summary.status || "Not connected")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function DeleteAccountCard() {
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: () => { toast.success("Account deleted"); clearStoredAuthState(); navigate("/signup"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete account"),
  });
  const onDelete = () => { if (window.confirm("This will permanently delete your account and org data. Continue?")) m.mutate(); };
  return (
    <div className="wc-panel-card pad wc-admincard">
      <div className="wc-admincard-h"><span className="wc-admincard-ic" style={{ color: "#DC2626", background: "#FEE2E2" }}><Icon name="trash" size={17} /></span>Danger zone</div>
      <div className="wc-band-d" style={{ marginBottom: 12 }}>Deleting your account permanently removes your workspace, leads, automations, and messages. This cannot be undone.</div>
      <button className="wc-ghostbtn wc-sm wc-danger" onClick={onDelete} disabled={m.isPending}>{m.isPending ? "Deleting..." : "Delete account"}</button>
    </div>
  );
}

export function EmailChannelCard({ email, busy, run, token }: {
  email: EmailCard | null;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  token: string;
}) {
  const navigate = useNavigate();
  if (!email) return <Card icon="mail" title="Email channel"><div className="wc-band-d">Loading...</div></Card>;
  const hasConnection = !!(email.address || email.mode);
  const gmailActive = email.gmail.status === "active";
  const gmailNeedsReauth = email.gmail.status === "needs_reauth";
  const hasBusiness = email.mode === "business" && !!email.address;
  const connectGmail = async () => {
    localStorage.setItem("gmail_oauth_return", window.location.pathname);
    const url = await startGmailConnect(token);
    window.location.href = url;
  };
  const connectBusiness = () => { localStorage.setItem("connect_domain_return", window.location.pathname); navigate("/connect-domain"); };

  return (
    <Card icon="mail" title="Email channel">
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4, marginBottom: 8 }}><ConnPill state={email.state} /></div>
      {!hasConnection ? (
        <>
          <div className="wc-band-d" style={{ marginBottom: 10 }}>No email connected yet. Send from your own domain (ElasticEmail, with DNS setup) or connect Gmail (one-click OAuth, no DNS).</div>
          <div className="wc-conn-btns">
            <button className="wc-primary wc-sm" disabled={!!busy} onClick={connectBusiness}><Icon name="building" size={14} />Set up custom domain</button>
            <button className="wc-ghostbtn wc-sm" disabled={!!busy || !email.personal_gmail_allowed} onClick={() => void run("gmail", connectGmail)}><Icon name="mail" size={14} />Connect Gmail</button>
          </div>
        </>
      ) : (
        <>
          <div className="wc-conn-addr"><span className="wc-mono">{email.address || "-"}</span>{email.mode ? <span className="wc-conn-mode">Mode: {email.mode === "business" ? "Business" : "Personal Gmail"}</span> : null}</div>
          <div className="wc-conn-status">
            <ReadyRow label="Sending" ready={email.sending.ready} />
            <ReadyRow label="Receiving" ready={email.receiving.ready} />
            {email.sending.provider ? <div className="wc-band-d">Provider: {email.sending.provider}</div> : null}
            {email.dns ? <div className="wc-band-d">DNS: {email.dns.overall} (SPF {email.dns.spf}, DKIM {email.dns.dkim})</div> : null}
          </div>
          <FixActions actions={email.fix_actions} />
          <div className="wc-conn-btns">
            {gmailNeedsReauth ? <button className="wc-primary wc-sm" disabled={!!busy} onClick={() => void run("gmail", connectGmail)}>Reconnect Gmail</button> : null}
            {hasBusiness ? <button className="wc-ghostbtn wc-sm" disabled={busy === "verify-dns"} onClick={() => void run("verify-dns", async () => { await verifyEmailDns(token, email.address || undefined); toast.success("DNS check completed"); })}><Icon name="refresh" size={14} />Verify DNS</button> : null}
            {gmailActive ? <button className="wc-ghostbtn wc-sm" disabled={!!busy} onClick={() => void run("gmail-disconnect", () => disconnectGmail(token))}>Disconnect Gmail</button> : null}
            {hasBusiness ? (
              <>
                <button className="wc-ghostbtn wc-sm" disabled={!!busy} onClick={connectBusiness}><Icon name="settings" size={14} />Manage domain</button>
                <button className="wc-ghostbtn wc-sm wc-danger" disabled={!!busy} onClick={() => void run("business-disconnect", () => disconnectBusinessEmail(token))}>Disconnect business</button>
              </>
            ) : null}
            {!hasBusiness && gmailActive ? <button className="wc-ghostbtn wc-sm" disabled={!!busy} onClick={connectBusiness}>Add business email</button> : null}
          </div>
        </>
      )}
    </Card>
  );
}

function SendingAddressCard() {
  const qc = useQueryClient();
  const sendingQ = useQuery({
    queryKey: ["sending-address"],
    queryFn: async () => { try { return await fetchSendingAddress(); } catch { return null; } },
    retry: false,
  });
  const data = sendingQ.data as { sending_address?: string; sending_prefix?: string; domain?: string; provider_type?: string; editable?: boolean } | null | undefined;
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);
  useEffect(() => { if (data?.sending_prefix && !seeded) { setDraft(data.sending_prefix); setSeeded(true); } }, [data, seeded]);

  if (!data || !data.sending_address) return null;
  const editable = Boolean(data.editable);
  const save = async () => {
    if (!draft || draft === data.sending_prefix) return;
    setErr("");
    if (draft.length > 64) { setErr("Sending prefix must be 64 characters or fewer."); return; }
    if (draft.includes("..")) { setErr("Sending prefix cannot contain consecutive dots."); return; }
    if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(draft)) { setErr("Use only letters, numbers, dot, underscore, or hyphen, and start and end with a letter or number."); return; }
    setSaving(true);
    try {
      const res = await saveSendingPrefix({ sending_prefix: draft });
      const next = res as { sending_address?: string };
      toast.success(next.sending_address ? `Sending as ${next.sending_address}` : "Sending address updated");
      void qc.invalidateQueries({ queryKey: ["sending-address"] });
    } catch (e) {
      const body = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
      setErr(body?.message || body?.error || "Failed to update sending address.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card icon="mail" title="Sending address">
      <div className="wc-band-d" style={{ marginBottom: 10 }}>Currently sending as <span className="wc-mono">{data.sending_address}</span>.</div>
      {editable ? (
        <>
          <div className="wc-modal-lbl">Local-part (prefix)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="wc-modal-input" style={{ flex: 1 }} value={draft} maxLength={64} placeholder="hello" onChange={(e) => { setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64)); setErr(""); }} />
            <span className="wc-mono wc-band-d">@{data.domain}</span>
          </div>
          {err ? <div className="wc-band-d" style={{ color: "#E11D48", marginTop: 6 }}>{err}</div> : <div className="wc-band-d" style={{ marginTop: 6 }}>Letters, numbers, dot, underscore, hyphen. Max 64 chars; must start and end with a letter or number.</div>}
          <div className="wc-formfoot"><button className="wc-primary wc-sm" onClick={() => void save()} disabled={saving || !draft || draft === data.sending_prefix}>{saving ? "Saving..." : "Save"}</button></div>
        </>
      ) : (
        <div className="wc-band-d">
          {data.provider_type === "elastic-otp"
            ? `The prefix "${data.sending_prefix}" is locked because you verified it via OTP - it maps to a real mailbox at your existing provider. To pick a different prefix, disconnect this domain and re-set-up with WarmChats as your inbox.`
            : data.provider_type === "gmail"
              ? "Gmail-connected accounts send from the address you authorized with Google. To change it, reconnect with a different Google account."
              : "This sending address is managed by your email provider."}
        </div>
      )}
    </Card>
  );
}

export function SmsChannelCard({ sms, busy, run, token }: {
  sms: SmsCard | null;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  token: string;
}) {
  const navigate = useNavigate();
  if (!sms) return <Card icon="message" title="SMS channel"><div className="wc-band-d">Loading...</div></Card>;
  const connected = sms.state !== "not_connected";
  const goConnect = () => { localStorage.setItem("sms_onboarding_return", window.location.pathname); navigate("/connect-phone"); };
  const chips = [`10DLC: ${sms.ten_dlc.status}`, `Brand: ${sms.ten_dlc.brand}`, `Campaign: ${sms.ten_dlc.campaign}`];
  if (sms.ten_dlc.campaign_number_status) chips.push(`Number: ${sms.ten_dlc.campaign_number_status}`);

  return (
    <Card icon="message" title="SMS channel">
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4, marginBottom: 8 }}><ConnPill state={sms.state} /></div>
      <div className="wc-conn-addr"><span className="wc-mono">{sms.phone_number || "-"}</span></div>
      <div className="wc-conn-chips">{chips.map((c) => <span key={c} className="wc-conn-chip">{c}</span>)}</div>
      {sms.ten_dlc.error_reason ? <div className="wc-band-d" style={{ color: "#DC2626", marginTop: 8 }}>{sms.ten_dlc.error_reason}</div> : null}
      <div className="wc-conn-status" style={{ marginTop: 10 }}>
        <ReadyRow label="Sending" ready={sms.sending.ready} />
        <ReadyRow label="Receiving" ready={sms.receiving.ready} />
      </div>
      <FixActions actions={sms.fix_actions} />
      <div className="wc-conn-btns">
        {!connected ? (
          <button className="wc-primary wc-sm" onClick={goConnect}><Icon name="settings" size={14} />Connect SMS</button>
        ) : (
          <>
            <button className="wc-primary wc-sm" onClick={goConnect}><Icon name="settings" size={14} />Manage setup</button>
            <button className="wc-ghostbtn wc-sm" disabled={busy === "sms-refresh"} onClick={() => void run("sms-refresh", async () => { await refreshTelnyxStatus(token); toast.success("SMS status updated"); })}><Icon name="refresh" size={14} />Refresh status</button>
            <button className="wc-ghostbtn wc-sm wc-danger" disabled={!!busy} onClick={() => void run("sms-disconnect", () => disconnectSms(token))}>Disconnect</button>
          </>
        )}
      </div>
    </Card>
  );
}

function DefaultsCard({ data, token, onSaved }: { data: ConnectedAccountsPayload; token: string; onSaved: () => void }) {
  const [emailMode, setEmailMode] = useState<EmailMode>(data.defaults.email_mode);
  const [smsEnabled, setSmsEnabled] = useState<boolean>(data.defaults.sms_enabled);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setEmailMode(data.defaults.email_mode); setSmsEnabled(data.defaults.sms_enabled); }, [data.defaults.email_mode, data.defaults.sms_enabled]);
  const dirty = emailMode !== data.defaults.email_mode || smsEnabled !== data.defaults.sms_enabled;
  const save = async () => {
    if (!data.email.personal_gmail_allowed && emailMode === "personal") { toast.error("Personal Gmail is not available while business email is connected"); return; }
    setSaving(true);
    try { await patchChannelDefaults(token, { email_mode: emailMode, sms_enabled: smsEnabled }); toast.success("Defaults saved"); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  };
  return (
    <Card icon="settings" title="Default channels">
      <div className="wc-band-d" style={{ marginBottom: 10 }}>Used when composing messages unless you pick another sender.</div>
      <div className="wc-formgrid">
        <div className="wc-modal-field">
          <div className="wc-modal-lbl">Default email</div>
          <select className="wc-modal-input wc-modal-select" value={emailMode} onChange={(e) => setEmailMode(e.target.value as EmailMode)}>
            <option value="auto">Auto (prefer business)</option>
            <option value="business">Business email</option>
            <option value="personal" disabled={!data.email.personal_gmail_allowed}>Personal Gmail{!data.email.personal_gmail_allowed ? " (unavailable)" : ""}</option>
          </select>
        </div>
        <div className="wc-modal-field">
          <div className="wc-modal-lbl">SMS default</div>
          <div className="wc-notrow" style={{ padding: 0 }}><div className="wc-notrow-d">Use my SMS number by default</div><AdmToggle on={smsEnabled} onChange={setSmsEnabled} /></div>
        </div>
      </div>
      <div className="wc-formfoot"><button className="wc-primary wc-sm" onClick={() => void save()} disabled={saving || !dirty}>{saving ? "Saving..." : "Save defaults"}</button></div>
    </Card>
  );
}

export function DealDefaultsCard({ orgId, canManage }: { orgId: number | null; canManage: boolean }) {
  const qc = useQueryClient();
  const ddQ = useQuery({ queryKey: ["org-deal-defaults", orgId], queryFn: () => fetchOrgDealDefaults(orgId ?? 0), enabled: Boolean(orgId) });
  const [price, setPrice] = useState("");
  const [pct, setPct] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const d = ddQ.data as { average_deal_price?: number; commission_percent?: number } | undefined;
    if (d && !seeded) {
      if (typeof d.average_deal_price === "number") setPrice(String(d.average_deal_price));
      if (typeof d.commission_percent === "number") setPct(String(d.commission_percent));
      setSeeded(true);
    }
  }, [ddQ.data, seeded]);
  const save = async () => {
    if (!orgId) return;
    const p = Number(price), c = Number(pct);
    if (!Number.isFinite(p) || p <= 0) { toast.error("Enter a valid average sale price"); return; }
    if (!Number.isFinite(c) || c <= 0 || c > 100) { toast.error("Enter a valid commission % (0-100)"); return; }
    setSaving(true);
    try {
      await putOrgDealDefaults(orgId, { average_deal_price: p, commission_percent: c });
      await qc.invalidateQueries({ queryKey: ["org-deal-defaults", orgId] });
      await qc.invalidateQueries({ queryKey: ["dashboard_data"] });
      toast.success("Deal defaults saved - the Pipeline Value KPI uses these.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save deal defaults"); }
    finally { setSaving(false); }
  };
  return (
    <Card icon="dollar" title="Average Sale Price & Commission">
      <div className="wc-band-d" style={{ marginBottom: 10 }}>
        Used to estimate your Pipeline Value: leads without a known price use the average sale price, multiplied by your average commission.
      </div>
      <div className="wc-formgrid">
        <div className="wc-modal-field">
          <div className="wc-modal-lbl">Average sale price ($)</div>
          <input className="wc-modal-input" type="number" min="0" step="1000" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!canManage} placeholder="400000" />
        </div>
        <div className="wc-modal-field">
          <div className="wc-modal-lbl">Average commission (%)</div>
          <input className="wc-modal-input" type="number" min="0" max="100" step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} disabled={!canManage} placeholder="2.5" />
        </div>
      </div>
      <div className="wc-formfoot"><button className="wc-primary wc-sm" onClick={() => void save()} disabled={saving || !canManage}>Save deal defaults</button></div>
    </Card>
  );
}

export function TimezoneCard({ orgId, canManage }: { orgId: number | null; canManage: boolean }) {
  const qc = useQueryClient();
  const tzQ = useQuery({ queryKey: ["org-timezone", orgId], queryFn: () => fetchOrgTimezone(orgId ?? 0), enabled: Boolean(orgId) });
  const [tz, setTz] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const v = (tzQ.data as { timezone?: string } | undefined)?.timezone;
    if (v && !seeded) { setTz(v); setSeeded(true); }
  }, [tzQ.data, seeded]);
  const save = async () => {
    if (!orgId || !tz) return;
    setSaving(true);
    try {
      await patchOrgTimezone(orgId, { timezone: tz });
      // Refresh the shared org-timezone query so the QuietHoursCard live clock
      // updates immediately instead of waiting for a page refresh.
      await qc.invalidateQueries({ queryKey: ["org-timezone", orgId] });
      toast.success("Workspace timezone updated");
    }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save timezone"); }
    finally { setSaving(false); }
  };
  return (
    <Card icon="building" title="Workspace Timezone">
      <div className="wc-band-d" style={{ marginBottom: 10 }}>Your account timezone - the default for new leads, automations, follow-ups, and booking availability. Each recipient's own timezone is used when known.</div>
      <TimezonePicker value={tz} onChange={setTz} disabled={!canManage} inputClassName="wc-modal-input" />
      <div className="wc-formfoot"><button className="wc-primary wc-sm" onClick={() => void save()} disabled={saving || !tz || !canManage}>Save timezone</button></div>
    </Card>
  );
}

function QuietHoursCard({ orgId, canManage }: { orgId: number | null; canManage: boolean }) {
  const quietQ = useQuery({ queryKey: ["org-quiet-hours", orgId], queryFn: () => fetchOrgQuietHours(orgId ?? 0), enabled: Boolean(orgId) });
  // Same cached query the TimezoneCard uses - so the live clock below reflects
  // the saved workspace timezone the quiet-hours window is evaluated in.
  const tzQ = useQuery({ queryKey: ["org-timezone", orgId], queryFn: () => fetchOrgTimezone(orgId ?? 0), enabled: Boolean(orgId) });
  const orgTz = (tzQ.data as { timezone?: string } | undefined)?.timezone || "";
  const [start, setStart] = useState(8);
  const [end, setEnd] = useState(21);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  // Tick every second so the workspace clock stays live (like the inbox clock).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const d = quietQ.data as { start?: number; end?: number } | undefined;
    if (d && !seeded) { if (typeof d.start === "number") setStart(d.start); if (typeof d.end === "number") setEnd(d.end); setSeeded(true); }
  }, [quietQ.data, seeded]);
  const save = async () => {
    if (!orgId) return;
    if (!(start >= 0 && start < end && end <= 24)) { toast.error("Start hour must be before end hour"); return; }
    setSaving(true);
    try { await patchOrgQuietHours(orgId, { start, end }); toast.success("Sending hours saved"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save sending hours"); }
    finally { setSaving(false); }
  };
  const clock = formatZoneClock(orgTz, now);
  const sending = clock ? clock.hour >= start && clock.hour < end : null;
  return (
    <Card icon="clock" title="Quiet hours">
      <div className="wc-band-d" style={{ marginBottom: 12 }}>Messages outside this window in each recipient's local timezone are queued for the next morning.</div>
      {clock ? (
        <div className="wc-band-d" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>Current time in <strong>{orgTz}</strong>: <strong>{clock.time}</strong></span>
          <span style={{ fontWeight: 600, color: sending ? "var(--green, #16a34a)" : "var(--accent, #e07a3f)" }}>{sending ? "Sending now" : "Quiet now"}</span>
        </div>
      ) : null}
      <div className="wc-formgrid">
        <div className="wc-modal-field"><div className="wc-modal-lbl">Start</div><select className="wc-modal-input wc-modal-select" value={start} onChange={(e) => setStart(Number(e.target.value))} disabled={!canManage}>{HOUR_OPTIONS.filter((h) => h < 24).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}</select></div>
        <div className="wc-modal-field"><div className="wc-modal-lbl">End</div><select className="wc-modal-input wc-modal-select" value={end} onChange={(e) => setEnd(Number(e.target.value))} disabled={!canManage}>{HOUR_OPTIONS.filter((h) => h > 0).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}</select></div>
      </div>
      <div className="wc-formfoot"><button className="wc-primary wc-sm" onClick={() => void save()} disabled={saving || !canManage}>Save hours</button></div>
    </Card>
  );
}

function WorkspaceTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = localStorage.getItem("token") || "";
  const { orgId, canManage } = useBoot();

  const connectedQ = useQuery({ queryKey: ["connected-accounts"], queryFn: () => fetchConnectedAccounts(token), enabled: Boolean(token) });
  const data = connectedQ.data ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await connectedQ.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(null); }
  };

  const teamQ = useQuery({
    queryKey: ["connected-accounts-team", orgId],
    queryFn: () => fetchTeamConnectedAccounts(token, orgId ?? undefined),
    enabled: Boolean(token && orgId && canManage && data?.team_mode),
  });

  // Handle the Gmail OAuth ?status= return on mount (qc/navigate are stable).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("status");
    if (!result) return;
    if (result === "success") { toast.success("Gmail connected successfully"); void qc.invalidateQueries({ queryKey: ["connected-accounts"] }); }
    else if (result === "reauth") toast.error("Gmail needs reconnect");
    else toast.error("Gmail connection failed");
    navigate(window.location.pathname, { replace: true });
  }, [qc, navigate]);

  const teamMembers = teamQ.data?.members ?? [];

  return (
    <div className="wc-admin-grid">
      <div className="wc-admin-col">
        <ProfileCard />
        <NotificationsCard />
        <PasswordCard />
        {canManage && orgId ? <ApiKeysCard token={token} orgId={orgId} /> : null}
        {canManage && data?.team_mode && teamMembers.length > 0 ? <TeamCard members={teamMembers} /> : null}
        <DeleteAccountCard />
      </div>

      <div className="wc-admin-col">
        <EmailChannelCard email={data?.email ?? null} busy={busy} run={run} token={token} />
        <SendingAddressCard />
        <SmsChannelCard sms={data?.sms ?? null} busy={busy} run={run} token={token} />
        {data ? <DefaultsCard data={data} token={token} onSaved={() => { void connectedQ.refetch(); }} /> : null}
        <TimezoneCard orgId={orgId} canManage={canManage} />
        <DealDefaultsCard orgId={orgId} canManage={canManage} />
        <QuietHoursCard orgId={orgId} canManage={canManage} />
      </div>
    </div>
  );
}

// Exported so the Admin control center can render the SAME wired billing tab.
export function BillingTab() {
  const { q, profile, billing } = useBoot();
  const planName = resolvePlanName(billing?.plan ?? null, profile?.org?.plan ?? undefined, localStorage.getItem("selectedPlan"));
  const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.free_channel;
  const rawProfile = q.data?.profile ? (q.data.profile as unknown as ProfileResponse) : null;
  const usageRows = buildUsageRows(rawProfile, limits);
  const callingQ = useQuery({ queryKey: ["calling-usage-ws"], queryFn: () => callingApi.getWorkspaceUsage(), retry: false });
  if (callingQ.data) {
    usageRows.push({ label: "Calling minutes", used: Math.round(callingQ.data.usage.totalMinutes), limit: callingQ.data.billingCycle.planLimit });
  }
  const displayPlan = formatPlanLabel(planName);
  const status = billing?.subscription_status || profile?.org?.subscription_status || "inactive";
  const startedLabel = billing?.plan_started_at
    ? new Date(billing.plan_started_at.replace(" ", "T") + "Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;

  // Track which button triggered the portal so only that one shows "Opening...".
  const [portalBusyKey, setPortalBusyKey] = useState<string | null>(null);
  const portalBusy = portalBusyKey !== null;
  const [showCancel, setShowCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  // Only show "Cancel plan" when there's actually something to cancel.
  const canCancel = ["active", "past_due", "trialing", "comp"].includes(status);
  // Saved Stripe cards for this customer (empty for free/comp/no-customer orgs).
  const cardsQ = useQuery({ queryKey: ["payment-methods"], queryFn: fetchPaymentMethods, retry: false });
  const cards = cardsQ.data?.cards ?? [];
  const openPortal = async (key: string) => {
    setPortalBusyKey(key);
    try {
      const res = await openBillingPortal();
      const url = (res as { portal_url?: string }).portal_url;
      if (url) window.open(url, "_blank", "noopener");
      else toast.error((res as { message?: string }).message || "Couldn't open billing portal.");
    } catch (e) {
      const body = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
      toast.error(body?.message || body?.error || "Couldn't open billing portal.");
    } finally {
      setPortalBusyKey(null);
    }
  };

  // Route a "Choose plan" click. An ACTIVE real Stripe subscriber switches plan
  // in the Customer Portal (proration handled by Stripe). A free / comp /
  // canceled org has NO Stripe subscription for the Portal to manage, so it
  // would dead-end there - start a real Checkout instead (which also comps out
  // instantly if the org carries a 100%-off promo code).
  const startPlanChange = async (key: string) => {
    const hasManageableSub = status === "active" || status === "past_due" || status === "trialing";
    if (hasManageableSub) { void openPortal(`plan-${key}`); return; }
    setPortalBusyKey(`plan-${key}`);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/billing/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          planId: key,
          cancelPath: "/settings?tab=billing",
          successPath: "/settings?tab=billing",
          promoCode: localStorage.getItem("wc_promo_code") || "",
        }),
      });
      const data = await res.json();
      if (data.checkout_url) window.location.assign(data.checkout_url);
      else if (data.comped) {
        window.location.assign(
          `/billing/success?comped=1&plan=${encodeURIComponent(data.plan || key)}&return=${encodeURIComponent("/settings?tab=billing")}`,
        );
      } else toast.error((data as { message?: string; error?: string }).message || (data as { error?: string }).error || "Couldn't start checkout.");
    } catch {
      toast.error("Couldn't start checkout.");
    } finally {
      setPortalBusyKey(null);
    }
  };

  const cancelPlan = async () => {
    setCanceling(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/billing/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error((data as { message?: string; error?: string }).message || (data as { error?: string }).error || "Couldn't cancel. Please try again.");
        return;
      }
      if (data.immediate) {
        toast.success(data.message || "Plan canceled - you're back on the Free plan.");
      } else {
        const when = data.ends_at
          ? new Date(data.ends_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
          : "the end of your billing period";
        toast.success(`Your plan will cancel on ${when}. You keep full access until then.`, { duration: 7000 });
      }
      setShowCancel(false);
      setTimeout(() => window.location.reload(), 1600);
    } catch {
      toast.error("Couldn't cancel. Please try again.");
    } finally {
      setCanceling(false);
    }
  };

  return (
    <div className="wc-billing">
      <div className="wc-admin-grid">
        <div className="wc-admin-col">
          <Card icon="trophy" title="Current plan">
            <div className="wc-plan-now">
              <div><div className="wc-plan-name">{displayPlan}</div><div className="wc-plan-price wc-mono">{PLAN_PRICE[planName] || "-"}</div></div>
              <span className="wc-statuspill is-live"><span className="wc-pdot"><span className="wc-pdot-core" style={{ background: "var(--green)" }} /></span>{status}</span>
            </div>
            {startedLabel ? <div className="wc-band-d">Subscribed on {startedLabel}</div> : null}
            <div className="wc-conn-btns" style={{ marginTop: 14 }}>
              <button className="wc-primary wc-sm" onClick={() => void openPortal("manage")} disabled={portalBusy}><Icon name="settings" size={14} />{portalBusyKey === "manage" ? "Opening..." : "Manage subscription"}</button>
              {canCancel ? (
                <button
                  className="wc-ghostbtn wc-sm"
                  onClick={() => setShowCancel(true)}
                  disabled={portalBusy || canceling}
                  style={{ color: "#dc2626", borderColor: "#f0c2c2" }}
                >
                  Cancel plan
                </button>
              ) : null}
            </div>
            <div className="wc-band-d" style={{ marginTop: 8 }}>Change card, swap plan, or view invoices in the secure Stripe portal. Cancel keeps your access until the end of the billing period.</div>
          </Card>

          <Card icon="file" title="Payment method">
            {cards.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {cards.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="wc-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", background: "#eef1f6", color: "#33415c", borderRadius: 6, padding: "5px 9px" }}>
                      {c.brand || "Card"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="wc-mono" style={{ fontSize: 14, letterSpacing: 1.5 }}>{"•••• •••• •••• "}{c.last4 || "••••"}</div>
                      {c.exp_month && c.exp_year ? (
                        <div className="wc-band-d" style={{ marginTop: 2 }}>Expires {String(c.exp_month).padStart(2, "0")} / {c.exp_year}</div>
                      ) : null}
                    </div>
                    {c.is_default && cards.length > 1 ? (
                      <span className="wc-statuspill" style={{ fontSize: 11 }}>Default</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="wc-band-d">No card on file. Cards are managed securely in Stripe - WarmChats never stores your card details.</div>
            )}
            <div className="wc-conn-btns" style={{ marginTop: 12 }}>
              <button className="wc-ghostbtn wc-sm" onClick={() => void openPortal("payment")} disabled={portalBusy}><Icon name="file" size={14} />{portalBusyKey === "payment" ? "Opening..." : "Update payment method"}</button>
            </div>
          </Card>
        </div>

        <div className="wc-admin-col">
          <Card icon="trending" title="Usage this cycle">
            {usageRows.map((u) => {
              const unlimited = u.limit === "unlimited" || u.limit === null || u.limit === undefined;
              const cap = unlimited ? 0 : Number(u.limit);
              return unlimited
                ? <UnlimitedUsageBar key={u.label} label={u.label} used={Number(u.used) || 0} />
                : <UsageBar key={u.label} label={u.label} used={Number(u.used) || 0} cap={cap || 1} />;
            })}
          </Card>
          <Card icon="list" title="Invoices">
            <div className="wc-band-d">View and download past invoices in the billing portal.</div>
            <div className="wc-conn-btns" style={{ marginTop: 12 }}>
              <button className="wc-ghostbtn wc-sm" onClick={() => void openPortal("invoices")} disabled={portalBusy}><Icon name="download" size={14} />{portalBusyKey === "invoices" ? "Opening..." : "View invoices"}</button>
            </div>
          </Card>
        </div>
      </div>

      {/* prototype.css pins .wc-changeplan to order:-1 so it renders at the TOP
          of the flex column (above Current plan / Usage). */}
      <div className="wc-panel-card pad wc-admincard wc-changeplan">
        <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name="layers" size={17} /></span>Change plan</div>
        <div className="wc-plans">
          {PLAN_CARDS.map((p) => {
            const isCurrent = p.key === planName;
            const isPopular = p.key === "growth";
            const price = PLAN_PRICE[p.key] || "-";
            return (
              <div className={"wc-plancard" + (isCurrent ? " is-current" : "") + (isPopular ? " is-pop" : "")} key={p.key}>
                <div className="wc-plancard-top">
                  <span className="wc-plancard-name">{p.name}</span>
                  {isCurrent ? <span className="wc-plancard-cur">Current</span> : isPopular ? <span className="wc-plancard-pop">Most popular</span> : null}
                </div>
                <div className="wc-plancard-tag">{p.tag}</div>
                <div className="wc-plancard-price wc-mono">{price}</div>
                <button
                  className={isCurrent ? "wc-ghostbtn wc-sm wc-full" : "wc-primary wc-sm wc-full"}
                  disabled={isCurrent || (portalBusy && portalBusyKey !== `plan-${p.key}`)}
                  onClick={() => {
                    // Custom Brokerage is sales-led - open the demo Calendly.
                    // Every other plan change happens in the secure Stripe
                    // portal (no in-app card form), matching the other billing
                    // buttons above.
                    if (p.key === "custom_brokerage") window.open(BROKERAGE_DEMO_URL, "_blank", "noopener");
                    else void startPlanChange(p.key);
                  }}
                >
                  {isCurrent
                    ? "Current plan"
                    : p.key === "custom_brokerage"
                      ? "Book demo"
                      : portalBusyKey === `plan-${p.key}`
                        ? "Opening..."
                        : "Choose plan"}
                </button>
                <ul className="wc-plancard-feats">{p.feats.map((f) => <li key={f}><Icon name="check" size={13} />{f}</li>)}</ul>
                {p.locked ? <div className="wc-plan-locked"><div className="wc-plan-lockedh">Upgrade to unlock</div>{p.locked.map((l) => <div className="wc-plan-lock" key={l}><Icon name="lock" size={12} />{l}</div>)}</div> : null}
                {p.overages ? <div className="wc-plan-over"><div className="wc-plan-overh">Overages</div>{p.overages.map((o) => <div className="wc-plan-overrow" key={o[0]}><span>{o[0]}</span><b className="wc-mono">{o[1]}</b></div>)}</div> : null}
              </div>
            );
          })}
        </div>
      </div>

      {showCancel ? createPortal((
        <div
          onClick={() => { if (!canceling) setShowCancel(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center", zIndex: 2000, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 440, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.28)" }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Cancel your subscription?</h3>
            <p style={{ margin: "0 0 20px", color: "#555", fontSize: 14, lineHeight: 1.55 }}>
              {status === "comp"
                ? "This ends your promo access and moves you to the Free plan right away. You can resubscribe anytime."
                : `You'll keep your ${displayPlan} plan and all its features until the end of your current billing period, then your account moves to the Free plan. You can resubscribe anytime.`}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="wc-ghostbtn wc-sm" onClick={() => setShowCancel(false)} disabled={canceling}>Keep my plan</button>
              <button
                onClick={() => void cancelPlan()}
                disabled={canceling}
                style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontWeight: 600, fontSize: 14, cursor: canceling ? "default" : "pointer", opacity: canceling ? 0.7 : 1 }}
              >
                {canceling ? "Canceling..." : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Compliance tab - read-only per-org opt-out / block overview, wired   *
 * to GET /compliance/summary.                                          *
 * ------------------------------------------------------------------ */
interface ComplianceSmsRow {
  contact_id: number;
  phone: string;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  blocked_by_name: string | null;
  lead_id: number | null;
  lead_name: string | null;
}
interface ComplianceEmailRow {
  lead_id: number;
  lead_name: string | null;
  email: string | null;
  last_email_opt_out_at: string | null;
}
interface ComplianceSummary {
  counts: {
    sms: { keyword: number; manual_admin: number; manual_agent: number; manual_import: number; other: number; total: number };
    email: { unsubscribed: number };
  };
  opt_outs: ComplianceSmsRow[];
  blocks: ComplianceSmsRow[];
  unsubscribes: ComplianceEmailRow[];
}
const EMPTY_COMPLIANCE: ComplianceSummary = {
  counts: { sms: { keyword: 0, manual_admin: 0, manual_agent: 0, manual_import: 0, other: 0, total: 0 }, email: { unsubscribed: 0 } },
  opt_outs: [],
  blocks: [],
  unsubscribes: [],
};
function formatComplianceTs(ts: string | null): string {
  if (!ts) return "-";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}
function formatComplianceReason(r: string | null): string {
  if (r === "manual_admin") return "Admin blocked";
  if (r === "manual_agent") return "Agent blocked";
  if (r === "manual_import") return "Marked opted-out at import";
  if (r === "keyword") return "Texted STOP";
  return "Other";
}
function LeadLink({ leadId, name }: { leadId: number | null; name: string | null }) {
  if (!leadId) return <>{name || "-"}</>;
  return <Link to={`/inbox?lead=${leadId}`} style={{ color: "var(--accent-strong)", fontWeight: 600 }}>{name || "Open lead"}</Link>;
}

function ComplianceSection({ title, empty, loading, rows }: {
  title: string;
  empty: string;
  loading: boolean;
  rows: { key: string; contact: React.ReactNode; lead: React.ReactNode; reason: React.ReactNode; when: React.ReactNode }[];
}) {
  return (
    <Card icon="lock" title={title}>
      <table className="wc-reptable">
        <thead><tr><th>Contact</th><th>Lead</th><th>Reason</th><th>When</th></tr></thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <tr><td colSpan={4} className="wc-band-d" style={{ textAlign: "center", padding: "18px 0" }}>Loading...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={4} className="wc-band-d" style={{ textAlign: "center", padding: "18px 0" }}>{empty}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key}>
              <td className="wc-mono">{r.contact}</td>
              <td>{r.lead}</td>
              <td className="wc-band-d">{r.reason}</td>
              <td className="wc-band-d">{r.when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ComplianceTab() {
  const q = useQuery({ queryKey: ["compliance-summary"], queryFn: fetchComplianceSummary });
  const data = (q.data as unknown as ComplianceSummary | undefined) ?? EMPTY_COMPLIANCE;
  const loading = q.isLoading;
  const manualBlocks = data.counts.sms.manual_admin + data.counts.sms.manual_agent + data.counts.sms.manual_import;
  const tiles: { label: string; value: number; icon: string; fg: string; bg: string }[] = [
    { label: "Texted STOP", value: data.counts.sms.keyword, icon: "message", fg: "#DC2626", bg: "#FEE2E2" },
    { label: "Email unsubscribes", value: data.counts.email.unsubscribed, icon: "mail", fg: "#DC2626", bg: "#FEE2E2" },
    { label: "Manual blocks", value: manualBlocks, icon: "lock", fg: "#DC2626", bg: "#FEE2E2" },
    { label: "Total SMS blocked", value: data.counts.sms.total, icon: "lock", fg: "#6B7280", bg: "#F3F4F6" },
  ];
  return (
    <div>
      <div className="wc-band-d" style={{ marginBottom: 16 }}>Everyone in your account who has opted out of SMS, email, or been manually blocked. Outbound to these contacts is refused on every send path. To unblock a contact, contact support so the change is centrally audited.</div>
      <div className="wc-rep-stats" style={{ marginBottom: 18 }}>
        {tiles.map((t) => (
          <div className="wc-stat wc-repstat" key={t.label}>
            <span className="wc-repstat-ic" style={{ color: t.fg, background: t.bg }}><Icon name={t.icon} size={17} /></span>
            <div className="wc-stat-label">{t.label}</div>
            <div className="wc-stat-val wc-mono">{t.value}</div>
          </div>
        ))}
      </div>
      <div className="wc-admin-grid" style={{ gridTemplateColumns: "1fr" }}>
        <ComplianceSection
          title="SMS opt-outs (texted STOP)"
          empty="No one has texted STOP yet."
          loading={loading}
          rows={data.opt_outs.map((r) => ({
            key: `optout-${r.contact_id}`,
            contact: r.phone,
            lead: <LeadLink leadId={r.lead_id} name={r.lead_name} />,
            reason: formatComplianceReason(r.opt_out_reason),
            when: formatComplianceTs(r.opted_out_at),
          }))}
        />
        <ComplianceSection
          title="Manual blocks"
          empty="No manual blocks in your account."
          loading={loading}
          rows={data.blocks.map((r) => ({
            key: `block-${r.contact_id}`,
            contact: r.phone,
            lead: <LeadLink leadId={r.lead_id} name={r.lead_name} />,
            reason: `${formatComplianceReason(r.opt_out_reason)}${r.blocked_by_name ? ` by ${r.blocked_by_name}` : ""}`,
            when: formatComplianceTs(r.opted_out_at),
          }))}
        />
        <ComplianceSection
          title="Email unsubscribes"
          empty="No email unsubscribes yet."
          loading={loading}
          rows={data.unsubscribes.map((r) => ({
            key: `unsub-${r.lead_id}`,
            contact: r.email || "-",
            lead: <LeadLink leadId={r.lead_id} name={r.lead_name} />,
            reason: "Clicked unsubscribe link",
            when: formatComplianceTs(r.last_email_opt_out_at),
          }))}
        />
      </div>
    </div>
  );
}

// Usage row for an unlimited allowance - shows the used count, no cap bar fill.
function UnlimitedUsageBar({ label, used }: { label: string; used: number }) {
  return (
    <div className="wc-usage">
      <div className="wc-usage-top"><span>{label}</span><span className="wc-mono">{used.toLocaleString()} / Unlimited</span></div>
      <div className="wc-usage-bar"><div style={{ width: "2%" }} /></div>
    </div>
  );
}

// Dims + blurs a tab's content and floats a "Coming soon" pill over it, so the
// design is visible but not interactive. Inline styles (Tailwind no-ops in .wcv2).
function ComingSoonCover({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <div aria-hidden style={{ filter: "blur(2.5px)", opacity: 0.55, pointerEvents: "none", userSelect: "none" }}>{children}</div>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 72, background: "rgba(255,255,255,0.45)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 999, background: "#0F172A", color: "#fff", fontWeight: 700, fontSize: 14, boxShadow: "0 10px 28px rgba(0,0,0,0.20)" }}>
          <Icon name="lock" size={16} />Coming soon
        </div>
      </div>
    </div>
  );
}

function Admin() {
  const navigate = useNavigate();
  const isAdmin = typeof window !== "undefined" && localStorage.getItem("is_admin") === "1";
  const { profile, billing } = useBoot();
  const planName = resolvePlanName(billing?.plan ?? null, profile?.org?.plan ?? undefined, localStorage.getItem("selectedPlan"));
  const planStatus = billing?.subscription_status || profile?.org?.subscription_status || "inactive";
  const isBroker = planName === "custom_brokerage";
  const visibleTabs = ADMIN_TABS.filter((t) => isBroker || !BROKER_ONLY_TABS.has(t.k));

  // Active tab lives in ?tab= so it survives reload and is linkable. A Gmail
  // OAuth return (?status=) forces the Workspace tab where its handler lives.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("status") ? "workspace" : (searchParams.get("tab") || "workspace");
  const tab = visibleTabs.some((t) => t.k === rawTab) ? rawTab : "workspace";
  const cur = ADMIN_TABS.find((t) => t.k === tab) || ADMIN_TABS[0];
  const setTab = (next: string) => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        if (next === "workspace") sp.delete("tab"); else sp.set("tab", next);
        return sp;
      },
      { replace: true },
    );
  };

  return (
    <div className="wc-page wc-fade">
      <div className="wc-pagehead">
        <div>
          <div className="wc-eyebrow" style={{ color: "var(--accent-strong)", marginBottom: 6 }}>Admin</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1>{cur.label}</h1>
            {isAdmin && tab === "workspace" ? (
              <button
                onClick={() => navigate("/admin/tools")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 999, border: "1px solid #7DD3FC",
                  background: "#E0F2FE", color: "#0369A1", fontWeight: 600, fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <Icon name="lock" size={14} />Admin Panel
              </button>
            ) : null}
          </div>
          <p>{ADMIN_BLURB[tab]}</p>
        </div>
        <div className="wc-planbadge"><Icon name="checkCircle" size={18} /><div><div className="wc-planbadge-t">PLAN: {formatPlanLabel(planName).toUpperCase()}</div><div className="wc-planbadge-s">Status: {planStatus}</div></div></div>
      </div>

      <div className="wc-admin-tabs">
        {visibleTabs.map((t) => (
          <button key={t.k} className={"wc-dtab" + (tab === t.k ? " is-on" : "")} onClick={() => setTab(t.k)}>{t.label}</button>
        ))}
      </div>

      {tab === "workspace" && <WorkspaceTab />}
      {tab === "billing" && <BillingTab />}
      {tab === "org" && <OrganizationTab />}
      {tab === "exchange" && <LeadExchangeTab />}
      {tab === "compliance" && <ComplianceTab />}
      {tab === "plans" && <ComingSoonCover><ActionPlansTab /></ComingSoonCover>}
      {tab === "integrations" && <ComingSoonCover><IntegrationsTab /></ComingSoonCover>}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <MainLayout title="Settings">
      <div className="wcv2 min-h-[calc(100vh-4rem)] lg:-mx-4 lg:-mt-4">
        <Admin />
      </div>
    </MainLayout>
  );
}
