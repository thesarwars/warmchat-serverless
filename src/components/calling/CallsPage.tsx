import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail,
  Search,
  Plus,
  Clock,
  CalendarCheck,
  ListFilter,
  Sparkles,
  X,
} from "lucide-react";
import MainLayout from "../MainLayout";
import { CallDetailPanel } from "./CallDetailPanel";
import { callingApi } from "@/api/calling";
import { useCalling } from "@/context/useCalling";
import { createWcSocket } from "@/utils/wsClient";
import type { CallListType, CallSummary } from "@/types/calling";
import { formatCallTime, formatDuration, sentimentStyle, statusBadge } from "./callFormat";

function buildWsUrl(): string {
  const override = import.meta.env.VITE_CALLING_WS_URL as string | undefined;
  if (override && override.length > 0) return `${override.replace(/\/+$/, "")}/api/calling/ws42`;
  if (typeof window === "undefined") return "";
  const isHttps = window.location.protocol === "https:";
  return `${isHttps ? "wss" : "ws"}://${window.location.hostname}${isHttps ? "" : ":3333"}/api/calling/ws42`;
}

type Filter = { type: CallListType; direction?: "incoming" | "outgoing"; key: string; label: string };

const FILTER_GROUPS: { heading: string; items: Filter[] }[] = [
  {
    heading: "Inbox",
    items: [
      { key: "all", type: "all", label: "All Calls" },
      { key: "missed", type: "missed", label: "Missed Calls" },
      { key: "voicemail", type: "voicemail", label: "Voicemails" },
    ],
  },
];

export default function CallsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [filterKey, setFilterKey] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filter = useMemo(
    () => FILTER_GROUPS.flatMap((g) => g.items).find((f) => f.key === filterKey) ?? FILTER_GROUPS[0].items[0],
    [filterKey],
  );

  const { data: stats } = useQuery({ queryKey: ["call-stats"], queryFn: () => callingApi.getStats() });

  const { data: list, isLoading } = useQuery({
    queryKey: ["calls", filter.type, filter.direction, search],
    queryFn: () =>
      callingApi.listCalls({
        type: filter.type,
        direction: filter.direction,
        search: search || undefined,
        limit: 50,
      }),
  });

  const calls = useMemo(() => list?.calls ?? [], [list]);

  // Auto-select the first call when the list changes and nothing valid is selected.
  useEffect(() => {
    if (calls.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !calls.some((c) => c.id === selectedId)) {
      setSelectedId(calls[0].id);
    }
  }, [calls, selectedId]);

  // Live refresh: the AI pipeline emits `call_insights_ready` when a call's
  // transcript/summary lands. Shares the one underlying socket via ref-counting.
  useEffect(() => {
    const url = buildWsUrl();
    if (!url) return;
    const socket = createWcSocket(url);
    const onReady = (data: unknown) => {
      const callId = (data as { callId?: string })?.callId;
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      if (callId) queryClient.invalidateQueries({ queryKey: ["call-insights", callId] });
    };
    socket.on("call_insights_ready", onReady);
    return () => socket.disconnect();
  }, [queryClient]);

  const content = (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#101828]">Calls</h1>
          <p className="text-sm text-[#667085]">
            AI-powered calling workspace - make calls, recover missed leads, and convert conversations.
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#FF6B35] px-4 py-2 text-sm font-medium text-white hover:bg-[#e65f2f]"
        >
          <Plus className="h-4 w-4" /> Start a Call
        </button>
      </div>

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Phone} label="Total Calls Today" value={stats ? String(stats.totalCalls.today) : "-"}
          sub={deltaLabel(stats?.totalCalls.deltaPct, "vs yesterday")} />
        <StatCard icon={PhoneMissed} label="Missed Calls" value={stats ? String(stats.missed.today) : "-"}
          sub={stats ? `${stats.missed.unrecovered} unrecovered` : ""} />
        <StatCard icon={Voicemail} label="Voicemails Pending" value={stats ? String(stats.voicemails.pending) : "-"}
          sub={stats ? `${stats.voicemails.highPriority} high priority` : ""} />
        <StatCard icon={Clock} label="Avg Call Duration" value={stats ? formatDuration(stats.avgDuration.seconds) : "-"}
          sub={deltaLabel(stats?.avgDuration.deltaPct, "vs last week")} />
        <StatCard icon={CalendarCheck} label="Booked from Calls" value={stats ? String(stats.booked.count) : "-"}
          sub={stats ? `${stats.booked.conversionPct}% conversion` : ""} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr_minmax(320px,420px)]">
        {/* Filter rail */}
        <aside className="space-y-4 rounded-2xl border border-[#EBEBF2] bg-white p-3">
          {FILTER_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="mb-1 px-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#98A2B3]">
                {group.heading}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <button
                      onClick={() => setFilterKey(item.key)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
                        filterKey === item.key
                          ? "bg-[#FFF1EC] font-semibold text-[#FF6B35]"
                          : "text-[#344054] hover:bg-[#F9FAFB]"
                      }`}
                    >
                      <FilterIcon filterKey={item.key} active={filterKey === item.key} />
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {/* List */}
        <section className="rounded-2xl border border-[#EBEBF2] bg-white">
          <div className="flex items-center gap-2 border-b border-[#EBEBF2] p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#EBEBF2] px-2.5 py-1.5">
              <Search className="h-4 w-4 shrink-0 text-[#98A2B3]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search calls..."
                className="min-w-0 flex-1 text-sm outline-none placeholder:text-[#98A2B3]"
              />
            </div>
            <span className="shrink-0 text-xs text-[#98A2B3]">{list?.total ?? 0} calls</span>
          </div>

          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            {isLoading ? (
              <p className="p-6 text-center text-sm text-[#98A2B3]">Loading...</p>
            ) : calls.length === 0 ? (
              <p className="p-6 text-center text-sm text-[#98A2B3]">-</p>
            ) : (
              <ul>
                {calls.map((call) => (
                  <CallRow
                    key={call.id}
                    call={call}
                    selected={call.id === selectedId}
                    onClick={() => setSelectedId(call.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Detail */}
        <section className="rounded-2xl border border-[#EBEBF2] bg-white">
          {selectedId ? (
            <CallDetailPanel callId={selectedId} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-[#98A2B3]">
              Select a call to see details
            </div>
          )}
        </section>
      </div>

      {dialogOpen && <NewCallDialog onClose={() => setDialogOpen(false)} />}
    </>
  );

  // When embedded (e.g. as the Inbox "Calls" tab) the parent already provides
  // the MainLayout chrome, so render the bare content.
  return embedded ? content : <MainLayout title="Calls">{content}</MainLayout>;
}

function deltaLabel(pct: number | null | undefined, suffix: string): string {
  if (pct == null) return "";
  const arrow = pct >= 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(pct)}% ${suffix}`;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Phone; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-[#EBEBF2] bg-white px-4 py-3.5">
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFF1EC]">
        <Icon className="h-4 w-4 text-[#FF6B35]" />
      </div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#98A2B3]">{label}</p>
      <p className="text-[26px] font-extrabold leading-[1.1] text-[#101828]">{value}</p>
      {sub && <p className="text-xs text-[#667085]">{sub}</p>}
    </div>
  );
}

