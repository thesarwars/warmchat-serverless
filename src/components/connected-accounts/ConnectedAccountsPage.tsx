import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
  Unplug,
  Users,
  Zap,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import MainLayout from "../MainLayout";
import { ROLES } from "../../constants/roles";
import {
  type ApiKey,
  INTEGRATION_API_BASE,
  createApiKey,
  fetchApiKeys,
  revokeApiKey,
} from "../../api/integrations";
import {
  type CardState,
  type ChannelDefaults,
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
} from "../../api/connectedAccounts";

const STATE_LABEL: Record<CardState, string> = {
  not_connected: "Not connected",
  connected: "Connected",
  error: "Needs action",
};

const STATE_BADGE: Record<CardState, string> = {
  not_connected: "bg-gray-100 text-gray-700",
  connected: "bg-emerald-100 text-emerald-800",
  error: "bg-amber-100 text-amber-900",
};

function StatusBadge({ state }: { state: CardState }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_BADGE[state]}`}>
      {STATE_LABEL[state]}
    </span>
  );
}

function ReadyRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={ready ? "font-medium text-emerald-700" : "font-medium text-gray-500"}>
        {ready ? "Ready" : "Not ready"}
      </span>
    </div>
  );
}

function FixActionsList({ actions }: { actions: FixAction[] }) {
  if (!actions.length) return null;
  return (
    <ul className="mt-3 space-y-2 rounded-xl border border-amber-100 bg-amber-50/80 p-3">
      {actions.map((a) => (
        <li key={a.code} className="flex gap-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {a.message}
            {a.href ? (
              <a className="ml-1 font-semibold underline" href={a.href}>
                Fix
              </a>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EmailCardSection({
  email,
  busy,
  hasConnection,
  onConnectGmail,
  onReconnectGmail,
  onDisconnectGmail,
  onConnectBusiness,
  onDisconnectBusiness,
  onVerifyDns,
}: {
  email: EmailCard;
  busy: string | null;
  hasConnection: boolean;
  onConnectGmail: () => void;
  onReconnectGmail: () => void;
  onDisconnectGmail: () => void;
  onConnectBusiness: () => void;
  onDisconnectBusiness: () => void;
  onVerifyDns: () => void;
}) {
  const [dnsOpen, setDnsOpen] = useState(false);
  const gmailActive = email.gmail.status === "active";
  const gmailNeedsReauth = email.gmail.status === "needs_reauth";
  const hasBusiness = email.mode === "business" && !!email.address;

  return (
    <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <Mail size={22} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Email</h2>
            <p className="text-sm text-gray-500">Business domain or personal Gmail</p>
          </div>
        </div>
        <StatusBadge state={email.state} />
      </div>

      {!hasConnection ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-purple-100">
              <Globe className="h-4 w-4 text-purple-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Connect a custom domain</h3>
            <p className="mt-1 text-sm text-gray-600">
              Send from your own business domain via ElasticEmail. Requires adding SPF, DKIM and DMARC DNS records.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-gray-500">
              <li>- Send from you@yourcompany.com</li>
              <li>- Higher deliverability and brand trust</li>
              <li>- 5-minute DNS setup with copy-paste records</li>
            </ul>
            <button
              type="button"
              disabled={!!busy}
              onClick={onConnectBusiness}
              className="mt-5 rounded-xl bg-linear-to-r from-purple-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:shadow disabled:opacity-50"
            >
              Set up custom domain
            </button>
          </div>
          <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-orange-100">
              <Mail className="h-4 w-4 text-orange-500" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Connect Gmail</h3>
            <p className="mt-1 text-sm text-gray-600">
              Use your Google account. One-click OAuth, no DNS changes needed. Best for individual senders.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-gray-500">
              <li>- Sends from your existing Gmail address</li>
              <li>- Replies sync into your unified inbox</li>
              <li>- No domain setup required</li>
            </ul>
            <button
              type="button"
              disabled={!!busy || !email.personal_gmail_allowed}
              onClick={onConnectGmail}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {busy === "gmail" && <Loader2 className="h-4 w-4 animate-spin" />}
              Connect Gmail
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm font-medium text-gray-800">{email.address || "-"}</p>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {email.mode ? (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
                Mode: {email.mode === "business" ? "Business" : "Personal Gmail"}
              </span>
            ) : null}
          </div>

          <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-4">
            <ReadyRow label="Sending" ready={email.sending.ready} />
            <ReadyRow label="Receiving" ready={email.receiving.ready} />
            {email.sending.provider ? (
              <p className="text-xs text-gray-500">Provider: {email.sending.provider}</p>
            ) : null}
          </div>

          {email.dns ? (
            <div className="mt-4 rounded-xl border border-gray-100">
              <button
                type="button"
                onClick={() => setDnsOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900"
              >
                DNS ({email.dns.overall})
                {dnsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {dnsOpen ? (
                <div className="space-y-2 border-t border-gray-100 px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">SPF</span>
                    <span className="font-medium capitalize">{email.dns.spf}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">DKIM</span>
                    <span className="font-medium capitalize">{email.dns.dkim}</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <FixActionsList actions={email.fix_actions} />

          <div className="mt-5 flex flex-wrap gap-2">
            {gmailNeedsReauth ? (
              <button
                type="button"
                disabled={!!busy}
                onClick={onReconnectGmail}
                className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Reconnect Gmail
              </button>
            ) : null}
            {hasBusiness ? (
              <button
                type="button"
                disabled={busy === "verify-dns"}
                onClick={onVerifyDns}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === "verify-dns" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Verify DNS
              </button>
            ) : null}
            {gmailActive ? (
              <button
                type="button"
                disabled={!!busy}
                onClick={onDisconnectGmail}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Unplug size={16} />
                Disconnect Gmail
              </button>
            ) : null}
            {hasBusiness ? (
              <>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={onConnectBusiness}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Manage domain
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={onDisconnectBusiness}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-100 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <Unplug size={16} />
                  Disconnect business
                </button>
              </>
            ) : null}
            {!hasBusiness && gmailActive ? (
              <button
                type="button"
                disabled={!!busy}
                onClick={onConnectBusiness}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Add business email
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function SmsCardSection({
  sms,
  busy,
  onConnect,
  onManage,
  onRefresh,
  onDisconnect,
}: {
  sms: SmsCard;
  busy: string | null;
  onConnect: () => void;
  onManage: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const connected = sms.state !== "not_connected";

  return (
    <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <MessageSquare size={22} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">SMS</h2>
            <p className="text-sm text-gray-500">Telnyx 10DLC texting</p>
          </div>
        </div>
        <StatusBadge state={sms.state} />
      </div>

      <p className="mt-4 text-sm font-medium text-gray-800">{sms.phone_number || "-"}</p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
          10DLC: {sms.ten_dlc.status}
        </span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
          Brand: {sms.ten_dlc.brand}
        </span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
          Campaign: {sms.ten_dlc.campaign}
        </span>
        {sms.ten_dlc.campaign_number_status ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
            Number: {sms.ten_dlc.campaign_number_status}
          </span>
        ) : null}
      </div>

      {sms.ten_dlc.error_reason ? (
        <p className="mt-2 text-sm text-red-700">{sms.ten_dlc.error_reason}</p>
      ) : null}

      <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-4">
        <ReadyRow label="Sending" ready={sms.sending.ready} />
        <ReadyRow label="Receiving" ready={sms.receiving.ready} />
      </div>

      <FixActionsList actions={sms.fix_actions} />

      <div className="mt-5 flex flex-wrap gap-2">
        {!connected ? (
          <button
            type="button"
            onClick={onConnect}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Connect SMS
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onManage}
              className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Manage setup
            </button>
            <button
              type="button"
              disabled={busy === "sms-refresh"}
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === "sms-refresh" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh status
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={onDisconnect}
              className="inline-flex items-center gap-2 rounded-xl border border-red-100 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Unplug size={16} />
              Disconnect
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function DefaultsSection({
  defaults,
  personalGmailAllowed,
  teamMode,
  saving,
  onSave,
}: {
  defaults: ChannelDefaults;
  personalGmailAllowed: boolean;
  teamMode: boolean;
  saving: boolean;
  onSave: (next: ChannelDefaults) => void;
}) {
  const [emailMode, setEmailMode] = useState<EmailMode>(defaults.email_mode);
  const [smsEnabled, setSmsEnabled] = useState<boolean>(defaults.sms_enabled);

  useEffect(() => {
    setEmailMode(defaults.email_mode);
    setSmsEnabled(defaults.sms_enabled);
  }, [defaults.email_mode, defaults.sms_enabled]);

  const dirty = emailMode !== defaults.email_mode || smsEnabled !== defaults.sms_enabled;

  return (
    <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Default channels</h2>
      <p className="mt-1 text-sm text-gray-500">
        Used when composing messages unless you pick another sender.
        {teamMode ? " Your organization has multiple members - each user keeps their own number." : ""}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Default email</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
            value={emailMode}
            onChange={(e) => setEmailMode(e.target.value as EmailMode)}
          >
            <option value="auto">Auto (prefer business)</option>
            <option value="business">Business email</option>
            <option value="personal" disabled={!personalGmailAllowed}>
              Personal Gmail{!personalGmailAllowed ? " (unavailable)" : ""}
            </option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">SMS enabled</label>
          <label className="flex h-10.5 items-center gap-2 rounded-lg border border-gray-200 px-3">
            <input
              type="checkbox"
              checked={smsEnabled}
              onChange={(e) => setSmsEnabled(e.target.checked)}
            />
            <span className="text-sm text-gray-700">Use my SMS number by default</span>
          </label>
        </div>
      </div>
      <button
        type="button"
        disabled={saving || !dirty}
        onClick={() => onSave({ email_mode: emailMode, sms_enabled: smsEnabled })}
        className="mt-4 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save defaults"}
      </button>
    </section>
  );
}

function TeamSection({ members }: { members: TeamMemberAccount[] }) {
  return (
    <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <Users size={20} className="text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-900">Team accounts</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-130 text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-2 pr-4 font-semibold">Member</th>
              <th className="pb-2 pr-4 font-semibold">Email</th>
              <th className="pb-2 font-semibold">SMS</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} className="border-b border-gray-50">
                <td className="py-3 pr-4">
                  <div className="font-medium text-gray-900">{m.name || "-"}</div>
                  <div className="text-xs text-gray-500">{m.role || ""}</div>
                </td>
                <td className="py-3 pr-4">
                  {m.email_summary.connected ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 size={14} />
                      {m.email_summary.address || m.email_summary.provider}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not connected</span>
                  )}
                </td>
                <td className="py-3">
                  {m.sms_summary.connected ? (
                    <span className="text-emerald-700">{m.sms_summary.phone_number}</span>
                  ) : (
                    <span className="text-gray-400">{m.sms_summary.status || "Not connected"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApiIntegrationsSection({ token, orgId }: { token: string; orgId: number }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setKeys(await fetchApiKeys(token, orgId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed - select and copy manually");
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      const { secret } = await createApiKey(token, orgId, name.trim() || "Zapier");
      setNewSecret(secret);
      setName("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: number) => {
    setRevoking(id);
    try {
      await revokeApiKey(token, id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setRevoking(null);
    }
  };

  const activeKeys = keys.filter((k) => !k.revoked_at);

  return (
    <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <KeyRound size={22} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">API &amp; Integrations</h2>
            <p className="text-sm text-gray-500">Connect WarmChats to Zapier, ManyChat, and other tools</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <Zap size={16} /> Connect with Zapier
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-indigo-900/90">
          <li>Generate a key below and copy it.</li>
          <li>In Zapier, add the WarmChats app and paste the key when asked to connect.</li>
          <li>Build a Zap - e.g. trigger on ManyChat &quot;New Subscriber&quot; and use the WarmChats &quot;Create or Update Lead&quot; action.</li>
        </ol>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-gray-700">
            {INTEGRATION_API_BASE}
          </code>
          <button
            type="button"
            onClick={() => void copy(INTEGRATION_API_BASE, "API URL")}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            <Copy size={14} /> Copy
          </button>
        </div>
      </div>

      {newSecret ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle size={16} /> Copy this key now - it will not be shown again
          </div>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-gray-800">{newSecret}</code>
            <button
              type="button"
              onClick={() => void copy(newSecret, "API key")}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600"
            >
              <Copy size={14} /> Copy
            </button>
            <button
              type="button"
              onClick={() => setNewSecret(null)}
              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-50">
          <label className="mb-1 block text-xs font-medium text-gray-600">Key name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Zapier - ManyChat"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <button
          type="button"
          disabled={creating}
          onClick={() => void create()}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Generate key
        </button>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" /> Loading keys...
          </div>
        ) : activeKeys.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">No API keys yet. Generate one to connect Zapier.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-130 text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-2 pr-4 font-semibold">Name</th>
                  <th className="pb-2 pr-4 font-semibold">Key</th>
                  <th className="pb-2 pr-4 font-semibold">Last used</th>
                  <th className="pb-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {activeKeys.map((k) => (
                  <tr key={k.id} className="border-b border-gray-50">
                    <td className="py-3 pr-4 font-medium text-gray-900">{k.name}</td>
                    <td className="py-3 pr-4">
                      <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{k.key_prefix}...</code>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        disabled={revoking === k.id}
                        onClick={() => void revoke(k.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {revoking === k.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ConnectedAccountsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token") || "";
  const roleName = localStorage.getItem("role_name") || "";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConnectedAccountsPayload | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const canViewTeam = roleName === ROLES.OWNER || roleName === ROLES.MANAGER;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await fetchConnectedAccounts(token);
      setData(payload);

      if (payload.team_mode && canViewTeam) {
        try {
          const team = await fetchTeamConnectedAccounts(token, payload.org_id ?? undefined);
          setTeamMembers(team.members);
        } catch {
          setTeamMembers([]);
        }
      } else {
        setTeamMembers([]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, canViewTeam]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("status");
    if (!result) return;
    if (result === "success") {
      toast.success("Gmail connected successfully");
      void load();
    } else if (result === "reauth") {
      toast.error("Gmail needs reconnect");
    } else {
      toast.error("Gmail connection failed");
    }
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, load, navigate]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const connectGmail = async () => {
    localStorage.setItem("gmail_oauth_return", location.pathname);
    const url = await startGmailConnect(token);
    window.location.href = url;
  };

  const saveDefaults = async (next: ChannelDefaults) => {
    if (!data) return;
    if (!data.email.personal_gmail_allowed && next.email_mode === "personal") {
      toast.error("Personal Gmail is not available while business email is connected");
      return;
    }
    setSavingDefaults(true);
    try {
      await patchChannelDefaults(token, next);
      toast.success("Defaults saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingDefaults(false);
    }
  };

  if (!token) {
    const signInMsg = <p className="p-8 text-gray-600">Please sign in again.</p>;
    return embedded ? signInMsg : <MainLayout>{signInMsg}</MainLayout>;
  }

  const hasConnection = !!(data && data.email && (data.email.address || data.email.mode));
  const connectedSummary = data?.email?.address
    ? { provider: data.email.mode === "business" ? "business email" : "Gmail", address: data.email.address }
    : null;

  const body = (
    <>
      <Toaster position="top-right" />
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-col gap-6 overflow-y-auto pb-8">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={15} /> Back to dashboard
        </button>

        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Connected Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage email and SMS channels, DNS verification, and default senders.
          </p>
        </div>

        {connectedSummary ? (
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span>
              Already connected via <strong>{connectedSummary.provider}</strong>: {connectedSummary.address}
            </span>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 className="mr-2 animate-spin" size={24} />
            Loading...
          </div>
        ) : data ? (
          <>
            <EmailCardSection
              email={data.email}
              busy={busy}
              hasConnection={hasConnection}
              onConnectGmail={() => void run("gmail", connectGmail)}
              onReconnectGmail={() => void run("gmail", connectGmail)}
              onDisconnectGmail={() => void run("gmail-disconnect", () => disconnectGmail(token))}
              onConnectBusiness={() => {
                localStorage.setItem("connect_domain_return", location.pathname);
                navigate("/connect-domain");
              }}
              onDisconnectBusiness={() => void run("business-disconnect", () => disconnectBusinessEmail(token))}
              onVerifyDns={() =>
                void run("verify-dns", async () => {
                  await verifyEmailDns(token, data.email.address || undefined);
                  toast.success("DNS check completed");
                })
              }
            />

            <SmsCardSection
              sms={data.sms}
              busy={busy}
              onConnect={() => {
                localStorage.setItem("sms_onboarding_return", location.pathname);
                navigate("/connect-phone");
              }}
              onManage={() => {
                localStorage.setItem("sms_onboarding_return", location.pathname);
                navigate("/connect-phone");
              }}
              onRefresh={() =>
                void run("sms-refresh", async () => {
                  await refreshTelnyxStatus(token);
                  toast.success("SMS status updated");
                })
              }
              onDisconnect={() => void run("sms-disconnect", () => disconnectSms(token))}
            />

            <DefaultsSection
              defaults={data.defaults}
              personalGmailAllowed={data.email.personal_gmail_allowed}
              teamMode={data.team_mode}
              saving={savingDefaults}
              onSave={(next) => void saveDefaults(next)}
            />

            {canViewTeam && data.org_id ? (
              <ApiIntegrationsSection token={token} orgId={data.org_id} />
            ) : null}

            {data.team_mode && canViewTeam && teamMembers.length > 0 ? (
              <TeamSection members={teamMembers} />
            ) : null}

            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh all
            </button>
          </>
        ) : (
          <p className="text-gray-500">Could not load account status.</p>
        )}
      </div>
    </>
  );

  // Standalone page at /connect-email (wraps its own MainLayout chrome). The
  // `embedded` mode renders the bare body for hosts that supply their own chrome.
  return embedded ? body : <MainLayout>{body}</MainLayout>;
}
