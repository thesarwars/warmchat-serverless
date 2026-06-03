import React from "react";
import { useNavigate } from "react-router-dom";
import { useFetch } from "@/helpers/hooks";
import { fetchAiAgents } from "@/helpers/backend";

type AgentColor = "violet" | "blue" | "orange";

interface AgentApi {
  key: string;
  name: string;
  enabled: boolean;
  activity_today: number;
  errors_24h: number;
}

// Static identity (color + icon + route) keyed by agent. The live state
// (enabled, activity counts) comes from /api/ai/agents.
const IDENTITY: Record<string, { color: AgentColor; icon: keyof typeof ICONS }> = {
  assistant: { color: "violet", icon: "assistant" },
  inbound: { color: "blue", icon: "inbound" },
  outbound: { color: "orange", icon: "outbound" },
};

const AssistantIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4.25 w-4.25">
    <path d="M12 2v3" /><rect x="4" y="5" width="16" height="13" rx="3" />
    <circle cx="9" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" />
    <path d="M9 16c.8.5 1.9.8 3 .8s2.2-.3 3-.8" /><path d="M3 11h1M20 11h1" />
  </svg>
);
const ArrowInIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.25 w-4.25">
    <path d="M3 12h13" /><path d="M12 7l5 5-5 5" /><path d="M21 5v14" />
  </svg>
);
const ArrowOutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.25 w-4.25">
    <path d="M3 5v14" /><path d="M8 12h13" /><path d="M17 7l5 5-5 5" />
  </svg>
);

const ICONS = {
  assistant: AssistantIcon,
  inbound: ArrowInIcon,
  outbound: ArrowOutIcon,
};

const COLOR: Record<AgentColor, { bg: string; fg: string }> = {
  violet: { bg: "#efebf9", fg: "#7c5cff" },
  blue: { bg: "#e9eef8", fg: "#2f6fed" },
  orange: { bg: "#fdf4ec", fg: "#FF6B35" },
};

const ORDER = ["assistant", "inbound", "outbound"];

const StatusDot: React.FC<{ on: boolean; color: string }> = ({ on, color }) => (
  <span className="relative inline-flex h-2 w-2">
    <span className="absolute inset-0 rounded-full" style={{ background: on ? color : "#b1a496" }} />
    {on && (
      <span
        className="absolute inset-0 animate-ping rounded-full"
        style={{ background: color, animationDuration: "2s" }}
      />
    )}
  </span>
);

const AgentsPulse: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useFetch<{ agents?: AgentApi[] }>(
    ["ai_agents_pulse"],
    () => fetchAiAgents() as Promise<{ agents?: AgentApi[] }>,
  );

  const agents = (data?.agents ?? [])
    .filter((a) => IDENTITY[a.key])
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

  return (
    <div className="rounded-[20px] border border-[#EAEAEA] bg-white p-5 shadow-[0_1px_2px_rgba(50,35,20,0.03)]">
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#C0530F]">AI Agents</div>
          <div className="mt-1 text-base font-bold tracking-tight text-[#211a14]">Working right now</div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {isLoading && !data ? (
          [0, 1, 2].map((i) => <div key={i} className="h-15 animate-pulse rounded-[11px] border border-[#EAEAEA] bg-gray-50" />)
        ) : agents.length === 0 ? (
          <div className="rounded-[11px] border border-dashed border-[#EAEAEA] bg-[#faf7f2] px-4 py-6 text-center text-[12.5px] text-[#8c7d6f]">
            No AI agents configured yet.
          </div>
        ) : (
          agents.map((a) => {
            const id = IDENTITY[a.key];
            const c = COLOR[id.color];
            const Icon = ICONS[id.icon];
            const hasErrors = a.errors_24h > 0;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => navigate(`/ai/${a.key}`)}
                className="flex items-center gap-3 rounded-[11px] border border-[#EAEAEA] bg-white p-3 text-left transition hover:border-[#d6ccc0]"
              >
                <span className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-[9px]" style={{ background: c.bg, color: c.fg }}>
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-bold text-[#211a14]">{a.name}</span>
                    <span
                      className="inline-flex items-center gap-1 text-[10.5px] font-semibold"
                      style={{ color: a.enabled ? "#1f7a52" : "#8c7d6f" }}
                    >
                      <StatusDot on={a.enabled} color={a.enabled ? "#1f7a52" : "#b1a496"} />
                      {a.enabled ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[#8c7d6f]">
                    {a.activity_today} {a.activity_today === 1 ? "action" : "actions"} today
                    {hasErrors ? <span className="text-[#b91c1c]"> · {a.errors_24h} errors</span> : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AgentsPulse;
