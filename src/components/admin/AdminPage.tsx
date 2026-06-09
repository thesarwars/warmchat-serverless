import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import { Icon } from "@/components/ai-v2/Icon";
import AdminOverviewTab from "@/components/admin/AdminOverviewTab";
import AdminMessagingTab from "@/components/admin/AdminMessagingTab";
import AdminGoalsTab from "@/components/admin/AdminGoalsTab";
import { BillingTab as SettingsBillingTab, NotificationsCard, PasswordCard, TimezoneCard, EmailChannelCard, SmsChannelCard } from "@/components/settings/SettingsPage";
import { fetchConnectedAccounts } from "@/api/connectedAccounts";
import { inviteUser } from "@/helpers/backend";
import toast from "react-hot-toast";
import "@/components/ai-v2/prototype.css";

/*
 * Admin - business control center, ported from docs/updated-docs/admin.jsx
 * (+ admin-prompt.md) through the prototype's .wc-* classes under .wcv2.
 * Tabs: Overview, Users, Messaging, Goals, Integrations, Billing & Usage.
 * Overview / Messaging / Goals reuse the Reporting design tabs; Users folds in
 * workspace settings. Live-data wiring lands per tab in the following stages.
 */

const ADMIN_TABS = [
  { k: "overview", label: "Overview" },
  { k: "org", label: "Users" },
  { k: "messaging", label: "Messaging" },
  { k: "goals", label: "Goals" },
  { k: "integrations", label: "Integrations" },
  { k: "billing", label: "Billing & Usage" },
] as const;

const ADMIN_BLURB: Record<string, string> = {
  overview: "Track leads, conversations, appointments, pipeline, AI impact, and closed business.",
  org: "Manage users and their roles across your organization.",
  messaging: "Volume, response times, and engagement across SMS, email, and AI conversations.",
  goals: "Set and track revenue, deal, and activity goals for your team.",
  integrations: "Connect WarmChats to your CRM, calendar, dialer, and the tools your team already uses.",
  billing: "Manage your plan, payment method, usage, and invoices.",
};

/* ---- brand logo SVGs (from admin.jsx) ---- */
const LOGO_META = '<svg viewBox="0 0 36 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="metaGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0099FF"/><stop offset="1" stop-color="#0064E1"/></linearGradient></defs><path d="M18 12 C15 6 12 5 9 6.5 C5 8.5 5 15.5 9 17.5 C12 19 15 18 18 12 C21 6 24 5 27 6.5 C31 8.5 31 15.5 27 17.5 C24 19 21 18 18 12 Z" fill="none" stroke="url(#metaGrad)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOGO_INSTAGRAM = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="igGrad" cx="0.3" cy="1" r="1.1"><stop offset="0" stop-color="#FED576"/><stop offset="0.26" stop-color="#F47133"/><stop offset="0.61" stop-color="#BC3081"/><stop offset="1" stop-color="#4C63D2"/></radialGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igGrad)"/><rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.6" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="#fff"/></svg>';
const LOGO_FACEBOOK = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#1877F2"/><path d="M14.9 12.6h-2v7.3a10 10 0 0 1-1.8 0v-7.3H9.2v-2.4h1.9V8.5c0-2 1.2-3 2.9-3 .8 0 1.5.06 1.7.09v2H14.5c-.9 0-1.1.43-1.1 1.06v1.55h2.2l-.3 2.4Z" fill="#fff"/></svg>';
const LOGO_ZAPIER = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#FF4F00" d="M23.708 10.21h-6.305l4.458-4.458a11.97 11.97 0 0 0-1.302-1.831 12.04 12.04 0 0 0-1.831-1.302L14.27 7.077V.772A12.07 12.07 0 0 0 12.001.56c-.772 0-1.53.074-2.266.212v6.305L5.276 2.619a11.97 11.97 0 0 0-1.83 1.303 12.03 12.03 0 0 0-1.302 1.83L6.603 10.21H.297S.085 11.226.085 12.001q0 1.162.211 2.266h6.305l-4.458 4.458c.376.661.812 1.277 1.303 1.831.554.49 1.17.927 1.831 1.302l4.458-4.458v6.306c.735.137 1.492.211 2.264.212h.004a12.07 12.07 0 0 0 2.264-.212v-6.306l4.459 4.458a12.05 12.05 0 0 0 1.83-1.303 12.05 12.05 0 0 0 1.302-1.83l-4.458-4.458h6.306c.137-.734.211-1.49.212-2.262v-.007c0-.772-.075-1.53-.212-2.265z"/></svg>';
const LOGO_WEBHOOKS = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#64748B" stroke-width="2.1" stroke-linecap="round"><path d="M11 7.8 7.3 13.6"/><path d="M13 7.8 16.7 13.6"/><path d="M8.7 16.4h6.6"/></g><circle cx="12" cy="6" r="2.7" fill="#64748B"/><circle cx="6" cy="16.6" r="2.7" fill="#64748B"/><circle cx="18" cy="16.6" r="2.7" fill="#64748B"/></svg>';

