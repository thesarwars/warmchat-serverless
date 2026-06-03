import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

interface InboxContact {
  id?: number | string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  preview?: string | null;
  last_message?: string | null;
  last_activity_label?: string | null;
  last_activity_at?: string | null;
  last_activity_channel?: string | null;
  total_unread_count?: number | string | null;
  unread_count?: number | string | null;
  intent?: string | null;
  status?: string | null;
}

interface ConversationFeedProps {
  /** fetchInboxContacts payload: { contacts: [...] }. */
  contacts?: { contacts?: InboxContact[] } | InboxContact[];
  isLoading?: boolean;
}

type FeedKind = "reply" | "call" | "ai";
type Tab = "all" | "urgent" | "replies" | "calls" | "ai";

interface Item {
  id: string;
  who: string;
  channel: string;
  text: string;
  when: string;
  urgent: boolean;
  kind: FeedKind;
  leadId: string | number | null;
}

const MsgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M20 12a8 8 0 0 1-12.2 6.8L4 20l1.2-3.8A8 8 0 1 1 20 12z" />
  </svg>
);
const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M5 4h3l1.5 4-2 1.5a12 12 0 0 0 7 7l1.5-2 4 1.5V20a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />
  </svg>
);
const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8" />
  </svg>
);

const KIND_STYLE: Record<FeedKind, { bg: string; fg: string; icon: React.FC }> = {
  reply: { bg: "#e8f1ea", fg: "#1f7a52", icon: MsgIcon },
  call: { bg: "#e9eef8", fg: "#2f6ad0", icon: PhoneIcon },
  ai: { bg: "#fdf4ec", fg: "#c0530f", icon: SparkleIcon },
};

const relativeTime = (iso?: string | null): string => {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.round(Math.abs(Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const channelLabel = (raw?: string | null): { label: string; kind: FeedKind } => {
  const c = String(raw ?? "").toLowerCase();
  if (c.includes("call") || c.includes("phone")) return { label: "Call", kind: "call" };
  if (c.includes("email") || c.includes("mail")) return { label: "Email", kind: "reply" };
  return { label: "SMS", kind: "reply" };
};

const contactName = (c: InboxContact): string => {
  if (c.name) return c.name;
  const n = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return n || c.email || "Lead";
};

const isUrgent = (c: InboxContact): boolean => {
  const status = String(c.status ?? "").toLowerCase();
  const intent = String(c.intent ?? "").toLowerCase();
  return status.includes("hot") || intent === "hot" || Number(c.total_unread_count ?? c.unread_count) > 1;
};

const ConversationFeed: React.FC<ConversationFeedProps> = ({ contacts, isLoading }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("all");

  if (isLoading && contacts == null) {
    return (
      <div className="animate-pulse rounded-[20px] border border-[#EAEAEA] bg-white p-5 shadow-[0_1px_2px_rgba(50,35,20,0.03)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-7 w-40 rounded bg-gray-200" />
          <div className="h-7 w-56 rounded bg-gray-200" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 border-t border-[#ece6dd] py-3 first:border-t-0">
            <div className="h-7.5 w-7.5 rounded-lg bg-gray-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 rounded bg-gray-200" />
              <div className="h-3 w-48 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const list = Array.isArray(contacts) ? contacts : contacts?.contacts ?? [];
  const items: Item[] = list.slice(0, 12).map((c, i) => {
    const { label, kind } = channelLabel(c.last_activity_channel);
    return {
      id: String(c.id ?? `f-${i}`),
      who: contactName(c),
      channel: label,
      text: c.preview ?? c.last_message ?? c.last_activity_label ?? "New activity",
      when: relativeTime(c.last_activity_at),
      urgent: isUrgent(c),
      kind,
      leadId: c.id ?? null,
    };
  });

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "all", label: "All" },
    { id: "urgent", label: "Urgent", count: items.filter((f) => f.urgent).length || undefined },
    { id: "replies", label: "Replies" },
    { id: "calls", label: "Calls" },
    { id: "ai", label: "AI" },
  ];

  const filtered = items.filter((f) => {
    if (tab === "all") return true;
    if (tab === "urgent") return f.urgent;
    if (tab === "ai") return f.kind === "ai";
    if (tab === "calls") return f.kind === "call";
    if (tab === "replies") return f.kind === "reply";
    return true;
  });

  const openLead = (leadId: string | number | null) => {
    if (leadId != null) localStorage.setItem("selectedLeadIdFromDashboard", String(leadId));
    navigate("/inbox");
  };

  return (
    <div className="rounded-[20px] border border-[#EAEAEA] bg-white p-5 shadow-[0_1px_2px_rgba(50,35,20,0.03)]">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#8c7d6f]">Live</div>
          <div className="mt-0.5 text-base font-bold tracking-tight text-[#211a14]">Conversation feed</div>
        </div>
        <div className="flex gap-0.5 rounded-[9px] bg-[#f4efe8] p-0.75">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-2.5 py-1.25 text-[12px] font-semibold transition ${
                tab === t.id ? "bg-white text-[#211a14] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6a5d50]"
              }`}
            >
              {t.label}
              {typeof t.count === "number" && <span className="ml-1 text-[10px] text-[#99410c]">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-3 py-7 text-center text-[13px] text-[#8c7d6f]">Nothing here right now.</div>
      ) : (
        <div className="flex flex-col">
          {filtered.map((f, i) => {
            const style = KIND_STYLE[f.kind];
            const Icon = style.icon;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => openLead(f.leadId)}
                className={`flex items-start gap-3 py-2.5 text-left transition hover:bg-[#faf7f2] ${
                  i > 0 ? "border-t border-[#ece6dd]" : ""
                }`}
              >
                <span
                  className="grid h-7.5 w-7.5 shrink-0 place-items-center rounded-lg"
                  style={{ background: style.bg, color: style.fg }}
                >
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.75">
                    <span className="text-[13px] font-semibold text-[#211a14]">{f.who}</span>
                    <span className="rounded bg-[#f4efe8] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#6a5d50]">
                      {f.channel}
                    </span>
                    {f.urgent && (
                      <span className="rounded bg-[#fde0d3] px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.03em] text-[#99410c]">
                        URGENT
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12.5px] text-[#6a5d50]">{f.text}</div>
                </div>
                {f.when && <div className="mt-0.5 shrink-0 text-[11px] tabular-nums text-[#8c7d6f]">{f.when}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConversationFeed;
