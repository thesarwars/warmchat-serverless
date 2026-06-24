import React, { useEffect, useRef, useState } from "react";
import { fetchOrgDealDefaults, putOrgDealDefaults } from "@/helpers/backend";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Check, Mail, X, MessageCircle, AlertTriangle, Loader2, Home, DollarSign, Handshake, ClipboardList, CheckCircle, ArrowRight, ChevronRight, ChevronDown, Copy, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import Confetti from "react-confetti";
import BusinessEmailSetup from "./BusinessEmailSetup";
import ConnectPhoneNumber from "./ConnectPhoneNumber";
import { logoutCurrentSession } from "../utils/authSession";
import { validateBusinessAddress } from "../utils/addressValidator";

/* ---------------- TYPES ---------------- */
type Step = 1 | 2 | 3 | 4 | 5;
// "ownership_verified" is the state the server records when a user finishes
// the Option-3 DNS-TXT takeover. From a UI perspective it behaves the same as
// "otp_verified" / "registered" - the user proved ownership but still needs
// to publish SPF/DKIM/MX before sending works.
type BusinessEmailStatus = "unknown" | "not_connected" | "otp_pending" | "otp_verified" | "registered" | "ownership_verified" | "verified";

/** Format a US E.164 number as +1 (XXX) XXX-XXXX for display. */
const formatDisplayPhone = (value: string) => {
  const digits = (value || "").replace(/\D/g, "");
  const normalized = digits.startsWith("1") ? digits.slice(1) : digits;
  if (normalized.length !== 10) return value;
  return `+1 (${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
};

/* ---------------- MAIN ---------------- */
const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const API_BASE = import.meta.env.VITE_API_BASE;
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id");
  const [step, setStep] = useState<Step>(1);
  // Deal defaults collected at account creation - feed the Pipeline Value KPI.
  // Editable later in Settings -> Workspace -> Average Sale Price & Commission.
  const [avgSalePrice, setAvgSalePrice] = useState("");
  const [avgCommission, setAvgCommission] = useState("");
  // Redesigned wizard: Step 1 = business profile, Step 2 = lead & pipeline.
  const [brokerage, setBrokerage] = useState("");
  const [market, setMarket] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [bizRole, setBizRole] = useState("agent");
  const [goalAppts, setGoalAppts] = useState("");
  const [goalDeals, setGoalDeals] = useState("");
  useEffect(() => {
    const orgId = localStorage.getItem("org_id");
    if (!orgId) return;
    void fetchOrgDealDefaults(orgId).then((d) => {
      const dd = d as { average_deal_price?: number; commission_percent?: number };
      if (typeof dd?.average_deal_price === "number") setAvgSalePrice(String(dd.average_deal_price));
      if (typeof dd?.commission_percent === "number") setAvgCommission(String(dd.commission_percent));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveDealDefaults = async () => {
    const orgId = localStorage.getItem("org_id");
    const p = Number(avgSalePrice), c = Number(avgCommission);
    if (!orgId || !Number.isFinite(p) || p <= 0 || !Number.isFinite(c) || c <= 0 || c > 100) return;
    try { await putOrgDealDefaults(orgId, { average_deal_price: p, commission_percent: c }); } catch { /* best-effort */ }
  };
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [connected, setConnected] = useState({ email: false, sms: false });
  const [orgPlan, setOrgPlan] = useState<string>("free_channel");
  const [smsTelnyxStatus, setSmsTelnyxStatus] = useState<string>("inactive");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showRegistrarsModal, setShowRegistrarsModal] = useState(false);
  const [showTakeoverModalRaw, setShowTakeoverModalRaw] = useState(false);
  // Wrap setShowTakeoverModal so closing the modal also clears transient
  // error / detected / notice state - otherwise stale errors from a previous
  // domain confuse the user the next time they reopen the modal.
  const setShowTakeoverModal = (open: boolean) => {
    if (!open) {
      setTakeoverError("");
      setTakeoverNotice("");
      setTakeoverDetected([]);
      setTakeoverProvider("");
    }
    setShowTakeoverModalRaw(open);
  };
  const showTakeoverModal = showTakeoverModalRaw;
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPhoneSetupModal, setShowPhoneSetupModal] = useState(false);

  // Lock body scroll while any full-screen modal is open so the background
  // page doesn't scroll behind the popup. showEmailModal is included because
  // it transitions into BusinessEmailSetup (the DNS records modal).
  useEffect(() => {
    const anyOpen =
      showPhoneSetupModal || showTakeoverModal || showRegistrarsModal ||
      showUpgradeModal || showEmailModal;
    if (!anyOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showPhoneSetupModal, showTakeoverModal, showRegistrarsModal, showUpgradeModal, showEmailModal]);

  /* Domain takeover (no-email-provider path) state */
  const [takeoverDomain, setTakeoverDomain] = useState("");
  const [takeoverPrefix, setTakeoverPrefix] = useState("hello");
  const [takeoverToken, setTakeoverToken] = useState("");
  const [takeoverExpiresAt, setTakeoverExpiresAt] = useState("");
  const [takeoverIssuing, setTakeoverIssuing] = useState(false);
  const [takeoverVerifying, setTakeoverVerifying] = useState(false);
  const [takeoverNotice, setTakeoverNotice] = useState("");
  const [takeoverError, setTakeoverError] = useState("");        // blocking errors (e.g. existing MX provider)
  const [takeoverDetected, setTakeoverDetected] = useState<string[]>([]);
  const [takeoverVerified, setTakeoverVerified] = useState(false);
  const [takeoverCopied, setTakeoverCopied] = useState<Record<string, boolean>>({});
  const copyTakeover = async (val: string, key: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setTakeoverCopied((c) => ({ ...c, [key]: true }));
      setTimeout(() => setTakeoverCopied((c) => ({ ...c, [key]: false })), 2000);
    } catch {
      toast.error("Could not copy.");
    }
  };
  const [takeoverProvider, setTakeoverProvider] = useState("");
  const [takeoverPending, setTakeoverPending] = useState(false); // there's an unfinished takeover in the DB
  const [takeoverDisconnecting, setTakeoverDisconnecting] = useState(false);
  // Discard-confirm modal state. Replaces window.confirm() so the destructive
  // action gets a styled dialog instead of the browser's native alert.
  const [discardConfirm, setDiscardConfirm] = useState<null | {
    title: string;
    body: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => Promise<void> | void;
  }>(null);
  const [discardConfirming, setDiscardConfirming] = useState(false);
  const [upgradingToCheckout, setUpgradingToCheckout] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<string>("starter");
  const [completingOnboarding, setCompletingOnboarding] = useState(false);
  const [selfEmail, setSelfEmail] = useState(() => localStorage.getItem("email") || "");
  // The provisioned 10DLC texting number. Loaded from /telnyx/agent so a
  // registered number shows on the Step 2 SMS card and survives a refresh.
  const [smsPhone, setSmsPhone] = useState("");
  // Reason the number isn't switched on yet (from the failed campaign assignment),
  // plus the inline "turn on texting" loading flag for the Step 2 SMS card.
  const [smsAssignError, setSmsAssignError] = useState("");
  const [turningOnTexting, setTurningOnTexting] = useState(false);
  const [moreEmailOptions, setMoreEmailOptions] = useState(false);
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessEmailStatus, setBusinessEmailStatus] = useState<BusinessEmailStatus>("unknown");
  const [businessOtp, setBusinessOtp] = useState("");
  const [businessOtpSent, setBusinessOtpSent] = useState(false);
  const [businessSending, setBusinessSending] = useState(false);
  const [businessVerifying, setBusinessVerifying] = useState(false);
  const [businessNotice, setBusinessNotice] = useState("");
  const popupAnchor = useRef<HTMLDivElement | null>(null);
  const [confettiActive, setConfettiActive] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [confettiSize, setConfettiSize] = useState({ width: 0, height: 0 });
  const confettiTimer = useRef<number | null>(null);
  const prevEmailConnected = useRef(false);
  const [gmailStatus, setGmailStatus] = useState<"unknown" | "not_connected" | "active" | "needs_reauth">("unknown");

  /* ---------------- LOAD PRESETS ---------------- */
  type Preset = {
    id: number;
    title: string;
    description?: string;
    avgReplies: string;
    messages: string;
    recommended: boolean;
  };
  const [presets, setPresets] = useState<Preset[]>([]);
  const [_loadingPresets, setLoadingPresets] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoadingPresets(true);
    fetch(`${API_BASE}/onboarding/presets`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setPresets(data))
      .catch((err) => console.error(err))
      .finally(() => setLoadingPresets(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/onboarding/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        // Keep the route-guard's cached onboarding step in sync with the server.
        // Without this, a stale `onboardingStep` (e.g. set on a different origin)
        // makes RoleProtectedRoute bounce /dashboard -> /onboarding while this
        // effect bounces back -> infinite loop.
        localStorage.setItem("onboardingStep", String(Number(data.step) || 0));
        if (data.step && data.step >= 5) {
          navigate("/dashboard");
          return;
        }
        // Onboarding is three steps (business profile / lead & pipeline /
        // connect tools). Older saved steps clamp into range.
        setStep((Math.min(Number(data.step) || 1, 3) as Step));
        setConnected({
          email: data.email_connected || false,
          sms: data.sms_connected || false,
        });
        if (data.selected_preset) {
          setSelectedPresetId(data.selected_preset);
        }
        if (data.brokerage) setBrokerage(String(data.brokerage));
        if (data.market) setMarket(String(data.market));
        if (data.business_address) setBusinessAddress(String(data.business_address));
        if (data.role) setBizRole(String(data.role));
        if (data.goal_appts) setGoalAppts(String(data.goal_appts));
        if (data.goal_deals) setGoalDeals(String(data.goal_deals));
        if (data.plan) setOrgPlan(data.plan);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Source of truth for the current plan lives in /billing/status (the
  // /onboarding/:userId endpoint doesn't expose org.plan). Fetch separately so
  // returning from Stripe Checkout immediately unlocks the SMS card.
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/billing/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.plan) setOrgPlan(data.plan);
      })
      .catch(() => { /* non-fatal */ });
  }, [API_BASE, token]);

  useEffect(() => {
    const updateSize = () => {
      setConfettiSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    return () => {
      if (confettiTimer.current) {
        window.clearTimeout(confettiTimer.current);
      }
    };
  }, []);

  const triggerConfetti = () => {
    setConfettiKey((key) => key + 1);
    setConfettiActive(true);
    if (confettiTimer.current) {
      window.clearTimeout(confettiTimer.current);
    }
    confettiTimer.current = window.setTimeout(() => {
      setConfettiActive(false);
    }, 3500);
  };

  useEffect(() => {
    if (connected.email && !prevEmailConnected.current) {
      triggerConfetti();
    }
    prevEmailConnected.current = connected.email;
  }, [connected.email]);

  // True until the first round of channel-status fetches resolve. Step 2
  // renders a skeleton instead of the email/SMS cards while this is true so
  // the user doesn't see a flash of "not connected" state that then changes.
  const [step2Loading, setStep2Loading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const loadStatuses = async () => {
      let gmailEmailAddress = "";
      try {
        const res = await fetch(`${API_BASE}/gmail/connection`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setGmailStatus(data.status || "not_connected");
        if (data.email_address) {
          gmailEmailAddress = data.email_address;
          setSelfEmail(data.email_address);
        }
        if (data.status === "active" && !connected.email) {
          await fetch(`${API_BASE}/onboarding/${userId}/connect`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ channel: "email" }),
          });
          setConnected((c) => ({ ...c, email: true }));
        }
      } catch {
        setGmailStatus("not_connected");
      }

      try {
        const res = await fetch(`${API_BASE}/elastic/business-email/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.email) setBusinessEmail(data.email);
        if (data.email) {
          setSelfEmail(gmailEmailAddress || data.email);
        }
        const status = (data.status || "not_connected") as BusinessEmailStatus;
        setBusinessEmailStatus(status);
        if (status === "otp_pending") setBusinessOtpSent(true);
        // After the Option-3 takeover the pending-takeover row is consumed,
        // so its GET returns null. Backfill takeoverDomain/prefix from the
        // verified inbox_connection email so Option 3's card still has the
        // domain to display ("Resume DNS setup for hello@yourdomain.com").
        if (status === "ownership_verified" && data.email) {
          const [pfx, dom] = String(data.email).split("@");
          if (dom) setTakeoverDomain(dom);
          if (pfx) setTakeoverPrefix(pfx);
        }
        if (status === "verified" && (data.sending_records_verified ?? data.all_records_verified) && !connected.email) {
          await fetch(`${API_BASE}/onboarding/${userId}/connect`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ channel: "email" }),
          });
          setConnected((c) => ({ ...c, email: true }));
        }
      } catch {
        setBusinessEmailStatus((prev) => (prev === "unknown" ? "not_connected" : prev));
      }

      // Load telnyx SMS status
      try {
        const res = await fetch(`${API_BASE}/telnyx/agent`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.user?.telnyx_sms_status) {
          setSmsTelnyxStatus(data.user.telnyx_sms_status);
        }
        if (data.user?.telnyx_phone_number) {
          setSmsPhone(data.user.telnyx_phone_number);
        }
        setSmsAssignError(data.user?.telnyx_error_reason || "");
      } catch {
        // non-fatal
      }
      setStep2Loading(false);
    };
    loadStatuses();
    // `connected.email` is intentionally NOT a dependency: the effect itself
    // flips it (via setConnected) when gmail/business-email is verified, and
    // including it would re-fire all three /gmail, /elastic, /telnyx fetches.
    // The `!connected.email` guard inside the body only gates the one-time
    // /onboarding/connect POST, which doesn't need a re-run to stay correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE, token, userId]);

  // Restore any unfinished MX-takeover so a page refresh doesn't lose state.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/elastic/domain/pending-takeover`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.pending) return;
        setTakeoverDomain(data.domain || "");
        setTakeoverPrefix(data.sending_prefix || "hello");
        setTakeoverToken(data.txt_value || "");
        setTakeoverExpiresAt(data.expires_at || "");
        setTakeoverVerified(Boolean(data.verified_at));
        setTakeoverPending(true);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [API_BASE, token]);

  useEffect(() => {
    if (!presets.length || selectedPresetId) return;
    const defaultPreset = presets.find((p) => p.title.toLowerCase() === "buyer lead follow-up");
    if (defaultPreset) setSelectedPresetId(defaultPreset.id);
  }, [presets, selectedPresetId]);

  // emailSetupReady is the "you're done with email" gate. We accept both
  // "verified" (Option 2 OTP path, fully done) and "ownership_verified" *with*
  // the local onboarding_progress.email_connected flag set - that flag only
  // flips true after a successful DNS verify, so its presence means the user
  // really did finish, even if the server-side status transition lagged.
  const emailSetupReady = connected.email && (
    gmailStatus === "active" ||
    businessEmailStatus === "verified" ||
    businessEmailStatus === "ownership_verified"
  );
  // Option 2 (OTP path) shows "Resume DNS setup" for otp_verified / registered.
  // Option 3 (takeover path) owns the ownership_verified state - that's the
  // signal the user came in through the DNS-TXT takeover flow.
  const option2InProgress =
    !emailSetupReady && Boolean(businessEmail) && ["otp_verified", "registered"].includes(businessEmailStatus);
  const option3DnsInProgress =
    !emailSetupReady && Boolean(businessEmail) && businessEmailStatus === "ownership_verified";
  // Alias for the rest of the file - any DNS-records-pending state.
  const businessDomainInProgress = option2InProgress || option3DnsInProgress;
  // Locks the other cards while a setup path is mid-flight.
  const takeoverInProgress = (takeoverPending && !takeoverVerified) || option3DnsInProgress;
  const emailSetupInProgress = businessDomainInProgress || takeoverInProgress;

  /* ---------------- HELPERS ---------------- */
  const updateStep = async (nextStep: Step, payload = {}) => {
    setStep(nextStep);
    await fetch(`${API_BASE}/onboarding/${userId}/step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ step: nextStep, ...payload }),
    });
  };

  const selectPreset = async (presetId: number) => {
    setSelectedPresetId(presetId);
    try {
      const preset = availablePresets.find((item) => item.id === presetId);
      const leadType = preset ? PRESET_LEAD_TYPE[preset.title.toLowerCase()] : undefined;
      const res = await fetch(`${API_BASE}/onboarding/${userId}/preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preset_id: presetId, lead_type: leadType }),
      });
      if (!res.ok) throw new Error("Failed to save selection");
    } catch {
      toast.error("Error saving preset");
    }
  };

  const connectSMS = () => {
    // Render the same ConnectPhoneNumber component inline as a modal so the
    // user never leaves the onboarding page. The component supports embedded
    // mode via props (no route navigation on completion).
    setShowPhoneSetupModal(true);
  };

  // Re-pull the texting number + status after the phone setup modal closes so
  // the Step 2 SMS card reflects a freshly-registered (often still "pending")
  // number without waiting for a full page refresh.
  const refreshSmsStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/telnyx/agent`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.user?.telnyx_phone_number) setSmsPhone(data.user.telnyx_phone_number);
      if (data.user?.telnyx_sms_status) setSmsTelnyxStatus(data.user.telnyx_sms_status);
      setSmsAssignError(data.user?.telnyx_error_reason || "");
    } catch {
      // non-fatal
    }
  };

  // "Turn on texting" = link the reserved number to the shared SMS campaign.
  // Kept inline on the onboarding card so the user doesn't have to reopen the
  // full setup modal just to finish this one tap.
  const turnOnTexting = async () => {
    if (!token) return;
    setTurningOnTexting(true);
    try {
      const res = await fetch(`${API_BASE}/telnyx/provision/assign-campaign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      // Backend error helper returns { message }; accept { error } too for older
      // endpoints so the real Telnyx detail makes it into the toast/error_reason.
      if (!res.ok) throw new Error(data.message || data.error || "We couldn't switch on texting just now.");
      setSmsTelnyxStatus("approved");
      setSmsAssignError("");
      if (userId) {
        fetch(`${API_BASE}/onboarding/${userId}/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ channel: "sms" }),
        }).catch(() => { });
      }
      toast.success("Texting is switched on for your number.");
    } catch (err) {
      const message = (err as Error).message || "We couldn't switch on texting just now. Please try again in a moment.";
      setSmsAssignError(message);
      toast.error(message);
    } finally {
      setTurningOnTexting(false);
    }
  };

  const createCheckoutAndRedirect = async (planId: string = selectedUpgradePlan, successPath: string = "/onboarding") => {
    setUpgradingToCheckout(true);
    try {
      const res = await fetch(`${API_BASE}/billing/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          planId,
          cancelPath: window.location.pathname,
          // Threads through Stripe -> BillingSuccess so the routing intent
          // survives even if the user finishes checkout on a different device.
          successPath,
          // Pre-apply a promo code the user validated at signup.
          promoCode: localStorage.getItem("wc_promo_code") || "",
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.assign(data.checkout_url);
      } else if (data.comped) {
        // 100%-off promo: comped instantly in D1, no Stripe / no card. Route via
        // the success page so the plan is reflected (SMS/AI unlock) on return.
        window.location.assign(
          `/billing/success?comped=1&plan=${encodeURIComponent(data.plan || planId)}&return=${encodeURIComponent(successPath)}`,
        );
      } else {
        // Surface the real Stripe error - "No such price" / "test mode key
        // used with live price" etc. is actionable info, not a generic toast.
        const msg = (data.message || data.error || "").toString();
        toast.error(
          msg.startsWith("No such price")
            ? "Stripe price not found. Check that STRIPE_PRICE_* in .dev.vars matches a test-mode price in your Stripe dashboard."
            : msg || "Failed to start checkout. Please try again.",
          { duration: 8000 },
        );
        setUpgradingToCheckout(false);
      }
    } catch {
      toast.error("Failed to start checkout. Please try again.");
      setUpgradingToCheckout(false);
    }
  };

  const handleSelectPaidPlan = async (planId: string) => {
    // Skip the inline SetupIntent / "Add card" sub-step entirely. Stripe
    // Checkout already collects card details AND creates the subscription in
    // one hosted flow - the inline form was causing users to enter their card
    // twice (once for SetupIntent, then again on Stripe Checkout).
    setSelectedUpgradePlan(planId);
    await createCheckoutAndRedirect(planId);
  };

  const startGmailOAuth = async () => {
    try {
      const res = await fetch(`${API_BASE}/gmail/connect-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error("Failed to start Gmail connect");
        return;
      }
      // remember to return here after OAuth
      localStorage.setItem("gmail_oauth_return", "/onboarding");
      window.location.href = data.url;
    } catch {
      toast.error("Failed to start Gmail connect");
    }
  };

  const sendBusinessEmailOtp = async () => {
    if (!businessEmail) {
      toast.error("Enter your business email");
      return;
    }
    setBusinessSending(true);
    setBusinessNotice("");
    try {
      const res = await fetch(`${API_BASE}/elastic/business-email/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: businessEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Server detected no MX on this domain - the OTP would never arrive.
        // Prefill the takeover modal with the same email and pop it open
        // instead of trying again with a different OTP.
        if (data?.no_email_provider) {
          const dom = String(data.domain || businessEmail.split("@")[1] || "").toLowerCase();
          const prefix = (businessEmail.split("@")[0] || "hello").toLowerCase().replace(/[^a-z0-9._-]/g, "");
          setBusinessNotice("");
          setTakeoverDomain(dom);
          setTakeoverPrefix(prefix || "hello");
          setShowEmailModal(false);
          setShowTakeoverModal(true);
          toast.error(`${dom} has no email provider - switched you to Option 3 (DNS verification).`, { duration: 6000 });
          return;
        }
        toast.error(data.error || data.message || "Failed to send code");
        return;
      }
      // Server short-circuited: this email/domain is already verified or
      // fully connected. Skip the OTP UI and jump the user straight into the
      // DNS-records modal (BusinessEmailSetup), since that's the next step
      // after OTP anyway. If they're already at "verified", BusinessEmailSetup
      // will render its done state.
      if (data.already_connected || data.already_verified) {
        const known = String(data.status || "registered") as BusinessEmailStatus;
        setBusinessEmailStatus(known);
        setBusinessOtpSent(false);
        setBusinessNotice("");
        toast.success(data.message || "Already verified - skipping OTP.");
        return;
      }
      setBusinessEmailStatus("otp_pending");
      setBusinessOtpSent(true);
      setBusinessNotice(
        data.domain_submitted === false
          ? "Verification code sent - check your inbox (and spam/promotions). We'll prepare DNS records after you verify the code."
          : "Verification code sent - check your inbox (and spam/promotions). Elastic Email domain setup is prepared for DNS records after verification."
      );
    } catch {
      toast.error("Failed to send code");
    } finally {
      setBusinessSending(false);
    }
  };

  const verifyBusinessEmailOtp = async () => {
    if (!businessEmail || !businessOtp) {
      toast.error("Enter the verification code");
      return;
    }
    setBusinessVerifying(true);
    setBusinessNotice("");
    try {
      const res = await fetch(`${API_BASE}/elastic/business-email/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: businessEmail, otp: businessOtp }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Invalid code");
        return;
      }
      setBusinessEmailStatus("otp_verified");
      setBusinessOtp("");
      toast.success("Business email verified. Add DNS records to finish connecting.");
    } catch {
      toast.error("Verification failed");
    } finally {
      setBusinessVerifying(false);
    }
  };

  const completeOnboarding = async (
    destination: string,
    navigationState?: Record<string, unknown> | null
  ) => {
    setCompletingOnboarding(true);
    await fetch(`${API_BASE}/onboarding/${userId}/step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ step: 5 }),
    });
    // Refresh the route-guard cache so /dashboard isn't bounced back to
    // /onboarding by a stale step (the cause of the post-finish redirect loop).
    localStorage.setItem("onboardingStep", "5");

    // Flow: pick a paid plan on pricing -> create account -> ONBOARD -> pay.
    // If a paid plan was carried from signup, finishing onboarding sends the
    // user to Stripe checkout for it; after payment BillingSuccess lands them on
    // the dashboard with the plan active.
    const pendingPlan = (localStorage.getItem("wc_pending_plan") || "").toLowerCase();
    if (["starter", "growth"].includes(pendingPlan)) {
      localStorage.removeItem("wc_pending_plan");
      await createCheckoutAndRedirect(pendingPlan, "/dashboard");
      return;
    }

    if (navigationState) {
      navigate(destination, { state: navigationState });
      return;
    }
    navigate(destination);
  };

  // SMS plan gate - any paid plan gets SMS
  const hasSmsAccess = orgPlan && orgPlan !== "free_channel";
  const smsApproved = smsTelnyxStatus === "approved";
  const canContinue = (currentStep: Step) => {
    // Step 1 business profile: brokerage + market + a valid commission % + a
    // valid business mailing address (required for CAN-SPAM marketing footers).
    if (currentStep === 1 && !(brokerage.trim() && market.trim() && Number(avgCommission) > 0 && businessAddress.trim() && !validateBusinessAddress(businessAddress))) return false;
    // Step 2 lead & pipeline: both goals set.
    if (currentStep === 2 && !(Number(goalDeals) > 0 && Number(goalAppts) > 0)) return false;
    // Step 3 connect tools: a connected email is required.
    if (currentStep === 3 && !emailSetupReady) return false;
    return true;
  };

  const totalSteps = 3;

  // Live pipeline projection for the Step 2 calc panel.
  const fmtMoney = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return "$0";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + Math.round(n).toLocaleString();
  };
  const projDeals = Number(goalDeals) || 0;
  const projPrice = Number(avgSalePrice) || 0;
  const projPct = Number(avgCommission) || 0;
  const projPipeline = projDeals * projPrice;
  const projCommission = projDeals * projPrice * (projPct / 100);

  // Map preset title → lead_type stored on backend
  const PRESET_LEAD_TYPE: Record<string, string> = {
    "buyer lead follow-up": "buyer",
    "open house follow-up": "open_house",
    "seller lead follow-up": "seller",
    "past client re-engagement": "past_client",
  };


  const getPresetIcon = (titleKey: string) => {
    switch (titleKey) {
      case "buyer lead follow-up":
        return <Home className="w-5 h-5 text-[#e25a09]" />;
      case "open house follow-up":
        return <MessageCircle className="w-5 h-5 text-[#e25a09]" />;
      case "seller lead follow-up":
        return <DollarSign className="w-5 h-5 text-[#e25a09]" />;
      case "past client re-engagement":
        return <Handshake className="w-5 h-5 text-[#e25a09]" />;
      default:
        return <ClipboardList className="w-5 h-5 text-[#e25a09]" />;
    }
  };

  const PRESET_CAPTIONS: Record<string, { tag: string; detail: string }> = {
    "buyer lead follow-up": {
      tag: "Default",
      detail: "AI tone: eager & helpful * Auto-schedule 3 follow-ups",
    },
    "open house follow-up": {
      tag: "Open House",
      detail: "AI tone: warm & inviting * 2-message sequence",
    },
    "seller lead follow-up": {
      tag: "Seller",
      detail: "AI tone: consultative * Auto-schedule 3 follow-ups",
    },
    "past client re-engagement": {
      tag: "Re-engagement",
      detail: "AI tone: friendly & nostalgic * 2-message sequence",
    },
  };

  const availablePresets = presets;

  /* ---------------- UI ---------------- */
  return (
    <div
      className="min-h-screen p-6"
      style={{
        background:
          "radial-gradient(900px 500px at 12% -8%, #fff3e6 0%, rgba(255,243,230,0) 60%), radial-gradient(800px 600px at 100% 0%, #fdeede 0%, rgba(253,238,222,0) 55%), #faf7f2",
      }}
    >
      <Toaster position="top-right" reverseOrder={false} />
      <div className="max-w-4xl mx-auto" ref={popupAnchor}>
        {/* Progress */}
        {/* <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Step {step} of 7</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-[#f4731e]" style={{ width: `${progress}%` }} />
          </div>
        </div> */}
        <div className="mb-8">
  {/* Header row */}
  <div className="flex items-center justify-between mb-3">
    {/* Logo / Brand */}
    <div className="flex items-center gap-2">
      <img src="/icon.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
      <span className="font-semibold text-gray-900">WarmChats</span>
    </div>

    {/* Step text */}
    <div className="text-sm text-gray-600">
      Step {Math.min(step, totalSteps)} of {totalSteps} * Takes ~2 minutes total
    </div>
  </div>

  {/* 3-step rail */}
  <div className="mt-4 flex items-center">
    {[
      { n: 1, label: "Business profile" },
      { n: 2, label: "Lead & pipeline" },
      { n: 3, label: "Connect tools" },
    ].map((s, i) => {
      const done = step > s.n;
      const active = step === s.n;
      return (
        <div key={s.n} className={i < 2 ? "flex items-center flex-1" : "flex items-center"}>
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                done
                  ? "bg-[#f4731e] text-white"
                  : active
                    ? "border-[1.5px] border-[#f7973f] bg-[#fef3ea] text-[#b9450a]"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {done ? <Check size={16} /> : s.n}
            </div>
            <div className="hidden sm:block">
              <div className={`text-[9px] font-bold uppercase tracking-wide ${active || done ? "text-[#e25a09]" : "text-gray-400"}`}>
                Step {s.n}
              </div>
              <div className={`text-xs font-semibold ${active ? "text-gray-900" : done ? "text-gray-700" : "text-gray-400"}`}>
                {s.label}
              </div>
            </div>
          </div>
          {i < 2 && (
            <div className={`mx-3 h-0.5 flex-1 rounded transition-colors ${step > s.n ? "bg-[#fbc193]" : "bg-gray-200"}`} />
          )}
        </div>
      );
    })}
  </div>
</div>

        <Card className="shadow-xl border border-white/40 bg-white/70 backdrop-blur-md">
          <CardContent className="pt-6">
            {step === 1 && (
              <div className="space-y-5 text-left">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#e25a09]">Welcome to WarmChats</p>
                  <h2 className="text-lg font-semibold text-gray-900">Tell us about your business</h2>
                  <p className="text-sm text-gray-600">We'll tailor your AI agents to how you work.</p>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Brokerage name</span>
                  <input
                    value={brokerage}
                    onChange={(e) => setBrokerage(e.target.value)}
                    placeholder="e.g. Acme Realty"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Market / City</span>
                  <input
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    placeholder="e.g. Austin, TX"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Business mailing address</span>
                  <textarea
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    rows={2}
                    placeholder="e.g. 123 Main St, Austin, TX 78701"
                    className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                  />
                  {businessAddress.trim() && validateBusinessAddress(businessAddress) ? (
                    <span className="mt-1 block text-[11px] text-red-600">{validateBusinessAddress(businessAddress)}</span>
                  ) : (
                    <span className="mt-1 block text-[11px] text-gray-500">Shown in the footer of every marketing email you send (required by law).</span>
                  )}
                </label>

                <div>
                  <span className="mb-1.5 block text-xs font-medium text-gray-700">Your role</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "agent", label: "Agent", sub: "I sell my own deals" },
                      { id: "broker", label: "Broker", sub: "I run a team / office" },
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setBizRole(o.id)}
                        className={`rounded-xl border p-3 text-left transition ${
                          bizRole === o.id ? "border-[#f7973f] bg-[#fef3ea] ring-2 ring-orange-100" : "border-gray-200 bg-white hover:border-orange-300"
                        }`}
                      >
                        <div className={`text-sm font-semibold ${bizRole === o.id ? "text-[#b9450a]" : "text-gray-900"}`}>{o.label}</div>
                        <div className="text-[11px] text-gray-500">{o.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Average commission (%)</span>
                  <input
                    type="number" min="0" max="100" step="0.1" placeholder="2.5"
                    value={avgCommission}
                    onChange={(e) => setAvgCommission(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">Your typical commission rate per closed deal.</span>
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5 text-left">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#e25a09]">Lead &amp; pipeline setup</p>
                  <h2 className="text-lg font-semibold text-gray-900">Let's size up your pipeline</h2>
                  <p className="text-sm text-gray-600">We use these to project your revenue and track your goals.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-700">Average sale price ($)</span>
                    <input
                      type="number" min="0" step="1000" placeholder="400000"
                      value={avgSalePrice}
                      onChange={(e) => setAvgSalePrice(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-700">Goal appointments / month</span>
                    <input
                      type="number" min="0" step="1" placeholder="20"
                      value={goalAppts}
                      onChange={(e) => setGoalAppts(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Goal deals closed this year</span>
                  <input
                    type="number" min="0" step="1" placeholder="24"
                    value={goalDeals}
                    onChange={(e) => setGoalDeals(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">How many deals you aim to close this year - we use this to project your revenue.</span>
                </label>

                {/* Calculated-for-you pipeline projection */}
                <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-4">
                  <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-[#b9450a]">Calculated for you</div>
                  {projDeals > 0 ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-2xl font-bold text-gray-900">{projPrice > 0 ? fmtMoney(projPipeline) : "-"}</div>
                          <div className="text-xs text-gray-500">Estimated annual pipeline</div>
                          <div className="mt-0.5 text-[11px] text-gray-400">{projPrice > 0 ? `${projDeals} deals * ${fmtMoney(projPrice)}` : "Add a sale price to project"}</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-[#b9450a]">{projPct > 0 && projPrice > 0 ? fmtMoney(projCommission) : "-"}</div>
                          <div className="text-xs text-gray-500">Potential annual commission</div>
                          <div className="mt-0.5 text-[11px] text-gray-400">{projPct > 0 ? `${projPct}% of pipeline` : "Add commission in step 1"}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Enter your goal deals closed this year to see your projected pipeline and commission.</p>
                  )}
                </div>
              </div>
            )}

            {step === 3 && step2Loading && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Connect your email to start sending
                  </h2>
                  <p className="text-sm text-gray-600">
                    Start conversations, automate follow-ups, and book appointments from one inbox. Setup takes less than 10 seconds.
                  </p>
                </div>
                {/* Skeleton: render the two card outlines so the layout doesn't
                    jump when real data arrives, but no interactive content yet. */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-gray-200 animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
                        <div className="h-3 w-64 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="h-28 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
                      <div className="h-28 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
                      <div className="h-28 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
                      <div className="h-28 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-gray-200 animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
                        <div className="h-3 w-56 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="mt-4 h-9 w-40 rounded-md bg-gray-100 animate-pulse" />
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-gray-200 animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
                        <div className="h-3 w-56 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="mt-4 h-9 w-32 rounded-md bg-gray-100 animate-pulse" />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && !step2Loading && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#e25a09]">Almost there</p>
                  <h2 className="text-lg font-semibold text-gray-900">Connect your tools</h2>
                  <p className="text-sm text-gray-600">Plug in the channels your AI will work across.</p>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Email block (now first) - a full-width block; the SMS card
                      below it carries the 1px divider that separates the two. */}
                  <Card className="rounded-none border-0 bg-transparent p-0 shadow-none">
                    <div className="flex items-start gap-3">
                      <Mail size={20} className="text-[#e25a09] mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                          Email <span className="text-[#e25a09]">(Required)</span>
                        </div>
                        <div className="text-sm text-gray-600 mt-0.5">
                          Send personalized follow-ups from your inbox
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          Gmail or business email * Takes 10 seconds
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      {emailSetupReady ? ((): React.ReactNode => {
                        // Detect which path the user took so we can show the
                        // right "connected via X" label + the right disconnect
                        // action (Gmail revoke vs elastic-domain disconnect).
                        const isGmail = gmailStatus === "active";
                        const isTakeover = businessEmailStatus === "ownership_verified";
                        const isOtpDomain = businessEmailStatus === "verified";
                        const connectedEmail = isGmail ? selfEmail : businessEmail;
                        const optionLabel = isGmail
                          ? "Option 1 - Gmail"
                          : isTakeover
                            ? "Option 3 - WarmChats inbox"
                            : isOtpDomain
                              ? "Option 2 - Your verified domain"
                              : "Connected";
                        const disconnectFn = async (): Promise<void> => {
                          if (isGmail) {
                            await fetch(`${API_BASE}/gmail/disconnect`, {
                              method: "POST",
                              headers: { Authorization: `Bearer ${token}` },
                            }).catch((): null => null);
                          } else if (businessEmail) {
                            const dom = businessEmail.split("@")[1];
                            if (dom) {
                              await fetch(`${API_BASE}/elastic/domain/disconnect`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ domain: dom }),
                              }).catch((): null => null);
                            }
                          }
                          window.location.reload();
                        };
                        return (
                          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex items-start gap-2 min-w-0">
                                <Check size={16} className="text-green-600 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-gray-900">
                                    Email connected
                                  </div>
                                  <div className="mt-0.5 text-xs text-gray-600">
                                    <span className="inline-flex items-center gap-1.5 mr-2">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium border border-green-200">
                                        {optionLabel}
                                      </span>
                                    </span>
                                    <span className="font-mono text-gray-800">{connectedEmail || "(no address)"}</span>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setDiscardConfirm({
                                  title: "Disconnect email?",
                                  body: (
                                    <span>
                                      This disconnects <span className="font-mono font-semibold text-gray-900">{connectedEmail}</span>{" "}
                                      ({optionLabel}). {isGmail
                                        ? "Your Google connection will be revoked; you'll be able to re-connect from Step 2."
                                        : "We'll remove your domain from Elastic and clean up the DNS records on our side - your DNS records at your provider stay in place."}
                                    </span>
                                  ),
                                  confirmLabel: "Yes, disconnect",
                                  onConfirm: disconnectFn,
                                })}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                <Trash2 size={12} />
                                Disconnect
                              </button>
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-2 items-stretch">
                          {/* Option 1 - Gmail */}
                          <div className={`rounded-xl border bg-white p-4 flex flex-col h-full ${
                            takeoverInProgress || businessDomainInProgress
                              ? "border-gray-200 opacity-50"
                              : "border-orange-200"
                          }`}>
                            <div className="text-xs font-semibold uppercase tracking-wide text-[#e25a09]">Option 1 - Fastest</div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">Connect Gmail</div>
                            <p className="mt-1 text-xs text-gray-500 italic">Best for agents already using Gmail or Google Workspace.</p>
                            <ul className="mt-2 space-y-1 text-xs text-gray-600">
                              <li className="flex items-start gap-1.5"><Check size={11} className="text-green-500 mt-0.5 shrink-0" />Send emails instantly from your existing inbox</li>
                              <li className="flex items-start gap-1.5"><Check size={11} className="text-green-500 mt-0.5 shrink-0" />No DNS setup required</li>
                              <li className="flex items-start gap-1.5"><Check size={11} className="text-green-500 mt-0.5 shrink-0" />Ready in seconds</li>
                            </ul>
                            {emailSetupInProgress && (
                              <p className="mt-2 text-xs text-gray-600 italic">
                                Cancel the other option below to switch to Gmail.
                              </p>
                            )}
                            <div className="grow" />
                            <button
                              onClick={startGmailOAuth}
                              disabled={emailSetupInProgress}
                              className="mt-4 w-full rounded-lg bg-[#f4731e] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {gmailStatus === "needs_reauth" ? "Reconnect with Google" : "Continue with Google"}
                            </button>
                          </div>

                          {/* Option 2 - Verify Domain (OTP path) */}
                          <div className={`rounded-xl border p-4 flex flex-col h-full ${
                            takeoverInProgress
                              ? "border-[#cdd8ee] bg-[#eef2fb] opacity-50"
                              : "border-[#cdd8ee] bg-[#eef2fb]"
                          }`}>
                            <div className="text-xs font-semibold uppercase tracking-wide text-[#2f6ad0]">Option 2 - Best Deliverability</div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">
                              {option2InProgress ? "Finish DNS setup" : "Verify Your Domain"}
                            </div>
                            {option2InProgress ? (
                              <p className="mt-1 text-xs text-gray-600">
                                <span>Add the DNS records for <b>{businessEmail}</b> to start sending.</span>
                              </p>
                            ) : (
                              <>
                                <p className="mt-1 text-xs text-gray-500 italic">Best for teams, brokerages, or high-volume sending.</p>
                                <ul className="mt-2 space-y-1 text-xs text-gray-600">
                                  <li className="flex items-start gap-1.5"><Check size={11} className="text-green-500 mt-0.5 shrink-0" />Send from your branded domain</li>
                                  <li className="flex items-start gap-1.5"><Check size={11} className="text-green-500 mt-0.5 shrink-0" />Higher sending limits</li>
                                  <li className="flex items-start gap-1.5"><Check size={11} className="text-green-500 mt-0.5 shrink-0" />Better email deliverability and trust</li>
                                </ul>
                              </>
                            )}
                            {takeoverInProgress && (
                              <p className="mt-2 text-xs text-gray-600 italic">
                                Cancel Option 3 first to switch.
                              </p>
                            )}
                            <div className="grow" />
                            <div className="mt-4 flex gap-2">
                              <button
                                onClick={() => setShowEmailModal(true)}
                                disabled={takeoverInProgress}
                                className="flex-1 rounded-lg border border-[#aec3e8] bg-white px-4 py-2 text-sm font-semibold text-[#2f6ad0] transition hover:bg-[#e9eef8] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {option2InProgress ? "Resume DNS setup" : "Verify Domain"}
                              </button>
                              {option2InProgress && (
                                <button
                                  type="button"
                                  onClick={() => setDiscardConfirm({
                                    title: "Discard in-progress setup?",
                                    body: (
                                      <span>
                                        This removes the DNS-records progress for <span className="font-mono font-semibold text-gray-900">{businessEmail}</span>.
                                        Any DNS records you've already added on your provider stay - you'll just need to re-OTP and re-verify here to use them again.
                                      </span>
                                    ),
                                    confirmLabel: "Yes, discard",
                                    onConfirm: async () => {
                                      const dom = (businessEmail || "").split("@")[1];
                                      if (!dom) return;
                                      try {
                                        await fetch(`${API_BASE}/elastic/domain/disconnect`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                          body: JSON.stringify({ domain: dom }),
                                        });
                                        window.location.reload();
                                      } catch {
                                        toast.error("Failed to discard.");
                                      }
                                    },
                                  })}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                  title="Discard this setup"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          </div>
                          {/* Advanced email paths (WarmChats Inbox + buy-a-domain)
                              collapse here so Gmail + Verify Domain lead. Auto-opens
                              when one of those paths is mid-setup. */}
                          <button
                            type="button"
                            onClick={() => setMoreEmailOptions((v) => !v)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                          >
                            {(moreEmailOptions || takeoverInProgress || option3DnsInProgress) ? "Hide advanced options" : "Show advanced options"}
                            <ChevronDown size={14} className={`transition-transform ${(moreEmailOptions || takeoverInProgress || option3DnsInProgress) ? "rotate-180" : ""}`} />
                          </button>
                          {(moreEmailOptions || takeoverInProgress || option3DnsInProgress) && (
                          <div className="space-y-3">
                          {/* Option 3 - Takeover */}
                          <div className={`rounded-xl border p-4 flex flex-col h-full ${
                            takeoverInProgress
                              ? "border-[#c3b3ef] bg-[#efebf9]"
                              : option2InProgress
                                ? "border-gray-200 bg-white opacity-50"
                                : "border-[#d8cdf3] bg-transparent"
                          }`}>
                            <div className="text-xs font-semibold uppercase tracking-wide text-[#6849cf]">
                              Option 3 - {option3DnsInProgress ? "DNS records pending" : takeoverInProgress ? "In progress" : "No Email Provider"}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">
                              {option3DnsInProgress
                                ? "Resume DNS setup"
                                : takeoverInProgress
                                  ? "Resume DNS verification"
                                  : "Use WarmChats Inbox"}
                            </div>
                            {option3DnsInProgress ? (
                              <p className="mt-1 text-xs text-gray-600">
                                <span>Ownership verified for <span className="font-mono">{businessEmail}</span>. Add the remaining SPF/DKIM/MX records to finish.</span>
                              </p>
                            ) : takeoverInProgress ? (
                              <p className="mt-1 text-xs text-gray-600">
                                <span>Finish verifying ownership of <b>{takeoverDomain}</b> for <span className="font-mono">{takeoverPrefix}@{takeoverDomain}</span>.</span>
                              </p>
                            ) : (
                              <>
                                <p className="mt-1 text-xs text-gray-500 italic">Best if you own a domain but haven't set up email yet.</p>
                                <ul className="mt-2 space-y-1 text-xs text-gray-600">
                                  <li className="flex items-start gap-1.5"><Check size={11} className="text-green-500 mt-0.5 shrink-0" />Send and receive emails inside WarmChats</li>
                                  <li className="flex items-start gap-1.5"><Check size={11} className="text-green-500 mt-0.5 shrink-0" />DNS setup handled automatically</li>
                                  <li className="flex items-start gap-1.5"><Check size={11} className="text-green-500 mt-0.5 shrink-0" />Switch to Gmail or Workspace later anytime</li>
                                </ul>
                              </>
                            )}
                            {option2InProgress && !takeoverInProgress && (
                              <p className="mt-2 text-xs text-gray-600 italic">
                                Discard Option 2 to switch to this path.
                              </p>
                            )}
                            <div className="grow" />
                            <div className="mt-4 flex gap-2">
                              <button
                                onClick={() => {
                                  // Ownership already verified -> go straight to the DNS-records
                                  // screen via the same EmailConnectModal path Option 2 uses.
                                  if (option3DnsInProgress) setShowEmailModal(true);
                                  else setShowTakeoverModal(true);
                                }}
                                disabled={option2InProgress && !takeoverInProgress}
                                className="flex-1 rounded-lg border border-[#c3b3ef] bg-white px-4 py-2 text-sm font-semibold text-[#6849cf] transition hover:bg-[#efebf9] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {option3DnsInProgress
                                  ? "Resume DNS setup"
                                  : takeoverInProgress
                                    ? "Resume DNS verification"
                                    : "Set Up Inbox"}
                              </button>
                              {takeoverInProgress && (
                                <button
                                  type="button"
                                  onClick={() => setDiscardConfirm({
                                    title: option3DnsInProgress ? "Disconnect this domain?" : "Discard this takeover?",
                                    body: (
                                      <span>
                                        {option3DnsInProgress ? (
                                          <>This disconnects <span className="font-mono font-semibold text-gray-900">{takeoverDomain}</span> from WarmChats and removes it from our ElasticEmail account. Any DNS records you added stay in your DNS - they'll just be ignored until you re-set-up.</>
                                        ) : (
                                          <>This removes the pending ownership-verification for <span className="font-mono font-semibold text-gray-900">{takeoverDomain}</span>. The TXT record stays in your DNS if you already added it - it'll just be ignored until you start a new takeover.</>
                                        )}
                                      </span>
                                    ),
                                    confirmLabel: option3DnsInProgress ? "Yes, disconnect" : "Yes, discard",
                                    onConfirm: async () => {
                                      setTakeoverDisconnecting(true);
                                      try {
                                        if (option3DnsInProgress && takeoverDomain) {
                                          // Full disconnect: removes Elastic
                                          // domain + all DB rows. The pending-
                                          // takeover endpoint only handles
                                          // unconsumed tokens.
                                          await fetch(`${API_BASE}/elastic/domain/disconnect`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                            body: JSON.stringify({ domain: takeoverDomain }),
                                          });
                                        } else {
                                          await fetch(`${API_BASE}/elastic/domain/pending-takeover`, {
                                            method: "DELETE",
                                            headers: { Authorization: `Bearer ${token}` },
                                          });
                                        }
                                        setTakeoverDomain("");
                                        setTakeoverPrefix("hello");
                                        setTakeoverToken("");
                                        setTakeoverExpiresAt("");
                                        setTakeoverNotice("");
                                        setTakeoverError("");
                                        setTakeoverDetected([]);
                                        setTakeoverPending(false);
                                        setTakeoverVerified(false);
                                        setBusinessEmail("");
                                        setBusinessEmailStatus("not_connected");
                                        setBusinessOtp("");
                                        setBusinessOtpSent(false);
                                        // Also clear the onboarding "email
                                        // channel connected" flag so the lock
                                        // releases - emailSetupReady stays
                                        // true otherwise even when there's no
                                        // working email connection left.
                                        setConnected((c) => ({ ...c, email: false }));
                                        toast.success(option3DnsInProgress ? "Domain disconnected." : "Takeover discarded.");
                                      } finally {
                                        setTakeoverDisconnecting(false);
                                      }
                                    },
                                  })}
                                  disabled={takeoverDisconnecting}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                                  title={option3DnsInProgress ? "Disconnect this domain" : "Discard this takeover"}
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* SMS card - sits BELOW the Email block, separated by a 1px
                      divider. Styled per docs/updated-docs/sms-automation-prompt.md,
                      wired to the real plan/registration state: free -> Upgrade,
                      paid+no number -> Register, reserved -> Turn On Texting,
                      approved -> Enabled (green). */}
                  <div className="border-t border-[#ece6dd] pt-6">
                  {(() => {
                    const smsEnabled = Boolean(hasSmsAccess && smsPhone && smsApproved);
                    const pill = (tone: "grey" | "orange" | "green" | "amber", text: React.ReactNode) => {
                      const tones: Record<string, string> = {
                        grey: "bg-[#f4efe8] text-[#6a5d50]",
                        orange: "bg-[#fef3ea] text-[#b9450a]",
                        green: "bg-[#e8f1ea] text-[#1f7a52]",
                        amber: "bg-[#f8efd9] text-[#a87400]",
                      };
                      return (
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] font-semibold ${tones[tone]}`}>{text}</span>
                      );
                    };
                    const arrow = (
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    );
                    return (
                      <div
                        style={{
                          border: "1px solid " + (smsEnabled ? "#c7e0ce" : "#ece6dd"),
                          borderRadius: 16,
                          padding: 18,
                          background: smsEnabled ? "#fff" : "#faf7f2",
                          transition: "all .2s",
                        }}
                      >
                        <div className="flex items-start gap-[13px]">
                          <div
                            className="grid shrink-0 place-items-center"
                            style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", border: "1px solid #ece6dd", color: smsEnabled ? "#1f7a52" : "#6a5d50" }}
                          >
                            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 01-12.2 7.7L3 21l1.8-5.8A8.5 8.5 0 1121 11.5z" /></svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[16px] font-bold text-[#211a14]">SMS Automation</span>
                              {pill("grey", orgPlan === "free_channel" ? "Free Plan" : `${orgPlan.replace("_channel", "")} plan`)}
                              {!hasSmsAccess
                                ? pill("orange", "SMS requires upgrade")
                                : smsEnabled
                                  ? pill("green", "SMS enabled")
                                  : smsPhone
                                    ? pill("amber", "Pending approval")
                                    : null}
                            </div>
                            <div className="mt-1.5 mb-3 text-[13.5px] leading-[1.45] text-[#6a5d50]">
                              Automatically text leads from a verified business number.
                            </div>
                            <ul className="mb-3.5 flex flex-col gap-[7px]">
                              {["AI follow-ups and appointment booking", "Requires SMS setup + 10DLC approval", "Available on paid plans"].map((t) => (
                                <li key={t} className="flex items-start gap-2 text-[12.5px] leading-[1.4] text-[#463b31]">
                                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="mt-[2.5px] shrink-0 text-[#1f7a52]"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                                  <span>{t}</span>
                                </li>
                              ))}
                            </ul>

                            {!hasSmsAccess ? (
                              <button
                                onClick={() => setShowUpgradeModal(true)}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] border border-[#f7973f] bg-transparent px-3 py-3 text-[14px] font-bold text-[#e25a09] transition hover:bg-[#fef3ea]"
                              >
                                Upgrade to Enable SMS {arrow}
                              </button>
                            ) : smsEnabled ? (
                              <button
                                onClick={connectSMS}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] border border-[#c7e0ce] bg-white px-3 py-3 text-[14px] font-bold text-[#1f7a52] transition hover:bg-[#e8f1ea]"
                              >
                                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                                SMS Enabled
                              </button>
                            ) : smsPhone ? (
                              <button
                                onClick={turnOnTexting}
                                disabled={turningOnTexting}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] border border-[#f7973f] bg-[#f4731e] px-3 py-3 text-[14px] font-bold text-white transition hover:bg-[#e25a09] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {turningOnTexting ? "Switching on..." : <>Turn On Texting {arrow}</>}
                              </button>
                            ) : (
                              <button
                                onClick={connectSMS}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] border border-[#f7973f] bg-[#f4731e] px-3 py-3 text-[14px] font-bold text-white transition hover:bg-[#e25a09]"
                              >
                                Register SMS Number {arrow}
                              </button>
                            )}

                            {hasSmsAccess && smsPhone && (
                              <div className="mt-[11px] rounded-[11px] border border-[#ece6dd] bg-white px-3 py-3 font-mono text-[14px] text-[#211a14]">
                                {formatDisplayPhone(smsPhone)}
                              </div>
                            )}
                            {hasSmsAccess && smsPhone && !smsApproved && smsAssignError && (
                              <p className="mt-1.5 text-[11.5px] text-[#b9450a]">
                                Couldn't switch on automatically - new numbers can take a minute. Tap Turn On Texting to retry.{" "}
                                <span className="opacity-70">({smsAssignError})</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  </div>
                </div>

                <p className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Check size={13} className="text-green-500 shrink-0" />
                  You can connect or change these anytime in Settings.
                </p>
              </div>
            )}

          </CardContent>

          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {step > 1 && (
              <button
                onClick={() => updateStep((step - 1) as Step)}
                className="border px-4 py-2 rounded-md"
              >
                Back
              </button>
            )}

            {step === 1 && (
              <button
                disabled={!canContinue(step)}
                onClick={async () => {
                  // Business profile -> persist brokerage (org name) + market/role
                  // and the commission rate (deal defaults).
                  await saveDealDefaults();
                  updateStep(2, { brokerage: brokerage.trim(), market: market.trim(), role: bizRole, business_address: businessAddress.trim() });
                }}
                className="px-6 py-3 rounded-lg font-semibold text-white bg-[#f4731e] hover:opacity-90 transition disabled:opacity-40 sm:ml-auto"
              >
                Continue →
              </button>
            )}

            {step === 2 && (
              <button
                disabled={!canContinue(step)}
                onClick={async () => {
                  // Lead & pipeline -> persist sale price (deal defaults) + goals.
                  await saveDealDefaults();
                  updateStep(3, { goal_appts: Number(goalAppts) || 0, goal_deals: Number(goalDeals) || 0 });
                }}
                className="px-6 py-3 rounded-lg font-semibold text-white bg-[#f4731e] hover:opacity-90 transition disabled:opacity-40 sm:ml-auto"
              >
                Continue →
              </button>
            )}

            {step === 3 && (
              <button
                disabled={!canContinue(step) || completingOnboarding}
                onClick={async () => {
                  // The follow-up playbook chooser was removed; default every new
                  // workspace to the Buyer playbook so AI tone/templates still seed.
                  const buyer = availablePresets.find((p) => p.title.toLowerCase() === "buyer lead follow-up");
                  const presetId = buyer?.id ?? selectedPresetId;
                  if (presetId) {
                    try { await selectPreset(presetId); } catch { /* non-fatal */ }
                  }
                  await completeOnboarding("/dashboard");
                }}
                className="px-6 py-3 rounded-lg font-semibold text-white bg-[#f4731e] hover:opacity-90 transition disabled:opacity-40 sm:ml-auto inline-flex items-center gap-2"
              >
                {completingOnboarding ? <Loader2 size={16} className="animate-spin" /> : null}
                Finish setup →
              </button>
            )}
          </CardFooter>
        </Card>

        <div className="mt-6 text-center text-sm text-gray-600 space-y-1">
          <div>
            Want to finish this later?{" "}
            <button
              type="button"
              onClick={async () => {
                await logoutCurrentSession(API_BASE);
                // Full reload to homepage: replaces this protected entry and
                // tears down authed state, matching the sidebar logout.
                window.location.replace("/");
              }}
              className="font-medium text-gray-900 hover:underline"
            >
              Log out
            </button>
          </div>
          <div className="text-xs text-gray-600">
            Need help?{" "}
            <button
              type="button"
              onClick={() => navigate("/support")}
              className="font-medium text-gray-700 hover:text-gray-900 hover:underline"
            >
              Contact support
            </button>
          </div>
        </div>
      </div>

      {confettiActive && (
        <div className="fixed inset-0 pointer-events-none z-40">
          <Confetti
            key={confettiKey}
            width={confettiSize.width}
            height={confettiSize.height}
            numberOfPieces={260}
            gravity={0.25}
            recycle={false}
          />
        </div>
      )}

      {showEmailModal && (
        <EmailConnectModal
          onClose={() => setShowEmailModal(false)}
          businessEmail={businessEmail}
          setBusinessEmail={setBusinessEmail}
          businessEmailStatus={businessEmailStatus}
          businessOtp={businessOtp}
          setBusinessOtp={setBusinessOtp}
          businessOtpSent={businessOtpSent}
          businessSending={businessSending}
          businessVerifying={businessVerifying}
          businessNotice={businessNotice}
          onSendOtp={sendBusinessEmailOtp}
          onVerifyOtp={verifyBusinessEmailOtp}
          onBusinessEmailConnected={() => {
            setBusinessEmailStatus("verified");
            setConnected((c) => ({ ...c, email: true }));
          }}
        />
      )}

      {/* ── Phone Setup Modal (embeds ConnectPhoneNumber inline so the user
            never leaves /onboarding for SMS registration). ── */}
      {showPhoneSetupModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 shrink-0 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Register SMS Number</h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  10DLC brand &amp; campaign setup. You'll return to onboarding when this is complete.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPhoneSetupModal(false);
                  refreshSmsStatus();
                }}
                className="text-gray-400 hover:text-gray-600 transition"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              <ConnectPhoneNumber
                embeddedInOnboarding
                onDone={() => {
                  // onDone fires only on allComplete (number assigned + approved),
                  // so we can flip status inline instead of re-fetching /telnyx/agent.
                  // The X-close button still calls refreshSmsStatus for the manual-
                  // close case where the user may have changed something.
                  setShowPhoneSetupModal(false);
                  setConnected((c) => ({ ...c, sms: true }));
                  setSmsTelnyxStatus("approved");
                  setSmsAssignError("");
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Discard Confirmation Modal ── */}
      {discardConfirm && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !discardConfirming && setDiscardConfirm(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-rose-100 shrink-0">
                <AlertTriangle size={18} className="text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-900">{discardConfirm.title}</h2>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{discardConfirm.body}</p>
              </div>
            </div>
            <div className="px-6 py-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDiscardConfirm(null)}
                disabled={discardConfirming}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDiscardConfirming(true);
                  try {
                    await discardConfirm.onConfirm();
                    setDiscardConfirm(null);
                  } finally {
                    setDiscardConfirming(false);
                  }
                }}
                disabled={discardConfirming}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {discardConfirming ? <Loader2 size={14} className="animate-spin" /> : null}
                {discardConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Takeover Modal (no-email-provider DNS TXT verification) ── */}
      {showTakeoverModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            // Only close when the press *starts* on the overlay - otherwise
            // text-selecting from an input and releasing outside would close
            // the modal because the click event bubbles to the common ancestor.
            if (e.target === e.currentTarget) setShowTakeoverModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">Use WarmChats as your inbox</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Send and receive lead emails through a domain you own - without setting up Gmail, Outlook, or a full mailbox.
                </p>
              </div>
              <button onClick={() => setShowTakeoverModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Blocking error (e.g. domain already has an email provider). */}
              {takeoverError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 space-y-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle size={13} /> This domain already has email set up
                  </p>
                  <p className="leading-relaxed">{takeoverError}</p>
                  <p className="text-rose-800">
                    Since you already have email set up on this domain, use "Verify Your Domain" (Option 2) instead - or connect Gmail if you use Google.
                  </p>
                </div>
              )}

              {/* Domain + prefix as two plain inputs separated by an @ glyph
                  so it visually reads as one email address. The grid keeps
                  both labels on their own rows and the @ aligned with the
                  input baseline. */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-800">Sending address</p>
                <p className="text-xs text-gray-500">Choose the email address leads will see.</p>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                <label className="text-xs">
                  <span className="block font-semibold text-gray-800 mb-1">Email Address</span>
                  <input
                    type="text"
                    value={takeoverPrefix}
                    onChange={(e) => {
                      setTakeoverPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64));
                      setTakeoverToken("");
                      setTakeoverVerified(false);
                    }}
                    disabled={takeoverVerified}
                    placeholder="hello"
                    maxLength={64}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-600"
                  />
                </label>
                <span className="pb-2 text-lg text-gray-500 font-mono select-none">@</span>
                <label className="text-xs">
                  <span className="block font-semibold text-gray-800 mb-1">Domain</span>
                  <input
                    type="text"
                    value={takeoverDomain}
                    onChange={(e) => {
                      setTakeoverDomain(e.target.value.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
                      setTakeoverToken("");
                      setTakeoverVerified(false);
                      setTakeoverNotice("");
                    }}
                    placeholder="yourdomain.com"
                    disabled={takeoverVerified}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-600"
                  />
                </label>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                This is the email leads will receive messages from: <span className="font-mono text-gray-700">{(takeoverPrefix || "hello")}@{takeoverDomain || "yourdomain.com"}</span>. You can change this later in Settings.
              </p>

              {takeoverVerified ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Check size={14} className="text-emerald-700" /> Domain confirmed
                  </p>
                  <p className="mt-1 text-xs">
                    Great - <span className="font-mono">{takeoverPrefix}@{takeoverDomain}</span> is connected to your account. One more step: we'll show you a few more records to add so email can actually send and receive.
                  </p>
                  <button
                    onClick={() => {
                      setBusinessEmail(`${takeoverPrefix}@${takeoverDomain}`);
                      setBusinessEmailStatus("registered");
                      setShowTakeoverModal(false);
                      setShowEmailModal(true);
                    }}
                    className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Continue setup
                  </button>
                </div>
              ) : !takeoverToken ? (
                <>
                <button
                  onClick={async () => {
                    setTakeoverError("");
                    if (!takeoverDomain || !takeoverDomain.includes(".")) {
                      setTakeoverError("Enter a valid domain (e.g. yourdomain.com).");
                      return;
                    }
                    if (!takeoverPrefix) {
                      setTakeoverError("Enter a sending prefix (e.g. hello).");
                      return;
                    }
                    if (takeoverPrefix.length > 64) {
                      setTakeoverError("Sending prefix must be 64 characters or fewer.");
                      return;
                    }
                    if (takeoverPrefix.includes("..")) {
                      setTakeoverError("Sending prefix cannot contain consecutive dots.");
                      return;
                    }
                    if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(takeoverPrefix)) {
                      setTakeoverError("Sending prefix must start and end with a letter or number, and use only letters, numbers, dot, underscore, or hyphen.");
                      return;
                    }
                    setTakeoverIssuing(true);
                    setTakeoverNotice("");
                    try {
                      const res = await fetch(`${API_BASE}/elastic/domain/begin-takeover`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ domain: takeoverDomain, sending_prefix: takeoverPrefix }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setTakeoverError(data.message || data.error || "Failed to start takeover.");
                        return;
                      }
                      setTakeoverToken(data.txt_value || "");
                      setTakeoverExpiresAt(data.expires_at || "");
                      setTakeoverPending(true);
                    } catch {
                      setTakeoverError("Network error - please try again.");
                    } finally {
                      setTakeoverIssuing(false);
                    }
                  }}
                  disabled={takeoverIssuing || !takeoverDomain || !takeoverPrefix}
                  className="w-full rounded-lg bg-[#f4731e] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e25a09] disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {takeoverIssuing ? <><Loader2 size={14} className="animate-spin" /> Generating token...</> : "Generate Verification Token"}
                </button>
                <p className="text-center text-[11px] text-gray-400">
                  We'll create a short code you'll paste into your domain settings to prove you own it.
                </p>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-orange-200 bg-[#fef3ea] p-4 text-xs text-orange-900 space-y-3">
                    <div className="space-y-1.5">
                      <p className="font-semibold">Where do you manage <span className="font-mono">{takeoverDomain}</span>?</p>
                      <div className="relative">
                        <select
                          value={takeoverProvider}
                          onChange={(e) => setTakeoverProvider(e.target.value)}
                          className="w-full appearance-none rounded-lg border border-orange-200 bg-white pl-3 pr-8 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        >
                          <option value="">Select where you bought your domain...</option>
                          <option value="cloudflare">Cloudflare</option>
                          <option value="godaddy">GoDaddy</option>
                          <option value="namecheap">Namecheap</option>
                          <option value="squarespace">Squarespace / Google Domains</option>
                          <option value="porkbun">Porkbun</option>
                          <option value="hover">Hover</option>
                          <option value="ionos">IONOS</option>
                          <option value="dynadot">Dynadot</option>
                          <option value="other">Other / Not sure</option>
                        </select>
                        <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      </div>
                      {takeoverProvider && (() => {
                        type ProviderDef = { href: string; label: string; steps: string[] } | { other: true };
                        const providers: Record<string, ProviderDef> = {
                          cloudflare: { href: "https://dash.cloudflare.com/",                      label: "Open Cloudflare", steps: [`Select ${takeoverDomain}`, "DNS", "Records", "Add record", "Type: TXT"] },
                          godaddy:    { href: "https://dcc.godaddy.com/",                          label: "Open GoDaddy",    steps: ["My Products", "your domain", "DNS", "Add New Record", "Type: TXT"] },
                          namecheap:  { href: "https://ap.www.namecheap.com/domains/list/",        label: "Open Namecheap",  steps: ["Domain List", "Manage", "Advanced DNS", "Add New Record", "TXT Record"] },
                          squarespace:{ href: "https://account.squarespace.com/domains",            label: "Open Squarespace",steps: ["Domains", "your domain", "DNS Settings", "Add Record", "Type: TXT"] },
                          porkbun:    { href: "https://porkbun.com/account/domainsSpeaking",       label: "Open Porkbun",    steps: ["your domain", "DNS", "Add record", "Type: TXT"] },
                          hover:      { href: "https://www.hover.com/control_panel/",              label: "Open Hover",      steps: ["your domain", "DNS", "Add Record", "Type: TXT"] },
                          ionos:      { href: "https://my.ionos.com/",                             label: "Open IONOS",      steps: ["Domains & SSL", "your domain", "DNS", "Add Record", "Type: TXT"] },
                          dynadot:    { href: "https://www.dynadot.com/account/domain/setting/",   label: "Open Dynadot",    steps: ["Manage Domains", "your domain", "DNS Settings", "Add TXT Record"] },
                          other:      { other: true },
                        };
                        const p = providers[takeoverProvider];
                        if ("other" in p) {
                          return (
                            <p className="text-xs text-gray-900 leading-relaxed">
                              Log in to where you manage your domain, find DNS settings, and add a new record. Set the type to TXT, the host to <span className="font-mono bg-white px-1 rounded">@</span>, and paste the value below.
                            </p>
                          );
                        }
                        return (
                          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-gray-900">
                            <a href={p.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2 shrink-0">{p.label}</a>
                            {p.steps.map((s) => (
                              <React.Fragment key={s}>
                                <ChevronRight size={12} className="text-gray-400 shrink-0" />
                                <span className="shrink-0">{s}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <p className="font-semibold">Copy these values exactly:</p>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 bg-white border border-orange-100 rounded-lg px-3 py-2">
                        <span className="text-gray-600 w-14 shrink-0">Type</span>
                        <code className="flex-1 font-mono text-xs text-gray-800">TXT</code>
                        <button
                          type="button"
                          onClick={() => copyTakeover("TXT", "type")}
                          className="text-[#e25a09] hover:text-orange-800 shrink-0"
                          title="Copy"
                        >
                          {takeoverCopied.type ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 bg-white border border-orange-100 rounded-lg px-3 py-2">
                        <span className="text-gray-600 w-14 shrink-0">Host</span>
                        <code className="flex-1 font-mono text-xs text-gray-800">@</code>
                        <button
                          type="button"
                          onClick={() => copyTakeover("@", "host")}
                          className="text-[#e25a09] hover:text-orange-800 shrink-0"
                          title="Copy"
                        >
                          {takeoverCopied.host ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </button>
                      </div>
                      <div className="flex items-start gap-2 bg-white border border-orange-100 rounded-lg px-3 py-2">
                        <span className="text-gray-600 w-14 shrink-0 mt-0.5">Value</span>
                        <code className="flex-1 font-mono text-xs break-all text-gray-800">{takeoverToken}</code>
                        <button
                          type="button"
                          onClick={() => copyTakeover(takeoverToken, "value")}
                          className="text-[#e25a09] hover:text-orange-800 shrink-0 mt-0.5"
                          title="Copy"
                        >
                          {takeoverCopied.value ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>

                    {takeoverExpiresAt && (
                      <p className="text-xs text-orange-800">
                        This code expires {new Date(takeoverExpiresAt).toLocaleString()}. Don't worry if it's visible, it can't be used to access your account.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={async () => {
                        setTakeoverVerifying(true);
                        setTakeoverNotice("");
                        setTakeoverError("");
                        setTakeoverDetected([]);
                        try {
                          const res = await fetch(`${API_BASE}/elastic/domain/verify-takeover`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ domain: takeoverDomain }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setTakeoverError(data.message || data.error || "Verification failed.");
                            return;
                          }
                          if (!data.verified) {
                            setTakeoverNotice(data.message || "We couldn't find the record yet. DNS changes can take 5-30 minutes to show up - wait a moment and try again.");
                            setTakeoverDetected(Array.isArray(data.detected) ? data.detected : []);
                            return;
                          }
                          setTakeoverVerified(true);
                          // Mirror the server-side ownership_verified state
                          // locally so the parent Onboarding re-derives
                          // option3DnsInProgress = true immediately. Without
                          // this, the lock on Option 1/2/4 + "Resume DNS
                          // setup" badge on Option 3 wouldn't appear until
                          // the user refreshes or clicks Continue.
                          const newAddr = String(data.sending_address || `${takeoverPrefix}@${takeoverDomain}`);
                          setBusinessEmail(newAddr);
                          setBusinessEmailStatus("ownership_verified");
                          toast.success("Ownership verified.");
                        } catch {
                          setTakeoverError("Network error - please try again.");
                        } finally {
                          setTakeoverVerifying(false);
                        }
                      }}
                      disabled={takeoverVerifying}
                      className="flex-1 rounded-lg bg-[#f4731e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e25a09] disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {takeoverVerifying ? <><Loader2 size={14} className="animate-spin" /> Checking...</> : "I've added it - verify now"}
                    </button>
                    <button
                      onClick={() => setDiscardConfirm({
                        title: "Change domain?",
                        body: (
                          <span>
                            This cancels the current setup for <span className="font-mono font-semibold text-gray-900">{takeoverDomain}</span> so you can start over with a different domain.
                            If you already added the record where you bought your domain, you can leave it - it won't affect anything.
                          </span>
                        ),
                        confirmLabel: "Change domain",
                        onConfirm: async () => {
                          setTakeoverDisconnecting(true);
                          try {
                            await fetch(`${API_BASE}/elastic/domain/pending-takeover`, {
                              method: "DELETE",
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            setTakeoverDomain("");
                            setTakeoverPrefix("hello");
                            setTakeoverToken("");
                            setTakeoverExpiresAt("");
                            setTakeoverNotice("");
                            setTakeoverError("");
                            setTakeoverDetected([]);
                            setTakeoverVerified(false);
                            setTakeoverPending(false);
                          } finally {
                            setTakeoverDisconnecting(false);
                          }
                        },
                      })}
                      disabled={takeoverDisconnecting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      <X size={14} />
                      Change domain
                    </button>
                  </div>
                  {takeoverNotice && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1">
                      <p className="font-medium">{takeoverNotice}</p>
                      {takeoverDetected.length === 0 ? (
                        <p>No records found yet at <span className="font-mono">{takeoverDomain}</span>. Make sure you saved the record on the site where you bought your domain.</p>
                      ) : (
                        <div>
                          <p>Records we found at <span className="font-mono">{takeoverDomain}</span> - check that yours is in the list:</p>
                          <ul className="mt-1 space-y-0.5">
                            {takeoverDetected.map((v, i) => (
                              <li key={i} className="font-mono text-[11px] break-all bg-white border border-amber-100 rounded px-2 py-1">{v}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Registrars Modal ── */}
      {showRegistrarsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowRegistrarsModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Buy a Domain</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Pick any of these - your domain works the same way no matter where you buy it. Come back and use Option 2 once it's yours.
                </p>
              </div>
              <button onClick={() => setShowRegistrarsModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 grid gap-3 sm:grid-cols-2">
              {[
                { name: "Cloudflare Registrar", url: "https://www.cloudflare.com/products/registrar/", domain: "cloudflare.com", note: "At-cost pricing, no markup" },
                { name: "Porkbun",              url: "https://porkbun.com/",                         domain: "porkbun.com",    note: "Cheap renewals, free WHOIS privacy" },
                { name: "Namecheap",            url: "https://www.namecheap.com/",                   domain: "namecheap.com",  note: "Popular, simple dashboard" },
                { name: "GoDaddy",              url: "https://www.godaddy.com/domains",              domain: "godaddy.com",    note: "Most recognized, frequent promos" },
                { name: "Squarespace Domains",  url: "https://domains.squarespace.com/",             domain: "squarespace.com",note: "Took over Google Domains" },
                { name: "Hover",                url: "https://www.hover.com/",                       domain: "hover.com",      note: "Clean UX, no upsells" },
                { name: "Dynadot",              url: "https://www.dynadot.com/",                     domain: "dynadot.com",    note: "Cheap, lots of TLDs" },
                { name: "Name.com",             url: "https://www.name.com/",                        domain: "name.com",       note: "Solid all-rounder" },
                { name: "Gandi",                url: "https://www.gandi.net/",                       domain: "gandi.net",      note: "EU-based, privacy-first" },
                { name: "IONOS",                url: "https://www.ionos.com/domains",                domain: "ionos.com",      note: "Often cheapest first-year" },
              ].map((r) => (
                <a
                  key={r.domain}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:border-orange-300 hover:bg-[#fef3ea]/30 transition"
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${r.domain}&sz=64`}
                    alt=""
                    width={24}
                    height={24}
                    className="mt-0.5 shrink-0 rounded"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{r.name}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{r.note}</div>
                  </div>
                </a>
              ))}
            </div>
            <div className="px-6 pb-5 text-xs text-gray-400">
              Heads-up: WarmChats has no affiliation with any of these. Prices and policies vary.
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade Modal ── */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Upgrade to Enable SMS</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Choose your plan - we'll redirect to Stripe Checkout to finish.
                </p>
              </div>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {/* Pick a plan - Checkout collects the card next. */}
              <div className="space-y-4">
                  {/* Free plan - current */}
                  <div className="border border-gray-200 rounded-xl p-5 flex items-center justify-between bg-gray-50">
                    <div>
                      <p className="font-semibold text-gray-700">Free Plan</p>
                      <p className="text-sm text-gray-600 mt-0.5">Email only * No SMS</p>
                    </div>
                    <span className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full font-medium">Current plan</span>
                  </div>

                  {/* Paid plans - side by side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: "starter",
                        label: "Starter",
                        price: 89,
                        recommended: false,
                        features: [
                          "1,250 SMS / month",
                          "10,000 emails / month",
                          "2,500 AI messages",
                          "1,000 calling minutes",
                          "AI instant reply",
                        ],
                      },
                      {
                        id: "growth",
                        label: "Growth",
                        price: 149,
                        recommended: true,
                        features: [
                          "2,500 SMS / month",
                          "20,000 emails / month",
                          "15,000 AI messages",
                          "3,750 calling minutes",
                          "AI follow-up sequences",
                          "Automation",
                        ],
                      },
                    ].map((plan) => (
                      <div
                        key={plan.id}
                        className={`border-2 rounded-xl p-5 flex flex-col h-full ${
                          plan.recommended ? "border-[#f7973f] bg-[#fef3ea]/40" : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-bold text-gray-900 text-base">{plan.label}</p>
                            <p className="text-2xl font-bold text-[#f4731e] mt-1">
                              ${plan.price}<span className="text-sm font-normal text-gray-600">/mo</span>
                            </p>
                          </div>
                          {plan.recommended && (
                            <span className="text-xs bg-orange-100 text-[#b9450a] px-2 py-1 rounded-full font-medium">Recommended</span>
                          )}
                        </div>

                        <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-center gap-2">
                              <Check size={14} className="text-green-500 shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>

                        <div className="grow" />
                        <button
                          onClick={() => handleSelectPaidPlan(plan.id)}
                          disabled={upgradingToCheckout}
                          className={`w-full py-3 rounded-xl font-semibold text-sm transition disabled:opacity-60 flex items-center justify-center gap-2 ${
                            plan.recommended
                              ? "bg-[#f4731e] hover:bg-[#e25a09] text-white"
                              : "bg-gray-900 hover:bg-gray-800 text-white"
                          }`}
                        >
                          {upgradingToCheckout && selectedUpgradePlan === plan.id ? (
                            <><Loader2 size={16} className="animate-spin" /> Checking...</>
                          ) : (
                            <>Select {plan.label} <ArrowRight size={15} /></>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Brokerage / teams - contact-sales, opens Calendly */}
                  <a
                    href="https://calendly.com/velasquezjojo7/30min"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-gray-200 rounded-xl p-4 flex items-center justify-between bg-white hover:border-orange-300 hover:bg-[#fef3ea]/30 transition group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 group-hover:bg-orange-100 flex items-center justify-center shrink-0 transition">
                        <Handshake size={18} className="text-gray-700 group-hover:text-[#e25a09] transition" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">Brokerage / Team</p>
                        <p className="text-xs text-gray-600 mt-0.5 truncate">
                          Multi-agent onboarding, volume pricing, priority support
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-[#e25a09] group-hover:text-[#b9450a] shrink-0 ml-3 flex items-center gap-1">
                      Book Demo <ArrowRight size={13} />
                    </span>
                  </a>
              </div>
              {/* The "Add a card" sub-step is gone - Stripe Checkout collects
                  the card itself, so the inline SetupIntent was just making
                  users enter their card twice. */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;

interface EmailConnectModalProps {
  onClose: () => void;
  businessEmail: string;
  setBusinessEmail: (v: string) => void;
  businessEmailStatus: string;
  businessOtp: string;
  setBusinessOtp: (v: string) => void;
  businessOtpSent: boolean;
  businessSending: boolean;
  businessVerifying: boolean;
  businessNotice: string;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  onBusinessEmailConnected: () => void;
}

/** Detect likely IMAP provider from email domain */
const EmailConnectModal = ({
  onClose,
  businessEmail,
  setBusinessEmail,
  businessEmailStatus,
  businessOtp,
  setBusinessOtp,
  businessOtpSent,
  businessSending,
  businessVerifying,
  businessNotice,
  onSendOtp,
  onVerifyOtp,
  onBusinessEmailConnected,
}: EmailConnectModalProps) => {
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id") || "";

  // DNS setup step (shown after OTP verified). Initialize from the current
  // status so the modal renders BusinessEmailSetup straight away on a resume
  // flow instead of briefly flashing the Gmail/Domain chooser first.
  const [showDnsSetup, setShowDnsSetup] = useState(
    ["otp_verified", "registered", "ownership_verified"].includes(businessEmailStatus),
  );
  const [dnsSetupDone, setDnsSetupDone] = useState(false);

  // Also react to status flipping AFTER mount (e.g. user just finished OTP).
  useEffect(() => {
    if (["otp_verified", "registered", "ownership_verified"].includes(businessEmailStatus) && !dnsSetupDone) {
      setShowDnsSetup(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessEmailStatus]);


  // DNS setup overlay - shown after OTP is verified
  if (showDnsSetup && !dnsSetupDone) {
    return (
      <BusinessEmailSetup
        onClose={() => {
          setShowDnsSetup(false);
          setDnsSetupDone(true);
          onClose();
        }}
        onSuccess={() => {
          setShowDnsSetup(false);
          setDnsSetupDone(true);
          onBusinessEmailConnected?.();
          onClose();
        }}
        userEmail={businessEmail}
        token={token || ""}
        userId={userId}
        onSendingAddressChange={(addr) => setBusinessEmail(addr)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-xl space-y-5 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute right-4 top-4">
          <X />
        </button>

        <h2 className="text-lg font-semibold">Connect Email</h2>
        <p className="text-sm text-gray-600 max-w-2xl">
          Gmail is the fastest way to start. Domain verification is for advanced users who want higher limits and stronger deliverability.
        </p>

        <div className="grid gap-4 items-stretch">
          <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col m-auto h-full">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Option 2 * Advanced</div>
            <h3 className="mt-1 text-base font-semibold text-gray-900">Verify Business Email</h3>
            <p className="mt-2 text-sm text-gray-600">
              Enter your business email and we'll send a one-time code to confirm you own it. After verifying, WarmChats will walk you through the DNS records needed to start sending.
            </p>
            <input
              type="email"
              placeholder="you@yourdomain.com"
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {businessEmailStatus === "otp_verified" && !dnsSetupDone && (
              <p className="mt-3 text-xs font-medium text-[#e25a09]">
                Email verified. Opening DNS setup next.
              </p>
            )}
            {businessEmailStatus === "registered" && !dnsSetupDone && (
              <p className="mt-3 text-xs font-medium text-[#e25a09]">
                Email verified. Finish DNS verification to complete email setup.
              </p>
            )}
            <p className="mt-3 text-xs text-gray-600">
              DNS changes can take 5-30 minutes, and sometimes up to 24 hours.
            </p>
            <button
              onClick={onSendOtp}
              disabled={businessSending || !businessEmail.includes("@")}
              className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {businessSending
                ? "Sending code..."
                : businessOtpSent || businessEmailStatus === "otp_pending"
                  ? "Resend code"
                  : "Send verification code"}
            </button>
            {(businessOtpSent || businessEmailStatus === "otp_pending") && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={businessOtp}
                  onChange={(e) => setBusinessOtp(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  onClick={onVerifyOtp}
                  disabled={businessVerifying || !businessOtp.trim()}
                  className="w-full rounded-lg bg-[#f4731e] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {businessVerifying ? "Verifying..." : "Verify code and show DNS records"}
                </button>
              </div>
            )}
          </div>
        </div>

        {dnsSetupDone && <p className="text-xs text-green-600 font-medium">Email verified and DNS configured.</p>}
        {businessNotice && <p className="text-xs text-gray-600">{businessNotice}</p>}
      </div>
    </div>
  );
};