interface IntItem { name: string; desc: string; color: string; letter: string; logo?: string; on: boolean }
const INTEGRATIONS: { cat: string; items: IntItem[] }[] = [
  { cat: "CRM & Lead Sources", items: [
    { name: "Zillow Premier Agent", desc: "Sync leads from Zillow & Trulia", color: "#1E40AF", letter: "Z", on: true },
    { name: "Follow Up Boss", desc: "Two-way CRM contact sync", color: "#0F172A", letter: "F", on: false },
    { name: "Meta Lead Ads", desc: "Import leads from Facebook & Instagram ads", color: "#0866FF", letter: "M", logo: LOGO_META, on: false },
  ] },
  { cat: "Calendar & Scheduling", items: [
    { name: "Google Calendar", desc: "Two-way appointment sync", color: "#4285F4", letter: "G", on: true },
    { name: "Outlook Calendar", desc: "Sync Microsoft 365 events", color: "#0078D4", letter: "O", on: false },
    { name: "Calendly", desc: "Let leads self-book showings", color: "#006BFF", letter: "C", on: true },
  ] },
  { cat: "Automation", items: [
    { name: "Instagram", desc: "Auto-reply to DMs & story mentions", color: "#BC3081", letter: "I", logo: LOGO_INSTAGRAM, on: false },
    { name: "Facebook", desc: "Capture Messenger leads & page comments", color: "#1877F2", letter: "F", logo: LOGO_FACEBOOK, on: false },
    { name: "ManyChat", desc: "Automate Instagram, Messenger & WhatsApp chats", color: "#00B0FF", letter: "M", on: false },
    { name: "Zapier", desc: "Connect 6,000+ apps", color: "#FF4F00", letter: "Z", logo: LOGO_ZAPIER, on: true },
    { name: "Webhooks", desc: "Push events to any endpoint", color: "#64748B", letter: "W", logo: LOGO_WEBHOOKS, on: false },
  ] },
];

function Card({ icon, title, children, className }: { icon: string; title: string; children: ReactNode; className?: string }) {
  return (
    <div className={"wc-panel-card pad wc-admincard " + (className || "")}>
      <div className="wc-admincard-h"><span className="wc-admincard-ic"><Icon name={icon} size={17} /></span>{title}</div>
      {children}
    </div>
  );
}

