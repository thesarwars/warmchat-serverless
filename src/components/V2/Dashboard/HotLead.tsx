import React from "react";
import { useNavigate } from "react-router-dom";

interface HotLeadRow {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
  direction?: "inbound" | "outbound";
  last_activity_at?: string;
  last_activity_channel?: "email" | "sms";
  last_activity_label?: string;
  intent?: string;
  name?: string;
  subtext?: string;
  role?: string;
  location?: string;
  range?: string;
  score?: number;
  status?: string;
  stage?: string;
  pipeline_stage?: string;
  lead_status?: string;
  appointment_booked?: boolean;
  signals?: { eye?: boolean; cal?: boolean; msg?: boolean; star?: boolean };
}

type LeadsEnvelope =
  | { count?: number; hours?: number; items?: HotLeadRow[] }
  | HotLeadRow[]
  | undefined;

interface HotLeadProps {
  data?: LeadsEnvelope;
  /** Used when the primary hot-leads payload is empty - keeps the table populated. */
  fallbackLeads?: LeadsEnvelope;
  /** Show loading skeleton while data is being fetched for the first time. */
  isLoading?: boolean;
  onReplayNow?: (leadId: string | number) => void;
  /** Star signal → toggle the lead's hot mark. `currentlyHot` lets the parent confirm before removing. */
  onMarkHot?: (leadId: string | number, currentlyHot: boolean) => void;
  /** Calendar signal → open the booking flow for the lead. */
  onBook?: (leadId: string | number) => void;
  /** Eye signal → open the lead in the Leads page. */
  onViewLead?: (leadId: string | number) => void;
}

const extractLeads = (data: LeadsEnvelope): HotLeadRow[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  return [];
};

const FlameIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M12 2c1.5 4 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5C10 9 11 7 12 2z" />
  </svg>
);

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const MsgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const StarIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
    <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2" />
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.75 w-3.75">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const MsgIconLg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.75 w-3.75">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const getInitials = (firstName?: string, lastName?: string): string => {
  const first = String(firstName || "").trim();
  const last = String(lastName || "").trim();
  if (!first && !last) return "?";
  if (first && !last) return first.slice(0, 2).toUpperCase();
  if (!first && last) return last.slice(0, 2).toUpperCase();
  return `${first[0] || ""}${last[0] || ""}`.toUpperCase();
};

const isHotLead = (lead: HotLeadRow): boolean => {
  const status   = String(lead.status ?? "").toLowerCase();
  const stage    = String(lead.stage ?? lead.pipeline_stage ?? "").toLowerCase();
  // "intent" is the WarmChats lead-temperature field; backend may also return it as "lead_status"
  const intent   = String(lead.intent ?? lead.lead_status ?? "").toLowerCase();
  return (
    status.includes("hot") ||
    stage.includes("hot")  ||
    intent === "hot"        ||
    intent.includes("hot")
  );
};

const inferScore = (lead: HotLeadRow, fallback: number): number => {
  if (typeof lead.score === "number") return lead.score;
  if (isHotLead(lead)) return Math.min(98, 90 + fallback);
  const intent = String(lead.intent ?? lead.last_activity_label ?? "").toLowerCase();
  if (intent.includes("high") || intent.includes("urgent")) return 88 + fallback;
  if (intent.includes("medium")) return 65 + fallback;
  if (intent.includes("low")) return 42 + fallback;
  return Math.max(20, 92 - fallback * 7);
};

const scoreClass = (score: number): { stroke: string; label: string } => {
  if (score >= 80) return { stroke: "#10B981", label: "Very High" };
  if (score >= 60) return { stroke: "#3B82F6", label: "High" };
  if (score >= 40) return { stroke: "#F59E0B", label: "Medium" };
  return { stroke: "#9CA0B8", label: "Low" };
};

