import React from "react";
import { useNavigate } from "react-router-dom";

/**
 * Orange "Daily Summary" urgency strip. Computed entirely from the live inbox
 * contacts feed - no static data. Shows how many leads are waiting on a human
 * reply, how many have gone cold (oldest activity > 60m), names the oldest
 * waiter, and links into the inbox pre-filtered to the Needs Reply queue.
 */
interface InboxContact {
  id?: number | string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  preview?: string | null;
  last_message?: string | null;
  last_activity_at?: string | null;
  total_unread_count?: number | string | null;
  unread_count?: number | string | null;
  intent?: string | null;
  status?: string | null;
  needs_reply?: boolean | null;
}

interface WaitingBannerProps {
  /** fetchInboxContacts payload: { contacts: [...] } or a raw array. */
  contacts?: { contacts?: InboxContact[] } | InboxContact[];
  isLoading?: boolean;
}

const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);
const MsgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
    <path d="M20 12a8 8 0 0 1-12.2 6.8L4 20l1.2-3.8A8 8 0 1 1 20 12z" />
  </svg>
);

const contactName = (c: InboxContact): string => {
  if (c.name) return c.name;
  const n = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return n || c.email || "a lead";
};

const minsAgo = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
};

const formatAgo = (mins: number): string => {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const COLD_THRESHOLD_MINS = 60;

const WaitingBanner: React.FC<WaitingBannerProps> = ({ contacts, isLoading }) => {
  const navigate = useNavigate();
  const openInbox = () => navigate("/inbox?filter=needs_reply");

  if (isLoading && contacts == null) {
    return (
      <div className="h-20 animate-pulse rounded-xl border border-[#f7c9a8] bg-[#fff7ee]" />
    );
  }

  const list = Array.isArray(contacts) ? contacts : contacts?.contacts ?? [];
  // A lead is "waiting" when it still owes a human reply (needs_reply), or has
  // unread inbound messages as a fallback when needs_reply isn't populated.
  const waiting = list.filter(
    (c) => Boolean(c.needs_reply) || Number(c.total_unread_count ?? c.unread_count) > 0,
  );

  // All caught up: nothing to nudge about, hide the strip entirely.
  if (waiting.length === 0) return null;

  const total = waiting.length;
  const enriched = waiting
    .map((c) => ({ c, mins: minsAgo(c.last_activity_at) }))
    .sort((a, b) => (b.mins ?? -1) - (a.mins ?? -1));
  const oldest = enriched[0];
  const coldCount = enriched.filter((e) => (e.mins ?? 0) > COLD_THRESHOLD_MINS).length;

  return (
    <button
      type="button"
      onClick={openInbox}
      className="group flex w-full items-center gap-3.5 rounded-xl border border-[#f7c9a8] border-l-4 border-l-[#FF6B35] p-3.5 text-left shadow-[0_1px_2px_rgba(50,35,20,0.03)] transition hover:shadow-[0_2px_8px_rgba(226,90,9,0.08)]"
      style={{ background: "linear-gradient(90deg, #fff2e3 0%, #ffffff 60%)" }}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white text-[#C0530F] shadow-[0_1px_2px_rgba(50,35,20,0.06)]">
        <MsgIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 text-[14px] font-bold text-[#211a14]">
          <span>
            {total} {total === 1 ? "lead" : "leads"} waiting for your reply
          </span>
          {coldCount > 0 && (
            <span className="font-semibold text-[#c0392b]">
              · {coldCount} {coldCount === 1 ? "has" : "have"} gone cold
            </span>
          )}
        </div>
        {oldest && (
          <div className="mt-0.5 truncate text-[12.5px] text-[#6a5d50]">
            Oldest: {contactName(oldest.c)}
            {oldest.mins != null ? ` · ${formatAgo(oldest.mins)}` : ""}
            {oldest.c.preview ? ` — "${oldest.c.preview}"` : ""}
          </div>
        )}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#FF6B35] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_3px_8px_rgba(226,90,9,0.2)] transition group-hover:bg-[#ea6d0c]">
        <BoltIcon /> Open inbox
      </span>
    </button>
  );
};

export default WaitingBanner;