/* ---- Users tab (= WorkspaceTab: users + notifications + channels + timezone + password) ---- */
function UsersTab() {
  const navigate = useNavigate();
  // Wire the channel / timezone cards to the SAME live data as Settings → Workspace.
  const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
  const orgId = typeof window !== "undefined" ? Number(localStorage.getItem("org_id")) || null : null;
  const canManage = true; // the Admin tab is gated to workspace admins
  const connectedQ = useQuery({ queryKey: ["connected-accounts"], queryFn: () => fetchConnectedAccounts(token), enabled: Boolean(token) });
  const conn = connectedQ.data ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await connectedQ.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(null); }
  };
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Representative");
  const [sending, setSending] = useState(false);
  const sendInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) { toast.error("Email is required"); return; }
    setSending(true);
    try {
      await inviteUser({ email, role: inviteRole });
      toast.success(`Invite sent to ${email}`);
      setShowInvite(false); setInviteEmail(""); setInviteRole("Representative");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="wc-admin-grid">
      {showInvite && (
        <div className="wc-modal-scrim" onClick={() => !sending && setShowInvite(false)}>
          <div className="wc-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <button className="wc-modal-x" onClick={() => setShowInvite(false)}><Icon name="x" size={16} /></button>
            <div className="wc-modal-title">Invite user</div>
            <div className="wc-modal-crumb"><span className="wc-band-d">They'll get an email invite to join this workspace.</span></div>
            <div className="wc-modal-fieldfull">
              <div className="wc-modal-lbl">Email</div>
              <input className="wc-modal-input" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@company.com" autoFocus />
            </div>
            <div className="wc-modal-fieldfull">
              <div className="wc-modal-lbl">Role</div>
              <select className="wc-modal-input wc-modal-select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="Representative">Agent</option>
                <option value="Manager">Manager</option>
                <option value="Owner">Owner</option>
              </select>
            </div>
            <div className="wc-modal-foot">
              <button className="wc-ghostbtn wc-sm" onClick={() => setShowInvite(false)} disabled={sending}>Cancel</button>
              <button className="wc-primary wc-sm" onClick={sendInvite} disabled={sending}>{sending ? "Sending…" : "Send invite"}</button>
            </div>
          </div>
        </div>
      )}
      <div className="wc-admin-col">
        <Card icon="users" title="Users" className="wc-orgcard">
          <div className="wc-admincard-h2-row">
            <span className="wc-band-d">Manage who has access to this workspace.</span>
            <button className="wc-primary wc-sm" onClick={() => setShowInvite(true)}><Icon name="plus" size={14} />Invite user</button>
          </div>
          <div className="wc-orgtable-wrap">
            <table className="wc-reptable">
              <thead><tr><th>User</th><th>Role</th><th>Team</th><th>Office</th><th>Status</th><th>Leads</th><th>Appts</th><th>Deals</th><th>Lead→Appt</th><th>Avg Response</th><th>Revenue</th><th></th></tr></thead>
              <tbody>
                <tr>
                  <td><div className="wc-goalrow-agent"><span className="wc-agoal-lav">JV</span><div><div className="wc-agoal-row-t">Joseph Velasquez</div><div className="wc-band-d">joseph@jovrealestate.com</div></div></div></td>
                  <td><span className="wc-cbadge" style={{ color: "#0EA5E9", background: "#E7F6FD" }}>Admin</span></td>
                  <td className="wc-band-d">Listings</td>
                  <td className="wc-band-d">Burbank HQ</td>
                  <td><span className="wc-actstatus is-online"><span className="wc-actdot-on" />Active</span></td>
                  <td className="wc-mono"><b>142</b></td>
                  <td className="wc-mono"><b>18</b></td>
                  <td className="wc-mono"><b>4</b></td>
                  <td className="wc-mono">14.8%</td>
                  <td className="wc-mono">42s</td>
                  <td className="wc-mono"><b>$1.24M</b></td>
                  <td><button className="wc-task-open" title="Manage" onClick={() => navigate("/team/users")}><Icon name="more" size={15} /></button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <NotificationsCard />
      </div>

      <div className="wc-admin-col">
        <EmailChannelCard email={conn?.email ?? null} busy={busy} run={run} token={token} />
        <SmsChannelCard sms={conn?.sms ?? null} busy={busy} run={run} token={token} />
        <TimezoneCard orgId={orgId} canManage={canManage} />
        <PasswordCard />
      </div>
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
  return (
    <div>
      <div className="wc-rep-stats" style={{ marginBottom: 18 }}>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#16A34A", background: "#E8F8ED" }}><Icon name="checkCircle" size={17} /></span><div className="wc-stat-label">Connected</div><div className="wc-stat-val wc-mono">7</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#EA580C", background: "var(--accent-soft)" }}><Icon name="zap" size={17} /></span><div className="wc-stat-label">Needs Setup</div><div className="wc-stat-val wc-mono">2</div></div>
        <div className="wc-stat wc-repstat"><span className="wc-repstat-ic" style={{ color: "#DC2626", background: "#FEE2E2" }}><Icon name="x" size={17} /></span><div className="wc-stat-label">Sync Errors</div><div className="wc-stat-val wc-mono">0</div></div>
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
                    <span className="wc-intcard-logo" style={it.logo ? { background: "#fff", boxShadow: "inset 0 0 0 1px var(--line)" } : { background: it.color }}>
                      {it.logo ? <span className="wc-intlogo-svg" dangerouslySetInnerHTML={{ __html: it.logo }} /> : it.letter}
                    </span>
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

function Admin() {
  // Active tab lives in the URL (?tab=...), matching the Settings page pattern,
  // so tabs are deep-linkable and back/forward works.
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab = ADMIN_TABS.some((t) => t.k === raw) ? (raw as string) : "overview";
  const cur = ADMIN_TABS.find((t) => t.k === tab) || ADMIN_TABS[0];
  const setTab = (k: string) => setParams({ tab: k });
  const navigate = useNavigate();
  const isSiteAdmin = typeof window !== "undefined" && localStorage.getItem("is_admin") === "1";
  return (
    <div className="wc-page wc-fade">
      <div className="wc-pagehead">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="wc-eyebrow" style={{ color: "var(--accent-strong)" }}>Admin</div>
            {isSiteAdmin && (
              <button
                onClick={() => navigate("/admin/tools")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 13px", borderRadius: 999, border: "1px solid #7DD3FC",
                  background: "#E0F2FE", color: "#0369A1", fontWeight: 600, fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <Icon name="lock" size={14} />Admin Panel
              </button>
            )}
          </div>
          <h1>{cur.label}</h1>
          <p>{ADMIN_BLURB[cur.k]}</p>
        </div>
        <div className="wc-planbadge">
          <Icon name="checkCircle" size={18} />
          <div><div className="wc-planbadge-t">PLAN: GROWTH</div><div className="wc-planbadge-s">Status: active</div></div>
        </div>
      </div>
      <div className="wc-admin-tabs">
        {ADMIN_TABS.map((t) => (
          <button key={t.k} className={"wc-dtab" + (tab === t.k ? " is-on" : "")} onClick={() => setTab(t.k)}>{t.label}</button>
        ))}
      </div>
      {tab === "overview" && <AdminOverviewTab />}
      {tab === "org" && <UsersTab />}
      {tab === "messaging" && <AdminMessagingTab />}
      {tab === "goals" && <AdminGoalsTab />}
      {tab === "integrations" && <IntegrationsTab />}
      {tab === "billing" && <SettingsBillingTab />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <MainLayout title="Admin">
      <div className="wcv2 min-h-[calc(100vh-4rem)] lg:-mx-4 lg:-mt-4">
        <Admin />
      </div>
    </MainLayout>
  );
}
