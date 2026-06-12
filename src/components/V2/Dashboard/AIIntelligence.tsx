import React from "react";
import { useNavigate } from "react-router-dom";
import { humanizeTaskText } from "@/utils/humanizeTime";

type Tone = "orange" | "violet" | "blue" | "amber";

interface PriorityItem {
  type?: string | null;
  lead_id?: number | null;
  lead_name?: string | null;
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  confidence?: number | null;
  cta?: { label?: string | null; action?: string | null; deep_link?: string | null } | null;
  occurred_at?: string | null;
}

/** Payload from fetchDashboardPriroty: { items: PriorityItem[], computed_at }. */
export interface PriorityActionsData {
  items?: PriorityItem[];
  computed_at?: string | null;
}

interface AIIntelligenceProps {
  data?: PriorityActionsData;
  isLoading?: boolean;
}

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8" />
  </svg>
);
const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);
const MsgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
    <path d="M20 12a8 8 0 0 1-12.2 6.8L4 20l1.2-3.8A8 8 0 1 1 20 12z" />
  </svg>
);
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
    <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />
  </svg>
);

const TONE: Record<Tone, { bg: string; fg: string; border: string }> = {
  orange: { bg: "#fdf4ec", fg: "#c0530f", border: "#f7d5b8" },
  violet: { bg: "#efebf9", fg: "#6849cf", border: "#dccdf3" },
  blue: { bg: "#e9eef8", fg: "#2f6ad0", border: "#cadcf4" },
  amber: { bg: "#f8efd9", fg: "#a87400", border: "#f0e0b3" },
};
const TONE_ORDER: Tone[] = ["orange", "violet", "blue", "amber"];
const ICONS = [SparkleIcon, BoltIcon, MsgIcon];

// Human label per priority-action type (see priority-actions.ts).
// Human label + tone + icon per priority-action type, following the
// AI_intelligence.prompt.md card system (Buying signal / Motivation /
// message-blue / Cooling-amber).
const TYPE_TAG: Record<string, string> = {
  ready_to_buy: "Buying signal",
  motivation: "Motivation",
  appointment_opportunity: "Appointment opportunity",
  appointment_unconfirmed: "Confirm appointment",
  human_takeover: "Human takeover needed",
  needs_response: "Needs response",
  re_engage: "Cooling",
  warm_lead_no_outreach: "No outreach yet",
};
const TYPE_TONE: Record<string, Tone> = {
  ready_to_buy: "orange",
  motivation: "violet",
  appointment_opportunity: "blue",
  appointment_unconfirmed: "blue",
  human_takeover: "amber",
  needs_response: "blue",
  re_engage: "amber",
  warm_lead_no_outreach: "violet",
};
const TYPE_ICON: Record<string, React.FC> = {
  ready_to_buy: SparkleIcon,
  motivation: BoltIcon,
  appointment_opportunity: MsgIcon,
  appointment_unconfirmed: MsgIcon,
  human_takeover: MsgIcon,
  needs_response: MsgIcon,
  re_engage: RefreshIcon,
  warm_lead_no_outreach: SparkleIcon,
};

const relativeTime = (iso?: string | null): string | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const AIIntelligence: React.FC<AIIntelligenceProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();
  const items = (data?.items ?? []).slice(0, 4);
  const updated = relativeTime(data?.computed_at);

  return (
    <div className="rounded-[20px] border border-[#EAEAEA] bg-white p-5 shadow-[0_1px_2px_rgba(50,35,20,0.03)]">
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#C0530F]">AI Intelligence</div>
          <div className="mt-1 text-[18px] font-bold tracking-tight text-[#211a14]">
            Specific recommendations for your deals
          </div>
        </div>
        {updated ? <span className="whitespace-nowrap text-[11px] text-[#8c7d6f]">Updated {updated}</span> : null}
      </div>

      {isLoading && !data ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[13px] border border-[#EAEAEA] bg-gray-50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[13px] border border-dashed border-[#EAEAEA] bg-[#faf7f2] px-4 py-8 text-center">
          <div className="text-[13px] font-semibold text-[#463b31]">No priority actions right now</div>
          <div className="mt-1 text-[12px] text-[#8c7d6f]">
            New leads and unconfirmed appointments will surface here.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {items.map((it, i) => {
            const tone = TYPE_TONE[String(it.type ?? "")] ?? TONE_ORDER[i % TONE_ORDER.length];
            const p = TONE[tone];
            const Icon = TYPE_ICON[String(it.type ?? "")] ?? ICONS[i % ICONS.length];
            const tag = TYPE_TAG[String(it.type ?? "")] ?? (it.priority === "high" ? "High priority" : "Action");
            const link = it.cta?.deep_link || (it.lead_id != null ? `/inbox?lead=${it.lead_id}` : "/inbox");
            return (
              <div
                key={`${it.type}-${it.lead_id}-${i}`}
                className="relative flex flex-col gap-2 overflow-hidden rounded-[13px] border border-[#EAEAEA] bg-white p-3.5"
              >
                <span className="absolute left-0 top-0 h-full w-0.75" style={{ background: p.fg }} />
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-bold tracking-[0.03em]"
                    style={{ background: p.bg, color: p.fg }}
                  >
                    <Icon /> {tag.toUpperCase()}
                  </span>
                  <span className="text-[13px] font-semibold text-[#211a14]">{it.lead_name || "Lead"}</span>
                </div>
                <p className="text-[13px] leading-snug text-[#463b31]">{humanizeTaskText(it.description || it.title)}</p>
                {typeof it.confidence === "number" && it.confidence > 0 ? (
                  <div className="text-[11.5px] font-semibold text-[#8c7d6f]">
                    {Math.round(it.confidence)}% confidence
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate(link)}
                  className="mt-0.5 cursor-pointer self-start rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition hover:-translate-y-px hover:shadow-sm"
                  style={{ background: p.bg, color: p.fg, borderColor: p.border }}
                >
                  {it.cta?.label || "View lead"} →
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AIIntelligence;
