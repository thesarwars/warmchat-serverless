import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle,
  Mail,
  Phone,
  Search,
  Smartphone,
  Sparkles,
} from "lucide-react";
import MainLayout from "./MainLayout";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthSession } from "../hooks/useAuthSession";

const DEFAULT_PRIVACY_URL = "https://www.warmchats.com/privacy";
const DEFAULT_TERMS_URL = "https://www.warmchats.com/terms";

const buildEmptyActivationState = () => ({
  business_type: "sole_proprietor",
  legal_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
  email: "",
  phone: "",
  brokerage_name: "",
  website: "",
  privacy_policy_url: DEFAULT_PRIVACY_URL,
  terms_url: DEFAULT_TERMS_URL,
  ein: "",
  ssn_last4: "",
  sole_prop_verification_status: "",
  sole_prop_verification_id: "",
});

const buildEmptyTelnyxState = () => ({
  telnyx_messaging_profile_id: "",
  telnyx_brand_id: "",
  telnyx_campaign_id: "",
  telnyx_phone_number: "",
  telnyx_sms_status: "inactive",
  telnyx_error_reason: "",
  telnyx_campaign_number_status: "",
  agent_slug: "",
  agent_page_url: "",
  agent_privacy_url: "",
  agent_terms_url: "",
});

const PUBLIC_SITE_ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://www.warmchats.com";

const formatUSPhone = (value: string) => {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return value;
  if (digits.startsWith("1") && digits.length == 11) return `+${digits}`;
  if (digits.length == 10) return `+1${digits}`;
  if ((value || "").trim().startsWith("+1") && digits.length == 11) return `+${digits}`;
  return value;
};

