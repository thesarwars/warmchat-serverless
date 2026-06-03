import React, { useState, useEffect, useRef } from "react";
import {
  X, Copy, Check, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, CheckCircle2, Clock, XCircle, Trash2, RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";

const API_BASE = import.meta.env.VITE_API_BASE;

/* ────────────────────────── types ────────────────────────── */
type FlowStep = 1 | 2 | 3 | 4;
type RecStatus = "missing" | "pending" | "incorrect" | "verified";

interface DnsRec {
  label: string;
  type: string;
  host: string;
  value: string;
  detected?: string;
  priority?: number | string | null;
  required: boolean;
  key: string;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  userEmail?: string;
  token: string;
  userId: string;
  /** Fires when the sending address (prefix) changes so callers can sync
   *  their own copy without waiting for a route change or page refresh. */
  onSendingAddressChange?: (newAddress: string) => void;
}

const DEFAULT_DNS_RECORDS: DnsRec[] = [
  {
    label: "SPF",
    type: "TXT",
    host: "@",
    value: "v=spf1 include:_spf.elasticemail.com ~all",
    required: true,
    key: "spf",
  },
  {
    label: "DKIM",
    type: "CNAME",
    host: "api._domainkey",
    value: "api.elasticemail.com",
    required: false,
    key: "dkim",
  },
  {
    label: "MX",
    type: "MX",
    host: "@",
    value: "mx.elasticemail.com",
    priority: 10,
    required: false,
    key: "mx",
  },
  {
    label: "Tracking",
    type: "CNAME",
    host: "tracking",
    value: "api.elasticemail.com",
    required: false,
    key: "tracking",
  },
  {
    label: "DMARC",
    type: "TXT",
    host: "_dmarc",
    value: "v=DMARC1; p=none;",
    required: false,
    key: "dmarc",
  },
];

/* ─────────────────────── status display ─────────────────── */
const STATUS_CONFIG: Record<RecStatus, { icon: React.ReactNode; text: string; cls: string }> = {
  verified: { icon: <CheckCircle2 className="w-4 h-4" />, text: "Verified", cls: "text-green-600 font-semibold" },
  pending: { icon: <Clock className="w-4 h-4" />, text: "Pending", cls: "text-gray-400" },
  missing: { icon: <AlertTriangle className="w-4 h-4" />, text: "Not found", cls: "text-yellow-600 font-medium" },
  incorrect: { icon: <XCircle className="w-4 h-4" />, text: "Incorrect", cls: "text-red-500 font-medium" },
};

/* ─────────────────────── provider data ──────────────────── */
const DNS_PROVIDERS = [
  { value: "cloudflare", label: "Cloudflare" },
  { value: "godaddy", label: "GoDaddy" },
  { value: "namecheap", label: "Namecheap" },
  { value: "route53", label: "AWS Route 53" },
  { value: "google", label: "Google / Squarespace" },
  { value: "other", label: "Other / cPanel" },
];

const PROVIDER_STEPS: Record<string, string[]> = {
  cloudflare: [
    "Go to dash.cloudflare.com and select your domain.",
    "Open the DNS → Records tab.",
    "Click 'Add record' for each row in the table.",
    "For CNAME records: set Proxy status to DNS only (grey cloud icon).",
    "For TXT records: paste the full value exactly as shown.",
  ],
  godaddy: [
    "Log in to GoDaddy → My Products → Domains.",
    "Click your domain → Manage DNS.",
    "Click Add for each record type.",
    "For TXT @: select Type TXT, host @, paste the exact value.",
    "For CNAME: use only the subdomain part as the name (no root domain).",
  ],
  namecheap: [
    "Log in to Namecheap → Domain List → Manage.",
    "Click the Advanced DNS tab.",
    "Click Add New Record for each entry.",
    "For TXT @: enter @ as the host exactly.",
    "For subdomains: enter just the prefix (e.g. api._domainkey).",
  ],
  route53: [
    "Open AWS Route 53 → Hosted zones → select your domain.",
    "Click 'Create record' for each DNS record.",
    "For TXT records: wrap the value in quotes if the console requires it.",
    "For CNAME: enter just the subdomain for the name field.",
  ],
  google: [
    "Go to Google Domains (or Squarespace Domains).",
    "Select your domain → DNS → Custom records.",
    "Add each record using the Type, Host, and Value shown.",
    "For TXT @: use @ as the host.",
    "For CNAME records: enter just the subdomain as host.",
  ],
  other: [
    "Log in to your DNS provider's control panel.",
    "Navigate to DNS records or Zone editor for your domain.",
    "Add each record shown in the table.",
    "For TXT records: paste the exact value - no extra quotes.",
    "For CNAME records: use only the subdomain as the host.",
  ],
};

/* ─────────────────────── helpers ──────────────────────────  */
function extractDomain(email: string): string {
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase().trim() : email.toLowerCase().trim();
}

function mapDnsRecord(raw: Partial<DnsRec> & { name?: string } | null | undefined): DnsRec {
  const label = String(raw?.label || "").toLowerCase();
  let key = "other";
  if (label === "spf" || label.includes("spf")) key = "spf";
  else if (label === "mx" || label.includes("mx")) key = "mx";
  else if (label === "dkim" || label.includes("dkim")) key = "dkim";
  else if (label === "tracking" || label.includes("tracking") || label.includes("cname")) key = "tracking";
  else if (label === "dmarc" || label.includes("dmarc")) key = "dmarc";

  return {
    label: raw?.label || key.toUpperCase(),
    type: raw?.type || "TXT",
    host: raw?.host || raw?.name || "",
    value: raw?.value || "",
    detected: raw?.detected,
    priority: raw?.priority ?? null,
    required: raw?.required ?? (key === "spf"),
    key,
  };
}

function mergeDnsRecords(rawRecords: (Partial<DnsRec> & { name?: string })[] | undefined | null): DnsRec[] {
  const provided = Array.isArray(rawRecords)
    ? rawRecords.map(mapDnsRecord).filter((record) => Boolean(record.host || record.value || record.label))
    : [];

  const merged = DEFAULT_DNS_RECORDS.map((record) => ({ ...record }));
  const knownIndexByKey = new Map(merged.map((record, index) => [record.key, index]));
  const extras: DnsRec[] = [];

  for (const record of provided) {
    const knownIndex = knownIndexByKey.get(record.key);
    if (knownIndex !== undefined) {
      merged[knownIndex] = {
        ...merged[knownIndex],
        ...record,
        required: record.required ?? merged[knownIndex].required,
      };
    } else {
      extras.push(record);
    }
  }

  const deduped: DnsRec[] = [];
  const seen = new Set<string>();

  for (const record of [...merged, ...extras]) {
    const identity = `${record.key}:${record.type}:${record.host || "@"}:${record.value}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    deduped.push(record);
  }

  return deduped;
}

/* ── DNS record card (step 2) ── */
const DnsRecordRow: React.FC<{
  rec: DnsRec;
  idx: number;
  copied: Record<string, boolean>;
  copyVal: (val: string, key: string) => void;
  status?: RecStatus;
}> = ({ rec, idx, copied, copyVal, status }) => {
  const stCfg = status ? STATUS_CONFIG[status] : null;
  // Per-field copy keys so copying Host doesn't reset the checkmark on Value.
  const fieldKey = (field: string) => `${idx}:${field}`;
  const renderField = (label: string, value: string, field: string, opts?: { mono?: boolean; valueClass?: string }) => (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 w-16 shrink-0 text-xs">{label}</span>
      <span className={`flex-1 min-w-0 break-all text-xs ${opts?.mono === false ? "" : "font-mono"} ${opts?.valueClass || "text-gray-700"}`}>
        {value || "-"}
      </span>
      {value && (
        <button
          type="button"
          onClick={() => copyVal(value, fieldKey(field))}
          className="shrink-0 text-gray-400 hover:text-gray-700 transition"
          title={`Copy ${label.toLowerCase()}`}
        >
          {copied[fieldKey(field)] ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {stCfg ? (
            <span className={`text-sm ${stCfg.cls}`}>{stCfg.icon}</span>
          ) : (
            <span className="w-4 h-4 rounded-full border-2 border-gray-300 inline-block" />
          )}
          <span className="text-sm font-semibold text-gray-800">{rec.label}</span>
        </div>
        {/* Cloudflare-specific gotcha for CNAME / proxy. */}
        {rec.type === "CNAME" && (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Cloudflare: turn proxy OFF (grey cloud)
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-2 text-xs">
        {renderField("Type", rec.type, "type")}
        {renderField("Host", rec.host || "@", "host")}
        {rec.priority !== null && rec.priority !== undefined && rec.priority !== "" &&
          renderField("Priority", String(rec.priority), "priority")}
        {renderField("Expected", rec.value, "value")}
        {rec.detected !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-16 shrink-0 text-xs">Detected</span>
            <span className={`flex-1 min-w-0 break-all font-mono text-xs ${!rec.detected ? "text-gray-400"
                : rec.detected === rec.value ? "text-emerald-700"
                  : "text-rose-700"
              }`}>
              {rec.detected || "- (not found)"}
            </span>
            {rec.detected && (
              <button
                type="button"
                onClick={() => copyVal(rec.detected || "", fieldKey("detected"))}
                className="shrink-0 text-gray-400 hover:text-gray-700 transition"
                title="Copy detected"
              >
                {copied[fieldKey("detected")] ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════ COMPONENT ════════════════════════ */
const BusinessEmailSetup: React.FC<Props> = ({
  onClose,
  onSuccess,
  userEmail = "",
  token,
  userId,
  onSendingAddressChange,
}) => {
  // Start at the records view. Step 1 (OTP) is handled by the upstream caller
  // (onboarding, ConnectDomain). Step 3 (success) is rendered inline within
  // the records view as a banner once verification passes.
  const [step, setStep] = useState<FlowStep>(2);

  // OTP verification is handled by the upstream caller (onboarding,
  // ConnectDomain). When userEmail is passed in we start in the registering
  // state so a spinner shows until resume() loads the DNS records.
  const [registering, setRegistering] = useState(Boolean(userEmail));

  /* records state (steps 2+) */
  const [dnsRecords, setDnsRecords] = useState<DnsRec[]>([]);
  const [sendingDomain, setSendingDomain] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [spfExisting, setSpfExisting] = useState("");
  const [spfMergeHint, setSpfMergeHint] = useState("");
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  /* step 2 state */
  const [provider, setProvider] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  /* Prefix-edit state. Only available for the Option-3 takeover path (where
     WarmChats is the inbound provider). Server enforces this via the
     `editable` flag on /api/elastic/sending-address. */
  const [prefixEditable, setPrefixEditable] = useState(false);
  const [prefixDraft, setPrefixDraft] = useState("");
  const [prefixSaving, setPrefixSaving] = useState(false);
  const [prefixError, setPrefixError] = useState("");
  const [providerType, setProviderType] = useState<"" | "gmail" | "elastic-takeover" | "elastic-otp" | "none">("");

  /* step 3 state */
  const [recStatuses, setRecStatuses] = useState<Record<string, RecStatus>>({});
  const [verifying, setVerifying] = useState(false);
  const [sendingReady, setSendingReady] = useState(false);
  const [sendingRecordsVerified, setSendingRecordsVerified] = useState(false);
  const [allRecordsVerified, setAllRecordsVerified] = useState(false);
  // ElasticEmail's per-record "they've accepted the record on their side"
  // booleans. DoH may already say "verified" while Elastic is still catching
  // up; we surface the lag to the user so they understand why "Check Again"
  // hasn't flipped the success banner yet.
  const [elasticStatus, setElasticStatus] = useState<Record<string, boolean>>({});
  // Timestamp of the last verify call so the user gets visible feedback when
  // they hit Check Again - otherwise repeat clicks with unchanged state feel
  // like a no-op.
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const autoSuccessSent = useRef(false);

  /* disconnect state */
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  /* MX detection state - we still warn (amber banner below) if the domain
     already has an email provider so the user knows not to point MX at us.
     The full takeover flow (no-provider case) lives in Onboarding.tsx's
     TakeoverModal now and never enters this component. */
  const [mxStatus, setMxStatus] = useState<"" | "none" | "elastic" | "google" | "microsoft" | "other">("");
  const [mxHosts, setMxHosts] = useState<string[]>([]);

  /* derived */
  const requiredSendingReady = sendingReady && sendingRecordsVerified;

  const syncDnsRecords = (rawRecords?: (Partial<DnsRec> & { name?: string })[] | null) => {
    setDnsRecords(mergeDnsRecords(rawRecords));
  };

  /* ── copy helper ── */
  const copyVal = async (val: string, key: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied((p) => ({ ...p, [key]: true }));
      setTimeout(() => setCopied((p) => ({ ...p, [key]: false })), 2000);
    } catch {
      toast.error("Could not copy - please copy manually.");
    }
  };

  /* ── Resume from existing registration on mount ── */
  useEffect(() => {
    const resume = async () => {
      if (!token) return;
      const fallbackEmail = (userEmail || "").trim().toLowerCase();
      setRegistering(Boolean(fallbackEmail));

      try {
        // Check if domain already registered in Elastic
        const statusRes = await fetch(`${API_BASE}/elastic/business-email/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const statusData = await statusRes.json().catch(() => ({}));
        const existingEmail = String(statusData.email || fallbackEmail).trim().toLowerCase();
        // If Elastic confirmed the domain doesn't exist, start fresh regardless of pre-fill
        if (!existingEmail || statusData.status === "not_connected") return;

        const existingDomain = existingEmail.split("@")[1] || "";
        setSendingDomain(existingDomain);
        setSenderEmail(existingEmail);

        // Fetch DNS records immediately. POST /elastic/domain creates the Elastic domain if needed.
        const regRes = await fetch(`${API_BASE}/elastic/domain`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ domain: existingDomain }),
        });
        const regData = await regRes.json().catch(() => ({}));

        if (!regRes.ok) {
          if (regRes.status === 403) {
            // OTP not yet verified for this email. This modal no longer handles
            // OTP - the upstream caller (onboarding/ConnectDomain) does. Send
            // the user back to finish that step.
            toast.error("Please verify your business email before configuring DNS.");
            onClose();
          } else {
            toast.error(regData.error || regData.message || "Failed to prepare DNS records.");
          }
          return;
        }

        syncDnsRecords(
          Array.isArray(regData.dns_records) && regData.dns_records.length > 0
            ? regData.dns_records
            : statusData.dns_records,
        );

        // Pull the sending-address info so we can show the prefix editor when
        // this domain came in via Option 3 (WarmChats-as-inbox). For OTP/Gmail
        // the editor stays hidden.
        try {
          const addrRes = await fetch(`${API_BASE}/elastic/sending-address`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (addrRes.ok) {
            const addrData = await addrRes.json();
            if (addrData?.sending_prefix) {
              setPrefixDraft(addrData.sending_prefix);
              setPrefixEditable(Boolean(addrData.editable));
              setProviderType(addrData.provider_type || "");
            }
          }
        } catch { /* non-fatal */ }

        if (regData?.spf_existing) {
          setSpfExisting(regData.spf_existing);
          setSpfMergeHint(regData.spf_merge_hint || "");
        }
        if (regData?.mx_status) {
          setMxStatus(regData.mx_status);
          setMxHosts(Array.isArray(regData.mx_hosts) ? regData.mx_hosts : []);
        }

        // If already fully verified, show the live result step; otherwise show records immediately.
        const shouldVerifyNow = statusData.status === "verified" || regData.sending_ready || regData.domain_verified;
        if (shouldVerifyNow) {
          const verRes = await fetch(`${API_BASE}/elastic/domain/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ domain: existingDomain }),
          });
          const verData = await verRes.json().catch(() => ({}));
          syncDnsRecords(verData.dns_records || regData.dns_records || statusData.dns_records);
          if (verData.record_status) setRecStatuses(verData.record_status);
          const verStatuses: Record<string, RecStatus> = verData.record_status || {};
          setSendingReady(Boolean(verData.sending_ready ?? verData.verified === true));
          setSendingRecordsVerified(
            Boolean(verData.sending_records_verified ?? verStatuses.spf === "verified")
          );
          setAllRecordsVerified(Boolean(verData.all_records_verified));
          setStep(2);
        } else {
          setStep(2);
        }
      } catch {
        if (fallbackEmail) toast.error("Failed to prepare DNS records. Please try again.");
      } finally {
        setRegistering(false);
      }
    };
    resume();
    // onClose is captured by reference at mount; re-running resume when the
    // parent re-creates the callback would re-issue the registration POST.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, userEmail]);

  /* ── Verify DNS records (manual or auto) ── */
  const handleVerify = async (options?: { auto?: boolean }) => {
    if (!senderEmail) return;
    const auto = Boolean(options?.auto);
    if (!auto) setVerifying(true);
    try {
      const res = await fetch(`${API_BASE}/elastic/domain/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ domain: extractDomain(senderEmail) }),
      });
      const data = await res.json();

      if (data.spf_existing && !spfExisting) {
        setSpfExisting(data.spf_existing);
        setSpfMergeHint(data.spf_merge_hint || "");
      }

      syncDnsRecords(data.dns_records);

      const statuses: Record<string, RecStatus> = data.record_status || {};
      setRecStatuses(statuses);

      const sendingReadyStatus = Boolean(data.sending_ready ?? data.verified === true);
      const requiredRecordsReady = Boolean(
        data.sending_records_verified ?? statuses.spf === "verified"
      );
      const allRecordsReady = Boolean(data.all_records_verified);
      const fullyVerified = Boolean(data.verified === true && sendingReadyStatus && requiredRecordsReady);

      setSendingReady(sendingReadyStatus);
      setSendingRecordsVerified(requiredRecordsReady);
      setAllRecordsVerified(allRecordsReady);
      setElasticStatus(data.elastic_status && typeof data.elastic_status === "object" ? data.elastic_status : {});
      setLastCheckedAt(Date.now());

      if (fullyVerified) {
        /* mark onboarding email channel connected */
        try {
          await fetch(`${API_BASE}/onboarding/${userId}/connect`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ channel: "email" }),
          });
        } catch { /* non-fatal */ }

        // Notify the parent exactly once - whether verification flipped to
        // fully-verified via the auto-mount run OR a manual "Check Again"
        // click. The previous gate only ran on auto, so users who fixed a
        // missing record then clicked Check Again never got the onSuccess
        // callback and had to refresh to see the parent Email Connected
        // card.
        if (!autoSuccessSent.current) {
          autoSuccessSent.current = true;
          onSuccess();
        }
      }

    } catch {
      if (!auto) toast.error("Verification failed. Please try again.");
    } finally {
      if (!auto) setVerifying(false);
    }
  };

  // Auto-run verify the moment records land - the user shouldn't have to
  // click a button to see green/red status badges on each row. Runs once per
  // (senderEmail) change. Subsequent re-runs are user-initiated via the
  // Check Again button.
  const autoVerifyRanFor = useRef<string>("");
  useEffect(() => {
    if (!senderEmail || dnsRecords.length === 0 || registering) return;
    if (autoVerifyRanFor.current === senderEmail) return;
    if (Object.keys(recStatuses).length > 0) return; // resume() may have populated already
    autoVerifyRanFor.current = senderEmail;
    handleVerify({ auto: true });
    // handleVerify identity changes per render but we only fire once per
    // sender; deps stay narrow on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderEmail, dnsRecords.length, registering]);

  // Verification runs only on explicit user click - no background polling.

  /* ── Disconnect domain ── */
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch(`${API_BASE}/elastic/domain/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ domain: sendingDomain || extractDomain(senderEmail) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to disconnect domain."); return; }
      toast.success("Domain disconnected.");
      // Full reload so every cached piece of state in the parent (onboarding
      // status, businessEmail, businessEmailStatus, etc.) is rebuilt from the
      // now-clean DB. Trying to bubble this up through props was racy: parents
      // read multiple endpoints on mount and don't share a single refetch hook.
      window.location.reload();
    } catch {
      toast.error("Failed to disconnect. Please try again.");
    } finally {
      setDisconnecting(false);
      setConfirmDisconnect(false);
    }
  };

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Business Email Setup</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {requiredSendingReady
                ? "Business email ready to send"
                : "Add these DNS records, then click Verify"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Disconnect option - only when a domain is already registered */}
            {sendingDomain && (
              confirmDisconnect ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Remove <span className="font-semibold text-gray-900">{sendingDomain}</span>?</span>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Yes, remove
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  <Trash2 size={12} />
                  Disconnect domain
                </button>
              )
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* While resume() is running, show only the spinner - the step 2
              content below is gated on !registering so the user doesn't see
              partially-populated UI scrolling under the loader. */}
          {registering && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-sm text-gray-500 text-center">
              <Loader2 size={20} className="animate-spin text-orange-500" />
              <div className="flex flex-col gap-1">
                <span>Loading your domain setup...</span>
                <span className="text-xs text-gray-400">
                  This might take a minute during the first time.
                </span>
              </div>
            </div>
          )}

          {/* Single consolidated DNS records page. We auto-run verify on mount
              once records load, so the user sees up-to-date status without
              clicking anything. */}
          {step >= 2 && !registering && (
            <>
              {/* Header banner: only treat the setup as "fully connected" when
                  ALL records pass (SPF + DKIM + MX + Tracking + DMARC). Until
                  then, even if sending records alone are accepted by Elastic,
                  we show the in-progress notice and keep showing the records. */}
              {allRecordsVerified ? (
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-900">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-100 shrink-0">
                    <Check size={20} className="text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">
                      Email connected.
                    </div>
                    <div className="text-xs text-emerald-800 mt-0.5">
                      {senderEmail ? <><span className="font-mono">{senderEmail}</span> is fully verified - SPF, DKIM, MX, Tracking, and DMARC are all in place.</> : "All required DNS records are in place."}
                    </div>
                  </div>
                </div>
              ) : Object.keys(recStatuses).length === 0 ? (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Add the required records below to your DNS provider. Status will refresh automatically; you can also click <strong>Check Again</strong> at any time.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <div>
                      Not all DNS records are verified yet.
                      {(() => {
                        const allMissing = dnsRecords
                          .filter((r) => recStatuses[r.key] !== "verified")
                          .map((r) => r.label);
                        return allMissing.length > 0
                          ? <> Missing: <strong>{allMissing.join(", ")}</strong>.</>
                          : !sendingReady ? <> Elastic send permission is still pending.</> : null;
                      })()}
                    </div>
                    <div className="mt-1">
                      Fix the missing records, then click <strong>Check Again</strong>. DNS changes can take 5-30 minutes, and sometimes up to 24 hours.
                    </div>
                  </div>
                </div>
              )}

              {/* Sending-address (prefix) editor - shown only for the Option-3
                  takeover path. Server gates writes via the `editable` flag
                  so OTP/Gmail users can't sneak edits in here. */}
              {prefixEditable && sendingDomain && !allRecordsVerified && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-2">
                  <div className="text-xs font-semibold text-purple-900">Sending address</div>
                  <p className="text-xs text-purple-800">
                    WarmChats is the email provider for <span className="font-mono">{sendingDomain}</span>, so you can pick any prefix. You can also change it later in Account &amp; Usage.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
                    <label className="text-xs flex-1">
                      <span className="block font-medium text-gray-700 mb-1">Local-part</span>
                      <div className="flex items-stretch rounded-lg border border-gray-300 bg-white overflow-hidden">
                        <input
                          type="text"
                          value={prefixDraft}
                          onChange={(e) => {
                            setPrefixDraft(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64));
                            setPrefixError("");
                          }}
                          placeholder="hello"
                          maxLength={64}
                          className="flex-1 min-w-0 px-3 py-2 text-sm focus:outline-hidden"
                        />
                        <span className="px-3 py-2 text-xs text-gray-600 bg-gray-100 self-stretch flex items-center font-mono">
                          @{sendingDomain}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Letters, numbers, dot, underscore, hyphen. Max 64 chars, must start/end with a letter or number.
                      </p>
                      {prefixError && (
                        <p className="mt-1 text-[11px] text-rose-600">{prefixError}</p>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        const currentPrefix = (senderEmail || "").split("@")[0] || "";
                        if (!prefixDraft || prefixDraft === currentPrefix) return;
                        setPrefixError("");
                        if (prefixDraft.length > 64) {
                          setPrefixError("Sending prefix must be 64 characters or fewer.");
                          return;
                        }
                        if (prefixDraft.includes("..")) {
                          setPrefixError("Sending prefix cannot contain consecutive dots.");
                          return;
                        }
                        if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(prefixDraft)) {
                          setPrefixError("Use only letters, numbers, dot, underscore, or hyphen, and start/end with a letter or number.");
                          return;
                        }
                        setPrefixSaving(true);
                        try {
                          const res = await fetch(`${API_BASE}/elastic/sending-address`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ sending_prefix: prefixDraft }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setPrefixError(data.message || data.error || "Failed to update.");
                            return;
                          }
                          setSenderEmail(data.sending_address);
                          onSendingAddressChange?.(data.sending_address);
                          toast.success(`Sending as ${data.sending_address}`);
                        } catch {
                          setPrefixError("Network error - please try again.");
                        } finally {
                          setPrefixSaving(false);
                        }
                      }}
                      disabled={prefixSaving || !prefixDraft || prefixDraft === (senderEmail || "").split("@")[0]}
                      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-1.5 sm:mt-5"
                    >
                      {prefixSaving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {/* Read-only sending-address note when the prefix is locked
                  (Option 2 OTP path) so the user can still see what's there. */}
              {!prefixEditable && providerType === "elastic-otp" && senderEmail && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-700">
                  Sending as <span className="font-mono font-semibold">{senderEmail}</span>. Prefix is locked because it's tied to your existing mailbox (OTP-verified). To pick a different prefix, disconnect this domain and re-set-up using Option 3.
                </div>
              )}

              {/* MX warning - if a provider IS detected, we WON'T take over.
                  Tell the user not to point MX at us. */}
              {mxStatus && mxStatus !== "none" && mxStatus !== "elastic" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle size={13} /> {sendingDomain} already has an email provider ({mxHosts.join(", ") || mxStatus})
                  </p>
                  <p className="mt-1">
                    Keep your existing MX records as-is. The records below let WarmChats send <em>as</em> your domain via Elastic, but inbound mail still goes to your current provider.
                  </p>
                </div>
              )}

              {/* Hide everything below the success banner when fully done. */}
              {!allRecordsVerified && <>

                {/* SPF merge warning - shown above the SPF row so the user sees
                  it before they consider adding a second TXT record. */}
                {spfExisting && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-xs text-orange-900 space-y-2">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle size={13} /> SPF already exists - do NOT create a second one
                    </p>
                    <p>Your current record:</p>
                    <code className="block bg-white px-2 py-1.5 rounded border text-xs break-all">{spfExisting}</code>
                    <p>Update it to:</p>
                    <div className="flex items-start gap-2">
                      <code className="flex-1 block bg-white px-2 py-1.5 rounded border text-xs break-all">
                        {spfMergeHint || spfExisting.replace("~all", "include:_spf.elasticemail.com ~all")}
                      </code>
                      <button
                        onClick={() =>
                          copyVal(
                            spfMergeHint || spfExisting.replace("~all", "include:_spf.elasticemail.com ~all"),
                            "spf-merge"
                          )
                        }
                        className="text-orange-600 hover:text-orange-800 shrink-0 mt-1"
                      >
                        {copied["spf-merge"] ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Required records */}
                {dnsRecords.filter((r) => r.required).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Required to send</p>
                    {dnsRecords.filter((r) => r.required).map((rec, i) => (
                      <DnsRecordRow
                        key={i} rec={rec} idx={i} copied={copied} copyVal={copyVal}
                        status={recStatuses[rec.key] as RecStatus | undefined}
                      />
                    ))}
                  </div>
                )}

                {/* Recommended records */}
                {dnsRecords.filter((r) => !r.required).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recommended after sending works</p>
                    {dnsRecords.filter((r) => !r.required).map((rec, i) => (
                      <DnsRecordRow
                        key={i} rec={rec} idx={100 + i} copied={copied} copyVal={copyVal}
                        status={recStatuses[rec.key] as RecStatus | undefined}
                      />
                    ))}
                  </div>
                )}

                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-700">
                  <div className="font-semibold text-gray-900">Add these records in your domain provider</div>
                  <ol className="mt-2 space-y-1.5 list-decimal pl-4">
                    <li>Go to where you purchased your domain, such as GoDaddy, Google Domains, Namecheap, Cloudflare, or Route 53.</li>
                    <li>Open DNS Settings.</li>
                    <li>Add the records above exactly as shown.</li>
                    <li>Come back here and click Verify Domain.</li>
                  </ol>
                </div>

                {/* Provider guide (collapsible) */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setShowGuide((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition"
                  >
                    <span>How to add records to your DNS provider</span>
                    {showGuide ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>

                  {showGuide && (
                    <div className="px-4 pb-4 pt-3 space-y-3 bg-white">
                      <p className="text-xs text-gray-500">Select your DNS provider:</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {DNS_PROVIDERS.map((p) => (
                          <button
                            key={p.value}
                            onClick={() => setProvider(p.value)}
                            className={`px-3 py-2 rounded-lg border text-xs font-medium transition text-left
                            ${provider === p.value
                                ? "border-orange-500 bg-orange-50 text-orange-700"
                                : "border-gray-200 text-gray-600 hover:border-orange-300 hover:bg-orange-50/40"}`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>

                      {provider && (
                        <ol className="space-y-2 mt-1">
                          {(PROVIDER_STEPS[provider] || PROVIDER_STEPS.other).map((inst, i) => (
                            <li key={i} className="flex gap-2.5 text-xs text-gray-700">
                              <span className="shrink-0 w-4 h-4 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                                {i + 1}
                              </span>
                              {inst}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>

                {/* Our DNS-check results panel - shown after any verify so the
                  user gets explicit confirmation that the click did something
                  (and which records pass/fail), even when the underlying state
                  didn't change since the last check. */}
                {lastCheckedAt && dnsRecords.length > 0 && (
                  <div className={`rounded-xl border px-4 py-3 text-xs space-y-2 ${dnsRecords.every((r) => recStatuses[r.key] === "verified")
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-semibold flex items-center gap-1.5">
                        {dnsRecords.every((r) => recStatuses[r.key] === "verified")
                          ? <><Check size={13} className="text-emerald-700" /> Our DNS check: all records detected</>
                          : <><AlertTriangle size={13} /> Our DNS check: some records missing</>}
                      </div>
                      <span className="text-[11px] opacity-75">
                        Last checked {new Date(lastCheckedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                      {dnsRecords.map((r) => {
                        const ok = recStatuses[r.key] === "verified";
                        return (
                          <div key={r.key} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium ${ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                            {ok ? <Check size={11} /> : <XCircle size={11} />}
                            <span className="uppercase">{r.label}</span>
                            <span className="ml-auto text-[10px]">{ok ? "ok" : "miss"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Elastic-lag panel: every record passes DoH but Elastic hasn't
                  confirmed all of them on their end yet. Surfaced so the user
                  understands why "Check Again" isn't flipping to Connected. */}
                {(() => {
                  const allDnsOk = dnsRecords.length > 0
                    && dnsRecords.every((r) => recStatuses[r.key] === "verified");
                  const elasticKeys = ["spf", "dkim", "tracking", "mx"] as const;
                  const pendingOnElastic = elasticKeys.filter((k) => elasticStatus[k] === false);
                  if (!allDnsOk || pendingOnElastic.length === 0) return null;
                  return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-2">
                      <div className="font-semibold flex items-center gap-1.5">
                        <Clock size={13} /> Waiting on Elastic to re-check {pendingOnElastic.length} record(s)
                      </div>
                      <p>
                        Your DNS looks correct on our side, but ElasticEmail hasn't confirmed it yet for: <strong>{pendingOnElastic.map((k) => k.toUpperCase()).join(", ")}</strong>. This usually clears in 5-30 minutes - click <strong>Check Again</strong> after a moment.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1">
                        {elasticKeys.map((k) => {
                          const ok = elasticStatus[k] === true;
                          return (
                            <div key={k} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium ${ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>
                              {ok ? <Check size={11} /> : <Clock size={11} />}
                              <span className="uppercase">{k}</span>
                              <span className="ml-auto text-[10px]">{ok ? "ok" : "pending"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => handleVerify()}
                    disabled={verifying}
                    className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-orange-600 transition"
                  >
                    {verifying
                      ? <><Loader2 size={15} className="animate-spin" /> Checking records...</>
                      : <><RefreshCw size={14} /> {Object.keys(recStatuses).length === 0 ? "Verify Records" : "Check Again"}</>}
                  </button>
                  <button
                    onClick={onClose}
                    className="px-5 py-3 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
                  >
                    Close and finish later
                  </button>
                </div>

                <p className="text-center text-xs text-gray-400">
                  DNS changes can take 5-30 minutes, and sometimes up to 24 hours.
                </p>

              </>}

              {/* When fully connected, only the success banner is shown.
                  Offer a quick "Done" close + the disconnect path stays
                  available in the header. */}
              {allRecordsVerified && (
                <button
                  onClick={onClose}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition flex items-center justify-center gap-2"
                >
                  <Check size={14} /> Done
                </button>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default BusinessEmailSetup;
