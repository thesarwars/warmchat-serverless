import React from "react";
import { useNavigate } from "react-router-dom";

interface PriorityItem {
  lead_id?: number | string | null;
  id?: number | string | null;
  channel?: string | null;
  priority?: string | null;
  created_at?: string | null;
  last_activity_at?: string | null;
  title?: string | null;
  description?: string | null;
  name?: string | null;
  score?: number | null;
}

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

interface NeedsReplyProps {
  /** fetchDashboardPriroty payload: { items: [...] } - primary source. */
  priority?: { items?: PriorityItem[] };
  /** fetchInboxContacts payload: { contacts: [...] } - fallback source. */
  contacts?: { contacts?: InboxContact[] } | InboxContact[];
  /**
   * The TRUE needs-reply count (DashboardV2 derives it from the inbox's
   * per-contact needs_reply, identical to the inbox "Needs Reply" chip). The
   * headline + "View all" use THIS, not the mixed priority-feed length, so the
   * card's number matches both the inbox queue it deep-links to and the
   * WaitingBanner - the whole point of the sync fix. The list below still shows
   * the broader "most important right now" priority feed.
   */
  needsReplyCount?: number;
  isLoading?: boolean;
}

interface Row {
  id: string;
  name: string;
  score: number;
  title: string;
  meta: string;
  channel: string;
  cta: string;
  urgent: boolean;
  leadId: string | number | null;
}

const MsgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4.25 w-4.25">
    <path d="M20 12a8 8 0 0 1-12.2 6.8L4 20l1.2-3.8A8 8 0 1 1 20 12z" />
  </svg>
);
const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4.25 w-4.25">
    <path d="M5 4h3l1.5 4-2 1.5a12 12 0 0 0 7 7l1.5-2 4 1.5V20a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const relativeTime = (iso?: string | null): string => {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.round(Math.abs(Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
};

const channelLabel = (raw?: string | null): string => {
  const c = String(raw ?? "").toLowerCase();
  if (c.includes("call") || c.includes("phone")) return "Call";
  if (c.includes("email") || c.includes("mail")) return "Email";
  if (c.includes("sms") || c.includes("text")) return "SMS";
  return "SMS";
};

const ctaFor = (channel: string, urgent: boolean): string => {
  if (channel === "Call") return "Call now";
  if (urgent) return "Review draft";
  return "Reply";
};

