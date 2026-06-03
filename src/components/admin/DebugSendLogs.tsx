import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import MainLayout from "@/components/MainLayout";
import { toast } from "sonner";
import { SMS_SEGMENT_LENGTH, smsSegmentCount, smsSegmentError } from "@/utils/smsSegments";
import { SMS_MAX_SEGMENTS } from "@/components/inbox/constants";

/**
 * /admin/debug - Owner-only debug feed for the mock send layer plus the big
 * "Mock send APIs" toggle. Hits two endpoints:
 *
 *   GET/POST /api/admin/mock-toggle   - flag persisted in app_settings
 *   GET      /api/admin/mock-logs     - paginated rows + counts
 *
 * Page size is fixed at 50. The auto-refresh switch defaults ON and ticks
 * every 5s; "Refresh now" forces an immediate fetch. Channel filter narrows
 * the table only - the counter pills always reflect the org-wide totals so
 * you can see what's happening across providers at a glance.
 */

interface MockLogRow {
  id: number;
  channel: string;
  direction: string;
  provider: string;
  from_address: string | null;
  to_address: string;
  subject: string | null;
  body: string | null;
  org_id: number | null;
  lead_id: number | null;
  automation_id: number | null;
  rate_acquired: number;
  second_bucket: number | null;
  created_at: string | null;
}

interface Counts {
  total: number;
  sms: number;
  mms: number;
  email: number;
  telnyx: number;
  elastic: number;
  gmail: number;
  last_1m: number;
  last_5m: number;
  last_15m: number;
}

interface PerNumberRow {
  channel: string;
  sender_key: string;
  sent_60s: number;
  peak_per_sec: number;
}

interface RateLimiterRow {
  channel: string;
  sender_key: string;
  count: number;
  second_bucket: number;
}

interface LogsResponse {
  rows: MockLogRow[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  counts: Counts;
  per_number?: PerNumberRow[];
  rate_limiter_recent?: RateLimiterRow[];
}

interface Account {
  user_id: number;
  name: string | null;
  email: string | null;
  org_id: number | null;
  lead_count: number;
  telnyx_phone_number: string | null;
  email_address: string | null;
  can_sms: boolean;
  can_email: boolean;
}

interface LeadOption {
  id: number;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

type ReplyChannel = "sms" | "email";

/**
 * When the "Reply" button on a log row is used we already know the exact
 * addresses (the inbound is the row's send with from/to swapped), so we bypass
 * the account/lead dropdowns and post explicit values plus the row's lead_id.
 */
interface DirectTarget {
  channel: ReplyChannel;
  from: string;
  to: string;
  leadId: number | null;
  label: string;
}

const SMS_PER_SEC_PER_PHONE = 49;
const MMS_PER_SEC_PER_PHONE = 14;
const EMAIL_PER_SEC = 10;

// Realistic caps for the simulated reply body so a tester can't paste a wall
// of example text. SMS matches the inbox composer (5 segments); email gets a
// sane single-reply ceiling.
const SMS_MAX_CHARS = SMS_SEGMENT_LENGTH * SMS_MAX_SEGMENTS;
const EMAIL_MAX_CHARS = 2000;

interface ToggleResponse {
  enabled: boolean;
  source: "db" | "env";
}

type ChannelFilter = "all" | "sms" | "mms" | "email";
const CHANNEL_FILTERS: ChannelFilter[] = ["all", "sms", "mms", "email"];
const PAGE_SIZE = 50;

function formatTimestamp(ts: string | null): string {
  if (!ts) return "-";
  // mock_send_log.created_at is stored as SQLite UTC text ("YYYY-MM-DD HH:MM:SS").
  // Treat it as UTC so the local-time rendering is correct.
  const normalized = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return ts;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function truncate(s: string | null, max = 80): string {
  if (!s) return "";
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? trimmed.slice(0, max) + "..." : trimmed;
}

function leadLabel(l: LeadOption): string {
  const name = l.name || [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
  const contact = l.phone || l.email || "no contact";
  return `${name || "Unnamed"} ${contact} (#${l.id})`;
}

const EMPTY_COUNTS: Counts = {
  total: 0, sms: 0, mms: 0, email: 0,
  telnyx: 0, elastic: 0, gmail: 0,
  last_1m: 0, last_5m: 0, last_15m: 0,
};

export default function DebugSendLogs() {
  const [rows, setRows] = useState<MockLogRow[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [perNumber, setPerNumber] = useState<PerNumberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [mockEnabled, setMockEnabled] = useState<boolean | null>(null);
  const [mockSource, setMockSource] = useState<"db" | "env" | null>(null);
  const [toggling, setToggling] = useState(false);

  // ---- "Simulate inbound reply" composer state ----
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [replyChannel, setReplyChannel] = useState<ReplyChannel>("sms");
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  // Set when "Reply" is clicked on a log row - overrides the dropdowns.
  const [directTarget, setDirectTarget] = useState<DirectTarget | null>(null);

  const fetchLogs = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (channel !== "all") params.set("channel", channel);
      params.set("page", String(page));
      params.set("page_size", String(PAGE_SIZE));
      const res = await axios.get<LogsResponse>(
        `/api/admin/mock-logs?${params.toString()}`,
        { withCredentials: true },
      );
      setRows(res.data.rows || []);
      setCounts(res.data.counts || EMPTY_COUNTS);
      setPerNumber(res.data.per_number || []);
      setTotalPages(res.data.total_pages || 1);
      setTotal(res.data.total || 0);
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } } };
      if (!opts?.silent) {
        toast.error(ax?.response?.data?.message || "Failed to load mock logs");
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [channel, page]);

  const fetchToggle = useCallback(async () => {
    try {
      const res = await axios.get<ToggleResponse>(
        "/api/admin/mock-toggle",
        { withCredentials: true },
      );
      setMockEnabled(res.data.enabled);
      setMockSource(res.data.source);
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax?.response?.data?.message || "Failed to load toggle state");
    }
  }, []);

