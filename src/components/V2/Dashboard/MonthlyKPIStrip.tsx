import React from "react";
import type { OrgKpiGoals } from "@/helpers/backend";

type NumLike = number | string | null | undefined;

interface DashboardSummary {
  estimated_pipeline_value?: NumLike;
  hot_leads?: NumLike;
  appointments?: NumLike;
  ai_appointments?: NumLike;
  deals_closed?: NumLike;
  closed_deals?: NumLike;
}

interface MonthlyKPIStripProps {
  /** Full payload from fetchDashboardData (carries `summary` + top-level counts). */
  data?: DashboardSummary & { summary?: DashboardSummary };
  /** Hot-leads endpoint payload (array or { count }) - recent hot count. */
  hotLeadsCount?: number;
  /** Live count of leads currently awaiting a human reply (Needs Reply queue). */
  needsReplyCount?: number;
  /** Per-org configurable monthly goals from /orgs/:id/kpi-goals (0 = unset). */
  goals?: OrgKpiGoals | null;
  /** Opens the goal editor. When omitted, the edit affordance is hidden. */
  onEditGoals?: () => void;
  /** Open the inbox filtered to the Needs Reply queue (Needs Reply KPI click). */
  onOpenNeedsReply?: () => void;
  isLoading?: boolean;
}

const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatCompactMoney = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);
const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8" />
  </svg>
);
const CalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 opacity-70">
    <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />
  </svg>
);
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);
const InboxIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.5-7z" />
  </svg>
);
const ChevLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const ChevRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

interface KPICardConfig {
  label: string;
  value: string | number;
  /** Optional real delta line (e.g. "3 booked by AI"). Hidden when empty. */
  delta?: string;
  /** Tone of the delta line: green (up) by default, red (down), or neutral ink. */
  deltaTone?: "up" | "down" | "info";
  /** Configured goal target. 0/undefined hides the progress bar + goal label. */
  goalValue?: number;
  current: number;
  goalLabel?: string;
  icon: React.ReactNode;
  /** When provided, the whole card is a button (e.g. Needs Reply -> inbox). */
  onClick?: () => void;
  /** Opens the goal editor from the "Set goal" affordance when no goal is set. */
  onSetGoal?: () => void;
}

const deltaToneClass = (tone: KPICardConfig["deltaTone"]): string => {
  if (tone === "down") return "text-[#c0392b]";
  if (tone === "info") return "text-[#6a5d50]";
  return "text-[#1f7a52]";
};

const KPICard: React.FC<KPICardConfig> = ({ label, value, delta, deltaTone, current, goalValue, goalLabel, icon, onClick, onSetGoal }) => {
  const hasGoal = (goalValue ?? 0) > 0;
  const progress = hasGoal ? Math.min(100, Math.round((current / (goalValue as number)) * 100)) : 0;
  const interactive = Boolean(onClick);
  const Wrapper: React.ElementType = interactive ? "button" : "div";
  return (
    <Wrapper
      {...(interactive ? { type: "button", onClick } : {})}
      className={`rounded-[18px] border border-[#EAEAEA] bg-white p-4 text-left shadow-[0_1px_2px_rgba(50,35,20,0.03)]${
        interactive ? " w-full transition hover:bg-[#faf7f2]" : ""
      }`}
    >
      <div className="flex items-center gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF4EC] text-[#C0530F]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8c7d6f]">{label}</div>
          <div className="mt-0.5 text-[28px] font-extrabold leading-none tracking-tight text-[#211a14]">{value}</div>
          {delta ? <div className={`mt-1 text-[11.5px] font-semibold ${deltaToneClass(deltaTone)}`}>{delta}</div> : null}
        </div>
      </div>
      {hasGoal ? (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#f4efe8]">
            <div className="h-full rounded-full bg-[#FF6B35]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] font-semibold text-[#8c7d6f]">
            <span>{progress}% of goal</span>
            <span>{goalLabel}</span>
          </div>
        </div>
      ) : onSetGoal ? (
        <div className="mt-3">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onSetGoal();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onSetGoal();
              }
            }}
            className="cursor-pointer text-[11px] font-semibold text-[#C0530F] hover:underline"
          >
            Set goal
          </span>
        </div>
      ) : null}
    </Wrapper>
  );
};