const inferSignals = (lead: HotLeadRow): { eye: boolean; cal: boolean; msg: boolean; star: boolean } => {
  if (lead.signals) {
    return {
      eye: !!lead.signals.eye,
      cal: !!lead.signals.cal,
      msg: !!lead.signals.msg,
      star: !!lead.signals.star,
    };
  }
  const channel = String(lead.last_activity_channel ?? "").toLowerCase();
  const label = String(lead.last_activity_label ?? "").toLowerCase();
  return {
    eye: label.includes("view") || label.includes("open"),
    cal: label.includes("tour") || label.includes("appoint") || label.includes("book") || !!lead.appointment_booked,
    msg: channel === "sms" || channel === "email" || label.includes("repl"),
    star: label.includes("save") || label.includes("favor") || isHotLead(lead),
  };
};

const relativeTime = (iso?: string): string => {
  if (!iso) return "-";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "-";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
};

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 16;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(Math.max(score, 0), 100) / 100) * c;
  const { stroke, label } = scoreClass(score);
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-10 w-10">
        <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
          <circle cx="20" cy="20" r={r} fill="none" stroke="#EBEBF2" strokeWidth="3" />
          <circle cx="20" cy="20" r={r} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[12.5px] font-extrabold text-[#15172B]">{score}</div>
      </div>
      <span className="whitespace-nowrap text-[11.5px] font-bold text-[#3B3D5A]">{label}</span>
    </div>
  );
};

const Signal: React.FC<{
  on: boolean;
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ on, title, onClick, children }) => (
  <button
    type="button"
    title={title}
    onClick={(e) => {
      e.stopPropagation();
      onClick?.();
    }}
    className={`relative flex h-6.5 w-6.5 items-center justify-center rounded-md border transition hover:border-[#FB923C] hover:text-[#FB923C] ${
      on ? "border-transparent bg-[#FFF4EB] text-[#FB923C]" : "border-[#EBEBF2] bg-[#FAFAFD] text-[#6E7191]"
    }`}
  >
    {children}
    {on && <span className="absolute -top-0.5 -right-0.5 h-1.75 w-1.75 rounded-full bg-[#FB923C] ring-[1.5px] ring-white" />}
  </button>
);