function FilterIcon({ filterKey, active }: { filterKey: string; active: boolean }) {
  const cls = `h-4 w-4 ${active ? "text-[#FF6B35]" : "text-[#98A2B3]"}`;
  switch (filterKey) {
    case "missed":
      return <PhoneMissed className={cls} />;
    case "voicemail":
      return <Voicemail className={cls} />;
    case "incoming":
      return <PhoneIncoming className={cls} />;
    case "outgoing":
      return <PhoneOutgoing className={cls} />;
    case "follow-up":
      return <ListFilter className={cls} />;
    case "ai-task":
      return <Sparkles className={cls} />;
    default:
      return <Phone className={cls} />;
  }
}

function CallRow({ call, selected, onClick }: { call: CallSummary; selected: boolean; onClick: () => void }) {
  const counterparty = call.direction === "INBOUND" ? call.fromNumber : call.toNumber;
  const name = call.leadName || counterparty;
  const badge = statusBadge(call.status, call.isVoicemail);
  const DirIcon = call.isVoicemail ? Voicemail : call.direction === "INBOUND" ? PhoneIncoming : PhoneOutgoing;

  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-start gap-3 border-b border-[#F2F4F7] px-3 py-3 text-left transition ${
          selected ? "bg-[#FFF7F4]" : "hover:bg-[#F9FAFB]"
        }`}
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2F4F7]">
          <DirIcon className="h-4 w-4 text-[#667085]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-[#101828]">{name}</span>
            <span className="shrink-0 text-xs text-[#98A2B3]">{formatCallTime(call.initiatedAt)}</span>
          </div>
          <p className="truncate text-xs text-[#667085]">
            {call.summary || counterparty}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>
            {call.sentiment && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sentimentStyle(call.sentiment)}`}>
                {call.sentiment}
              </span>
            )}
            {call.duration > 0 && <span className="text-[11px] text-[#98A2B3]">{formatDuration(call.duration)}</span>}
          </div>
        </div>
      </button>
    </li>
  );
}

function NewCallDialog({ onClose }: { onClose: () => void }) {
  const { startWebCall, telnyxReady } = useCalling();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!phone.trim()) return;
    setBusy(true);
    try {
      await startWebCall({ phoneNumber: phone.trim(), name: name.trim() || undefined });
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#101828]">Start a Call</h2>
          <button onClick={onClose} className="text-[#98A2B3] hover:text-[#667085]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 123 4567"
            className="w-full rounded-lg border border-[#EBEBF2] px-3 py-2 text-sm focus:border-[#FF6B35] focus:outline-none"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="w-full rounded-lg border border-[#EBEBF2] px-3 py-2 text-sm focus:border-[#FF6B35] focus:outline-none"
          />
          <button
            onClick={start}
            disabled={!phone.trim() || busy || !telnyxReady}
            className="w-full rounded-lg bg-[#FF6B35] px-4 py-2 text-sm font-medium text-white hover:bg-[#e65f2f] disabled:bg-[#D0D5DD]"
          >
            {telnyxReady ? (busy ? "Calling..." : "Call from web") : "Connecting..."}
          </button>
        </div>
      </div>
    </div>
  );
}