const MonthlyKPIStrip: React.FC<MonthlyKPIStripProps> = ({ data, hotLeadsCount, needsReplyCount, goals, onEditGoals, onOpenNeedsReply, isLoading }) => {
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  // Month navigation. Only months with persisted history are navigable. There is
  // no monthly-snapshot backend yet, so the only month with data is the current
  // one - both arrows are disabled until snapshots land.
  // TODO: monthly snapshot persistence - load prior/next month KPIs from a
  // snapshot endpoint and enable the arrow whose direction has history.
  const hasPrevMonth = false;
  const hasNextMonth = false; // future months never have data

  if (isLoading && data == null) {
    return (
      <div className="animate-pulse">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="h-3 w-44 rounded bg-gray-200" />
          <div className="h-7 w-40 rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-[18px] border border-[#EAEAEA] bg-white p-4">
              <div className="flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-16 rounded bg-gray-200" />
                  <div className="h-6 w-20 rounded bg-gray-200" />
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const summary = data?.summary ?? {};
  const pipeline = toNumber(summary.estimated_pipeline_value ?? data?.estimated_pipeline_value);
  const hot = hotLeadsCount ?? toNumber(summary.hot_leads ?? data?.hot_leads);
  const appointments = toNumber(summary.appointments ?? data?.appointments);
  const aiBooked = toNumber(summary.ai_appointments ?? data?.ai_appointments);
  const deals = toNumber(summary.deals_closed ?? summary.closed_deals ?? data?.deals_closed ?? data?.closed_deals);
  const needsReply = toNumber(needsReplyCount);

  const goalPipeline = toNumber(goals?.goal_pipeline_value);
  const goalHot = toNumber(goals?.goal_hot_leads);
  const goalAppts = toNumber(goals?.goal_appointments);
  const goalDeals = toNumber(goals?.goal_deals_closed);

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#8c7d6f]">This month&apos;s goals</span>
          <span className="text-[11px] text-[#b1a496]">·</span>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#6a5d50]">
            <RefreshIcon /> Resets {monthEnd}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!hasPrevMonth}
              aria-label="Previous month"
              title={hasPrevMonth ? "Previous month" : "No earlier history yet"}
              className="grid h-7 w-7 place-items-center rounded-lg border border-[#EAEAEA] bg-white text-[#6a5d50] transition enabled:hover:bg-[#faf7f2] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevLeft />
            </button>
            <div className="min-w-28 text-center text-[13px] font-semibold text-[#211a14]">{monthLabel}</div>
            <button
              type="button"
              disabled={!hasNextMonth}
              aria-label="Next month"
              title={hasNextMonth ? "Next month" : "No later history yet"}
              className="grid h-7 w-7 place-items-center rounded-lg border border-[#EAEAEA] bg-white text-[#6a5d50] transition enabled:hover:bg-[#faf7f2] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevRight />
            </button>
          </div>
          {onEditGoals ? (
            <button
              type="button"
              onClick={onEditGoals}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[#6a5d50] transition hover:bg-[#faf7f2]"
            >
              <EditIcon /> Set goals
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPICard
          label="Pipeline value"
          value={formatCompactMoney(pipeline)}
          current={pipeline}
          goalValue={goalPipeline}
          goalLabel={`${formatCompactMoney(goalPipeline)} goal`}
          onSetGoal={onEditGoals}
          icon={<BoltIcon />}
        />
        <KPICard
          label="Hot leads"
          value={hot}
          current={hot}
          goalValue={goalHot}
          goalLabel={`${goalHot} goal`}
          onSetGoal={onEditGoals}
          icon={<SparkleIcon />}
        />
        <KPICard
          label="Appointments"
          value={appointments}
          delta={aiBooked > 0 ? `${aiBooked} booked by AI` : undefined}
          deltaTone="info"
          current={appointments}
          goalValue={goalAppts}
          goalLabel={`${goalAppts} goal`}
          onSetGoal={onEditGoals}
          icon={<CalIcon />}
        />
        <KPICard
          label="Deals closed"
          value={deals}
          current={deals}
          goalValue={goalDeals}
          goalLabel={`${goalDeals} goal`}
          onSetGoal={onEditGoals}
          icon={<BoltIcon />}
        />
        <KPICard
          label="Needs reply"
          value={needsReply}
          delta={needsReply > 0 ? "Awaiting your reply" : "All caught up"}
          deltaTone={needsReply > 0 ? "down" : "up"}
          current={needsReply}
          icon={<InboxIcon />}
          onClick={onOpenNeedsReply}
        />
      </div>
    </div>
  );
};

export default MonthlyKPIStrip;
