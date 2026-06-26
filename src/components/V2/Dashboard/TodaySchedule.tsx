import React from "react";
import { useNavigate } from "react-router-dom";

interface TodayScheduleProps {
  data?: {
    upcoming_appointments?: ApiAppointment[];
    schedule_today?: ApiAppointment[];
  };
  isLoading?: boolean;
}

type ApiAppointment = {
  id?: number;
  lead_id?: number | null;
  title?: string;
  starts_at?: string | null;
  meeting_type?: string | null;
  status?: string | null;
  with_name?: string | null;
  notes?: string | null;
  external_meeting_url?: string | null;
  /** True when the appointment was booked by the AI (renders a "BY AI" pill). */
  by_ai?: boolean | null;
};

const CalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const MapPinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 text-[#6E7191]">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const NoteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 text-[#6E7191]">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const formatTime = (iso?: string | null): string => {
  if (!iso) return "-";
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "-";
  return t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const TodaySchedule: React.FC<TodayScheduleProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading && data == null) {
    return (
      <div className="rounded-2xl border border-[#EBEBF2] bg-white animate-pulse">
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 border-b border-[#EBEBF2]">
          <div className="h-5.5 w-5.5 rounded-md bg-gray-200" />
          <div className="h-3.5 w-28 rounded bg-gray-200" />
          <div className="ml-auto h-3 w-16 rounded bg-gray-100" />
        </div>
        <div className="divide-y divide-[#EBEBF2]">
          {[0,1,2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-gray-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-32 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-100" />
              </div>
              <div className="h-6 w-16 rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const raw: ApiAppointment[] = data?.upcoming_appointments ?? data?.schedule_today ?? [];

  const today = new Date();
  const nowMs = today.getTime();
  const TERMINAL = new Set(["cancelled", "canceled", "completed", "done", "no_show", "no-show"]);
  const items = raw
    // Upcoming only: drop anything whose start time has already passed, plus any
    // cancelled/completed/no-show appointment. The card shows only what the user
    // still needs to attend or prepare for; it re-evaluates on every 30s refetch.
    .filter((a) => {
      const t = a.starts_at ? new Date(a.starts_at).getTime() : NaN;
      if (!Number.isFinite(t) || t < nowMs) return false;
      return !TERMINAL.has(String(a.status ?? "").toLowerCase());
    })
    .map((a) => {
      const startsAt = a.starts_at ? new Date(a.starts_at) : null;
      const isToday = startsAt && Number.isFinite(startsAt.getTime()) && isSameDay(startsAt, today);
      const timeStr = startsAt && Number.isFinite(startsAt.getTime()) ? formatTime(a.starts_at) : "";
      const dateStr = !startsAt
        ? ""
        : isToday
          ? "Today"
          : startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const subParts = [a.with_name, a.meeting_type].filter(Boolean) as string[];
      return {
        id: a.id,
        time: timeStr,
        date: dateStr,
        title: a.title || "Appointment",
        sub: subParts.join(" · "),
        address: a.external_meeting_url?.trim() || null,
        notes: a.notes?.trim() || null,
        leadId: a.lead_id ?? undefined,
        isToday: !!isToday,
        byAi: !!a.by_ai,
        startsAt,
      };
    })
    .sort((x, y) => (x.startsAt?.getTime() ?? 0) - (y.startsAt?.getTime() ?? 0));

  const handleOpen = (leadId?: number) => {
    if (leadId != null) {
      localStorage.setItem("selectedLeadIdFromDashboard", String(leadId));
      navigate("/inbox");
    } else {
      navigate("/appointments");
    }
  };

  return (
    <div className="flex max-h-120 min-h-65 flex-col overflow-hidden rounded-2xl border border-[#EBEBF2] bg-white">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3.5 pb-3">
        <span className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md bg-[#FFF7ED] text-[#F97316]">
          <CalIcon />
        </span>
        <h3 className="text-[12.5px] font-extrabold uppercase tracking-[0.04em] text-[#15172B]">Upcoming Schedule</h3>
        <button
          type="button"
          onClick={() => navigate("/appointments")}
          className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#F97316]"
        >
          Open calendar <ArrowRight />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="m-4 rounded-xl border border-dashed border-[#EBEBF2] px-4 py-10 text-center">
          <p className="text-sm font-semibold text-[#15172B]">Nothing scheduled yet</p>
          <p className="mt-1 text-xs text-[#6E7191]">Booked appointments will show up here.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          {items.map((s, i) => (
            <div
              key={s.id ?? i}
              className={`grid grid-cols-[72px_minmax(0,1fr)_auto] items-start gap-2.5 py-3 ${
                i > 0 ? "border-t border-[#EBEBF2]" : ""
              }`}
            >
              {/* Time + date label */}
              <div className="flex flex-col items-start tabular-nums pt-0.5">
                <span className="text-[12.5px] font-extrabold text-[#15172B] leading-tight">{s.time}</span>
                <span className={`text-[10px] font-extrabold uppercase tracking-wider leading-tight mt-0.5 ${s.isToday ? "text-[#F97316]" : "text-[#6E7191]"}`}>
                  {s.date}
                </span>
              </div>

              {/* Main info */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-[12.5px] font-bold leading-tight text-[#15172B]">
                    {s.title}
                  </div>
                  {s.byAi && (
                    <span className="shrink-0 rounded bg-[#FFF7ED] px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-[0.03em] text-[#EA580C]">
                      BY AI
                    </span>
                  )}
                </div>
                {s.sub && (
                  <div className="mt-0.5 truncate text-[11px] text-[#6E7191]">{s.sub}</div>
                )}
                {s.address && (
                  <div className="mt-1 flex items-center gap-1 min-w-0">
                    <MapPinIcon />
                    <span className="truncate text-[11px] text-[#6E7191]">{s.address}</span>
                  </div>
                )}
                {s.notes && (
                  <div className="mt-0.5 flex items-start gap-1 min-w-0">
                    <NoteIcon />
                    <span className="line-clamp-2 text-[11px] text-[#6E7191] italic">{s.notes}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleOpen(s.leadId)}
                className="mt-0.5 h-7 rounded-md bg-[#FFF7ED] px-2.5 text-[11.5px] font-bold text-[#EA580C] transition hover:bg-[#FFEDD5]"
              >
                Open
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TodaySchedule;