const formatDisplayPhone = (value: string) => {
  const digits = (value || "").replace(/\D/g, "");
  const normalized = digits.startsWith("1") ? digits.slice(1) : digits;
  if (normalized.length !== 10) return value;
  return `+1 (${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
};

const formatPostal = (value: string) => {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return value;
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
};

// ─── Number search + pick component ──────────────────────────────────────────
interface PurchaseResult {
  messagingProfileId?: string;
  assigned?: boolean;
  assignError?: string;
}

interface NumberSearchPickerProps {
  apiBase: string;
  token: string;
  messagingProfileId: string;
  onPurchased: (phone: string, result?: PurchaseResult) => void;
}

function NumberSearchPicker({ apiBase, token, messagingProfileId, onPurchased }: NumberSearchPickerProps) {
  const [areaCode, setAreaCode] = useState("");
  type SearchResult = {
    phone_number: string;
    label?: string;
    locality?: string;
    region?: string;
    cost_information?: { upfront_cost?: string; monthly_cost?: string; currency?: string };
    record_type?: string;
  };
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [searchError, setSearchError] = useState("");

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const validAreaCode = /^\d{3}$/.test(areaCode.trim());

  const search = async () => {
    if (!validAreaCode) {
      setSearchError("Enter a valid 3-digit US area code.");
      setResults([]);
      setSelected(null);
      return;
    }
    setSearching(true);
    setSearchError("");
    setResults([]);
    setSelected(null);
    try {
      const params = new URLSearchParams({ limit: "10", area_code: areaCode.trim() });
      const res = await fetch(`${apiBase}/telnyx/numbers/search?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      const nextResults = data.numbers || [];
      setResults(nextResults);
      if (!nextResults.length) {
        setSearchError("No numbers available for this area code. Try another area code.");
      }
    } catch (err) {
      setSearchError((err as Error).message || "Unable to search available numbers right now.");
    } finally {
      setSearching(false);
    }
  };

  const buy = async () => {
    if (!selected) return;
    setBuying(true);
    try {
      const res = await fetch(`${apiBase}/telnyx/provision/number`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          phone_number: selected,
          messaging_profile_id: messagingProfileId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to choose this number");
      onPurchased(data.phone_number || selected, {
        messagingProfileId: data.messaging_profile_id || messagingProfileId || "",
        assigned: Boolean(data.assigned),
        assignError: data.assign_error || "",
      });
    } catch (err) {
      toast.error((err as Error).message || "Unable to choose this number");
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="rounded-[30px] border border-[#e8e2d8] bg-[#fcfaf6] p-5 shadow-[0_22px_50px_rgba(15,23,42,0.06)]">
      <div className="rounded-[26px] border border-[#ece4d7] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${searchError ? "border-red-300 bg-red-50/40" : "border-[#e8dfd2] bg-[#fbfaf7]"}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-xs">
              <Search size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Area Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                placeholder="559"
                value={areaCode}
                onChange={(e) => {
                  setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3));
                  if (searchError) setSearchError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && search()}
                className="mt-1 w-full bg-transparent text-base font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-hidden"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={search}
            disabled={searching}
            className="rounded-2xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {searchError && <p className="mt-3 text-sm text-red-600">{searchError}</p>}

        {results.length > 0 && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {results.map((num) => {
              const isSelected = selected === num.phone_number;
              const locationLabel = num.label || [num.locality, num.region && `${num.region} Local`].filter(Boolean).join(" - ") || "Local";
              return (
                <button
                  key={num.phone_number}
                  type="button"
                  onClick={() => setSelected(num.phone_number)}
                  className={`rounded-[22px] border p-4 text-left transition ${isSelected
                      ? "border-green-200 bg-[#f3fbf4] shadow-[0_14px_30px_rgba(34,197,94,0.10)]"
                      : "border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50/40"
                    }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg font-semibold text-gray-900">{formatDisplayPhone(num.phone_number)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>{locationLabel}</span>
                        <span className="rounded-full border border-gray-200 bg-[#fbfaf7] px-2 py-0.5 font-semibold text-gray-500">Local</span>
                      </div>
                    </div>
                    <span className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full border ${isSelected ? "border-green-200 bg-white text-green-600" : "border-gray-200 bg-white text-transparent"}`}>
                      <CheckCircle size={16} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 rounded-3xl border border-[#efe5d6] bg-[#fff8ee] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Selected Number</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {selected ? formatDisplayPhone(selected) : "Select one phone number to continue."}
              </p>
            </div>
            <button
              type="button"
              onClick={buy}
              disabled={!selected || buying}
              className={`w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white transition md:w-auto ${!selected || buying ? "cursor-not-allowed bg-gray-300" : "bg-orange-500 hover:bg-orange-600"
                }`}
            >
              {buying ? "Choosing Number..." : "Choose Number"}
            </button>
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs text-gray-600">
            <CheckCircle size={14} className="mt-0.5 shrink-0 text-green-600" />
            <div>
              <p>No charges until your SMS is approved. Most approvals take 1-3 business days</p>
              <p className="mt-1 text-[11px] text-gray-400">Cancel anytime before activation.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConnectPhoneNumberProps {
  /** When provided, called instead of navigating after completion. Lets the
   *  component be embedded inline (e.g. inside an Onboarding modal) without
   *  forcing a route change. */
  onDone?: () => void;
  /** When true, treat this mount as part of the onboarding flow (skip the
   *  search-param check). Useful for inline embeds. */
  embeddedInOnboarding?: boolean;
}

const ConnectPhoneNumber = ({ onDone, embeddedInOnboarding }: ConnectPhoneNumberProps = {}) => {
  const API_BASE = import.meta.env.VITE_API_BASE;
  const { accountKey, token, userId } = useAuthSession();
  const navigate = useNavigate();
  // Return path lives in a URL query param now so it survives cross-device
  // session restores and is impossible to leak between users on the same
  // browser. Falls back to /dashboard.
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("return") || "";
  const fromOnboarding = embeddedInOnboarding || returnTo === "/onboarding";

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const [loading, setLoading] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  type StatusSnapshot = {
    campaign?: { data?: Record<string, unknown>; campaignStatus?: string; status?: string };
    brand?: { data?: { identityStatus?: string; status?: string }; identityStatus?: string; status?: string };
    status?: {
      brand_bucket?: string;
      campaign_bucket?: string;
      brand_status?: string;
      campaign_status?: string;
      assignment_ready?: boolean;
      brand_reason?: string;
      campaign_reason?: string;
    };
  };
  const [statusSnapshot, setStatusSnapshot] = useState<StatusSnapshot | null>(null);
  const [manualStep, setManualStep] = useState<number | null>(null);

  // 3-second cooldown after each Refresh Status click. Prevents spam-clicking
  // the button from hammering /telnyx/status (which in turn proxies to Telnyx).
  const STATUS_COOLDOWN_MS = 3000;
  const [statusCooldownActive, setStatusCooldownActive] = useState(false);
  const statusCooldownTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (statusCooldownTimerRef.current) window.clearTimeout(statusCooldownTimerRef.current);
    };
  }, []);

  // Set to true only when a user action IN THIS MODAL SESSION caused the
  // completion (successful purchase-with-assignment or successful Turn On
  // Texting). When the user opens "View registration status" on an already-
  // complete registration, this stays false - so we don't re-POST
  // /onboarding/connect or auto-close the modal 2 seconds later on them.
  const userJustCompletedRef = useRef(false);

  const [activationSaved, setActivationSaved] = useState(false);
  // The EIN/business-type confirmation UI was removed from the form, so this is
  // implicitly confirmed (no longer gates the save).
  const [businessTypeConfirmed, setBusinessTypeConfirmed] = useState(true);
  const [businessTypeFinalized, setBusinessTypeFinalized] = useState(false);
  const [showActivationConfirmModal, setShowActivationConfirmModal] = useState(false);

  const [activation, setActivation] = useState(buildEmptyActivationState);

  const [telnyxIds, setTelnyxIds] = useState(buildEmptyTelnyxState);

  const isBusinessRegistration = activation.business_type === "registered_business";
  const nameFieldLabel = isBusinessRegistration ? "Business Name" : "Legal Name";
  const generatedWebsiteUrl = telnyxIds.agent_page_url || activation.website || "";
  const generatedPrivacyUrl = telnyxIds.agent_privacy_url || activation.privacy_policy_url || "";
  const generatedTermsUrl = telnyxIds.agent_terms_url || activation.terms_url || "";

  // Generate a URL-safe slug from the user's entered legal name for preview purposes
  const localNameSlug = useMemo(() => {
    return (activation.legal_name || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }, [activation.legal_name]);

  const activationReady = useMemo(() => {
    const required = [
      activation.legal_name,
      activation.address_line1,
      activation.city,
      activation.state,
      activation.postal_code,
      activation.email,
      activation.phone,
    ];
    if (!isBusinessRegistration) {
      required.push(activation.brokerage_name);
    }
    return required.every((value) => String(value || "").trim().length > 0);
  }, [activation, isBusinessRegistration]);

  const previewAgentSlug = telnyxIds.agent_slug || localNameSlug || userId || "";
  // Links are only shown after the user saves activation - prevents showing another user's data
  const clickableWebsiteUrl = activationSaved ? (generatedWebsiteUrl || (previewAgentSlug ? `${PUBLIC_SITE_ORIGIN}/agents/${previewAgentSlug}` : "")) : "";
  const clickablePrivacyUrl = activationSaved ? (generatedPrivacyUrl || (previewAgentSlug ? `${PUBLIC_SITE_ORIGIN}/agents/${previewAgentSlug}/privacy` : "")) : "";
  const clickableTermsUrl = activationSaved ? (generatedTermsUrl || (previewAgentSlug ? `${PUBLIC_SITE_ORIGIN}/agents/${previewAgentSlug}/terms` : "")) : "";

  const formattedPostalPreview = formatPostal(activation.postal_code);
  const formattedPhonePreview = formatUSPhone(activation.phone);
  const stateIsValid = /^\s*[A-Za-z]{2}\s*$/.test(activation.state || "");
  const postalIsValid = /^\d{5}(-\d{4})?$/.test((formattedPostalPreview || "").trim());
  const phoneIsValid = /^\+1\d{10}$/.test((formattedPhonePreview || "").trim());
  const ssnLast4IsValid = /^\d{4}$/.test((activation.ssn_last4 || "").trim());
  const einIsValid = /^\d{9}$/.test(String(activation.ein || "").replace(/\D/g, ""));

  const statusLabel = (telnyxIds.telnyx_sms_status || "inactive").toLowerCase();
  const statusClasses = {
    approved: "bg-green-100 text-green-700 border-green-200",
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
    inactive: "bg-gray-100 text-gray-600 border-gray-200",
  } as const;
  const statusClass = statusClasses[statusLabel as keyof typeof statusClasses] || statusClasses.inactive;
  const statusDetails = (statusSnapshot?.status || {}) as NonNullable<StatusSnapshot["status"]>;
  const selectedStatusReason = statusDetails.campaign_reason || statusDetails.brand_reason || telnyxIds.telnyx_error_reason || "";

  // Reordered flow: Step 1 = Choose Number, Step 2 = Business Verification.
  const step1Complete = Boolean(telnyxIds.telnyx_phone_number);
  const step2Complete = activationReady && activationSaved;
  const step3Accessible = step2Complete;
  // The EIN / business-type lock applies only once the agent's OWN 10DLC brand or
  // campaign has been submitted (that registration uses the EIN). It must NOT key
  // off the phone number / messaging profile - those come from the now-first
  // "Choose Number" step (shared master campaign) and don't involve the EIN, so
  // locking on them would freeze the EIN choice before Step 2 is even reached.
  const hasActiveComplianceSubmission = Boolean(
    telnyxIds.telnyx_brand_id ||
    telnyxIds.telnyx_campaign_id
  );
  const businessTypeLocked = loading || businessTypeFinalized || hasActiveComplianceSubmission;
  const allComplete =
    step1Complete &&
    step2Complete &&
    telnyxIds.telnyx_campaign_number_status === "assigned" &&
    statusLabel === "approved";
  const currentStep = !step1Complete ? 1 : !step2Complete ? 2 : 3;
  const effectiveStep = manualStep ?? currentStep;
  const allowStepSkip = new URLSearchParams(window.location.search).get("debug_steps") === "1";
  const canGoToStep = (step: number) =>
    allowStepSkip || step <= currentStep || (step === 3 && step3Accessible);
  const goToStep = (step: number) => {
    if (canGoToStep(step)) {
      setManualStep(step);
    }
  };
  const step1PrimaryDisabled =
    loading ||
    !activationReady ||
    (!businessTypeLocked && !businessTypeConfirmed) ||
    (businessTypeLocked && activationSaved);
  const step1PrimaryLabel = loading
    ? businessTypeLocked
      ? "Saving Changes..."
      : "Saving Activation..."
    : businessTypeLocked
      ? activationSaved
        ? "Activation Saved"
        : "Save Changes"
      : "Save Activation";

  const updateActivation = (patch: Partial<typeof activation>) => {
    if (patch.business_type && patch.business_type !== activation.business_type) {
      // EIN / business-type confirmation UI was removed - stay implicitly
      // confirmed so the save buttons never lock up.
      setBusinessTypeConfirmed(true);
      setShowActivationConfirmModal(false);
    }
    setActivation((prev) => ({ ...prev, ...patch }));
    setActivationSaved(false);
  };

  useEffect(() => {
    // The EIN / business-type confirmation UI was removed from the form, so the
    // save is no longer gated on it - keep it implicitly confirmed in both the
    // locked and unlocked states (otherwise Save Activation / Continue stay
    // permanently disabled with no UI left to re-confirm).
    setBusinessTypeConfirmed(true);
    if (businessTypeLocked) {
      setShowActivationConfirmModal(false);
    }
  }, [businessTypeLocked]);

  useEffect(() => {
    let cancelled = false;

    // Wipe all user-specific state immediately so Account 1's data never
    // shows while we wait for Account 2's API response.
    setActivation(buildEmptyActivationState());
    setActivationSaved(false);
    setBusinessTypeFinalized(false);
    // EIN / business-type confirmation UI was removed - stay implicitly
    // confirmed so Save Activation never locks up. This wipe effect runs AFTER
    // the force-true effect on mount, so setting false here would clobber it.
    setBusinessTypeConfirmed(true);
    setShowActivationConfirmModal(false);
    setTelnyxIds(buildEmptyTelnyxState());
    setStatusSnapshot(null);
    setManualStep(null);
    setLoading(false);
    setLoadingAssign(false);
    setLoadingStatus(false);

    if (!token || !userId) {
      return () => {
        cancelled = true;
      };
    }

    const fetchTelnyx = async () => {
      try {
        const res = await fetch(`${API_BASE}/telnyx/agent`, { headers });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const hasSavedComplianceSubmission = Boolean(
          data.user?.telnyx_messaging_profile_id ||
          data.user?.telnyx_brand_id ||
          data.user?.telnyx_campaign_id ||
          data.user?.telnyx_phone_number
        );
        if (data.activation) {
          const storedWebsite = data.activation.website || "";
          const invalidWebsite =
            !storedWebsite ||
            storedWebsite === DEFAULT_PRIVACY_URL ||
            storedWebsite === DEFAULT_TERMS_URL ||
            storedWebsite === "https://www.warmchats.com/privacy-policy";
          const autoWebsite = data.user?.agent_page_url || "";
          const nextActivation = {
            ...data.activation,
            business_type: data.activation.business_type || "sole_proprietor",
            legal_name: data.activation.legal_name || "",
            address_line1: data.activation.address_line1 || "",
            address_line2: data.activation.address_line2 || "",
            city: data.activation.city || "",
            state: data.activation.state || "",
            postal_code: data.activation.postal_code || "",
            country: data.activation.country || "US",
            email: data.activation.email || "",
            phone: data.activation.phone || "",
            brokerage_name: data.activation.brokerage_name || "",
            website: invalidWebsite ? autoWebsite : storedWebsite,
            privacy_policy_url: data.activation.privacy_policy_url || DEFAULT_PRIVACY_URL,
            terms_url: data.activation.terms_url || DEFAULT_TERMS_URL,
            ein: data.activation.ein || "",
            ssn_last4: data.activation.ssn_last4 || "",
            sole_prop_verification_status: data.activation.sole_prop_verification_status || "",
            sole_prop_verification_id: data.activation.sole_prop_verification_id || "",
          };
          setActivation((prev) => ({
            ...prev,
            ...nextActivation,
          }));
          setActivationSaved(true);
        } else {
          // No activation for this user - reset to blank defaults so stale data
          // from a previously logged-in user's session never bleeds through.
          setActivation(buildEmptyActivationState());
          setActivationSaved(false);
        }
        if (data.user) {
          setTelnyxIds((prev) => ({
            ...prev,
            telnyx_messaging_profile_id: data.user.telnyx_messaging_profile_id || "",
            telnyx_brand_id: data.user.telnyx_brand_id || "",
            telnyx_campaign_id: data.user.telnyx_campaign_id || "",
            telnyx_phone_number: data.user.telnyx_phone_number || "",
            telnyx_sms_status: data.user.telnyx_sms_status || prev.telnyx_sms_status,
            telnyx_error_reason: data.user.telnyx_error_reason || "",
            telnyx_campaign_number_status: data.user.telnyx_campaign_number_status || "",
            agent_slug: data.user.agent_slug || "",
            agent_page_url: data.user.agent_page_url || "",
            agent_privacy_url: data.user.agent_privacy_url || "",
            agent_terms_url: data.user.agent_terms_url || "",
          }));
        }
        setBusinessTypeFinalized(hasSavedComplianceSubmission);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
      }
    };

    fetchTelnyx();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE, accountKey, token, userId]);

  useEffect(() => {
    const agentPrivacyUrl = telnyxIds.agent_privacy_url;
    const termsUrl = telnyxIds.agent_terms_url;
    if (!agentPrivacyUrl && !termsUrl) return;
    setActivation((prev) => {
      const next = { ...prev };
      const currentPrivacy = (prev.privacy_policy_url || "").trim();
      if (agentPrivacyUrl && (!currentPrivacy || currentPrivacy === DEFAULT_PRIVACY_URL)) {
        next.privacy_policy_url = agentPrivacyUrl;
      }
      const currentTerms = (prev.terms_url || "").trim();
      if (termsUrl && (!currentTerms || currentTerms === DEFAULT_TERMS_URL)) {
        next.terms_url = termsUrl;
      }
      return next;
    });
  }, [activation.privacy_policy_url, activation.terms_url, telnyxIds.agent_privacy_url, telnyxIds.agent_terms_url]);

  const saveActivationDetails = async ({
    provisionBrand = true,
    showSuccessToast = true,
    phoneOverride,
  }: {
    provisionBrand?: boolean;
    showSuccessToast?: boolean;
    phoneOverride?: string;
  } = {}) => {
    const activationPhoneInput = phoneOverride !== undefined ? phoneOverride : activation.phone;
    const requiredMissing = [
      !activation.legal_name && nameFieldLabel,
      !isBusinessRegistration && !activation.brokerage_name && "Brokerage",
      !activation.address_line1 && "Address",
      !activation.city && "City",
      !activation.state && "State",
      !activation.postal_code && "Postal code",
      !activation.email && "Email",
      !activationPhoneInput && "Business phone",
    ].filter(Boolean) as string[];

    if (requiredMissing.length) {
      toast.error(`Missing required fields: ${requiredMissing.join(", ")}`);
      return false;
    }

    const normalizedState = (activation.state || "").trim().toUpperCase();
    const formattedPostal = formatPostal(activation.postal_code);
    const formattedPhone = formatUSPhone(activationPhoneInput);
    const normalizedSsnLast4 = (activation.ssn_last4 || "").replace(/\D/g, "").slice(-4);
    const localPostalValid = /^\d{5}(-\d{4})?$/.test((formattedPostal || "").trim());
    const localPhoneValid = /^\+1\d{10}$/.test((formattedPhone || "").trim());

    if (normalizedState && normalizedState != activation.state) {
      setActivation((prev) => ({ ...prev, state: normalizedState }));
    }
    if (formattedPostal && formattedPostal !== activation.postal_code) {
      setActivation((prev) => ({ ...prev, postal_code: formattedPostal }));
    }
    if (localPhoneValid && formattedPhone && formattedPhone !== activation.phone) {
      setActivation((prev) => ({ ...prev, phone: formattedPhone }));
    }
    if (normalizedSsnLast4 && normalizedSsnLast4 !== activation.ssn_last4) {
      setActivation((prev) => ({ ...prev, ssn_last4: normalizedSsnLast4 }));
    }

    const invalidFields = [];
    if (!stateIsValid) invalidFields.push("State (2-letter)");
    if (!localPostalValid) invalidFields.push("Postal Code (5 digits)");
    if (!localPhoneValid) invalidFields.push("Business Phone (+1XXXXXXXXXX)");
    if (invalidFields.length) {
      toast.error(`Invalid fields: ${invalidFields.join(", ")}`);
      return false;
    }

    setLoading(true);
    try {
      const payload = {
        ...activation,
        state: normalizedState || activation.state,
        postal_code: formattedPostal || activation.postal_code,
        phone: formattedPhone || activationPhoneInput,
        ssn_last4: normalizedSsnLast4 || activation.ssn_last4,
        brokerage_name: isBusinessRegistration ? "" : activation.brokerage_name,
        website: clickableWebsiteUrl,
      };
      setActivation((prev) => ({ ...prev, ...payload }));
      const res = await fetch(`${API_BASE}/telnyx/activation`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save activation details");
      if (data.activation) {
        setActivation((prev) => ({ ...prev, ...data.activation }));
      }

      let currentBrandId = "";
      if (data.user) {
        currentBrandId = data.user.telnyx_brand_id || "";
        setTelnyxIds((prev) => ({
          ...prev,
          telnyx_messaging_profile_id: data.user.telnyx_messaging_profile_id || "",
          telnyx_brand_id: data.user.telnyx_brand_id || "",
          telnyx_campaign_id: data.user.telnyx_campaign_id || "",
          telnyx_phone_number: data.user.telnyx_phone_number || prev.telnyx_phone_number,
          telnyx_sms_status: data.user.telnyx_sms_status || "inactive",
          telnyx_error_reason: data.user.telnyx_error_reason || "",
          telnyx_campaign_number_status: data.user.telnyx_campaign_number_status || (data.user.telnyx_phone_number ? "purchased" : ""),
        }));
      }

      if (data.agent_page_url || data.agent_slug) {
        setTelnyxIds((prev) => ({
          ...prev,
          agent_page_url: data.agent_page_url || prev.agent_page_url,
          agent_privacy_url: data.agent_privacy_url || prev.agent_privacy_url,
          agent_slug: data.agent_slug || prev.agent_slug,
          agent_terms_url: data.agent_terms_url || prev.agent_terms_url,
        }));
        if (data.agent_page_url) {
          setActivation((prev) => ({
            ...prev,
            website: data.agent_page_url,
          }));
        }
      }

      if (provisionBrand && !currentBrandId) {
        // Umbrella model: stamp the shared master brand + campaign ids. These are
        // instant DB writes (no per-client Telnyx API calls), so we do them
        // silently as part of saving Step 1.
        try {
          const brandRes = await fetch(`${API_BASE}/telnyx/provision/brand`, {
            method: "POST",
            headers,
            body: JSON.stringify({}),
          });
          const brandData = await brandRes.json();
          if (brandRes.ok && brandData.brand_id) {
            currentBrandId = brandData.brand_id;
            setTelnyxIds((prev) => ({
              ...prev,
              telnyx_brand_id: brandData.brand_id,
              telnyx_error_reason: "",
            }));
          }
        } catch {
          // best-effort; activation is still saved
        }
        try {
          const campaignRes = await fetch(`${API_BASE}/telnyx/provision/campaign`, {
            method: "POST",
            headers,
            body: JSON.stringify({}),
          });
          const campaignData = await campaignRes.json();
          if (campaignRes.ok && campaignData.campaign_id) {
            setTelnyxIds((prev) => ({
              ...prev,
              telnyx_campaign_id: campaignData.campaign_id,
            }));
          }
        } catch {
          // best-effort; activation is still saved
        }
      }
      setActivationSaved(true);
      setBusinessTypeFinalized(true);
      setBusinessTypeConfirmed(true);
      if (showSuccessToast) {
        toast.success("SMS activation details saved");
      }
      return true;
    } catch (err) {
      toast.error((err as Error).message || "Failed to save activation details");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSaveActivation = async () => {
    if (!businessTypeLocked && !businessTypeConfirmed) {
      toast.error("Confirm your EIN / business type before activating");
      return false;
    }
    return await saveActivationDetails({ provisionBrand: true, showSuccessToast: true });
  };

  const handleStep1PrimaryAction = async () => {
    if (!businessTypeLocked) {
      setShowActivationConfirmModal(true);
      return;
    }
    await handleSaveActivation();
  };

  const handleConfirmStep1Activation = async () => {
    const saved = await handleSaveActivation();
    if (saved) {
      setShowActivationConfirmModal(false);
    }
  };

  const handleOpenGeneratedLink = async (url: string) => {
    if (!url || !activationReady || loading) return;
    const ready = activationSaved ? true : await saveActivationDetails({ provisionBrand: false, showSuccessToast: false });
    if (!ready) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // "Turning on texting" = linking the chosen number to the shared SMS campaign.
  // We keep the user-facing language plain; the Telnyx term is "campaign assignment".
  const handleAssignCampaign = async () => {
    if (!telnyxIds.telnyx_phone_number) {
      toast.error("Choose a number first");
      return;
    }
    setLoadingAssign(true);
    try {
      const res = await fetch(`${API_BASE}/telnyx/provision/assign-campaign`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          campaign_id: telnyxIds.telnyx_campaign_id,
          messaging_profile_id: telnyxIds.telnyx_messaging_profile_id,
        }),
      });
      const data = await res.json();
      // Our backend's error() helper returns { message }; some older endpoints
      // still respond with { error } - accept both so the real Telnyx detail
      // makes it into the toast/error_reason instead of a generic fallback.
      if (!res.ok) throw new Error(data.message || data.error || "We couldn't switch on texting just now.");
      userJustCompletedRef.current = true;
      setTelnyxIds((prev) => ({
        ...prev,
        telnyx_messaging_profile_id: data.messaging_profile_id || prev.telnyx_messaging_profile_id,
        telnyx_campaign_number_status: "assigned",
        telnyx_sms_status: "approved",
        telnyx_error_reason: "",
      }));
      setManualStep(null);
      toast.success("Texting is switched on for your number.");
    } catch (err) {
      const message = (err as Error).message || "We couldn't switch on texting just now. Please try again in a moment.";
      // Persist so the message survives a reload / revisit from the dashboard.
      setTelnyxIds((prev) => ({ ...prev, telnyx_error_reason: message }));
      toast.error(message);
    } finally {
      setLoadingAssign(false);
    }
  };

  const fetchStatus = async (silent = false) => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`${API_BASE}/telnyx/status`, {
        method: "GET",
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch status");
      if (data.status) {
        setTelnyxIds((prev) => ({
          ...prev,
          telnyx_messaging_profile_id: data.status.messaging_profile_id || prev.telnyx_messaging_profile_id,
          telnyx_sms_status: data.status.sms_status || prev.telnyx_sms_status,
          telnyx_error_reason: data.status.error_reason || "",
          telnyx_campaign_number_status: data.status.campaign_number_status || prev.telnyx_campaign_number_status,
        }));
      }
      setStatusSnapshot(data || null);
      if (!silent) {
        if (data.status?.sms_status === "rejected") {
          toast.error(data.status?.error_reason || "10DLC registration was rejected.");
        } else if (data.auto_assigned) {
          toast.success("Campaign approved and your selected number was assigned automatically.");
        } else if (data.status?.auto_assign_error) {
          toast.error(data.status.auto_assign_error);
        } else if (data.status?.assignment_ready) {
          toast.success("Campaign approved. Assign your selected number to start sending.");
        } else if (data.status?.sms_status === "approved") {
          toast.success("Campaign approved.");
        } else {
          toast.success("Status updated");
        }
      }
      return data;
    } catch (err) {
      if (!silent) toast.error((err as Error).message || "Failed to fetch status");
      return null;
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleCheckStatus = async () => {
    if (loadingStatus || statusCooldownActive) return;
    setStatusCooldownActive(true);
    if (statusCooldownTimerRef.current) window.clearTimeout(statusCooldownTimerRef.current);
    statusCooldownTimerRef.current = window.setTimeout(() => {
      setStatusCooldownActive(false);
      statusCooldownTimerRef.current = null;
    }, STATUS_COOLDOWN_MS);
    await fetchStatus(false);
  };

  useEffect(() => {
    // Only auto-navigate to /dashboard when the user just finished assignment
    // in THIS session (not when they opened "View registration status" on an
    // already-complete registration just to look). Also skip in the embedded
    // onboarding modal - the parent handles routing via onDone.
    if (!allComplete || !userJustCompletedRef.current || fromOnboarding) return;
    const timer = window.setTimeout(() => navigate("/dashboard"), 5000);
    return () => window.clearTimeout(timer);
  }, [allComplete, navigate, fromOnboarding]);

  const handleResetBrand = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`${API_BASE}/telnyx/ids`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          telnyx_messaging_profile_id: null,
          telnyx_brand_id: null,
          telnyx_campaign_id: null,
          telnyx_phone_number: null,
          telnyx_sms_status: "inactive",
          telnyx_error_reason: null,
          telnyx_campaign_number_status: null,
          sole_prop_verification_status: null,
          sole_prop_verification_id: null,
          sole_prop_verified_at: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset registration");
      setTelnyxIds((prev) => ({
        ...prev,
        telnyx_messaging_profile_id: "",
        telnyx_brand_id: "",
        telnyx_campaign_id: "",
        telnyx_phone_number: "",
        telnyx_sms_status: "inactive",
        telnyx_error_reason: "",
        telnyx_campaign_number_status: "",
      }));
      setStatusSnapshot(null);
      setActivation((prev) => ({
        ...prev,
        sole_prop_verification_status: "",
        sole_prop_verification_id: "",
      }));
      setActivationSaved(false);
      setBusinessTypeFinalized(false);
      // Deprecated EIN gate - keep implicitly confirmed so re-submit isn't locked.
      setBusinessTypeConfirmed(true);
      setShowActivationConfirmModal(false);
      setManualStep(1);
      toast.success("Registration reset. You can re-submit with corrected details.");
    } catch (err) {
      toast.error((err as Error).message || "Failed to reset registration");
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (allComplete && userJustCompletedRef.current) {
      // No fetchStatus here: allComplete is derived from state we just set
      // from /telnyx/agent, and the separate brand/campaign-id effect below
      // already calls fetchStatus once. Calling it again here was producing
      // a duplicate /telnyx/status request on every modal open.
      if (fromOnboarding) {
        // Mark SMS connected in onboarding then return
        if (userId && token) {
          fetch(`${API_BASE}/onboarding/${userId}/connect`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ channel: "sms" }),
          }).catch(() => { });
        }
        // Auto-leave the "Register SMS Number" page 5 seconds after texting is
        // switched on (the user can also leave immediately via the X top-right).
        setTimeout(() => {
          if (onDone) onDone();
          else navigate(returnTo || "/onboarding");
        }, 5000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allComplete]);

  useEffect(() => {
    if (!token) return;
    if (!telnyxIds.telnyx_brand_id && !telnyxIds.telnyx_campaign_id) return;
    fetchStatus(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, telnyxIds.telnyx_brand_id, telnyxIds.telnyx_campaign_id]);

  useEffect(() => {
    if (allowStepSkip) return;
    if (manualStep && manualStep > currentStep && !(manualStep === 3 && step3Accessible)) {
      setManualStep(currentStep);
    }
  }, [allowStepSkip, currentStep, manualStep, step3Accessible]);

  const campaignAssigned = telnyxIds.telnyx_campaign_number_status === "assigned";
  const numberNeedsActivation = Boolean(telnyxIds.telnyx_phone_number) && !campaignAssigned;
  const step4Title = statusLabel === "rejected"
    ? "10DLC registration was rejected"
    : campaignAssigned && statusLabel === "approved"
      ? "You're all set - texting is switched on"
      : numberNeedsActivation
        ? "Almost there - switch on texting"
        : "SMS activation is in progress";
  const step4Description = statusLabel === "rejected"
    ? "Telnyx rejected the current registration. Review the reason below, fix the application, and resubmit."
    : campaignAssigned && statusLabel === "approved"
      ? "Your number is connected and ready. SMS is live inside WarmChats - redirecting you to your dashboard."
      : numberNeedsActivation
        ? "Use the button above to switch on texting and start sending and receiving messages - it only takes a moment."
        : "Your number has been submitted for carrier review. Most approvals happen within 1-3 business days.";
  const progressSteps = [
    { step: 1, label: "Choose Number", icon: Phone },
    { step: 2, label: "Business Verification", icon: Building2 },
    { step: 3, label: "Complete", icon: BadgeCheck },
  ] as const;
  const completionEyebrow = statusLabel === "rejected"
    ? "Complete › Action Required"
    : campaignAssigned && statusLabel === "approved"
      ? "Complete › Texting Live"
      : numberNeedsActivation
        ? "Complete › One Tap Left"
        : "Complete › SMS Activation Pending";
  const pendingChecklist = [
    {
      label: telnyxIds.telnyx_phone_number
        ? `${formatDisplayPhone(telnyxIds.telnyx_phone_number)} is your texting number`
        : "Choose your business texting number",
      done: Boolean(telnyxIds.telnyx_phone_number),
    },
    {
      label: campaignAssigned ? "Texting is switched on for your number" : "Switch on texting for your number",
      done: campaignAssigned,
    },
  ];
  const heroSupportText = campaignAssigned && statusLabel === "approved"
    ? "Your number is connected. WarmChats will take you to your dashboard automatically."
    : numberNeedsActivation
      ? "If it doesn't switch on right away, wait a moment and tap Turn On Texting again - new numbers can take a minute to activate."
      : "Most accounts are approved within a few days, but some may take longer depending on carrier verification.";

  // When embedded inside the onboarding modal, skip the dashboard MainLayout
  // (sidebar etc.) and render without the page chrome.
  const Wrapper: React.ElementType = embeddedInOnboarding ? React.Fragment : MainLayout;
  const containerClass = embeddedInOnboarding
    ? "p-2"
    : "flex justify-center items-start min-h-screen bg-[#f8f9fb] pt-6 pb-20";
  const innerClass = embeddedInOnboarding
    ? "w-full bg-transparent"
    : "w-full max-w-4xl bg-white p-10 rounded-2xl shadow-lg";

  return (
    <Wrapper>
      {!embeddedInOnboarding && (
        <div className="mx-auto w-full max-w-4xl px-4 pt-4">
          <button
            type="button"
            onClick={() => {
              const target = localStorage.getItem("sms_onboarding_return");
              navigate(target && target.startsWith("/") ? target : "/dashboard");
            }}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft size={15} /> Back
          </button>
        </div>
      )}
      <div className={containerClass}>
        <div className={innerClass}>
          {showActivationConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
              <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                    <AlertCircle size={20} />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Final Confirmation</p>
                    <h3 className="mt-2 text-xl font-bold text-gray-900">You only get one active 10DLC application.</h3>
                    <p className="mt-3 text-sm text-gray-600">
                      After you save Step 2, your selected business type is locked for this application. You will only be able to change it again if the application is rejected and reset.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                  <p><span className="font-semibold">Selected business type:</span> {isBusinessRegistration ? "Yes EIN" : "No EIN / Sole Proprietor"}</p>
                  <p className="mt-1"><span className="font-semibold">{nameFieldLabel}:</span> {activation.legal_name || "Not provided yet"}</p>
                </div>

                <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  Please confirm your EIN / business type is correct before continuing. This submission starts your single active application.
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowActivationConfirmModal(false)}
                    disabled={loading}
                    className={`rounded-2xl border border-gray-300 px-5 py-3 text-sm font-semibold transition ${loading ? "cursor-not-allowed bg-gray-100 text-gray-400" : "text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmStep1Activation}
                    disabled={loading}
                    className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition ${loading ? "cursor-not-allowed bg-gray-300" : "bg-orange-500 hover:bg-orange-600"
                      }`}
                  >
                    {loading ? "Saving Activation..." : "Confirm and Save Activation"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <h1 className="text-3xl font-bold text-gray-800 mb-3 flex items-center gap-3">
            <Phone className="text-orange-500" /> SMS Activation
          </h1>
          <p className="text-sm text-gray-600 mb-8">
            WarmChats is the platform, but sender compliance is per agent. Complete SMS Activation to provision your
            business texting number.
          </p>
          <div className="mb-6 rounded-2xl border border-gray-200 bg-[#fcfbf8] p-3 shadow-xs">
            <div className="grid gap-2 md:grid-cols-3">
              {progressSteps.map((item) => {
                const Icon = item.icon;
                const isComplete = item.step < currentStep || (item.step === 3 && allComplete);
                const isActive = item.step === effectiveStep;
                const isClickable = canGoToStep(item.step);

                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => goToStep(item.step)}
                    disabled={!isClickable}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${isComplete
                        ? "border-green-200 bg-green-50 text-green-700"
                        : isActive
                          ? "border-orange-200 bg-orange-50 text-orange-700"
                          : isClickable
                            ? "border-transparent bg-white text-gray-600 hover:border-gray-200"
                            : "border-transparent bg-transparent text-gray-300 cursor-not-allowed"
                      }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full border ${isComplete
                          ? "border-green-200 bg-white"
                          : isActive
                            ? "border-orange-200 bg-white"
                            : "border-gray-200 bg-white"
                        }`}
                    >
                      {isComplete ? <CheckCircle size={16} /> : <Icon size={16} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                        {item.step === 3 ? "Final" : `Step ${item.step}`}
                      </p>
                      <p className="truncate text-sm font-semibold">{item.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-6">
            {effectiveStep === 2 && (
              <section className="border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">Step 2 * Personal Information</h2>
                    <p className="text-xs text-gray-500">Enter your personal details, confirm your business type, then save Step 2 to generate your website, privacy page, and terms page.</p>
                  </div>
                  <span
                    className={`text-xs px-3 py-1 rounded-full border ${activationReady
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-yellow-50 text-yellow-700 border-yellow-200"
                      }`}
                  >
                    {activationReady ? "Ready to Save" : "Required"}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-gray-700">{nameFieldLabel}</label>
                    <input
                      value={activation.legal_name}
                      onChange={(e) => updateActivation({ legal_name: e.target.value })}
                      className="mt-1 w-full border rounded-xl p-3"
                      placeholder={isBusinessRegistration ? "Smith Real Estate Group" : "Jane Smith"}
                    />
                  </div>

                  {!isBusinessRegistration && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Brokerage</label>
                      <input
                        value={activation.brokerage_name}
                        onChange={(e) => updateActivation({ brokerage_name: e.target.value })}
                        className="mt-1 w-full border rounded-xl p-3"
                        placeholder="Coldwell Banker Realty"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-gray-700">Address Line 1</label>
                    <input
                      value={activation.address_line1}
                      onChange={(e) => updateActivation({ address_line1: e.target.value })}
                      className="mt-1 w-full border rounded-xl p-3"
                      placeholder="123 Market St"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">City</label>
                    <input
                      value={activation.city}
                      onChange={(e) => updateActivation({ city: e.target.value })}
                      className="mt-1 w-full border rounded-xl p-3"
                      placeholder="Fresno"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">State (2-letter)</label>
                    <input
                      value={activation.state}
                      onChange={(e) => updateActivation({ state: e.target.value })}
                      onBlur={(e) => updateActivation({ state: e.target.value.toUpperCase().trim() })}
                      className={`mt-1 w-full border rounded-xl p-3 ${!stateIsValid && activation.state ? "border-red-300" : "border-gray-200"}`}
                      placeholder="CA"
                    />
                    {!stateIsValid && activation.state && (
                      <p className="mt-1 text-xs text-red-600">Use 2-letter state code.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Postal Code</label>
                    <input
                      value={activation.postal_code}
                      onChange={(e) => updateActivation({ postal_code: e.target.value })}
                      onBlur={(e) => updateActivation({ postal_code: formatPostal(e.target.value) })}
                      className={`mt-1 w-full border rounded-xl p-3 ${!postalIsValid && activation.postal_code ? "border-red-300" : "border-gray-200"}`}
                      placeholder="93720"
                    />
                    {!postalIsValid && activation.postal_code && (
                      <p className="mt-1 text-xs text-red-600">Use 5 digits (or 5-4).</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Business Email</label>
                    <input
                      value={activation.email}
                      onChange={(e) => updateActivation({ email: e.target.value })}
                      className="mt-1 w-full border rounded-xl p-3"
                      placeholder="agent@brokerage.com"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Business Phone</label>
                    <input
                      value={activation.phone}
                      onChange={(e) => updateActivation({ phone: e.target.value })}
                      onBlur={(e) => updateActivation({ phone: formatUSPhone(e.target.value) })}
                      className={`mt-1 w-full border rounded-xl p-3 ${!phoneIsValid && activation.phone ? "border-red-300" : "border-gray-200"}`}
                      placeholder="+14155551234"
                    />
                    {!phoneIsValid && activation.phone && (
                      <p className="mt-1 text-xs text-red-600">Format: +1XXXXXXXXXX.</p>
                    )}
                  </div>

                </div>

                <div className="mt-6">
                  <button
                    onClick={handleStep1PrimaryAction}
                    disabled={step1PrimaryDisabled}
                    className={`px-6 py-3 rounded-xl font-semibold text-white transition ${step1PrimaryDisabled ? "bg-gray-300 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
                      }`}
                  >
                    {step1PrimaryLabel}
                  </button>
                  {!activationReady ? (
                    <p className="mt-2 text-xs text-gray-500">Enter all required personal information before saving activation.</p>
                  ) : !businessTypeLocked && !businessTypeConfirmed ? (
                    <p className="mt-2 text-xs text-gray-500">Confirm your EIN / business type before saving activation.</p>
                  ) : businessTypeLocked && activationSaved ? (
                    <p className="mt-2 text-xs text-gray-500">Step 2 is activated and your business type is locked. Continue to finish setup.</p>
                  ) : null}
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => goToStep(3)}
                    disabled={!activationSaved || loading}
                    className={`px-6 py-3 rounded-xl font-semibold text-white transition ${!activationSaved || loading ? "bg-gray-300 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800"
                      }`}
                  >
                    Continue →
                  </button>
                </div>
              </section>
            )}

            {effectiveStep === 1 && (
              <section className="rounded-4xl border border-[#e8e2d8] bg-white p-6 shadow-[0_28px_65px_rgba(15,23,42,0.06)]">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Step 1 of 2 - Pick Your Number</p>
                    <h2 className="mt-2 text-2xl font-bold text-gray-900">Step 1: Choose a Business Texting Number</h2>
                    <p className="mt-2 max-w-2xl text-sm text-gray-500">
                      Search for a local phone number for your business to text from.
                    </p>
                  </div>
                  {telnyxIds.telnyx_phone_number && (
                    <span className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-xs font-semibold text-green-700">
                      <CheckCircle size={14} /> {formatDisplayPhone(telnyxIds.telnyx_phone_number)}
                    </span>
                  )}
                </div>

                {telnyxIds.telnyx_phone_number ? (
                  <div className="space-y-5">
                    <div className="rounded-3xl border border-green-200 bg-linear-to-r from-green-50 to-white p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-green-600 shadow-xs">
                            <CheckCircle size={28} />
                          </span>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-green-700">Selected Number</p>
                            <p className="mt-1 font-mono text-3xl font-bold text-gray-900">{formatDisplayPhone(telnyxIds.telnyx_phone_number)}</p>
                            <p className={`mt-2 text-sm ${campaignAssigned ? "text-green-700" : "text-gray-600"}`}>
                              {campaignAssigned
                                ? "Texting is switched on - this is the number your messages send from."
                                : "This number is reserved for you. One quick step left to switch on texting."}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {!campaignAssigned && (
                            <button
                              onClick={handleAssignCampaign}
                              disabled={loadingAssign}
                              className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition ${loadingAssign ? "bg-gray-300 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"
                                }`}
                            >
                              {loadingAssign ? "Switching on..." : "Turn On Texting"}
                            </button>
                          )}
                          <button
                            onClick={() => setManualStep(3)}
                            className="rounded-2xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                          >
                            Review Status
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <NumberSearchPicker
                    apiBase={API_BASE}
                    token={token || ""}
                    messagingProfileId={telnyxIds.telnyx_messaging_profile_id}
                    onPurchased={(phone, result) => {
                      const assigned = Boolean(result?.assigned);
                      if (assigned) userJustCompletedRef.current = true;
                      setTelnyxIds((prev) => ({
                        ...prev,
                        telnyx_messaging_profile_id: result?.messagingProfileId || prev.telnyx_messaging_profile_id,
                        telnyx_phone_number: phone,
                        telnyx_campaign_number_status: assigned ? "assigned" : "purchased",
                        telnyx_sms_status: assigned ? "approved" : "pending",
                        telnyx_error_reason: assigned ? "" : (result?.assignError || ""),
                      }));
                      setManualStep(2);
                      if (assigned) {
                        toast.success(`${formatDisplayPhone(phone)} is ready - texting is switched on.`);
                      } else {
                        toast.success(`${formatDisplayPhone(phone)} is reserved. One more tap to switch on texting.`);
                      }
                    }}
                  />
                )}
              </section>
            )}

            {effectiveStep === 3 && (
              <section className="rounded-4xl border border-[#e8e2d8] bg-white p-6 shadow-[0_28px_65px_rgba(15,23,42,0.06)]">
                {statusLabel === "rejected" ? (
                  <>
                    <div className="mb-4 flex items-center gap-2">
                      <AlertCircle size={20} className="shrink-0 text-red-600" />
                      <span className={`rounded-full border px-3 py-1 text-xs ${statusClass}`}>{statusLabel}</span>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Complete › Action Required</p>
                    <h2 className="mt-2 text-2xl font-bold text-gray-900">{step4Title}</h2>
                    <p className="mt-2 text-sm text-gray-600">{step4Description}</p>
                    {selectedStatusReason && (
                      <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {selectedStatusReason}
                      </div>
                    )}
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        onClick={handleCheckStatus}
                        disabled={loadingStatus || statusCooldownActive}
                        className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${loadingStatus || statusCooldownActive
                            ? "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400"
                            : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                          }`}
                      >
                        {loadingStatus ? "Refreshing..." : statusCooldownActive ? "Just refreshed" : "Refresh Status"}
                      </button>
                      <button
                        onClick={handleResetBrand}
                        className="rounded-2xl border border-red-300 px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        Reset Brand
                      </button>
                      <button
                        onClick={() => navigate("/dashboard")}
                        className="rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
                      >
                        Go to Dashboard
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {!campaignAssigned && telnyxIds.telnyx_phone_number ? (
                      <div className="mb-6 rounded-3xl border border-orange-200 bg-orange-50 px-5 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="max-w-xl">
                            <p className="text-base font-semibold text-orange-900">
                              One last step: switch on texting for {formatDisplayPhone(telnyxIds.telnyx_phone_number)}
                            </p>
                            <p className="mt-1 text-sm text-orange-700">
                              {telnyxIds.telnyx_error_reason
                                ? "We couldn't switch it on automatically just now. This usually clears up within a minute - tap Turn On Texting to try again."
                                : "Your number is reserved. Switch on texting so you can start sending and receiving messages."}
                            </p>
                            {telnyxIds.telnyx_error_reason && (
                              <p className="mt-2 text-[11px] text-orange-600/80">Details: {telnyxIds.telnyx_error_reason}</p>
                            )}
                          </div>
                          <button
                            onClick={handleAssignCampaign}
                            disabled={loadingAssign}
                            className={`rounded-2xl px-6 py-3 text-sm font-semibold text-white transition ${loadingAssign ? "cursor-not-allowed bg-gray-300" : "bg-orange-500 hover:bg-orange-600"
                              }`}
                          >
                            {loadingAssign ? "Switching on..." : "Turn On Texting"}
                          </button>
                        </div>
                      </div>
                    ) : selectedStatusReason ? (
                      <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
                        {selectedStatusReason}
                      </div>
                    ) : null}

                    <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,520px)] lg:items-start xl:grid-cols-[minmax(0,1fr)_360px]">
                      <div className="max-w-180">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green-600">{completionEyebrow}</p>
                        <div className="mt-3 flex items-start gap-3">
                          <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                            <CheckCircle size={20} />
                          </span>
                          <div>
                            <h2 className="text-[2rem] font-bold tracking-tight text-gray-900">{step4Title}</h2>
                            <p className="mt-3 text-base text-gray-600">{step4Description}</p>
                            <p className="mt-3 text-sm text-gray-500">{heroSupportText}</p>
                          </div>
                        </div>
                      </div>

                      <div className="relative min-h-85 w-full overflow-hidden rounded-4xl border border-[#f0e1c7] bg-linear-to-br from-[#fff8ef] via-[#fffdf8] to-[#f5eee2] p-7 shadow-xs lg:min-h-90">
                        <Sparkles className="absolute left-9 top-7 h-5 w-5 text-orange-300" />
                        <Sparkles className="absolute right-12 top-8 h-5 w-5 text-amber-300" />
                        <div className="absolute left-12 top-10 h-32 w-32 rounded-full bg-white/80 blur-3xl" />
                        <div className="absolute right-8 bottom-4 h-44 w-44 rounded-full bg-[#fde7ca] blur-3xl" />

                        <div className="relative flex h-full items-center justify-center">
                          <div className="relative w-full max-w-90">
                            <div className="absolute left-0 top-7 rounded-2xl border border-white/90 bg-white/95 px-5 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
                              <div className="flex items-center gap-2 text-[15px] font-semibold text-gray-700">
                                <Mail size={17} className="text-orange-500" />
                                Email is ready now
                              </div>
                            </div>

                            <div className="mx-auto w-67.5 rounded-[40px] border border-white/90 bg-white/95 p-6 shadow-[0_22px_45px_rgba(15,23,42,0.12)]">
                              <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                                <span>WarmChats</span>
                                <BadgeCheck size={16} className="text-green-600" />
                              </div>
                              <div className="rounded-[30px] bg-linear-to-br from-[#fff4e1] via-[#fffdf7] to-[#eef8ef] p-7">
                                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-[36px] bg-white shadow-xs">
                                  <Smartphone className="h-16 w-16 text-slate-700" />
                                </div>
                                <div className="mt-5 rounded-2xl bg-white/90 px-4 py-2.5 shadow-xs">
                                  <div className="flex items-center justify-center gap-2 text-sm font-semibold text-green-700">
                                    <CheckCircle size={15} />
                                    SMS review in progress
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="absolute right-2 bottom-12 rounded-2xl border border-white/90 bg-white/95 px-5 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
                              <div className="flex items-center gap-2 text-[15px] font-semibold text-gray-700">
                                <CheckCircle size={17} className="text-green-600" />
                                SMS Activated
                              </div>
                            </div>

                            <div className="absolute left-1/2 top-full mt-5 -translate-x-1/2 rounded-full border border-white/80 bg-white/90 px-5 py-2.5 text-sm font-semibold text-gray-600 shadow-xs">
                              WarmChats activation
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-6 rounded-3xl border border-gray-200 bg-[#fcfbf8] p-6">
                      <div className="space-y-4">
                        {pendingChecklist.map((item, index) => (
                          <div key={`${item.label}-${index}`} className="flex items-center gap-3 text-sm text-gray-700">
                            {item.done ? (
                              <CheckCircle size={18} className="shrink-0 text-green-600" />
                            ) : (
                              <span className="h-4.5 w-4.5 shrink-0 rounded-full border-2 border-orange-300" />
                            )}
                            <span className={item.done ? "" : "font-semibold text-gray-900"}>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-gray-500">
                        {campaignAssigned
                          ? "Your number is live. You can start sending messages from your inbox."
                          : "New numbers can take a minute to activate. If it doesn't switch on right away, give it a moment and try again."}
                      </p>
                      <button
                        onClick={handleCheckStatus}
                        disabled={loadingStatus || statusCooldownActive}
                        className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${loadingStatus || statusCooldownActive
                            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                          }`}
                      >
                        {loadingStatus ? "Refreshing..." : statusCooldownActive ? "Just refreshed" : "Refresh Status"}
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </Wrapper>
  );
};

export default ConnectPhoneNumber;
