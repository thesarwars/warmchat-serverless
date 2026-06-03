import React from "react";

type NumLike = number | string | null | undefined;

interface DashboardSummary {
  total_replies?: NumLike;
  hot_leads?: NumLike;
  ai_followups_sent?: NumLike;
  ai_appointments?: NumLike;
  appointments?: NumLike;
  new_conversations?: NumLike;
  time_saved_hours?: NumLike;
}

interface AIWinsTodayProps {
  /** Full payload from fetchDashboardData (carries `summary` + top-level counts). */
  data?: DashboardSummary & { summary?: DashboardSummary };
  isLoading?: boolean;
}

const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.75 w-3.75">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8" />
  </svg>
);
const MsgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.75 w-3.75">
    <path d="M20 12a8 8 0 0 1-12.2 6.8L4 20l1.2-3.8A8 8 0 1 1 20 12z" />
  </svg>
);
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.75 w-3.75">
    <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />
  </svg>
);
const CalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.75 w-3.75">
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

const WinTile: React.FC<{ value: string | number; label: string; icon: React.ReactNode }> = ({ value, label, icon }) => (
  <div className="flex items-center gap-2.5">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-[#fae6d6] bg-white text-[#c0530f]">
      {icon}
    </span>
    <div>
      <div className="text-2xl font-extrabold leading-none tracking-tight text-[#211a14]">{value}</div>
      <div className="mt-1 text-[11.5px] font-medium text-[#6a5d50]">{label}</div>
    </div>
  </div>
);

const AIWinsToday: React.FC<AIWinsTodayProps> = ({ data, isLoading }) => {
  if (isLoading && data == null) {
    return (
      <div className="animate-pulse rounded-2xl border border-[#fae6d6] bg-[#fff7ee] p-4.5">
        <div className="mb-3 h-3 w-28 rounded bg-orange-200" />
        <div className="grid grid-cols-2 gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[9px] bg-orange-200" />
              <div className="space-y-1.5">
                <div className="h-5 w-10 rounded bg-orange-200" />
                <div className="h-3 w-16 rounded bg-orange-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const summary = data?.summary ?? {};
  const replies = toNumber(summary.total_replies ?? data?.total_replies);
  const qualified = toNumber(summary.hot_leads ?? data?.hot_leads);
  const followUps = toNumber(summary.ai_followups_sent ?? data?.ai_followups_sent ?? data?.new_conversations);
  const booked = toNumber(summary.ai_appointments ?? data?.ai_appointments ?? summary.appointments ?? data?.appointments);
  const hours = Number(summary.time_saved_hours ?? data?.time_saved_hours ?? 0);

  const wins = [
    { value: replies, label: "Replies sent", icon: <MsgIcon /> },
    { value: qualified, label: "Leads qualified", icon: <SparkleIcon /> },
    { value: followUps, label: "AI follow-ups sent", icon: <RefreshIcon /> },
    { value: booked, label: "Showings booked", icon: <CalIcon /> },
  ];

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[#fae6d6] p-4.5"
      style={{ background: "linear-gradient(135deg, #fff7ee 0%, #ffffff 70%)" }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
        style={{ background: "radial-gradient(circle, #ffd9b8 0%, transparent 70%)" }}
      />
      <div className="relative mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#c0530f]">
          <SparkleIcon />
          <span className="text-[11px] font-bold tracking-[0.04em]">AI WINS TODAY</span>
        </div>
        {hours > 0 && (
          <span className="text-[11px] font-semibold text-[#99410c]">Saved you ~{hours}h</span>
        )}
      </div>
      <div className="relative grid grid-cols-2 gap-3.5">
        {wins.map((w, i) => (
          <WinTile key={i} value={w.value} label={w.label} icon={w.icon} />
        ))}
      </div>
    </div>
  );
};

export default AIWinsToday;