const HotLead: React.FC<HotLeadProps> = ({
  data,
  fallbackLeads,
  isLoading,
  onReplayNow,
  onMarkHot,
  onBook,
  onViewLead,
}) => {
  const navigate = useNavigate();
  const primary = extractLeads(data); // recent unreplied inbound
  const fallback = extractLeads(fallbackLeads); // full org leads list

  // FIXED: Only show explicitly hot leads (status/intent = hot).
  // Recent inbound (primary) is a secondary fallback when no explicit hot leads exist.
  const seen = new Set<string>();
  const explicitlyHot: HotLeadRow[] = [];
  for (const lead of [...primary, ...fallback]) {
    const key = String(lead.id);
    if (seen.has(key)) continue;
    seen.add(key);
    if (isHotLead(lead)) {
      explicitlyHot.push(lead);
    }
  }

  const leads = (
    explicitlyHot.length > 0 ? explicitlyHot :
    primary.length > 0 ? primary :
    fallback
  )
    .sort((a, b) => {
      // Explicitly hot leads first
      const diff = Number(isHotLead(b)) - Number(isHotLead(a));
      if (diff !== 0) return diff;
      // Then by most recent activity
      const tA = new Date(a.last_activity_at || "").getTime() || 0;
      const tB = new Date(b.last_activity_at || "").getTime() || 0;
      return tB - tA;
    })
    .slice(0, 4);
  const hasLeads = leads.length > 0;

  const getDisplayName = (lead: HotLeadRow): string => {
    if (lead.name) return lead.name;
    const firstName = lead.first_name || "";
    const lastName = lead.last_name || "";
    return `${firstName} ${lastName}`.trim() || "Unknown Lead";
  };

  const handleSelect = (lead: HotLeadRow) => {
    if (onReplayNow) onReplayNow(lead.id);
    else navigate("/leads");
  };

  // Loading skeleton
  if (isLoading && !hasLeads) {
    return (
      <div className="rounded-2xl border border-[#EBEBF2] bg-white pb-2 animate-pulse">
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-3">
          <span className="h-5.5 w-5.5 rounded-md bg-gray-200" />
          <span className="h-3.5 w-20 rounded-md bg-gray-200" />
          <span className="ml-1 h-3 w-28 rounded-md bg-gray-100" />
          <span className="ml-auto h-3 w-20 rounded-md bg-gray-100" />
        </div>
        <div className="hidden md:block">
          <div className="grid grid-cols-5 gap-3 border-b border-[#EBEBF2] px-3.5 pb-3">
            {["Lead","AI Score","Intent Signals","Last Activity","Best Action"].map(h => (
              <div key={h} className="h-3 w-16 rounded bg-gray-200" />
            ))}
          </div>
          {[0,1,2,3].map((i) => (
            <div key={i} className="grid grid-cols-5 items-center gap-3 border-b border-[#EBEBF2] px-3.5 py-4 last:border-b-0">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-16 rounded bg-gray-100" />
                </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-gray-200" />
              <div className="flex gap-1.5">
                {[0,1,2,3].map(j => <div key={j} className="h-6.5 w-6.5 rounded-md bg-gray-200" />)}
              </div>
              <div className="space-y-1.5">
                <div className="h-3.5 w-12 rounded bg-gray-200" />
                <div className="h-3 w-16 rounded bg-gray-100" />
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <div className="h-8 w-8 rounded-md bg-gray-200" />
                <div className="h-8 w-8 rounded-md bg-gray-200" />
                <div className="h-8 w-16 rounded-md bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
        <ul className="flex flex-col gap-2 px-2 pb-2 md:hidden">
          {[0,1,2,3].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-[#F0F0F0] p-2.5">
              <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-28 rounded bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-100" />
              </div>
              <div className="h-10 w-10 rounded-full bg-gray-200" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#EBEBF2] bg-white pb-2">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3">
        <span className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md bg-[#FFE8E0] text-[#C2410C]">
          <FlameIcon />
        </span>
        <h3 className="text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-[#15172B]">Hot Leads</h3>
        <span className="ml-1 whitespace-nowrap text-[11.5px] font-semibold text-[#6E7191]">Sorted by AI score</span>
        <button
          type="button"
          onClick={() => navigate("/leads")}
          className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#FB923C]"
        >
          View all leads <ArrowRight />
        </button>
      </div>

      {!hasLeads ? (
        <div className="m-4 rounded-xl border border-dashed border-[#EBEBF2] px-4 py-10 text-center">
          <p className="text-sm font-semibold text-[#15172B]">No hot leads yet</p>
          <p className="mt-1 text-xs text-[#6E7191]">Hot leads appear here when contacts reply to your messages.</p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <ul className="flex flex-col gap-2 px-2 pb-2 md:hidden">
            {leads.slice(0, 4).map((l, i) => {
              const score = inferScore(l, i);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(l)}
                    className="flex w-full items-center gap-3 rounded-xl border border-[#F0F0F0] p-2.5 text-left transition hover:bg-[#FAFAFD]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#EBEBF2] bg-[#FAFAFD] text-[12.5px] font-bold text-[#C5C7D6]">
                      {getInitials(l.first_name, l.last_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#15172B]">{getDisplayName(l)}</p>
                      <p className="truncate text-xs text-[#6E7191]">{l.last_activity_label || l.company || l.email || "-"}</p>
                    </div>
                    <ScoreRing score={score} />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-180 border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-[#EBEBF2] px-3.5 pt-2 pb-3 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#6E7191]">Lead</th>
                <th className="border-b border-[#EBEBF2] px-3.5 pt-2 pb-3 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#6E7191]">AI Score</th>
                <th className="border-b border-[#EBEBF2] px-3.5 pt-2 pb-3 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#6E7191]">Intent Signals</th>
                <th className="border-b border-[#EBEBF2] px-3.5 pt-2 pb-3 text-left text-[10.5px] font-extrabold uppercase tracking-wider text-[#6E7191]">Last Activity</th>
                <th className="border-b border-[#EBEBF2] px-3.5 pt-2 pb-3 text-right text-[10.5px] font-extrabold uppercase tracking-wider text-[#6E7191]">Best Action</th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 4).map((l, i) => {
                const score = inferScore(l, i);
                const signals = inferSignals(l);
                const last = relativeTime(l.last_activity_at);
                return (
                  <tr key={l.id} className="transition hover:bg-[#FAFAFD]">
                    <td className="border-b border-[#EBEBF2] px-3.5 py-4 align-middle [tr:last-child_&]:border-b-0">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#EBEBF2] bg-[#FAFAFD] text-[12.5px] font-bold text-[#C5C7D6]">
                          {getInitials(l.first_name, l.last_name)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-[#15172B]">
                            <span className="truncate">{getDisplayName(l)}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[11.5px] text-[#6E7191]">
                            {l.last_activity_label || l.company || l.email || "-"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-[#EBEBF2] px-3.5 py-4 align-middle [tr:last-child_&]:border-b-0">
                      <ScoreRing score={score} />
                    </td>
                    <td className="border-b border-[#EBEBF2] px-3.5 py-4 align-middle [tr:last-child_&]:border-b-0">
                      <div className="flex gap-1.5">
                        <Signal on={signals.eye} title="View lead" onClick={() => onViewLead?.(l.id)}><EyeIcon /></Signal>
                        <Signal on={signals.cal} title="Book a showing" onClick={() => onBook?.(l.id)}><CalIcon /></Signal>
                        <Signal on={signals.msg} title="Message" onClick={() => handleSelect(l)}><MsgIcon /></Signal>
                        <Signal on={signals.star} title={isHotLead(l) ? "Remove hot mark" : "Mark as hot"} onClick={() => onMarkHot?.(l.id, isHotLead(l))}><StarIcon /></Signal>
                      </div>
                    </td>
                    <td className="border-b border-[#EBEBF2] px-3.5 py-4 align-middle [tr:last-child_&]:border-b-0">
                      <div className="text-xs font-bold text-[#15172B]">{last}</div>
                      <div className="mt-0.5 text-[11.5px] text-[#6E7191]">{l.last_activity_label ?? "-"}</div>
                    </td>
                    <td className="border-b border-[#EBEBF2] px-3.5 py-4 align-middle [tr:last-child_&]:border-b-0 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Message"
                          onClick={() => handleSelect(l)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#EBEBF2] bg-white text-[#3B3D5A] transition hover:border-transparent hover:bg-[#FFF4EB] hover:text-[#FB923C]"
                        >
                          <MsgIconLg />
                        </button>
                        <button
                          type="button"
                          title="Call"
                          onClick={() => handleSelect(l)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#EBEBF2] bg-white text-[#3B3D5A] transition hover:border-transparent hover:bg-[#FFF4EB] hover:text-[#FB923C]"
                        >
                          <PhoneIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => onBook?.(l.id)}
                          className="h-8 rounded-md bg-[#FB923C] px-3 text-[12.5px] font-bold text-white transition hover:bg-[#EA6D0C]"
                        >
                          Book
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#EBEBF2] px-4 py-3.5 text-[11.5px] text-[#6E7191] md:flex">
            <span className="font-bold text-[#3B3D5A]">AI Score:</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />80+ Very High</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />60-79 High</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />40-59 Medium</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#9CA0B8]" />Below 40 Low</span>
            <span className="ml-auto">Scores update every 30 minutes</span>
          </div>
        </>
      )}
    </div>
  );
};

export default HotLead;
