import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

/**
 * Reusable, dismissible "upgrade to a paid plan" nudge for Free-plan users.
 * Generic on purpose - the CALLER decides when it's contextually relevant
 * (free plan + the right trigger) and passes the copy. Dismissal is remembered
 * per `id` in localStorage so a nudge a user closes never nags again.
 *
 * Keep it contextual, not annoying: render at most one of these at a time per
 * surface, and only when it's actually relevant to what the user is doing.
 */
const dismissKey = (id: string) => `wc_nudge_dismissed_${id}`;

type Tone = "orange" | "amber";
const TONES: Record<Tone, { border: string; bg: string; ink: string; sub: string; chipBg: string; chipFg: string }> = {
  orange: { border: "#FFE0D2", bg: "#FFF3EC", ink: "#101828", sub: "#8a5a3a", chipBg: "#fff", chipFg: "#FF6B35" },
  amber: { border: "#FCE5B8", bg: "#FEF7E6", ink: "#101828", sub: "#92704a", chipBg: "#fff", chipFg: "#D97706" },
};

export default function UpgradeNudge({
  id, icon, title, message, cta = "Upgrade", to = "/upgrade", tone = "orange",
}: {
  id: string;
  icon: ReactNode;
  title: string;
  message: string;
  cta?: string;
  to?: string;
  tone?: Tone;
}) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey(id)) === "1");
  if (dismissed) return null;
  const t = TONES[tone];
  const dismiss = () => { localStorage.setItem(dismissKey(id), "1"); setDismissed(true); };
  return (
    <div className="flex items-start gap-3 rounded-xl border p-4" style={{ borderColor: t.border, background: t.bg }}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: t.chipBg, color: t.chipFg }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color: t.ink }}>{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: t.sub }}>{message}</p>
      </div>
      <Link
        to={to}
        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
        style={{ background: "linear-gradient(90deg,#FB923C 0%,#F97316 86%)" }}
      >
        {cta}
      </Link>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
