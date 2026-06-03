import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "./MainLayout";
import { Loader2, AlertTriangle, CheckCircle, ArrowLeft } from "lucide-react";
import BusinessEmailSetup from "./BusinessEmailSetup";

const API_BASE = import.meta.env.VITE_API_BASE;

export default function ConnectDomain() {
  const token  = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id") || "";
  const navigate = useNavigate();
  // Caller (Connected Accounts page / onboarding / dashboard) stashes the
  // return path here. We read once and consume it on next exit so X / Back /
  // success all bounce back to the right place instead of hard-coding /inbox.
  const [returnTo] = useState<string>(() => {
    const stashed = localStorage.getItem("connect_domain_return");
    return stashed && stashed.startsWith("/") ? stashed : "/inbox";
  });
  useEffect(() => {
    return () => {
      localStorage.removeItem("connect_domain_return");
    };
  }, []);

  const [otpEmail, setOtpEmail]     = useState("");
  const [otp, setOtp]               = useState("");
  const [otpSent, setOtpSent]       = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [notice, setNotice]         = useState("");
  const [showDnsSetup, setShowDnsSetup] = useState(false);
  const [checking, setChecking]     = useState(true);

  // On mount - if domain already registered/verified, skip OTP and go straight to BusinessEmailSetup
  useEffect(() => {
    const checkExisting = async () => {
      if (!token) { setChecking(false); return; }
      try {
        const res  = await fetch(`${API_BASE}/elastic/business-email/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.status === "registered" || data.status === "verified") {
          setOtpEmail(data.email || "");
          setShowDnsSetup(true);
        }
      } catch { /* proceed to OTP */ }
      finally  { setChecking(false); }
    };
    checkExisting();
  }, [token]);

  const handleSendOtp = async () => {
    if (!otpEmail.trim()) { setNotice("Enter your business email."); return; }
    setOtpSending(true); setNotice("");
    try {
      const res  = await fetch(`${API_BASE}/elastic/business-email/send-otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ email: otpEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { setNotice(data.error || "Failed to send code."); return; }
      setOtpSent(true);
      setNotice(`Code sent to ${otpEmail}. Check your inbox.`);
    } catch { setNotice("Failed to send code. Please try again."); }
    finally  { setOtpSending(false); }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) { setNotice("Enter the 6-digit code."); return; }
    setOtpVerifying(true); setNotice("");
    try {
      const res  = await fetch(`${API_BASE}/elastic/business-email/verify-otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ email: otpEmail.trim().toLowerCase(), otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setNotice(data.error || "Invalid code."); return; }
      setShowDnsSetup(true);
    } catch { setNotice("Verification failed. Please try again."); }
    finally  { setOtpVerifying(false); }
  };

  if (checking) {
    return (
      <MainLayout>
        <div className="max-w-md mx-auto mt-12 flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-orange-400" />
        </div>
      </MainLayout>
    );
  }

  if (showDnsSetup) {
    return (
      <BusinessEmailSetup
        userEmail={otpEmail}
        token={token || ""}
        userId={userId}
        onClose={() => navigate(returnTo)}
        onSuccess={() => navigate(returnTo)}
      />
    );
  }

  return (
    <MainLayout>
      <div className="max-w-md mx-auto mt-12 bg-white border rounded-2xl shadow-xs p-6 space-y-5">
        <button
          onClick={() => navigate(returnTo)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={15} /> Back to inbox
        </button>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">Connect Your Domain</h2>
          <p className="text-sm text-gray-500 mt-1">
            Verify your business email to register a sending domain with DNS records.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business email</label>
          <input
            type="email"
            value={otpEmail}
            onChange={(e) => { setOtpEmail(e.target.value); setOtpSent(false); setNotice(""); }}
            placeholder="you@yourcompany.com"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <button
          onClick={handleSendOtp}
          disabled={otpSending || !otpEmail.trim()}
          className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          {otpSending
            ? <><Loader2 size={14} className="animate-spin" /> Sending...</>
            : otpSent
              ? "Resend code"
              : "Send verification code"}
        </button>

        {otpSent && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">6-digit code</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-400 tracking-widest"
              />
            </div>
            <button
              onClick={handleVerifyOtp}
              disabled={otpVerifying || otp.length !== 6}
              className="w-full py-2.5 bg-linear-to-r from-orange-500 to-purple-500 text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition flex items-center justify-center gap-2"
            >
              {otpVerifying ? <><Loader2 size={14} className="animate-spin" /> Verifying...</> : "Verify & Get DNS Records"}
            </button>
          </div>
        )}

        {notice && (
          <p className={`text-xs flex items-center gap-1.5 ${notice.includes("sent") ? "text-green-600" : "text-red-500"}`}>
            {notice.includes("sent") ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
            {notice}
          </p>
        )}
      </div>
    </MainLayout>
  );
}