const scoreBadgeClass = (score: number): string => {
  if (score >= 90) return "bg-[#fde0d3] text-[#c0392b]";
  if (score >= 75) return "bg-[#fdf4ec] text-[#c0530f]";
  return "bg-[#f4efe8] text-[#6a5d50]";
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

const NeedsReply: React.FC<NeedsReplyProps> = ({ priority, contacts, needsReplyCount, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading && priority == null && contacts == null) {
    return (
      <div className="animate-pulse rounded-[20px] border border-[#EAEAEA] bg-white p-5 shadow-[0_1px_2px_rgba(50,35,20,0.03)]">
        <div className="mb-4 h-7 w-40 rounded bg-gray-200" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3.5 border-t border-[#ece6dd] py-3.5 first:border-t-0">
            <div className="h-9 w-9 rounded-[10px] bg-gray-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-40 rounded bg-gray-200" />
              <div className="h-3 w-28 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-20 rounded-lg bg-gray-200" />
          </div>
        ))}
      </div>
    );
  }

  // Build rows. Prefer the priority-actions feed; fall back to inbox contacts.
  let rows: Row[];
  const priorityItems = priority?.items ?? [];
  if (priorityItems.length > 0) {
    rows = priorityItems.map((it, i) => {
      const p = String(it.priority ?? "").toLowerCase();
      const urgent = p === "high" || p === "urgent";
      const channel = channelLabel(it.channel);
      const score = typeof it.score === "number" ? it.score : urgent ? 94 - i * 2 : 78 - i * 6;
      const leadId = it.lead_id ?? it.id ?? null;
      return {
        id: String(leadId ?? `pr-${i}`),
        name: it.name ?? it.title ?? "Lead",
        score: Math.max(40, Math.min(99, score)),
        title: it.description ?? it.title ?? "Waiting on a reply",
        meta: relativeTime(it.created_at ?? it.last_activity_at),
        channel,
        cta: ctaFor(channel, urgent),
        urgent,
        leadId,
      };
    });
  } else {
    const list = Array.isArray(contacts) ? contacts : contacts?.contacts ?? [];
    rows = list
      .filter((c) => Number(c.total_unread_count ?? c.unread_count) > 0 || isUrgent(c))
      .map((c, i) => {
        const urgent = isUrgent(c);
        const channel = channelLabel(c.last_activity_channel);
        return {
          id: String(c.id ?? `c-${i}`),
          name: contactName(c),
          score: urgent ? 92 - i * 2 : 74 - i * 5,
          title: c.preview ?? c.last_message ?? c.last_activity_label ?? "Waiting on a reply",
          meta: relativeTime(c.last_activity_at),
          channel,
          cta: ctaFor(channel, urgent),
          urgent,
          leadId: c.id ?? null,
        };
      });
  }

  // Headline count = the TRUE needs-reply count (matches the inbox chip + the
  // queue "View all" opens). Fall back to the row count only if the parent didn't
  // pass it. The list itself (`top`) still shows the broader priority feed.
  const total = typeof needsReplyCount === "number" ? needsReplyCount : rows.length;
  const urgentCount = Math.min(rows.filter((r) => r.urgent).length, total);
  const top = rows.slice(0, 3);

  const openLead = (leadId: string | number | null) => {
    if (leadId != null) localStorage.setItem("selectedLeadIdFromDashboard", String(leadId));
    navigate("/inbox");
  };

  return (
    <div className="rounded-[20px] border border-[#EAEAEA] bg-white p-5 shadow-[0_1px_2px_rgba(50,35,20,0.03)]">
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#C0530F]">Needs reply</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-bold leading-none tracking-tight text-[#211a14]">{total}</span>
            <span className="text-sm font-medium text-[#6a5d50]">people waiting</span>
            {urgentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#c0392b]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#c0392b]" />
                {urgentCount} urgent
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/inbox?filter=needs_reply")}
          className="whitespace-nowrap rounded-lg border border-[#EAEAEA] bg-white px-2.5 py-1.5 text-xs font-medium text-[#463b31] transition hover:bg-[#faf7f2]"
        >
          View all {total}
        </button>
      </div>

      {top.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#EAEAEA] px-4 py-10 text-center">
          <div className="mx-auto mb-2.5 grid h-10 w-10 place-items-center rounded-full bg-[#E8F8ED] text-[#16A34A]">
            <CheckIcon />
          </div>
          <p className="text-sm font-semibold text-[#211a14]">You&apos;re all caught up</p>
          <p className="mt-1 text-xs text-[#8c7d6f]">No urgent actions right now. AI is handling the rest.</p>
        </div>
      ) : (
        <>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#b1a496]">
            Most important right now
          </div>
          <div className="flex flex-col">
            {top.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-3.5 py-3.5 ${i > 0 ? "border-t border-[#ece6dd]" : ""}`}
              >
                <div
                  className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${
                    r.urgent ? "bg-[#fdf4ec] text-[#C0530F]" : "bg-[#f4efe8] text-[#463b31]"
                  }`}
                >
                  {r.channel === "Call" ? <PhoneIcon /> : <MsgIcon />}
                  {r.urgent && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#FF6B35] ring-2 ring-white" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-[#211a14]">{r.name}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${scoreBadgeClass(r.score)}`}>
                      AI {r.score}
                    </span>
                    {r.urgent && (
                      <span className="rounded-md bg-[#fde0d3] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.03em] text-[#c0530f]">
                        URGENT
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] text-[#463b31]">{r.title}</div>
                  {r.meta && <div className="mt-0.5 text-[12px] text-[#8c7d6f]">{r.meta}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => openLead(r.leadId)}
                  className={`whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-semibold transition ${
                    r.urgent
                      ? "bg-[#FF6B35] text-white shadow-[0_3px_8px_rgba(226,90,9,0.2)] hover:bg-[#ea6d0c]"
                      : "border border-[#EAEAEA] bg-white text-[#463b31] hover:bg-[#faf7f2]"
                  }`}
                >
                  {r.cta}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default NeedsReply;
