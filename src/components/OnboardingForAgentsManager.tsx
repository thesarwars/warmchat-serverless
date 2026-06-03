import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Check, Mail, X, MessageCircle, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { Popup } from "@progress/kendo-react-popup";
import Confetti from "react-confetti";
import BusinessEmailSetup from "./BusinessEmailSetup";
import { logoutCurrentSession } from "../utils/authSession";

/* ---------------- TYPES ---------------- */
type Step = 1 | 2 | 3 | 4 | 5;
type BusinessEmailStatus = "unknown" | "not_connected" | "otp_pending" | "otp_verified" | "registered" | "verified";

/* ---------------- MAIN ---------------- */
const OnboardingForAgentsManager: React.FC = () => {
  const navigate = useNavigate();
  const API_BASE = import.meta.env.VITE_API_BASE;
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id");
  const [step, setStep] = useState<Step>(1);
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [connected, setConnected] = useState({ email: false, sms: false });
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [smsConnecting, setSmsConnecting] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<"email" | "sms">("email");
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [popupAnchor, setPopupAnchor] = useState<HTMLDivElement | null>(null);
  const [confettiActive, setConfettiActive] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [confettiSize, setConfettiSize] = useState({ width: 0, height: 0 });
  const confettiTimer = useRef<number | null>(null);
  const prevEmailConnected = useRef(false);
  const [gmailStatus, setGmailStatus] = useState<"unknown" | "not_connected" | "active" | "needs_reauth">("unknown");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessEmailStatus, setBusinessEmailStatus] = useState<BusinessEmailStatus>("unknown");
  const [businessOtp, setBusinessOtp] = useState("");
  const [businessOtpSent, setBusinessOtpSent] = useState(false);
  const [businessSending, setBusinessSending] = useState(false);
  const [businessVerifying, setBusinessVerifying] = useState(false);
  const [businessNotice, setBusinessNotice] = useState("");

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
  }, [API_BASE, token]);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/onboarding/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.step && data.step >= 5) {
          navigate("/dashboard");
          return;
        }
        setStep((data.step as Step) || 1);
        setConnected({
          email: data.email_connected || false,
          sms: data.sms_connected || false,
        });
        if (data.selected_preset) {
          setSelectedPresetId(data.selected_preset);
        }
      });
  }, [API_BASE, navigate, token, userId]);

  useEffect(() => {
    if (!token) return;
    const loadStatuses = async () => {
      try {
        const res = await fetch(`${API_BASE}/gmail/connection`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setGmailStatus(data.status || "not_connected");
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
        const status = (data.status || "not_connected") as BusinessEmailStatus;
        setBusinessEmailStatus(status);
        if (status === "otp_pending") setBusinessOtpSent(true);
        if (status === "verified" && (data.sending_records_verified ?? data.all_records_verified) && !connected.email) {
          await fetch(`${API_BASE}/onboarding/${userId}/connect`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ channel: "email" }),
          });
          setConnected((c) => ({ ...c, email: true }));
        }
      } catch {
        setBusinessEmailStatus((cur) => (cur === "unknown" ? "not_connected" : cur));
      }
    };
    loadStatuses();
  }, [API_BASE, token, userId, connected.email]);

  useEffect(() => {
    if (!presets.length || selectedPresetId) return;
    const defaultPreset = presets.find((p) => p.title.toLowerCase() === "buyer lead follow-up");
    if (defaultPreset) setSelectedPresetId(defaultPreset.id);
  }, [presets, selectedPresetId]);

  useEffect(() => {
    if (!connected.sms && selectedChannel === "sms") {
      setSelectedChannel("email");
    }
  }, [connected.sms, selectedChannel]);

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
      const res = await fetch(`${API_BASE}/onboarding/${userId}/preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preset_id: presetId }),
      });
      if (!res.ok) throw new Error("Failed to save selection");
    } catch {
      toast.error("Error saving preset");
    }
  };

  const connectSMS = async () => {
    setSmsConnecting(true);
    try {
      await fetch(`${API_BASE}/onboarding/${userId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel: "sms" }),
      });
      setConnected((c) => ({ ...c, sms: true }));
      toast.success("SMS connected!");
    } catch {
      toast.error("Failed to connect SMS");
    } finally {
      setSmsConnecting(false);
    }
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
        toast.error(data.error || "Failed to send code");
        return;
      }
      setBusinessEmailStatus("otp_pending");
      setBusinessOtpSent(true);
      setBusinessNotice(
        data.domain_submitted === false
          ? "Verification code sent. We'll prepare DNS records after you verify the code."
          : "Verification code sent. Elastic Email domain setup is prepared for DNS records after verification."
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

  const emailSetupReady = connected.email && (gmailStatus === "active" || businessEmailStatus === "verified");
  const businessDomainInProgress =
    !emailSetupReady && Boolean(businessEmail) && ["otp_verified", "registered"].includes(businessEmailStatus);

  const sendTest = async () => {
    const channel = selectedChannel === "sms" ? "sms" : "email";
    if (channel === "email" && !emailSetupReady) {
      toast.error("Finish connecting Gmail or fully verify your business domain before sending.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/onboarding/${userId}/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel }),
      });
      if (!res.ok) throw new Error("Failed to send test");
      setShowSuccessPopup(true);
      triggerConfetti();
    } catch {
      toast.error("Failed to send test message");
    }
  };

  const canContinue = (currentStep: Step) => {
    if (currentStep === 1 && !selectedPresetId) return false;
    if (currentStep === 2 && !emailSetupReady) return false;
    return true;
  };

  const totalSteps = 4;
  const availablePresets = presets;

  const renderMessage = (text: string) =>
    text.split(/(\[[^\]]+\])/g).map((part, idx) =>
      part.startsWith("[") && part.endsWith("]") ? (
        <span
          key={`${part}-${idx}`}
          className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-900 font-medium"
        >
          {part}
        </span>
      ) : (
        <span key={`${part}-${idx}`}>{part}</span>
      )
    );

  /* ---------------- UI ---------------- */
  return (
    <div className="min-h-screen p-6 bg-orange-50">
      <Toaster position="top-right" reverseOrder={false} />
      <div className="max-w-4xl mx-auto" ref={setPopupAnchor}>
        {/* Progress */}
        {/* <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-500 mb-1">
            <span>Step {step} of 7</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-orange-500" style={{ width: `${progress}%` }} />
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
    <div className="text-sm text-gray-500">
      Step {Math.min(step, totalSteps)} of {totalSteps} * Takes ~2 minutes total
    </div>
  </div>

  {/* Progress bar */}
  <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
    <div
      className="h-full bg-orange-500 transition-all duration-300"
      style={{ width: `${(Math.min(step, totalSteps) / totalSteps) * 100}%` }}
    />
  </div>
</div>

        <Card className="shadow-xl border border-white/40 bg-white/70 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-xl">
              {({
                1: "Step 1: Choose your follow-up",
                2: "Step 2: Connect channels",
                3: "Step 3: Review & send",
                4: "Step 4: Leads & automation",
              } as Record<number, string>)[step]}
            </CardTitle>
          </CardHeader>

          <CardContent>
            {step === 1 && (
              <div className="space-y-6 text-left">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Choose your first follow-up
                  </h2>
                  <p className="text-sm text-gray-500">
                    Start with one proven playbook. You can edit everything later.
                  </p>
                </div>

                {availablePresets.length === 0 && !_loadingPresets && (
                  <div className="text-center text-sm text-gray-400 py-6">-</div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  {availablePresets.map((preset) => {
                    const isSelected = preset.id === selectedPresetId;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => selectPreset(preset.id)}
                        className={`relative w-full text-left p-4 rounded-xl border transition-all ${
                          isSelected
                            ? "border-orange-500 bg-orange-50"
                            : "border-gray-200 bg-white hover:border-orange-400"
                        }`}
                      >
                        {preset.recommended && (
                          <span className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">
                            Default
                          </span>
                        )}

                        <div className="text-sm font-semibold text-gray-900">
                          {preset.title}
                        </div>
                        {preset.description && (
                          <div className="text-xs text-gray-500 mt-1">
                            {preset.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                          {preset.avgReplies} replies * {preset.messages}
                        </div>

                        {isSelected && (
                          <div className="absolute bottom-3 right-3 text-orange-500">
                            <Check size={16} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedPresetId &&
                  availablePresets.find((p) => p.id === selectedPresetId)?.title.toLowerCase() ===
                    "buyer lead follow-up" && (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="border rounded-lg p-4 bg-white">
                        <div className="text-xs text-gray-500">Preview</div>
                        <div className="text-sm font-semibold text-gray-900">
                          Review & send your message
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          This message is ready - edit it or send as-is.
                        </p>
                      </div>
                      <div className="border rounded-lg p-4 bg-white">
                        <div className="text-xs text-gray-500">Success</div>
                        <div className="text-sm font-semibold text-gray-900">
                          Message sent successfully
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Replies will appear here.
                        </p>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-1 text-center">
                  <h2 className="text-lg font-semibold">
                    Connect channels (but cheat)
                  </h2>
                  <p className="text-sm text-gray-500">
                    Email is required. You can add SMS later without friction.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Card className="p-6 border-orange-300 bg-orange-50">
                    <div className="flex items-start gap-3">
                      <Mail size={20} className="text-orange-600 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          Email <span className="text-orange-600">(required)</span>
                        </div>
                        <div className="text-sm text-gray-600">
                          Send messages from your email
                        </div>
                        <div className="text-xs text-gray-500">
                          Gmail * 1-click connect
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      {emailSetupReady ? (
                        <div className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                          <Check size={14} /> Connected
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowEmailModal(true)}
                          className="px-4 py-2 rounded-md text-sm font-medium text-white bg-orange-500 hover:opacity-90 transition"
                        >
                          {businessDomainInProgress
                            ? "Resume DNS setup"
                            : gmailStatus === "needs_reauth"
                              ? "Reconnect Gmail"
                              : "Connect Gmail"}
                        </button>
                      )}
                    </div>
                  </Card>

                  <Card className="p-6 border-gray-200 bg-white">
                    <div className="flex items-start gap-3">
                      <MessageCircle size={20} className="text-orange-600 mt-0.5" />
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          SMS <span className="text-xs text-gray-500">(add later)</span>
                        </div>
                        <div className="text-sm text-gray-600">
                          Text leads automatically
                        </div>
                        <div className="text-xs text-gray-500">
                          We'll assign you a verified number
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (!emailSetupReady) {
                            toast.error("Finish connecting Gmail or fully verify your business domain to continue");
                            return;
                          }
                          updateStep(3);
                        }}
                        className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 border hover:bg-gray-50 transition"
                      >
                        Add later (recommended)
                      </button>
                      <button
                        onClick={connectSMS}
                        disabled={smsConnecting}
                        className="text-xs text-orange-600 hover:underline disabled:text-gray-400"
                      >
                        {smsConnecting ? "Connecting..." : "Connect SMS now"}
                      </button>
                    </div>
                  </Card>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  You can send messages without SMS - add it later.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-1 text-center">
                  <h2 className="text-lg font-semibold">
                    Step 3: Review & send your message
                  </h2>
                  <p className="text-sm text-gray-500">
                    This message is ready - edit it or send as-is.
                  </p>
                </div>

                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setSelectedChannel("email")}
                    className={`px-4 py-2 rounded-md text-sm font-medium border ${
                      selectedChannel === "email"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                  >
                    Email
                  </button>
                  <button
                    onClick={() => connected.sms && setSelectedChannel("sms")}
                    className={`px-4 py-2 rounded-md text-sm font-medium border ${
                      selectedChannel === "sms"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-white text-gray-400 border-gray-200"
                    }`}
                    disabled={!connected.sms}
                  >
                    SMS
                  </button>
                </div>

                <div className="border rounded-xl p-5 bg-white shadow-xs">
                  <div className="text-xs text-gray-500 mb-2">Message preview</div>
                  <div className="text-sm text-gray-800 leading-6 space-y-2">
                    <p>
                      {renderMessage(
                        "Hi [First Name], thanks for reaching out about [Property Address]."
                      )}
                    </p>
                    <p>
                      {renderMessage(
                        "I can share a few options that match what you're looking for. Want me to send them over?"
                      )}
                    </p>
                    <p>{renderMessage("Best, [Sender Name]")}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <button
                    onClick={sendTest}
                    className="text-orange-600 hover:underline"
                  >
                    Send to myself (recommended)
                  </button>
                  <span>Variables are highlighted so you can spot them quickly.</span>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6 text-center">
                <div className="space-y-2">
                  <div className="flex justify-center">
                    <Rocket className="w-12 h-12 text-orange-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Leads & automation (after the win)
                  </h2>
                  <p className="text-sm text-gray-500">
                    You already saw this work. Now scale it.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 text-left">
                  {[
                    "Add real leads",
                    "Create automation",
                    "Enable automation",
                    "Send to list",
                  ].map((item) => (
                    <div key={item} className="border rounded-lg p-4 bg-white">
                      <div className="text-sm font-medium text-gray-900">{item}</div>
                      <p className="text-xs text-gray-500 mt-1">
                        Complete this step to keep momentum going.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {step > 1 && step <= 4 && (
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
                  if (selectedPresetId) {
                    await selectPreset(selectedPresetId);
                  }
                  updateStep(2);
                }}
                className="px-6 py-3 rounded-lg font-semibold text-white bg-orange-500 hover:opacity-90 transition disabled:opacity-40"
              >
                Continue →
              </button>
            )}

            {step === 2 && (
              <button
                disabled={!canContinue(step)}
                onClick={() => updateStep(3)}
                className="px-6 py-3 rounded-lg font-semibold text-white bg-orange-500 hover:opacity-90 transition disabled:opacity-40 sm:ml-auto"
              >
                Continue →
              </button>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:ml-auto">
                <button
                  onClick={() => navigate("/ai/agent?tab=outbound&sub=templates")}
                  className="px-5 py-2 rounded-md border text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit message
                </button>
                <button
                  disabled={!emailSetupReady}
                  onClick={sendTest}
                  className="px-6 py-2 rounded-md text-white font-semibold bg-orange-500 hover:opacity-90 transition disabled:opacity-40"
                >
                  Send message
                </button>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:ml-auto">
                <button
                  onClick={() => {
                    updateStep(5);
                    navigate("/leads");
                  }}
                  className="px-5 py-2 rounded-md border text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Add leads
                </button>
                <button
                  onClick={() => {
                    updateStep(5);
                    navigate("/ai/agent?tab=outbound");
                  }}
                  className="px-6 py-2 rounded-md text-white font-semibold bg-orange-500 hover:opacity-90 transition"
                >
                  Create automation
                </button>
              </div>
            )}
          </CardFooter>
        </Card>

        <div className="mt-6 text-center text-sm text-gray-500">
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
      </div>

      {showSuccessPopup && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setShowSuccessPopup(false)}
        />
      )}
      {popupAnchor && (
        <Popup
          anchor={popupAnchor}
          show={showSuccessPopup}
          anchorAlign={{ horizontal: "center", vertical: "center" }}
          popupAlign={{ horizontal: "center", vertical: "center" }}
        >
          <div className="relative z-50 bg-white rounded-2xl p-6 w-[320px] sm:w-105 text-center shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Message sent successfully
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Replies will appear here.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              Next: automate this so it runs automatically.
            </p>
            <button
              onClick={() => {
                setShowSuccessPopup(false);
                updateStep(4);
              }}
              className="mt-4 px-5 py-2 rounded-md text-white text-sm font-medium bg-orange-500 hover:opacity-90 transition"
            >
              Set up automatic follow-up →
            </button>
          </div>
        </Popup>
      )}

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
          onConnect={startGmailOAuth}
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
    </div>
  );
};

export default OnboardingForAgentsManager;

interface EmailConnectModalProps {
  onClose: () => void;
  onConnect: () => void;
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

const EmailConnectModal = ({
  onClose,
  onConnect,
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
  const [status, setStatus] = useState("");
  const [showDnsSetup, setShowDnsSetup] = useState(false);
  const [dnsSetupDone, setDnsSetupDone] = useState(false);

  useEffect(() => {
    if (["otp_verified", "registered"].includes(businessEmailStatus) && !dnsSetupDone) {
      setShowDnsSetup(true);
    }
  }, [businessEmailStatus, dnsSetupDone]);

  const connect = async () => {
    if (!token) {
      setStatus("Please log in again.");
      return;
    }
    setStatus("Redirecting to Google...");
    await onConnect();
  };

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
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 relative">
        <button onClick={onClose} className="absolute right-4 top-4">
          <X />
        </button>

        <h2 className="text-lg font-semibold">Connect Gmail</h2>
        <p className="text-sm text-gray-600">
          Sign in with Google to connect your Gmail. No app password required.
        </p>

        <button
          onClick={connect}
          className="w-full py-2 rounded text-white bg-orange-500"
        >
          Connect Gmail
        </button>

        {status && <p className="text-sm text-gray-500">{status}</p>}

        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Or verify business email</h3>
          <p className="text-xs text-gray-500">
            We'll send a one-time code to verify your business email for automations.
          </p>
          <input
            type="email"
            placeholder="you@yourdomain.com"
            value={businessEmail}
            onChange={(e) => setBusinessEmail(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={onSendOtp}
            disabled={businessSending}
            className="w-full py-2 rounded text-white bg-orange-500 disabled:opacity-60"
          >
            {businessSending
              ? "Sending code..."
              : businessOtpSent || businessEmailStatus === "otp_pending"
                ? "Resend code"
                : "Send verification code"}
          </button>

          {(businessOtpSent || businessEmailStatus === "otp_pending") && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Enter 6-digit code"
                value={businessOtp}
                onChange={(e) => setBusinessOtp(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <button
                onClick={onVerifyOtp}
                disabled={businessVerifying}
                className="w-full py-2 rounded text-white bg-orange-500 disabled:opacity-60"
              >
                {businessVerifying ? "Verifying..." : "Verify code"}
              </button>
            </div>
          )}

          {businessEmailStatus === "verified" && (
            <p className="text-xs text-green-600">
              Verified: {businessEmail}
            </p>
          )}
          {businessEmailStatus === "otp_verified" && !dnsSetupDone && (
            <p className="text-xs text-orange-600 font-medium">Email verified. DNS setup is required to connect sending.</p>
          )}
          {businessEmailStatus === "registered" && !dnsSetupDone && (
            <p className="text-xs text-orange-600 font-medium">DNS records are ready. Verify them to connect sending.</p>
          )}
          {businessNotice && <p className="text-xs text-gray-500">{businessNotice}</p>}
        </div>
      </div>
    </div>
  );
};