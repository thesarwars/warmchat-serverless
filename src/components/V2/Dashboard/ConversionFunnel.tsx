import React, { useState } from "react";

type NumLike = number | string | null | undefined;

interface ConversionFunnelProps {
  /** fetchDashboardPerformance payload: { funnel: [{ label, count }] }. */
  data?: { funnel?: Array<{ step?: string | null; label?: string | null; count?: NumLike }> };
  /** Called when the user switches the 30/60/90-day range so the parent can refetch. */
  onRangeChange?: (days: 30 | 60 | 90) => void;
  isLoading?: boolean;
}

const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface Step {
  label: string;
  value: number;
  color: string;
}

const COLORS = ["#fff5ed", "#ffe6d0", "#ffc89a", "#fb8d3a", "#e25a09"];
const LABELS = ["New Leads", "Engaged Leads", "Appointments", "Active Clients", "Closed Deals"];

const matchStage = (
  funnel: Array<{ step?: string | null; label?: string | null; count?: NumLike }>,
  stepKey: string,
  ...keywords: string[]
): number | undefined => {
  // Prefer the stable step key the endpoint emits; fall back to a label keyword
  // so the row still renders if the API contract ever drifts.
  const byKey = funnel.find((f) => String(f?.step ?? "") === stepKey);
  if (byKey) return toNumber(byKey.count);
  const m = funnel.find((f) => {
    const l = String(f?.label ?? "").toLowerCase();
    return keywords.some((k) => l.includes(k));
  });
  return m ? toNumber(m.count) : undefined;
};

const ConversionFunnel: React.FC<ConversionFunnelProps> = ({ data, onRangeChange, isLoading }) => {
  const [range, setRange] = useState<30 | 60 | 90>(30);

  const changeRange = (r: 30 | 60 | 90) => {
    setRange(r);
    onRangeChange?.(r);
  };

  const funnel = data?.funnel ?? [];
  // Source each stage from the real funnel only - no fabricated fallbacks.
  const steps: Step[] = [
    matchStage(funnel, "new_leads", "new", "lead"),
    matchStage(funnel, "engaged", "engaged", "contact", "warm"),
    matchStage(funnel, "appointments", "appoint", "showing", "meeting"),
    matchStage(funnel, "active_clients", "active", "client"),
    matchStage(funnel, "closed", "closed", "won", "deal"),
  ].map((real, i) => ({
    label: LABELS[i],
    value: real != null ? real : 0,
    color: COLORS[i],
  }));

  const hasData = steps.some((s) => s.value > 0);
  const max = Math.max(...steps.map((s) => s.value), 1);
  const closeRate = ((steps[steps.length - 1].value / (steps[0].value || 1)) * 100).toFixed(1);

  if (isLoading && data == null) {
    return (
      <div className="animate-pulse rounded-[20px] border border-[#EAEAEA] bg-white p-5 shadow-[0_1px_2px_rgba(50,35,20,0.03)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-7 w-40 rounded bg-gray-200" />
          <div className="h-7 w-28 rounded bg-gray-200" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="mb-2 flex items-center gap-2.5">
            <div className="h-5 w-28 rounded bg-gray-100" />
            <div className="h-5.5 flex-1 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-[#EAEAEA] bg-white p-5 shadow-[0_1px_2px_rgba(50,35,20,0.03)]">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2.5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c7d6f]">Last {range} days</div>
          <div className="mt-0.5 text-base font-bold tracking-tight text-[#211a14]">Pipeline conversion</div>
        </div>
        <div className="flex items-center gap-2">
          {hasData ? (
            <span className="whitespace-nowrap text-[11.5px] font-semibold text-[#1f7a52]">{closeRate}% close rate</span>
          ) : null}
          <div className="flex gap-0.5 rounded-lg bg-[#f4efe8] p-0.75">
            {([30, 60, 90] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => changeRange(r)}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition ${
                  range === r ? "bg-white text-[#211a14] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6a5d50]"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-md border border-dashed border-[#EAEAEA] bg-[#faf7f2] px-4 py-8 text-center">
          <div className="text-[13px] font-semibold text-[#463b31]">No funnel data for this range yet</div>
          <div className="mt-1 text-[12px] text-[#8c7d6f]">
            Lead activity over the last {range} days will appear here.
          </div>
        </div>
      ) : (
      <div className="flex flex-col gap-1.75">
        {steps.map((s, i) => {
          const pct = (s.value / max) * 100;
          const dropPct = i > 0 ? Math.round((s.value / (steps[i - 1].value || 1)) * 100) : 100;
          return (
            <div key={s.label} className="flex items-center gap-2.5">
              <div className="min-w-27 text-[12.5px] font-medium text-[#463b31]">{s.label}</div>
              <div className="relative h-5.5 flex-1 overflow-hidden rounded-md bg-[#faf7f2]">
                <div className="absolute inset-y-0 left-0 rounded-md transition-all" style={{ width: `${pct}%`, background: s.color }} />
                <div
                  className={`absolute inset-0 flex items-center px-2 text-[11.5px] font-bold ${
                    pct > 40 && i >= 3 ? "text-white" : "text-[#211a14]"
                  }`}
                >
                  {s.value.toLocaleString()}
                </div>
              </div>
              <div className="min-w-10.5 text-right text-[11px] text-[#8c7d6f]">{i === 0 ? "-" : `${dropPct}%`}</div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

export default ConversionFunnel;