  // Initial load + reload when channel / page change.
  useEffect(() => {
    void fetchLogs();
  }, [channel, page, fetchLogs]);

  useEffect(() => {
    void fetchToggle();
  }, [fetchToggle]);

  // Auto-refresh tick. Silent so a flaky network doesn't keep spawning
  // toasts; the visible counts are the user-facing signal anyway.
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => { void fetchLogs({ silent: true }); }, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchLogs]);

  const toggleMock = async (next: boolean) => {
    setToggling(true);
    try {
      const res = await axios.post<ToggleResponse>(
        "/api/admin/mock-toggle",
        { enabled: next },
        { withCredentials: true },
      );
      setMockEnabled(res.data.enabled);
      setMockSource(res.data.source);
      toast.success(`Mock send APIs ${res.data.enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax?.response?.data?.message || "Failed to update toggle");
    } finally {
      setToggling(false);
    }
  };

  const onSelectChannel = (c: ChannelFilter) => {
    setChannel(c);
    setPage(1);
  };

  // ---- Clear logs ----
  // Wipes mock_send_log. Filtered clear when a channel pill is active so the
  // admin can purge just SMS or just email; otherwise everything goes.
  const clearLogs = async () => {
    const scope = channel === "all" ? "ALL channels" : channel.toUpperCase();
    if (!window.confirm(`Delete every mock send log row for ${scope}? This cannot be undone.`)) {
      return;
    }
    try {
      const qs = channel === "all" ? "" : `?channel=${encodeURIComponent(channel)}`;
      const res = await axios.delete<{ deleted: number }>(
        `/api/admin/mock-logs${qs}`,
        { withCredentials: true },
      );
      toast.success(`Cleared ${res.data.deleted} row(s)`);
      setPage(1);
      void fetchLogs();
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax?.response?.data?.message || "Failed to clear logs");
    }
  };

  // ---- Simulate inbound reply ----
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await axios.get<{ accounts: Account[] }>(
        "/api/admin/mock-inbound/accounts",
        { withCredentials: true },
      );
      setAccounts(res.data.accounts || []);
    } catch {
      // Non-fatal: the composer just stays empty if this fails.
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  // Load the chosen agent's leads. Clears the lead selection on account change.
  useEffect(() => {
    if (accountId == null) {
      setLeads([]);
      setLeadId(null);
      return;
    }
    let cancelled = false;
    setLeadsLoading(true);
    setLeadId(null);
    axios
      .get<{ leads: LeadOption[] }>(`/api/admin/mock-inbound/accounts?owner_id=${accountId}`, { withCredentials: true })
      .then((res) => { if (!cancelled) setLeads(res.data.leads || []); })
      .catch(() => { if (!cancelled) setLeads([]); })
      .finally(() => { if (!cancelled) setLeadsLoading(false); });
    return () => { cancelled = true; };
  }, [accountId]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.user_id === accountId) || null,
    [accounts, accountId],
  );
  const selectedLead = useMemo(
    () => leads.find((l) => l.id === leadId) || null,
    [leads, leadId],
  );

  // Which channels are sendable for the current selection.
  const canReplySms = directTarget
    ? directTarget.channel === "sms"
    : Boolean(selectedLead?.phone && selectedAccount?.can_sms);
  const canReplyEmail = directTarget
    ? directTarget.channel === "email"
    : Boolean(selectedLead?.email && selectedAccount?.can_email);

  // Keep the channel valid as the selection changes.
  useEffect(() => {
    if (directTarget) { setReplyChannel(directTarget.channel); return; }
    if (replyChannel === "sms" && !canReplySms && canReplyEmail) setReplyChannel("email");
    else if (replyChannel === "email" && !canReplyEmail && canReplySms) setReplyChannel("sms");
  }, [directTarget, canReplySms, canReplyEmail, replyChannel]);

  const startRowReply = (r: MockLogRow) => {
    const ch: ReplyChannel = r.channel === "email" ? "email" : "sms";
    setDirectTarget({
      channel: ch,
      from: r.to_address,          // inbound sender = whoever we sent TO
      to: r.from_address || "",    // inbound recipient = our sender address
      leadId: r.lead_id,
      label: `${ch.toUpperCase()} from ${r.to_address}${r.from_address ? ` to ${r.from_address}` : ""}${r.lead_id ? ` (lead #${r.lead_id})` : ""}`,
    });
    setReplyChannel(ch);
    setReplySubject("");
    setReplyBody("");
    if (typeof document !== "undefined") {
      document.getElementById("simulate-inbound")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const clearDirectTarget = () => setDirectTarget(null);

  const replyMaxChars = replyChannel === "sms" ? SMS_MAX_CHARS : EMAIL_MAX_CHARS;
  const withinLimit = replyChannel === "sms"
    ? smsSegmentCount(replyBody) <= SMS_MAX_SEGMENTS
    : replyBody.length <= EMAIL_MAX_CHARS;
  const canSubmitReply = replyBody.trim().length > 0
    && withinLimit
    && (directTarget != null || leadId != null)
    && (replyChannel === "sms" ? canReplySms : canReplyEmail);

  const submitReply = async () => {
    if (!canSubmitReply) return;
    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        channel: replyChannel,
        body: replyBody.trim(),
      };
      if (replyChannel === "email") payload.subject = replySubject.trim() || "(no subject)";
      if (directTarget) {
        if (directTarget.leadId != null) payload.lead_id = directTarget.leadId;
        else { payload.from = directTarget.from; payload.to = directTarget.to; }
      } else {
        payload.lead_id = leadId;
      }
      await axios.post("/api/admin/mock-inbound", payload, { withCredentials: true });
      toast.success(`Mock inbound ${replyChannel.toUpperCase()} sent`);
      setReplyBody("");
      setReplySubject("");
      setDirectTarget(null);
      void fetchLogs({ silent: true });
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax?.response?.data?.message || "Failed to send mock inbound");
    } finally {
      setSending(false);
    }
  };

  const pillStyle = "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium";
  const sourceLabel = useMemo(() => {
    if (mockSource === "db") return "stored in app_settings";
    if (mockSource === "env") return "from MOCK_SEND_APIS env var";
    return "";
  }, [mockSource]);

  return (
    <MainLayout title="Debug Send Logs">
      <div className="space-y-4 p-2 md:p-6">
        {/* Mock-send toggle card */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900">Mock send APIs</div>
              <p className="mt-1 text-sm text-gray-500">
                When ON, all Telnyx / Elastic / Gmail sends are intercepted
                and only logged to this page. Turn OFF to send real messages.
              </p>
              {sourceLabel ? (
                <p className="mt-1 text-xs text-gray-400">Current source: {sourceLabel}.</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`text-sm font-semibold ${mockEnabled ? "text-orange-600" : "text-gray-500"}`}>
                {mockEnabled == null ? "..." : mockEnabled ? "ON" : "OFF"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={mockEnabled ?? false}
                disabled={mockEnabled == null || toggling}
                onClick={() => { void toggleMock(!mockEnabled); }}
                className={
                  "relative inline-flex h-7 w-12 items-center rounded-full transition " +
                  (mockEnabled
                    ? "bg-orange-500"
                    : "bg-gray-300") +
                  (toggling ? " opacity-60" : "")
                }
              >
                <span
                  className={
                    "inline-block h-5 w-5 transform rounded-full bg-white transition " +
                    (mockEnabled ? "translate-x-6" : "translate-x-1")
                  }
                />
              </button>
            </div>
          </div>
        </div>

        {/* Simulate inbound reply */}
        <div id="simulate-inbound" className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="text-lg font-semibold text-gray-900">Simulate inbound reply</div>
          <p className="mt-1 text-sm text-gray-500">
            Writes an inbound SMS or email into the DB exactly as the provider
            webhook would - same notifications, opt-out handling and AI
            follow-up dispatch (for SMS). Use it to test replies without a real
            phone or mailbox.
          </p>

          {directTarget ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-orange-800">Replying to log row: {directTarget.label}</span>
              <button
                type="button"
                onClick={clearDirectTarget}
                className="shrink-0 rounded-md border border-orange-300 bg-white px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Account (agent)</span>
                <select
                  value={accountId ?? ""}
                  onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select an agent...</option>
                  {accounts.map((a) => (
                    <option key={a.user_id} value={a.user_id}>
                      {(a.name || a.email || `User #${a.user_id}`)} - {a.lead_count} {a.lead_count === 1 ? "lead" : "leads"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Lead</span>
                <select
                  value={leadId ?? ""}
                  onChange={(e) => setLeadId(e.target.value ? Number(e.target.value) : null)}
                  disabled={accountId == null || leadsLoading}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {accountId == null ? "Select an agent first" : leadsLoading ? "Loading leads..." : "Select a lead..."}
                  </option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>{leadLabel(l)}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Channel</span>
            <button
              type="button"
              onClick={() => setReplyChannel("sms")}
              disabled={!canReplySms}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (replyChannel === "sms" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200") +
                (!canReplySms ? " cursor-not-allowed opacity-40" : "")
              }
            >
              SMS
            </button>
            <button
              type="button"
              onClick={() => setReplyChannel("email")}
              disabled={!canReplyEmail}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (replyChannel === "email" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200") +
                (!canReplyEmail ? " cursor-not-allowed opacity-40" : "")
              }
            >
              Email
            </button>
            {!directTarget && leadId != null && !canReplySms && !canReplyEmail ? (
              <span className="text-xs text-gray-400">Lead/agent has no usable phone or email.</span>
            ) : null}
          </div>

          {replyChannel === "email" ? (
            <input
              type="text"
              value={replySubject}
              onChange={(e) => setReplySubject(e.target.value)}
              placeholder="Subject (optional)"
              className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          ) : null}

          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={replyChannel === "sms" ? "Type the lead's SMS reply..." : "Type the lead's email reply..."}
            rows={3}
            maxLength={replyMaxChars}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />

          {replyChannel === "sms" ? (
            <div className="mt-2 text-xs text-gray-500">
              {replyBody.length}/{SMS_MAX_CHARS} characters * {smsSegmentCount(replyBody)} segment
              {smsSegmentCount(replyBody) === 1 ? "" : "s"}
              {smsSegmentError(replyBody, SMS_MAX_SEGMENTS) ? (
                <div className="mt-1 text-amber-600">{smsSegmentError(replyBody, SMS_MAX_SEGMENTS)}</div>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 text-xs text-gray-500">
              {replyBody.length}/{EMAIL_MAX_CHARS} characters
            </div>
          )}

          <div className="mt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => { void submitReply(); }}
              disabled={!canSubmitReply || sending}
              className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send inbound reply"}
            </button>
          </div>
        </div>

        {/* Counter pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${pillStyle} bg-gray-900 text-white`}>Total {counts.total}</span>
          <span className={`${pillStyle} bg-blue-100 text-blue-800`}>SMS {counts.sms}</span>
          <span className={`${pillStyle} bg-blue-100 text-blue-800`}>MMS {counts.mms}</span>
          <span className={`${pillStyle} bg-blue-100 text-blue-800`}>Email {counts.email}</span>
          <span className="mx-1 h-4 w-px bg-gray-200" aria-hidden />
          <span className={`${pillStyle} bg-purple-100 text-purple-800`}>Telnyx {counts.telnyx}</span>
          <span className={`${pillStyle} bg-purple-100 text-purple-800`}>Elastic {counts.elastic}</span>
          <span className={`${pillStyle} bg-purple-100 text-purple-800`}>Gmail {counts.gmail}</span>
          <span className="mx-1 h-4 w-px bg-gray-200" aria-hidden />
          <span className={`${pillStyle} bg-emerald-100 text-emerald-800`}>1m {counts.last_1m}</span>
          <span className={`${pillStyle} bg-emerald-100 text-emerald-800`}>5m {counts.last_5m}</span>
          <span className={`${pillStyle} bg-emerald-100 text-emerald-800`}>15m {counts.last_15m}</span>
        </div>

        {/* Per-number throughput (last 60s). Telnyx limits are PER PHONE
            (49 SMS/sec, 14 MMS/sec); ElasticEmail is ~10/sec. The "Peak/s"
            column shows the highest one-second bucket each sender hit. */}
        {perNumber.length > 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Per-number throughput (last 60s)</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Rate caps per phone - SMS {SMS_PER_SEC_PER_PHONE}/sec, MMS {MMS_PER_SEC_PER_PHONE}/sec; email {EMAIL_PER_SEC}/sec per sender. Red rows are above 80% of cap.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Channel</th>
                    <th className="px-4 py-2 font-medium">Sender</th>
                    <th className="px-4 py-2 text-right font-medium">Sent (60s)</th>
                    <th className="px-4 py-2 text-right font-medium">Peak/s</th>
                    <th className="px-4 py-2 text-right font-medium">Cap</th>
                    <th className="px-4 py-2 text-right font-medium">% of cap</th>
                  </tr>
                </thead>
                <tbody>
                  {perNumber.map((row, i) => {
                    const cap =
                      row.channel === "mms" ? MMS_PER_SEC_PER_PHONE
                        : row.channel === "email" ? EMAIL_PER_SEC
                          : SMS_PER_SEC_PER_PHONE;
                    const pct = cap > 0 ? Math.round((row.peak_per_sec / cap) * 100) : 0;
                    const danger = pct >= 80;
                    return (
                      <tr key={`${row.channel}-${row.sender_key}-${i}`} className={danger ? "bg-red-50" : "border-b border-gray-50"}>
                        <td className="px-4 py-2 capitalize">{row.channel}</td>
                        <td className="px-4 py-2 font-mono text-xs">{row.sender_key}</td>
                        <td className="px-4 py-2 text-right">{row.sent_60s}</td>
                        <td className={`px-4 py-2 text-right ${danger ? "font-semibold text-red-700" : ""}`}>{row.peak_per_sec}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{cap}/s</td>
                        <td className={`px-4 py-2 text-right ${danger ? "font-semibold text-red-700" : "text-gray-600"}`}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Channel filter + refresh controls */}
        <div className="flex flex-wrap items-center gap-2">
          {CHANNEL_FILTERS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSelectChannel(c)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (channel === c
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200")
              }
            >
              {c}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-600">
            <span className="font-medium">Auto-refresh (5s)</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((v) => !v)}
              className={
                "relative inline-flex h-6 w-11 items-center rounded-full transition " +
                (autoRefresh ? "bg-orange-500" : "bg-gray-300")
              }
            >
              <span
                className={
                  "inline-block h-4 w-4 transform rounded-full bg-white transition " +
                  (autoRefresh ? "translate-x-6" : "translate-x-1")
                }
              />
            </button>
            <button
              type="button"
              onClick={() => { void fetchLogs(); void fetchToggle(); }}
              className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Refresh now
            </button>
            <button
              type="button"
              onClick={() => { void clearLogs(); }}
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              Clear logs{channel !== "all" ? ` (${channel})` : ""}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Subject / Body</th>
                <th className="px-3 py-2">Org</th>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Automation</th>
                <th className="px-3 py-2">Rate</th>
                <th className="px-3 py-2">Reply</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-400">No mock sends recorded yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-500">{formatTimestamp(r.created_at)}</td>
                  <td className="px-3 py-2">{r.channel}</td>
                  <td className="px-3 py-2">{r.provider}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-700">{r.from_address || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-700">{r.to_address}</td>
                  <td className="max-w-md px-3 py-2 text-gray-700" title={[r.subject, r.body].filter(Boolean).join("\n\n")}>
                    {r.subject ? <div className="font-medium">{truncate(r.subject)}</div> : null}
                    <div className="text-gray-500">{truncate(r.body, 120)}</div>
                  </td>
                  <td className="px-3 py-2">{r.org_id ?? "-"}</td>
                  <td className="px-3 py-2">{r.lead_id ?? "-"}</td>
                  <td className="px-3 py-2">{r.automation_id ?? "-"}</td>
                  <td className="px-3 py-2">{r.rate_acquired ? "ok" : "skipped"}</td>
                  <td className="px-3 py-2">
                    {r.direction === "outbound" && (r.channel === "sms" || r.channel === "mms" || r.channel === "email") ? (
                      <button
                        type="button"
                        onClick={() => startRowReply(r)}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50"
                      >
                        Reply
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div>
            {total > 0
              ? `Showing page ${page} of ${totalPages} (${total} ${total === 1 ? "row" : "rows"})`
              : "No rows"}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
