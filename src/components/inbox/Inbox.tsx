import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import MainLayout from "../MainLayout";
import "../ai-v2/prototype.css";
import { Icon } from "../ai-v2/Icon";
import CallsPage from "@/components/calling/CallsPage";
// "Add lead" reuses the same modal as the Leads page (merged from the old
// inbox-only "Add contact"). Rendered via a portal to document.body so its
// Tailwind styling is not nuked by the inbox's .wcv2 wrapper.
import AddLeadModal from "@/components/leads/components/AddLeadModal";
import AddLeadCampaignModal, { type AddLeadCampaignChoice } from "@/components/leads/components/AddLeadCampaignModal";
import { DEFAULT_NEW_LEAD } from "@/components/leads/constants";
import type { NewLeadForm, SmsConsentStatus } from "@/components/leads/types";
import { InboxTabs, type InboxTab } from "./InboxTabs";
import { CallButton } from "@/components/calling/CallButton";
import { CallHistoryList } from "@/components/calling/CallHistoryList";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Calendar,
  Eye,
  ImageIcon,
  Loader2,
  Lock,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Send,
  UserPlus,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import {
  extractSmsErrorMessage,
  isSmsConsentError,
  isSmsPendingConfirmationError,
} from "../../utils/smsConsent";
import {
  smsSegmentCount,
  smsSegmentError,
  SMS_SEGMENT_LENGTH,
} from "../../utils/smsSegments";
import {
  renderPersonalizedText,
  validatePersonalization,
} from "../../utils/personalization";
import { callAiImprove, fetchAiCredits, type AiCredits } from "@/utils/aiImprove";
import {
} from "./utils/personalizeTokens";
import {
  uploadMessageAttachments,
  UploadedAttachment,
} from "../../utils/messageAttachments";
import AppointmentCancelConfirmModal from "../AppointmentCancelConfirmModal";
import AppointmentModal from "../V2/Dashboard/AppointmentModal";
import SendLaterModal from "./SendLaterModal";
import EmptyStateCard from "./components/EmptyStateCard";
// EditLeadModal was removed - the unified AddLeadModal handles both Add and
// Edit. See openEditLead() + saveLeadFromInbox() below for the edit path.
import NewMessageModal from "./components/NewMessageModal";
import BookingMessageModal from "./components/BookingMessageModal";
import { isHotStage, getLeadType } from "@/components/leads/utils/leadDisplay";
import AttachmentChips from "./components/AttachmentChips";
import AppointmentThreadCard from "./components/AppointmentThreadCard";
import DeleteLeadConfirmModal from "./components/DeleteLeadConfirmModal";
import MessageBubble from "./components/MessageBubble";
import {
  SMS_MAX_SEGMENTS,
  CONTACTS_PAGE_SIZE,
} from "./constants";
import {
  contactDisplayName,
  initials,
  parseTags,
} from "./utils/contactUtils";
import {
  formatDateTime,
  formatRelativeTime,
  latestPreviewMessage,
  latestTimestamp,
  mergeAppointmentsById,
} from "./utils/formatters";
import {
  composerInnerPlain,
  sanitizePastedHtml,
} from "./utils/composerUtils";
import { loadNotifPrefs, type InboxNotifPrefs } from "./utils/notifications";
import { sendInboxEmail, sendInboxSms } from "./api/sendMessage";
import { trackFirstMessageSent } from "../../lib/mixpanel";
import type {
  ComposeChannel,
  ContactFormState,
  ContactMessage,
  DomainStatus,
  GmailStatus,
  InboxContact,
  LeadLike,
  SenderType,
  ViewTab,
} from "./types";
import { QuietHoursError } from "./types";
import { useQuietHoursConfirm } from "./components/useQuietHoursConfirm";
import {
  patchInboxAppointment,
  postInboxAppointment,
  postInboxAppointmentCancel,
  InboxAppointmentRecord,
  InboxAppointmentPayload,
} from "@/helpers/backend";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "@/context/useNotifications";

// Shared query key for the inbox contacts list. The SideBar unread badge reads
// the same key, so navigating to the Inbox serves cached data instead of
// firing a duplicate request.
const INBOX_CONTACTS_KEY = ["inbox-contacts"] as const;

// Short zone label for the common US timezones; falls back to the bare GMT
// offset abbreviation the browser produces for anything else.
const TZ_ABBREV: Record<string, string> = {
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "America/Phoenix": "MST",
  "America/Los_Angeles": "PST", // always PST (not PDT) per workspace preference
  "America/Anchorage": "AKT",
  "Pacific/Honolulu": "HT",
};

function zoneAbbrev(timezone: string): string {
  const mapped = TZ_ABBREV[timezone];
  if (mapped) return mapped;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

function formatClockTime(now: Date, zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(zone ? { timeZone: zone } : {}),
    }).format(now);
  } catch {
    return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
}

/**
 * Live clock for the thread header. Shows the current time in the selected
 * lead's timezone when one is set, otherwise the viewer's browser-local time.
 * Re-renders every 15s; the interval is cleaned up on unmount / tz change.
 */
function ThreadClock({ timezone, orgTimezone }: { timezone?: string | null; orgTimezone?: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(handle);
  }, []);

  const valid = (z: string): string => {
    if (!z) return "";
    try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return z; } catch { return ""; }
  };
  // Prefer the lead's own timezone; when the lead has none, fall back to the
  // account/workspace timezone (NOT the agent's browser) so the shown hour is
  // the lead's expected local time, not whatever zone the agent is sitting in.
  const resolvedZone =
    valid(timezone || "") ||
    valid(orgTimezone || "") ||
    Intl.DateTimeFormat().resolvedOptions().timeZone || "";

  const time = formatClockTime(now, resolvedZone);
  const abbrev = resolvedZone ? zoneAbbrev(resolvedZone) : "";

  return (
    <div className="wc-clock" title={resolvedZone || undefined}>
      <Icon name="clock" size={14} />
      <span className="wc-mono">{time}</span>
      {abbrev ? ` ${abbrev}` : ""}
    </div>
  );
}

// Current hour (0-23) in a given IANA zone. Falls back to the viewer's local
// hour if the zone is invalid.
function currentHourInZone(zone: string, now: Date): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "2-digit",
      hour12: false,
    }).format(now);
    const h = Number.parseInt(s, 10);
    if (!Number.isFinite(h)) return now.getHours();
    return h === 24 ? 0 : h;
  } catch {
    return now.getHours();
  }
}

/**
 * Quiet-hours badge for the thread header. Shows a sleep ("zzz") mark next to
 * the lead name when it's currently outside the org's sending window in the
 * lead's local time (the same half-open [start, end) window the send-time
 * quiet-hours guard enforces). Resolves the zone like ThreadClock: lead's own
 * timezone, then the account/workspace timezone, then the browser.
 */
function QuietHoursBadge({
  timezone,
  orgTimezone,
  quietWindow,
}: {
  timezone?: string | null;
  orgTimezone?: string | null;
  quietWindow: { start: number; end: number };
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const valid = (z: string): string => {
    if (!z) return "";
    try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return z; } catch { return ""; }
  };
  const zone =
    valid(timezone || "") ||
    valid(orgTimezone || "") ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "";
  if (!zone) return null;

  const hour = currentHourInZone(zone, now);
  const quiet = hour < quietWindow.start || hour >= quietWindow.end;
  if (!quiet) return null;

  return (
    <span
      title={`Quiet hours - it's outside this contact's contact window (${quietWindow.start}:00-${quietWindow.end}:00 in ${zone}). Sending now will prompt for confirmation.`}
      className="inline-flex mt-1.5 shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700"
    >
      <Icon name="zzz" size={11} />
      Quiet hours
    </span>
  );
}

// Conversation list filter chips. Each predicate reads existing contact data
// only - "All" is a no-op pass-through, "Needs Reply" uses the unread count,
// and the rest map onto the normalized lead type / intent helpers.
type InboxListFilter =
  | "all"
  | "needs_reply"
  | "hot"
  | "buyers"
  | "sellers";

const INBOX_LIST_FILTERS: { key: InboxListFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_reply", label: "Needs Reply" },
  { key: "hot", label: "Hot Leads" },
  { key: "buyers", label: "Buyers" },
  { key: "sellers", label: "Sellers" },
];

type ScheduledSummary = {
  pending: number; next_at: string | null; due_within_hour: number; sms: number; email: number;
  // Day-by-day breakdown in the org's local calendar (server-computed).
  today: number; today_sms: number; today_email: number; tomorrow: number; later: number;
};

/** "in ~3 min" / "in ~2 hr" until the next scheduled send fires. */
function nextSendLabel(nextAt: string | null): string {
  if (!nextAt) return "";
  const ms = Date.parse(nextAt) - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "any moment now";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "in under a minute";
  if (min < 60) return `in ~${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ~${hr} hr`;
  const days = Math.round(hr / 24);
  return `in ~${days} day${days > 1 ? "s" : ""}`;
}

/**
 * Slim status strip summarising the org's pending outbound queue
 * (scheduled_message): how many are about to send, when the next one fires, and
 * the channel split. Rendered inside each inbox view (top of the conversation
 * list, the "No conversations yet" card, and the "Select a conversation" pane)
 * rather than as a floating bar, so it reads as part of that surface. Renders
 * nothing when the queue is empty. Styled to match the inbox panels.
 */
function ScheduledStrip({ summary }: { summary: ScheduledSummary | null }) {
  if (!summary || summary.pending <= 0) return null;
  const { today, tomorrow, later } = summary;
  // Headline the soonest non-empty bucket: today if anything goes out today,
  // otherwise tomorrow, otherwise the rest. This keeps the strip from reading
  // "0 messages queued to send today" when everything is a future follow-up.
  const headline =
    today > 0
      ? { n: today, label: "queued to send today" }
      : tomorrow > 0
        ? { n: tomorrow, label: "queued to send tomorrow" }
        : { n: later, label: "queued to send" };
  // Channel split only makes sense for today's batch.
  const channelBits = today > 0
    ? [
        summary.today_sms > 0 ? `${summary.today_sms} SMS` : null,
        summary.today_email > 0 ? `${summary.today_email} email` : null,
      ].filter(Boolean).join(" · ")
    : "";
  // The buckets that aren't the headline, shown below as future follow-ups.
  // `later` is the running total of everything from the day after tomorrow on.
  const futureBits = [
    today > 0 && tomorrow > 0 ? `${tomorrow} tomorrow` : null,
    later > 0 ? `${later} after tomorrow` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", gap: 3,
        padding: "9px 14px", borderRadius: 16, fontSize: 12.5,
        background: "var(--panel, #fff)", color: "var(--ink-2, #6B6660)",
        border: "1px solid var(--line, #E7E3DB)",
        boxShadow: "0 1px 2px rgba(0,0,0,.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 700, color: "var(--ink, #2A2622)" }}>
          <Loader2 size={13} className="animate-spin" style={{ color: "var(--accent, #E2622C)" }} />
          {headline.n} message{headline.n === 1 ? "" : "s"} {headline.label}
        </span>
        <span style={{ color: "#000" }}>·</span>
        <span>
          next <strong style={{ color: "var(--accent, #E2622C)", fontWeight: 700 }}>{nextSendLabel(summary.next_at)}</strong>
          {summary.due_within_hour > 0 ? ` · ${summary.due_within_hour} within the hour` : ""}
        </span>
        {channelBits ? (
          <>
            <span style={{ color: "#000" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--ink-3, #9A948C)" }}>{channelBits}</span>
          </>
        ) : null}
      </div>
      {futureBits ? (
        <div style={{ fontSize: 11.5, color: "var(--ink-3, #9A948C)", paddingLeft: 20 }}>
          Upcoming follow-ups: {futureBits}
        </div>
      ) : null}
    </div>
  );
}

function matchesListFilter(
  contact: InboxContact,
  filter: InboxListFilter,
): boolean {
  switch (filter) {
    case "needs_reply":
      // The lead spoke last (server-computed from last-message direction).
      // Deliberately NOT based on unread - reading a message doesn't discharge
      // the need to reply, so it must stay until the agent actually replies.
      return Boolean(contact.needs_reply);
    case "hot":
      return isHotStage(contact as Record<string, unknown>);
    case "buyers": {
      const type = getLeadType(contact as Record<string, unknown>);
      return type === "Buyer" || type === "Both";
    }
    case "sellers": {
      const type = getLeadType(contact as Record<string, unknown>);
      return type === "Seller" || type === "Both";
    }
    case "all":
    default:
      return true;
  }
}

export default function Inbox() {
  const API_BASE = import.meta.env.VITE_API_BASE;
  const SMS_API_BASE = import.meta.env.VITE_SMS_API_BASE || API_BASE;
  const token = localStorage.getItem("token") || "";
  const userId = localStorage.getItem("user_id") || "";
  const orgId = localStorage.getItem("org_id") || "";
  const userName = localStorage.getItem("name") || "";
  const orgName = localStorage.getItem("org_name") || "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { markReadByContact, lastLiveNotification, setActiveConversation } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();
  const senderPreview = { name: userName, orgName };

  // Account/workspace timezone - used as the thread-clock fallback when a lead
  // has no timezone of its own, so the hour shown is the lead's expected local
  // time rather than the agent's browser zone.
  const [orgTimezone, setOrgTimezone] = useState<string | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetch(`${API_BASE}/orgs/${orgId}/timezone`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.timezone) setOrgTimezone(d.timezone); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [API_BASE, orgId]);

  // Org sending window (half-open [start, end), defaults 8-21) - drives the
  // thread-header "Quiet hours" badge. Same window the send-time guard enforces.
  const [orgQuietHours, setOrgQuietHours] = useState<{ start: number; end: number }>({
    start: 8,
    end: 21,
  });
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetch(`${API_BASE}/orgs/${orgId}/quiet-hours`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.start === "number" && typeof d.end === "number")
          setOrgQuietHours({ start: d.start, end: d.end });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [API_BASE, orgId]);

  // When a conversation is opened from a notification we flash its newest
  // inbound message so the user's eye lands on what the alert was about.
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);
  const pendingHighlightRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  // The last `lead|channel` URL value the URL-watching effect actually acted
  // on. The effect re-runs whenever `contacts` refreshes (polls), and during
  // the render gap right after a click - selectedLeadId/ref already moved, but
  // react-router has not yet committed the new URL - it would otherwise re-read
  // the STALE url and "restore" the previously-open lead. Acting only when this
  // value changes makes a contacts refresh in that gap a no-op.
  const lastUrlSelectionRef = useRef<string | null>(null);

  // Messages | Calls tab (Calls moved into the Inbox). Driven by ?tab= so the
  // old /calls URL can deep-link into the Calls tab and it stays linkable.
  // Named inboxTopTab to avoid colliding with the sms/email `activeTab` below.
  const inboxTopTab: InboxTab = searchParams.get("tab") === "calls" ? "calls" : "messages";
  const setTab = (tab: InboxTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "calls") next.set("tab", "calls");
        else next.delete("tab");
        return next;
      },
      { replace: true },
    );
  };

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const contactActionMenuRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  const [contacts, setContacts] = useState<InboxContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  // Aggregate of the org's pending outbound queue (scheduled_message), shown in
  // the empty / "select a conversation" panes so the agent can see how many AI /
  // automation messages are waiting and when the next one fires.
  const [scheduledSummary, setScheduledSummary] = useState<ScheduledSummary | null>(null);
  // True per-filter totals from the server (over the whole org, not the loaded
  // page) so the chip counts don't grow as you scroll. Null until first load.
  const [serverFilterCounts, setServerFilterCounts] = useState<Record<InboxListFilter, number> | null>(null);
  // Infinite-scroll pagination for the contacts list (Sarwar a9f3a6c).
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsHasMore, setContactsHasMore] = useState(true);
  const [contactsLoadingMore, setContactsLoadingMore] = useState(false);
  const [contactsQuery, setContactsQuery] = useState("");
  const contactsScrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  // Track the user's current selection so an in-flight poll for a previous
  // lead can't overwrite state after the user clicks a different conversation.
  const selectedLeadIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedLeadIdRef.current = selectedLeadId;
  }, [selectedLeadId]);
  const [selectedContact, setSelectedContact] = useState<InboxContact | null>(
    null,
  );
  const [messagesByTab, setMessagesByTab] = useState<{
    unified: ContactMessage[];
    email: ContactMessage[];
    sms: ContactMessage[];
  }>({
    unified: [],
    email: [],
    sms: [],
  });
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  // Client-side conversation filter chips. These narrow the already-fetched
  // server list (filteredContacts) on top of the server-side `q` search - they
  // do NOT replace the server source. Every chip is backed by real contact
  // data; chips with no backing data are simply not offered.
  const [listFilter, setListFilter] = useState<InboxListFilter>("all");
  const [activeTab, setActiveTab] = useState<ViewTab>("sms");
  const [composeChannel, setComposeChannel] = useState<ComposeChannel>("sms");
  const selectedPlan = localStorage.getItem("selectedPlan") || "free_channel";
  const isFreePlan = selectedPlan === "free_channel";
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<
    UploadedAttachment[]
  >([]);
  const [showPreview, setShowPreview] = useState(false);
  const [, setUploadingComposeAttachments] = useState(false);
  const [sending, setSending] = useState(false);
  const { modal: quietHoursModal, confirm: askQuietHours } =
    useQuietHoursConfirm();
  // const [composeLoadingAI, setComposeLoadingAI] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus>("loading");
  const [domainStatus, setDomainStatus] = useState<DomainStatus>("loading");
  const [domainEmail, setDomainEmail] = useState("");
  const [telnyxApproved, setTelnyxApproved] = useState<boolean | null>(null);
  // Pulled once from /api/auto-response so BookingMessageModal can hide its
  // Calendly fallback when the org has a handoff agent configured.
  const [bookingHandoffUserId, setBookingHandoffUserId] = useState<number | null>(null);
  const [, setTelnyxChecking] = useState(true);
  // editingLeadId drives AddLeadModal's edit mode (the unified Add/Edit
  // modal). When non-null, the modal renders the "Edit Lead" UI and onSave
  // dispatches an UPDATE instead of a CREATE. The Leads page uses the same
  // pattern; we're now consolidated onto that single source of truth.
  const [editingLeadIdInbox, setEditingLeadIdInbox] = useState<number | null>(null);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showInboxCampaignGate, setShowInboxCampaignGate] = useState(false);
  const [inboxPendingEnrollLeadId, setInboxPendingEnrollLeadId] = useState<number | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [showBookingMessageModal, setShowBookingMessageModal] = useState(false);
  const [isContactsCollapsed, setIsContactsCollapsed] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat" | "details">(
    "list",
  );
  // Spec section-8 state machine. `intelOpen` drives the lead-intelligence panel
  // (inline on desktop, slide-over drawer on tablet, bottom-sheet on phone).
  // `bp` mirrors the active breakpoint so JS can keep the data-attrs honest.
  const [intelOpen, setIntelOpen] = useState(true);
  const [bp, setBp] = useState<"xl" | "lg" | "md" | "sm">("xl");
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setBp(w >= 1280 ? "xl" : w >= 1024 ? "lg" : w >= 768 ? "md" : "sm");
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  // On tablet/phone the intel panel is an overlay; default it closed there and
  // close it whenever the conversation changes (spec 8.4).
  useEffect(() => {
    if (bp === "md" || bp === "sm") setIntelOpen(false);
    else setIntelOpen(true);
  }, [bp]);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isContactActionMenuOpen, setIsContactActionMenuOpen] = useState(false);
  const [addContactSaving, setAddContactSaving] = useState(false);
  // "Add lead" modal (shared with the Leads page) - lives here so the inbox can
  // create a lead with the same form the lead selector uses.
  const [newLeadForm, setNewLeadForm] = useState<NewLeadForm>({ ...DEFAULT_NEW_LEAD });
  // Default to "opted_in" for new leads added from the inbox - agents
  // adding leads here typically know the contact already (they're replying
  // to or about to message them). The attestation friction sits at the
  // save action, not on the radio default.
  const [newLeadConsent, setNewLeadConsent] = useState<SmsConsentStatus>("opted_in");
  const [leads, setLeads] = useState<LeadLike[]>([]);
  const [leadAppointmentsByLead, setLeadAppointmentsByLead] = useState<
    Record<number, InboxAppointmentRecord[]>
  >({});
  const [appointmentModalEditing, setAppointmentModalEditing] =
    useState<InboxAppointmentRecord | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelingAppointment, setCancelingAppointment] = useState(false);
  const [appointmentPendingCancel, setAppointmentPendingCancel] =
    useState<InboxAppointmentRecord | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const [_notifPrefs, _setNotifPrefs] = useState<InboxNotifPrefs>(() =>
    loadNotifPrefs(),
  );
  // AI Assist ▾ dropdown — rewrites the current draft in place via callAiImprove.
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistBusy, setAssistBusy] = useState(false);
  const assistWrapRef = useRef<HTMLDivElement | null>(null);
  // AI Assist credits (monthly AI quota). `remaining: null` => unlimited.
  const [aiCredits, setAiCredits] = useState<AiCredits | null>(null);
  const refreshAiCredits = useCallback(() => {
    if (!token) return;
    fetchAiCredits(token).then(setAiCredits).catch(() => {/* non-fatal */});
  }, [token]);
  useEffect(() => { refreshAiCredits(); }, [refreshAiCredits]);
  const [showSendLaterModal, setShowSendLaterModal] = useState(false);
  const [showDeleteLeadConfirm, setShowDeleteLeadConfirm] = useState(false);
  const unreadBaselineRef = useRef<Map<
    number,
    { e: number; s: number }
  > | null>(null);
  const notifCenterRef = useRef<HTMLDivElement | null>(null);
  const openDetailsRef = useRef<(c: InboxContact) => Promise<void>>(
    async () => {},
  );

  // Search is handled server-side via the `q` param + debounced contactsQuery.
  const filteredContacts = contacts;

  // Conversation list narrowed by the active filter chip. The chip predicate is
  // applied on top of the server-fetched list so server-side search (`q`) and
  // pagination stay authoritative; "all" passes everything through. Conversations
  // that need a reply (unread > 0) are pinned to the top so an inbound message
  // never gets buried under newer outbound-only threads - the list is otherwise
  // recency-ordered by the server, and the sort is stable so that order is kept
  // within each group.
  const displayedContacts = useMemo(() => {
    const base =
      listFilter === "all"
        ? filteredContacts
        : filteredContacts.filter((c) => matchesListFilter(c, listFilter));
    const needsReply = (c: InboxContact) => (c.needs_reply ? 1 : 0);
    return [...base].sort((a, b) => needsReply(b) - needsReply(a));
  }, [filteredContacts, listFilter]);

  // Per-chip counts over the loaded window, shown as a badge on each filter chip.
  const filterCounts = useMemo(() => {
    const count = (f: InboxListFilter) => filteredContacts.reduce((n, c) => n + (matchesListFilter(c, f) ? 1 : 0), 0);
    return {
      all: filteredContacts.length,
      needs_reply: count("needs_reply"),
      hot: count("hot"),
      buyers: count("buyers"),
      sellers: count("sellers"),
    } as Record<InboxListFilter, number>;
  }, [filteredContacts]);

  // Compose target list: union of inbox contacts (people you've messaged) and
  // leads (CRM rows you haven't necessarily messaged yet), deduped by id so a
  // contact who is also a lead doesn't show twice. The New Message modal
  // wants both - the "leads"-only feed was hiding inbox-only people.
  const mergedComposeContacts = useMemo<LeadLike[]>(() => {
    const map = new Map<number, LeadLike>();
    for (const c of contacts) {
      map.set(c.id, {
        id: c.id,
        name: c.name ?? null,
        first_name: c.first_name ?? null,
        last_name: c.last_name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        status: c.stage ?? null,
      } as LeadLike);
    }
    for (const l of leads) {
      if (!map.has(l.id)) map.set(l.id, l);
    }
    return [...map.values()];
  }, [contacts, leads]);

  const selectedMessages =
    activeTab === "email"
      ? messagesByTab.email
      : activeTab === "sms"
        ? messagesByTab.sms
        : messagesByTab.unified;

  const threadAppointments = useMemo(() => {
    if (!selectedLeadId) return [];
    return leadAppointmentsByLead[selectedLeadId] || [];
  }, [leadAppointmentsByLead, selectedLeadId]);

  type UnifiedTimelineEntry =
    | { kind: "message"; id: string; at: number; message: ContactMessage }
    | {
        kind: "appointment";
        id: string;
        at: number;
        appointment: InboxAppointmentRecord;
      };

  const unifiedTimeline = useMemo((): UnifiedTimelineEntry[] | null => {
    // Built for every tab. Appointments belong to the lead (not a single
    // channel), so they're injected into the SMS and email timelines too -
    // otherwise booking while on the SMS tab would show nothing.
    const entries: UnifiedTimelineEntry[] = [];
    const seenAppointmentIds = new Set<number>();

    // Position an appointment card at the moment the booking happened in the
    // conversation (created_at), not at starts_at - otherwise a future
    // appointment (and a cancelled one) always sorts past every message and
    // sticks to the bottom instead of interleaving chronologically.
    const apptAt = (a: InboxAppointmentRecord) =>
      new Date(a.created_at || a.starts_at || 0).getTime();

    selectedMessages.forEach((m) => {
      if (m.channel === "appointment" && m.appointment) {
        const appt = m.appointment;
        seenAppointmentIds.add(appt.id);
        entries.push({
          kind: "appointment",
          id: `a-${appt.id}`,
          at: apptAt(appt),
          appointment: appt,
        });
        return;
      }
      entries.push({
        kind: "message",
        id: `m-${m.id}`,
        at: new Date(m.timestamp || 0).getTime(),
        message: m,
      });
    });

    threadAppointments.forEach((a) => {
      if (seenAppointmentIds.has(a.id)) return;
      entries.push({
        kind: "appointment",
        id: `a-${a.id}`,
        at: apptAt(a),
        appointment: a,
      });
    });

    entries.sort((x, y) => x.at - y.at);
    return entries;
  }, [selectedMessages, threadAppointments]);

  const messagesScrollAnchor = useMemo(() => {
    if (unifiedTimeline && unifiedTimeline.length > 0) {
      const last = unifiedTimeline[unifiedTimeline.length - 1];
      const tail =
        last.kind === "message"
          ? `m-${last.message.id}`
          : `a-${last.appointment.id}`;
      return `${selectedLeadId ?? ""}:unified:${unifiedTimeline.length}:${tail}`;
    }
    const n = selectedMessages.length;
    if (n === 0) return "";
    const tailId = selectedMessages[n - 1]?.id ?? "";
    return `${selectedLeadId ?? ""}:${activeTab}:${n}:${tailId}`;
  }, [selectedLeadId, activeTab, selectedMessages, unifiedTimeline]);

  // Track whether the user is pinned to the bottom of the thread so the 15s
  // background poll doesn't yank them down while they're reading scrollback.
  // Updated by the onScroll handler on the scroll container.
  const pinnedToBottomRef = useRef(true);
  // Identity of the last anchor we auto-scrolled to. We only scroll when the
  // thread really changes (lead switch, new tail, tab switch); a poll that
  // re-fetches the same tail keeps the anchor identical and we no-op.
  const lastScrolledAnchorRef = useRef<string>("");
  const lastScrolledLeadRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (detailLoading) return;
    const el = messagesScrollRef.current;
    if (!el) return;
    const timelineLen = unifiedTimeline ? unifiedTimeline.length : 0;
    const messageLen = selectedMessages.length;
    if (timelineLen === 0 && messageLen === 0) return;

    const leadChanged = lastScrolledLeadRef.current !== selectedLeadId;
    const anchorChanged = lastScrolledAnchorRef.current !== messagesScrollAnchor;
    // If the anchor is unchanged (same tail message), the poll merely
    // re-rendered the same thread - never scroll.
    if (!leadChanged && !anchorChanged) return;
    // If the user has scrolled away from the bottom, respect that and don't
    // auto-scroll on poll refreshes. We still snap to bottom when they switch
    // conversations so the new thread opens at the latest message.
    if (!leadChanged && !pinnedToBottomRef.current) {
      lastScrolledAnchorRef.current = messagesScrollAnchor;
      return;
    }

    lastScrolledAnchorRef.current = messagesScrollAnchor;
    lastScrolledLeadRef.current = selectedLeadId;
    const scrollToEnd = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToEnd();
    requestAnimationFrame(() => {
      scrollToEnd();
      requestAnimationFrame(scrollToEnd);
    });
  }, [
    detailLoading,
    messagesScrollAnchor,
    activeTab,
    unifiedTimeline,
    selectedMessages.length,
    selectedLeadId,
  ]);

  const handleMessagesScroll = (
    event: React.UIEvent<HTMLDivElement>,
  ) => {
    const el = event.currentTarget;
    // Roughly "is the viewport touching the bottom?" - 32px slack absorbs
    // sub-pixel rounding, scrollbar widths, and the scroll-snap from a
    // freshly appended message.
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distance <= 32;
  };

  const selectedSummary = useMemo(() => {
    if (!selectedLeadId) return null;
    return contacts.find((contact) => contact.id === selectedLeadId) || null;
  }, [contacts, selectedLeadId]);

  // Prefer the loaded detail only when it actually belongs to the selected
  // lead. While a freshly-clicked lead's detail is still loading (or if a poll
  // momentarily holds the previous lead's detail), a stale `selectedContact`
  // must not win over the new selection - otherwise the thread switches but the
  // displayed contact snaps back to the previously-open lead.
  const contactForView =
    selectedContact && selectedContact.id === selectedLeadId
      ? selectedContact
      : selectedSummary;

  // Open the rich Edit Lead modal for the selected contact. The contact IS a
  // lead, so we edit it with the same modal the Leads page uses. Prefer the full
  // lead row (from the loaded leads list) so no fields are blanked on save; fall
  // back to the contact projection when the lead isn't in the current page.
  /**
   * Open the unified modal in ADD mode for a brand-new lead. Resets the
   * form to defaults (incl. consent = "opted_in") and clears any
   * editing-lead-id left over from a previous edit pass - without this the
   * "Add Lead" buttons would carry the stale state of the last edit
   * forward (form prefilled, consent stuck on whatever the edited lead
   * had).
   */
  const openAddLead = () => {
    setEditingLeadIdInbox(null);
    setNewLeadForm({ ...DEFAULT_NEW_LEAD });
    setNewLeadConsent("opted_in");
    setShowAddContactModal(true);
  };

  /**
   * Open the unified Add/Edit Lead modal in EDIT mode for the selected
   * contact. Same modal the Leads page uses. We build the form from cached
   * sources only - the inbox's `selectedContact` (the loaded full contact
   * detail) is the richest projection. We DO NOT call GET /api/leads/:id
   * here: that path is the org-scoped list endpoint, not a single-lead
   * fetch, so a "successful" response was an empty list which wiped the
   * form (this was the bug where STOP-blocked leads showed details for a
   * moment then cleared).
   */
  const openEditLead = () => {
    if (!contactForView) return;
    const leadId = Number(contactForView.id);
    if (!Number.isFinite(leadId) || leadId <= 0) return;

    type AnyLeadShape = Record<string, unknown> & {
      id?: number;
      sms_consent_status?: string | null;
      tags?: string[] | string;
      pre_approved?: boolean | null;
    };
    // Prefer the loaded leads list (richer projection from /api/leads/:orgId
    // which DOES include AI Qualification capture etc.), fall back to the
    // current contactForView. Merge so blanks in one source can be filled
    // from the other - this matters for STOP-blocked leads whose contact
    // projection drops some fields.
    const fromList = leads.find((l) => l.id === leadId) as unknown as AnyLeadShape | undefined;
    const fromContact = contactForView as unknown as AnyLeadShape;
    const full: AnyLeadShape = { ...fromContact, ...(fromList ?? {}) };
    const tagsArray: string[] = Array.isArray(full.tags)
      ? (full.tags as string[])
      : typeof full.tags === "string"
        ? (full.tags as string).split(",").map((t) => t.trim()).filter(Boolean)
        : [];
    const str = (v: unknown): string => (v == null ? "" : String(v));
    const next: NewLeadForm = {
      ...DEFAULT_NEW_LEAD,
      name: str(full.name),
      email: str(full.email),
      company: str(full.company),
      status: str(full.status) || "New",
      phone: str(full.phone),
      countryCode: str((full as { countryCode?: string }).countryCode) || "+1",
      source: str(full.source),
      price_range: str(full.price_range),
      notes: str(full.notes),
      tags: tagsArray.join(", "),
      tagsArray,
      lead_type: str(full.lead_type),
      intent: str(full.intent) || "Cold",
      ai_status: str(full.ai_status) || "AI Active",
      area: str(full.area),
      timezone: str(full.timezone),
      property_address: str(full.property_address),
      timeline: str(full.timeline),
      pre_approved: typeof full.pre_approved === "boolean" ? full.pre_approved : null,
      motivation: str(full.motivation),
      occupancy_status: str(full.occupancy_status),
      interest_level: str(full.interest_level),
      financing_status: str(full.financing_status),
      bedrooms: str(full.bedrooms),
      bathrooms: str(full.bathrooms),
      property_type: str(full.property_type),
      seller_price_expectations: str(full.seller_price_expectations),
      qualification_step: Number(full.qualification_step) || 0,
      qualification_status: str(full.qualification_status),
      email_notifications_enabled: (full.email_notifications_enabled as boolean | undefined) ?? true,
      sms_notifications_enabled: (full.sms_notifications_enabled as boolean | undefined) ?? true,
    };
    setNewLeadForm(next);
    const consent = String(full.sms_consent_status || "").toLowerCase();
    setNewLeadConsent(
      consent === "opted_in"
        ? "opted_in"
        : consent === "no_sms"
          ? "no_sms"
          : "unknown",
    );
    setEditingLeadIdInbox(leadId);
    setShowAddContactModal(true);
  };

  const previewContact = contactForView
    ? {
        ...contactForView,
        stage: contactForView.stage,
      }
    : null;

  const currentChannel: ComposeChannel =
    activeTab === "sms"
      ? "sms"
      : activeTab === "email"
        ? "email"
        : composeChannel;

  // Show the multi-segment cost warning as soon as the draft spills past one
  // segment, even though we don't block sending until SMS_MAX_SEGMENTS.
  const smsSegmentWarning =
    currentChannel === "sms" ? smsSegmentError(composeBody, 1) : null;

  // An attachment alone is a valid message (an image-only MMS), so don't
  // require body text when something is attached.
  const hasComposeAttachments = composeAttachments.length > 0;
  const composeSendDisabled =
    sending ||
    (!composeBody.trim() && !hasComposeAttachments) ||
    (currentChannel === "email" && !composeSubject.trim()) ||
    (currentChannel === "sms" &&
      smsSegmentCount(composeBody) > SMS_MAX_SEGMENTS);

  const hasVerifiedBusinessEmail = domainStatus === "verified";
  const emailConnected =
    gmailStatus === "connected" || hasVerifiedBusinessEmail;
  const smsConnected = telnyxApproved === true;

  const resetComposer = (contact?: InboxContact | null) => {
    const defaultSubject = contact?.latest_email_subject
      ? /^re:/i.test(contact.latest_email_subject)
        ? contact.latest_email_subject
        : `Re: ${contact.latest_email_subject}`
      : "";
    setComposeSubject(defaultSubject);
    setComposeBody("");
    if (bodyRef.current) {
      bodyRef.current.innerHTML = "";
    }
    setComposeAttachments([]);
    setShowPreview(false);
  };

  const fetchLeads = async () => {
    if (!token || !orgId) return;
    try {
      // Use the same paginated shape the Leads page uses. The bare-array
      // variant of this endpoint silently returned 1 row for at least one
      // tenant (cause unclear), so we go through the metadata path which
      // explicitly returns { items: [...] } and is what /leads/ relies on.
      const res = await fetch(
        `${API_BASE}/leads/${orgId}?include_meta=1&page=1&page_size=500`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = (await res.json().catch(() => ({}))) as {
        items?: LeadLike[];
      };
      setLeads(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setLeads([]);
    }
  };

  const startGmailOAuth = async () => {
    try {
      const res = await fetch(`${API_BASE}/gmail/connect-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        toast.error(data?.message || "Failed to start Gmail connection.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Failed to start Gmail connection.");
    }
  };

  const fetchConnectionStatus = async () => {
    if (!token) return;
    try {
      const [domainRes, gmailRes, smsRes] = await Promise.all([
        fetch(`${API_BASE}/elastic/business-email/status`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/inbox/verify/connected`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
        fetch(`${API_BASE}/telnyx/agent`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const domainData = await domainRes.json().catch(() => ({}));
      const gmailData = await gmailRes.json().catch(() => ({}));
      const smsData = await smsRes.json().catch(() => ({}));
      const smsUser = smsData?.user || smsData;

      setDomainStatus(
        domainData?.status === "verified"
          ? "verified"
          : domainData?.status === "registered"
            ? "registered"
            : "not_connected",
      );
      setDomainEmail(domainData?.email || "");

      if (gmailData?.isVerified) {
        setGmailStatus("connected");
      } else if (gmailData?.message === "Reconnect required") {
        setGmailStatus("reconnect_required");
      } else {
        setGmailStatus("not_connected");
      }

      const smsReady =
        smsUser?.telnyx_sms_status === "approved" &&
        !!smsUser?.telnyx_phone_number;
      setTelnyxApproved(Boolean(smsReady));
      setTelnyxChecking(false);

      if (!smsReady && currentChannel === "sms") {
        setComposeChannel("email");
      }
    } catch {
      setDomainStatus("not_connected");
      setDomainEmail("");
      setGmailStatus("not_connected");
      setTelnyxApproved(false);
      setTelnyxChecking(false);
    }
  };

  const buildContactsUrl = (page: number, pageSize: number, query: string) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(Math.min(Math.max(pageSize, 1), 300)));
    const trimmed = query.trim();
    if (trimmed) params.set("q", trimmed);
    // Apply the active chip server-side so a matching contact that sits past the
    // loaded/capped window (e.g. a fresh "needs reply" buried under a busy queue)
    // is still returned, instead of being filtered out of an incomplete page.
    if (listFilter !== "all") params.set("filter", listFilter);
    return `${API_BASE}/inbox/contacts?${params.toString()}`;
  };

  const computeContactsHasMore = (
    data: { total?: number; total_count?: number; count?: number; has_more?: boolean; pagination?: { total?: number; has_next?: boolean } },
    loadedCount: number,
    lastPageCount: number,
  ) => {
    const total = Number(
      data?.pagination?.total ?? data?.total ?? data?.total_count ?? NaN,
    );
    if (Number.isFinite(total)) return loadedCount < total;
    if (typeof data?.pagination?.has_next === "boolean") return data.pagination.has_next;
    if (typeof data?.has_more === "boolean") return data.has_more;
    return lastPageCount >= CONTACTS_PAGE_SIZE;
  };

  // Refresh the currently-loaded window in a single request - polling /
  // mutations call this so the visible list stays fresh without losing the
  // user's scroll position. `force` skips the React-Query cache.
  const fetchContacts = async (force = false, opts?: { guardEmpty?: boolean }) => {
    if (!token) return;
    try {
      const size = Math.min(Math.max(contactsPage, 1) * CONTACTS_PAGE_SIZE, 300);
      const res = await fetch(buildContactsUrl(1, size, contactsQuery), {
        headers: { Authorization: `Bearer ${token}` },
      });
      // A failed / malformed refresh must NOT wipe the visible list - keep what
      // we have and let the next tick retry.
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { contacts?: InboxContact[]; pagination?: { total?: number; has_next?: boolean }; filter_counts?: Record<InboxListFilter, number> };
      if (!Array.isArray(data?.contacts)) return;
      const nextContacts = data.contacts;
      // `guardEmpty` (background POLL only): a poll that comes back empty while we
      // currently have contacts and aren't searching is almost always a transient
      // miss - keep the list rather than flashing the empty state. Explicit
      // refreshes (after a delete/send) skip this so a genuinely-empty result
      // (e.g. the last contact was just deleted) clears the list immediately.
      if (opts?.guardEmpty && nextContacts.length === 0 && contacts.length > 0 && !contactsQuery.trim()) return;
      setContacts(nextContacts);
      if (data.filter_counts) setServerFilterCounts(data.filter_counts);
      setContactsHasMore(computeContactsHasMore(data, nextContacts.length, nextContacts.length));
      if (force) {
        queryClient.invalidateQueries({ queryKey: INBOX_CONTACTS_KEY });
      }
      if (selectedLeadId) {
        const summary = nextContacts.find((c) => c.id === selectedLeadId);
        if (summary) {
          // Only overlay the previously-loaded detail when it belongs to the
          // SAME lead. Merging a stale detail (from the lead that was open
          // before this switch) over the fresh summary produced a contact whose
          // identity reverted to the old lead - the "selected contact snaps
          // back" bug. For a different (or absent) detail, just adopt the
          // summary; the in-flight detail fetch will fill it in.
          setSelectedContact((current) =>
            current && current.id === selectedLeadId
              ? { ...summary, ...current }
              : summary,
          );
        }
      }
    } catch {
      // Background refresh failed (network blip) - keep the current list silently;
      // the next poll tick retries. Only the explicit first-page load toasts.
    } finally {
      setContactsLoading(false);
    }
  };

  // Pending outbound queue summary (cheap aggregate). Silent on failure - it is
  // a passive widget and must never disrupt the inbox.
  const fetchScheduledSummary = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/inbox/scheduled/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as Partial<ScheduledSummary>;
      if (typeof data?.pending === "number") {
        setScheduledSummary({
          pending: data.pending,
          next_at: data.next_at ?? null,
          due_within_hour: data.due_within_hour ?? 0,
          sms: data.sms ?? 0,
          email: data.email ?? 0,
          today: data.today ?? data.pending,
          today_sms: data.today_sms ?? 0,
          today_email: data.today_email ?? 0,
          tomorrow: data.tomorrow ?? 0,
          later: data.later ?? 0,
        });
      }
    } catch { /* passive widget - ignore */ }
  };

  // First-page load - called on mount and whenever the debounced search changes.
  const loadFirstPageContacts = async () => {
    if (!token) return;
    setContactsLoading(true);
    try {
      const res = await fetch(buildContactsUrl(1, CONTACTS_PAGE_SIZE, contactsQuery), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { contacts?: InboxContact[]; pagination?: { total?: number; has_next?: boolean }; filter_counts?: Record<InboxListFilter, number> };
      const nextContacts = Array.isArray(data?.contacts) ? data.contacts : [];
      setContacts(nextContacts);
      if (data.filter_counts) setServerFilterCounts(data.filter_counts);
      setContactsPage(1);
      setContactsHasMore(computeContactsHasMore(data, nextContacts.length, nextContacts.length));
    } catch {
      toast.error("Failed to load inbox conversations.");
    } finally {
      setContactsLoading(false);
    }
  };

  // Append the next page when the user scrolls toward the bottom.
  const loadMoreContacts = async () => {
    if (!token || contactsLoadingMore || !contactsHasMore || contactsLoading) return;
    setContactsLoadingMore(true);
    try {
      const nextPage = contactsPage + 1;
      const res = await fetch(buildContactsUrl(nextPage, CONTACTS_PAGE_SIZE, contactsQuery), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { contacts?: InboxContact[]; pagination?: { total?: number; has_next?: boolean } };
      const incoming: InboxContact[] = Array.isArray(data?.contacts) ? data.contacts : [];
      let mergedCount = 0;
      setContacts((current) => {
        const seen = new Set(current.map((c) => c.id));
        const deduped = incoming.filter((c) => !seen.has(c.id));
        const merged = [...current, ...deduped];
        mergedCount = merged.length;
        return merged;
      });
      setContactsPage(nextPage);
      setContactsHasMore(computeContactsHasMore(data, mergedCount, incoming.length));
    } catch {
      // Keep the existing list; the next scroll attempt can retry.
    } finally {
      setContactsLoadingMore(false);
    }
  };

  const handleContactsScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
      void loadMoreContacts();
    }
  };

  const fetchContactDetail = async (
    leadId: number,
    preserveComposer = true,
    options?: { quiet?: boolean },
  ) => {
    if (!token) return;
    const quiet = Boolean(options?.quiet);
    if (!quiet) setDetailLoading(true);
    try {
      // `no-store` so the 15s background poll always sees fresh delivery /
      // read status instead of a cached body - otherwise ticks only update
      // on a hard page refresh.
      const res = await fetch(`${API_BASE}/inbox/contacts/${leadId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Failed to load conversation.");
        return;
      }

      // Bail out if the user navigated to a different lead while this request
      // was in flight - otherwise the stale response can clobber the new
      // selection, leaving the URL stuck on the previous lead and the thread
      // flickering as poll responses race the click.
      const current = selectedLeadIdRef.current;
      if (current != null && current !== leadId) return;

      const summary = contacts.find((contact) => contact.id === leadId);
      const emailMessages = Array.isArray(data?.email_messages)
        ? data.email_messages
        : [];
      const smsMessages = Array.isArray(data?.sms_messages)
        ? data.sms_messages
        : [];
      const unifiedMessages = Array.isArray(data?.unified_messages)
        ? data.unified_messages
        : [];
      const mergedContact: InboxContact = {
        ...(summary || {}),
        ...(data?.contact || {}),
        has_email_history:
          emailMessages.length > 0 || summary?.has_email_history,
        has_sms_history: smsMessages.length > 0 || summary?.has_sms_history,
        email_unread_count: 0,
        sms_unread_count: 0,
        total_unread_count: 0,
        preview:
          latestPreviewMessage(unifiedMessages) || summary?.preview || "",
        last_activity_at:
          latestTimestamp(unifiedMessages) || summary?.last_activity_at || null,
      };

      // Only adopt the leadId from an explicit (non-quiet) request - the
      // polling tick must not re-set selectedLeadId after the user navigates.
      if (!quiet) setSelectedLeadId(leadId);
      setSelectedContact(mergedContact);
      setMessagesByTab({
        email: emailMessages,
        sms: smsMessages,
        unified: unifiedMessages,
      });

      const serverAppointments = Array.isArray(data?.appointments)
        ? (data.appointments as InboxAppointmentRecord[])
        : [];
      // Always replace the lead's appointment list with the server's view so
      // cancellations / reschedules from elsewhere converge. mergeAppointments
      // is no longer correct here because the server is now authoritative.
      setLeadAppointmentsByLead((prev) => ({
        ...prev,
        [leadId]: serverAppointments.length
          ? mergeAppointmentsById(prev[leadId] || [], serverAppointments)
          : prev[leadId] || [],
      }));

      setContacts((current) => {
        // A deep-linked lead (URL ?lead= on reload, or a selection that sat past
        // the loaded/capped contacts window when the queue was busy) won't be in
        // the list. Inject it so the conversation row actually renders AND gets
        // highlighted - without this the thread opened but no list row matched
        // `selectedLeadId`, so nothing was highlighted after a refresh.
        if (!current.some((contact) => contact.id === leadId)) {
          return [
            { ...mergedContact, id: leadId, email_unread_count: 0, sms_unread_count: 0, total_unread_count: 0 },
            ...current,
          ];
        }
        return current.map((contact) =>
          contact.id === leadId
            ? {
                ...contact,
                ...mergedContact,
                email_unread_count: 0,
                sms_unread_count: 0,
                total_unread_count: 0,
              }
            : contact,
        );
      });

      if (!preserveComposer) {
        resetComposer(mergedContact);
      }
    } finally {
      if (!quiet) setDetailLoading(false);
    }
  };

  // Clear the active-conversation marker when leaving the inbox so notifications
  // resume popping toasts on other pages.
  useEffect(() => () => setActiveConversation(null), [setActiveConversation]);

  useEffect(() => {
    void fetchConnectionStatus();
    void fetchLeads();
    void fetchScheduledSummary();

    // Check if navigating from Dashboard with a selected lead
    const selectedLeadIdFromDashboard = localStorage.getItem(
      "selectedLeadIdFromDashboard",
    );
    if (selectedLeadIdFromDashboard) {
      const leadId = parseInt(selectedLeadIdFromDashboard, 10);
      setSelectedLeadId(leadId);
      fetchContactDetail(leadId, false);
      localStorage.removeItem("selectedLeadIdFromDashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the search box, then push the term to the backend `q` param.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setContactsQuery(search.trim());
    }, 500);
    return () => window.clearTimeout(handle);
  }, [search]);
  const contactsSearchPending = search.trim() !== contactsQuery;

  // Load the first page on mount and whenever the debounced search OR the active
  // filter chip changes (the chip is applied server-side, so it needs a fresh
  // first-page fetch rather than re-filtering the loaded window).
  useEffect(() => {
    if (!token) return;
    void loadFirstPageContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, contactsQuery, listFilter]);

  // One-shot fetch of auto-response settings to surface the configured
  // booking handoff user (or fall back to the spec's Calendly link in the
  // booking modal when none is set).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/auto-response`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { handoff_user_id?: number | null };
        if (!cancelled) {
          setBookingHandoffUserId(
            typeof data.handoff_user_id === "number" ? data.handoff_user_id : null,
          );
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [token, API_BASE]);

  // If the loaded contacts don't fill the scroll viewport, keep pulling pages.
  useEffect(() => {
    if (contactsLoading || contactsLoadingMore || !contactsHasMore) return;
    const el = contactsScrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 40) {
      void loadMoreContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, contactsHasMore, contactsLoading, contactsLoadingMore]);

  // Keep the latest poll behaviour in a ref so the interval below can mount
  // ONCE. Previously this effect depended on `selectedLeadId`, so every lead
  // switch tore down and recreated the interval - rapid clicking could briefly
  // stack multiple intervals before the old cleanup fired.
  const pollTickRef = useRef<() => void>(() => {});
  useEffect(() => {
    pollTickRef.current = () => {
      void fetchContacts(true, { guardEmpty: true });
      void fetchScheduledSummary();
      if (selectedLeadId) {
        void fetchContactDetail(selectedLeadId, true, { quiet: true });
      }
    };
  });

  useEffect(() => {
    const tick = () => pollTickRef.current();
    const intervalMs = document.hidden ? 60_000 : 20_000;
    const intervalId = window.setInterval(tick, intervalMs);
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (activeTab === "sms") {
      setComposeChannel("sms");
    } else if (activeTab === "email") {
      setComposeChannel("email");
    }
  }, [activeTab]);

  // SMS can't carry rich text. When the composer switches to the SMS channel,
  // flatten any formatting left over from the email composer down to plain
  // text so it isn't sent as (invisible) markup.
  useEffect(() => {
    if (currentChannel !== "sms") return;
    const el = bodyRef.current;
    if (!el) return;
    const plain = composerInnerPlain(el);
    if (el.innerHTML !== plain) {
      el.textContent = plain;
      setComposeBody(plain);
    }
  }, [currentChannel]);

  useEffect(() => {
    if (!isHeaderMenuOpen && !isContactActionMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsHeaderMenuOpen(false);
        setIsContactActionMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isHeaderMenuOpen, isContactActionMenuOpen]);

  useEffect(() => {
    if (!isHeaderMenuOpen && !isContactActionMenuOpen && !notifCenterOpen)
      return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        isHeaderMenuOpen &&
        headerMenuRef.current &&
        !headerMenuRef.current.contains(event.target as Node)
      ) {
        setIsHeaderMenuOpen(false);
      }

      if (
        isContactActionMenuOpen &&
        contactActionMenuRef.current &&
        !contactActionMenuRef.current.contains(event.target as Node)
      ) {
        setIsContactActionMenuOpen(false);
      }

      if (
        notifCenterOpen &&
        notifCenterRef.current &&
        !notifCenterRef.current.contains(event.target as Node)
      ) {
        setNotifCenterOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isHeaderMenuOpen, isContactActionMenuOpen, notifCenterOpen]);

  // AI Assist ▾ dropdown: close on outside-click or Escape.
  useEffect(() => {
    if (!assistOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        assistWrapRef.current &&
        !assistWrapRef.current.contains(event.target as Node)
      ) {
        setAssistOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAssistOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [assistOpen]);

  const handleSelectContact = async (
    contact: InboxContact,
    opts?: { preferredTab?: ViewTab },
  ) => {
    // Default channel tab: paid plans open on SMS, the free plan opens on Email
    // (SMS is locked on free). Fall back to Email if the contact has no phone.
    // A notification deep-link can override this with the channel it fired for.
    const defaultTab: ViewTab =
      opts?.preferredTab ??
      (isFreePlan || (!contact.phone && !contact.has_sms_history)
        ? "email"
        : "sms");
    setActiveTab(defaultTab);
    setComposeChannel(defaultTab === "sms" ? "sms" : "email");
    setIsHeaderMenuOpen(false);
    setIsContactActionMenuOpen(false);
    setMobileView("chat");
    resetComposer(contact);
    // Set selectedLeadId BEFORE updating the URL - the URL-watching effect's
    // guard (selectedLeadId === id) then short-circuits and avoids a second
    // fetchContactDetail call for the same lead. Update the ref synchronously
    // so a poll response for the previous lead can't overwrite the new pick.
    selectedLeadIdRef.current = contact.id;
    setSelectedLeadId(contact.id);
    setSearchParams({ lead: String(contact.id) }, { replace: true });
    // Opening the conversation clears any unread notifications tied to it AND
    // tells the notifications layer this thread is now active, so further
    // incoming messages for it are marked read instead of popping a reply toast.
    setActiveConversation(contact.id);
    markReadByContact(contact.id);
    await fetchContactDetail(contact.id, false);
  };

  // Deselect the open conversation - back to the "Select a conversation" pane on
  // desktop, and the conversation list on mobile. Used by the mobile Back button
  // and by clicking the already-active conversation again (toggle to close).
  const closeConversation = () => {
    selectedLeadIdRef.current = null;
    setSelectedLeadId(null);
    setSelectedContact(null);
    setActiveConversation(null);
    setMobileView("list");
    setSearchParams(
      (prev) => { const p = new URLSearchParams(prev); p.delete("lead"); return p; },
      { replace: true },
    );
  };

  // Clicking a conversation toggles it: open it, or close it if it is already
  // the active one.
  const handleConversationClick = (contact: InboxContact) => {
    if (selectedLeadId === contact.id) {
      closeConversation();
      return;
    }
    void handleSelectContact(contact);
  };

  const openDetailsForContact = async (contact: InboxContact) => {
    await handleSelectContact(contact);
    setIntelOpen(true);
  };
  useEffect(() => {
    openDetailsRef.current = openDetailsForContact;
  });

  const openContactDetails = () => {
    setIsHeaderMenuOpen(false);
    setIntelOpen(true);
  };

  // Honor a ?filter= deep-link (e.g. the dashboard's "Open inbox" / "View all"
  // links pass ?filter=needs_reply) so the conversation list opens pre-filtered.
  useEffect(() => {
    const raw = searchParams.get("filter");
    if (!raw) return;
    const valid: InboxListFilter[] = ["all", "needs_reply", "hot", "buyers", "sellers"];
    if ((valid as string[]).includes(raw)) setListFilter(raw as InboxListFilter);
    // Run once per URL filter value; the chip UI takes over after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const raw = searchParams.get("lead");
    if (!raw || contactsLoading || !contacts.length) return;
    const id = Number.parseInt(raw, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    // A notification deep-link carries the channel it fired for so we open on
    // the right tab and flash the newest inbound message.
    const channelParam = searchParams.get("channel");
    // Only act when the URL selection genuinely changed since we last handled
    // it. A `contacts` poll (or any other dep change) re-runs this effect; if
    // it fires during react-router's URL-commit lag right after a click, `raw`
    // still reads the OLD lead - and re-selecting it is the lead=5 -> lead=3 ->
    // lead=5 snap-back. The channel is included so a same-lead notification
    // deep-link (?channel=...) still re-highlights.
    const urlSelectionKey = `${raw}|${channelParam ?? ""}`;
    if (urlSelectionKey === lastUrlSelectionRef.current) return;
    lastUrlSelectionRef.current = urlSelectionKey;
    const preferredTab: ViewTab | undefined =
      channelParam === "email"
        ? "email"
        : channelParam === "sms"
          ? "sms"
          : undefined;
    // Strip the consumed channel hint so a later contacts refresh doesn't
    // re-fire this effect and re-highlight on every poll.
    const stripChannel = () => {
      if (channelParam)
        setSearchParams({ lead: String(id) }, { replace: true });
    };

    // Compare against the synchronous ref, NOT the `selectedLeadId` state, and
    // keep this effect keyed off the URL only (not selectedLeadId). When a
    // click sets selectedLeadId + the URL together, react-router can commit the
    // URL one render after the state, leaving a transient render where
    // selectedLeadId is the NEW lead but searchParams still reads the OLD one.
    // Reacting to that render with the stale URL made the effect "restore" the
    // old lead (the lead=5 -> lead=3 -> lead=5 snap-back).
    if (selectedLeadIdRef.current === id) {
      // Conversation already open: a fresh deep-link can still flip the tab and
      // re-highlight (e.g. an email alert while the SMS tab is showing).
      if (preferredTab) {
        setActiveTab(preferredTab);
        setComposeChannel(preferredTab === "sms" ? "sms" : "email");
        pendingHighlightRef.current = true;
        markReadByContact(id);
        stripChannel();
      }
      return;
    }

    if (preferredTab) pendingHighlightRef.current = true;
    const match = contacts.find((c) => c.id === id);
    if (match) {
      void handleSelectContact(match, { preferredTab });
      return;
    }
    // Deep-linked lead (e.g. from an SMS notification) isn't on the loaded
    // contacts page. Open the thread straight from the messages endpoint so it
    // resolves without the user having to scroll it into the list first.
    selectedLeadIdRef.current = id;
    setSelectedLeadId(id);
    if (preferredTab) {
      setActiveTab(preferredTab);
      setComposeChannel(preferredTab === "sms" ? "sms" : "email");
    }
    setMobileView("chat");
    markReadByContact(id);
    stripChannel();
    void fetchContactDetail(id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, contactsLoading, searchParams]);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_INBOX_WS_URL as string | undefined;
    if (!wsUrl || !token) return;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);
      socket.onmessage = () => {
        void fetchContacts(true);
        if (selectedLeadId)
          void fetchContactDetail(selectedLeadId, true, { quiet: true });
      };
    } catch {
      /* optional realtime */
    }
    return () => {
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedLeadId]);

  // Live refresh off the central notification socket (NotificationsProvider).
  // This is the reliable realtime path - VITE_INBOX_WS_URL above is an optional
  // fallback socket that is usually unset, which is why the open thread used to
  // only update on the 20s poll or a focus change. When a new inbound lands we
  // refresh the contacts list and, if it belongs to the open thread, the thread.
  useEffect(() => {
    if (!lastLiveNotification) return;
    void fetchContacts(true);
    const cid = lastLiveNotification.contact_id;
    if (cid && cid === selectedLeadIdRef.current) {
      void fetchContactDetail(cid, true, { quiet: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastLiveNotification]);

  // A reply sent from the global notification toast (which is a separate route)
  // asks the open thread to refresh so the outbound message appears immediately
  // instead of waiting for the next poll / focus change.
  useEffect(() => {
    const onRefresh = (e: Event) => {
      void fetchContacts(true);
      const cid = (e as CustomEvent<{ contactId?: number | null }>).detail
        ?.contactId;
      const open = selectedLeadIdRef.current;
      if (open && (!cid || cid === open)) {
        void fetchContactDetail(open, true, { quiet: true });
      }
    };
    window.addEventListener("wc:inbox-refresh", onRefresh);
    return () => window.removeEventListener("wc:inbox-refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flash the newest inbound message of the open tab once a notification
  // deep-link has loaded the thread. Keyed off the scroll anchor so it runs
  // after the messages for the active tab actually arrive.
  useEffect(() => {
    if (!pendingHighlightRef.current) return;
    if (!selectedMessages.length) return;
    const lastInbound = [...selectedMessages]
      .reverse()
      .find((m) => m.direction === "inbound");
    pendingHighlightRef.current = false;
    if (!lastInbound) return;
    setHighlightMsgId(lastInbound.id);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`inbox-msg-${lastInbound.id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(
      () => setHighlightMsgId(null),
      2600,
    );
  }, [messagesScrollAnchor, selectedMessages]);

  // Drop the highlight timer on unmount.
  useEffect(
    () => () => {
      if (highlightTimerRef.current)
        window.clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  // In-app toast + OS notification on new inbound messages is now handled
  // centrally by NotificationsProvider (driven off the server fan-out), so
  // this component just keeps the local unread baseline in sync to avoid
  // resetting state on re-fetch.
  useEffect(() => {
    if (contactsLoading) return;
    if (!unreadBaselineRef.current) {
      unreadBaselineRef.current = new Map(
        contacts.map((c) => [
          c.id,
          { e: c.email_unread_count || 0, s: c.sms_unread_count || 0 },
        ]),
      );
      return;
    }
    const baseline = unreadBaselineRef.current;
    for (const c of contacts) {
      baseline.set(c.id, {
        e: c.email_unread_count || 0,
        s: c.sms_unread_count || 0,
      });
    }
  }, [contacts, contactsLoading]);

  const updateLead = async (
    leadId: number,
    payload: Partial<Omit<ContactFormState, "tags">> & {
      tags?: string | string[];
      status?: string;
    } & Record<string, unknown>,
    options?: { silent?: boolean },
  ) => {
    const res = await fetch(`${API_BASE}/leads/${leadId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        org_id: orgId,
        tags: Array.isArray(payload.tags)
          ? payload.tags
          : parseTags(String(payload.tags || "")),
        status: payload.stage || payload.status,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "Failed to update contact");
    }

    await Promise.all([fetchContacts(true), fetchLeads()]);
    if (selectedLeadId === leadId) {
      await fetchContactDetail(leadId);
    }

    if (!options?.silent) {
      toast.success("Contact updated.");
    }
  };

  const handleToggleNotifications = async (channel: "email" | "sms") => {
    if (!contactForView) return;

    const currentValue =
      channel === "email"
        ? (contactForView.email_notifications_enabled ?? true)
        : (contactForView.sms_notifications_enabled ?? true);

    setSelectedContact((current) =>
      current
        ? {
            ...current,
            ...(channel === "email"
              ? { email_notifications_enabled: !currentValue }
              : { sms_notifications_enabled: !currentValue }),
          }
        : current,
    );
    setContacts((current) =>
      current.map((contact) =>
        contact.id === contactForView.id
          ? {
              ...contact,
              ...(channel === "email"
                ? { email_notifications_enabled: !currentValue }
                : { sms_notifications_enabled: !currentValue }),
            }
          : contact,
      ),
    );

    try {
      await updateLead(
        contactForView.id,
        {
          name: contactDisplayName(contactForView),
          email: contactForView.email || "",
          phone: contactForView.phone || "",
          stage: contactForView.stage || "New",
          price_range: contactForView.price_range || "",
          notes: contactForView.notes || "",
          tags: contactForView.tags || [],
          email_notifications_enabled:
            channel === "email"
              ? !currentValue
              : contactForView.email_notifications_enabled,
          sms_notifications_enabled:
            channel === "sms"
              ? !currentValue
              : contactForView.sms_notifications_enabled,
        },
        { silent: true },
      );
      toast.success(
        `${channel === "email" ? "Email" : "SMS"} notifications ${
          currentValue ? "disabled" : "enabled"
        }.`,
      );
    } catch (error) {
      toast.error((error as Error)?.message || "Failed to update notifications");
      await fetchContacts(true);
      if (contactForView.id) {
        await fetchContactDetail(contactForView.id);
      }
    }
  };

  // Per-lead AI on/off. A lead's AI is "on" unless its ai_status reads off /
  // paused / disabled. Toggling persists through the same updateLead path the
  // Edit Lead modal uses, so the AI agent's handling of inbound replies flips
  // with it (mirrors the Leads page AI Active control).
  const aiStatusIsOn = (c: InboxContact | null): boolean => {
    if (!c) return false;
    const s = String(c.ai_status || "").toLowerCase();
    if (!s) return true;
    return !(s === "off" || s === "paused" || s === "disabled" || s.includes("off"));
  };

  const handleToggleAiStatus = async () => {
    if (!contactForView) return;
    const next = aiStatusIsOn(contactForView) ? "off" : "AI Active";
    // Optimistic flip in both the open detail and the list row.
    setSelectedContact((cur) =>
      cur && cur.id === contactForView.id ? { ...cur, ai_status: next } : cur,
    );
    setContacts((current) =>
      current.map((c) =>
        c.id === contactForView.id ? { ...c, ai_status: next } : c,
      ),
    );
    try {
      await updateLead(
        contactForView.id,
        {
          name: contactDisplayName(contactForView),
          email: contactForView.email || "",
          phone: contactForView.phone || "",
          stage: contactForView.stage || "New",
          ai_status: next,
        },
        { silent: true },
      );
      toast.success(next === "off" ? "AI paused for this lead." : "AI enabled for this lead.");
    } catch (error) {
      toast.error((error as Error)?.message || "Failed to update AI status.");
      await fetchContacts(true);
    }
  };

  // Inline saves for the lead-intelligence sidebar (notes / address). We always
  // re-send name/email/phone/stage/tags so the lead PUT never clears them.
  const [editingAddress, setEditingAddress] = useState(false);
  const saveLeadField = async (
    patch: Record<string, unknown>,
    successMsg?: string,
  ) => {
    if (!contactForView) return;
    try {
      await updateLead(
        contactForView.id,
        {
          name: contactDisplayName(contactForView),
          email: contactForView.email || "",
          phone: contactForView.phone || "",
          stage: contactForView.stage || "New",
          tags: contactForView.tags || [],
          ...patch,
        },
        { silent: true },
      );
      if (successMsg) toast.success(successMsg);
    } catch (error) {
      toast.error((error as Error)?.message || "Failed to save.");
    }
  };

  // Lead-intelligence sidebar - spec section 4 ONLY: identity, lead info,
  // buyer/seller info, notes, call history, per-contact notifications.
  const isSellerLead = String(contactForView?.lead_type || "")
    .toLowerCase()
    .includes("sell");
  const contactDetailsPanelContent = contactForView ? (
    <>
      {/* Mobile-only close (drawer / bottom sheet). */}
      <div className="mb-1 flex justify-end lg:hidden">
        <button
          type="button"
          onClick={() => setIntelOpen(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500"
          aria-label="Close lead information"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* 1. Identity */}
      <div className="wc-intel-id">
        <div className="wc-intel-av">
          {initials(contactDisplayName(contactForView))}
        </div>
        <div className="min-w-0">
          <div className="wc-intel-name truncate">
            {contactDisplayName(contactForView)}
          </div>
          <div className="wc-intel-last">
            {contactForView.last_activity_label
              ? contactForView.last_activity_label
              : contactForView.last_activity_at
                ? `Last contact ${formatDateTime(contactForView.last_activity_at)}`
                : "No recent contact"}
          </div>
        </div>
      </div>

      {/* 2. Lead Information */}
      <div className="wc-intel-sec">
        <div className="wc-intel-sech">Lead Information</div>
        {/* AI Summary card - top of Lead Information, above the Phone row. */}
        {contactForView.ai_summary &&
        contactForView.ai_summary.trim() !== "" ? (
          <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-orange-600">
              <Icon name="sparkles" size={12} /> AI Summary
            </div>
            <p className="text-[13px] leading-relaxed text-gray-700">
              {contactForView.ai_summary}
            </p>
          </div>
        ) : null}
        <div className="wc-irow">
          <span>Phone</span>
          <b>{contactForView.phone || "—"}</b>
        </div>
        <div className="wc-irow">
          <span>Email</span>
          <b className="min-w-0 truncate">{contactForView.email || "—"}</b>
        </div>
        {contactForView.property_address || editingAddress ? (
          <div className="wc-irow">
            <span>Address</span>
            {editingAddress ? (
              <input
                className="wc-modal-input"
                style={{ height: 32, maxWidth: 190 }}
                autoFocus
                defaultValue={contactForView.property_address || ""}
                placeholder="123 Main St"
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingAddress(false);
                }}
                onBlur={(e) => {
                  setEditingAddress(false);
                  const v = e.target.value.trim();
                  if (v !== (contactForView.property_address || ""))
                    void saveLeadField({ property_address: v }, "Address saved.");
                }}
              />
            ) : (
              <b
                className="cursor-pointer hover:text-orange-600"
                onClick={() => setEditingAddress(true)}
              >
                {contactForView.property_address}
              </b>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="wc-intel-add"
            onClick={() => setEditingAddress(true)}
          >
            <Icon name="plus" size={14} /> Add address
          </button>
        )}
        <div className="wc-irow">
          <span>Source</span>
          <b>{contactForView.source || "—"}</b>
        </div>
        <div className="wc-irow">
          <span>Stage</span>
          <b>{contactForView.stage || "New"}</b>
        </div>
      </div>

      {/* 3. Buyer / Seller Information */}
      {isSellerLead ? (
        <div className="wc-intel-sec">
          <div className="wc-intel-sech">Seller Information</div>
          <div className="wc-irow">
            <span>Address</span>
            <b>{contactForView.property_address || "—"}</b>
          </div>
          <div className="wc-irow">
            <span>Est. Value</span>
            <b>
              {contactForView.seller_price_expectations ||
                contactForView.price_range ||
                "—"}
            </b>
          </div>
          <div className="wc-irow">
            <span>Timeline</span>
            <b>{contactForView.timeline || "—"}</b>
          </div>
        </div>
      ) : (
        <div className="wc-intel-sec">
          <div className="wc-intel-sech">Buyer Information</div>
          <div className="wc-irow">
            <span>Budget</span>
            <b>{contactForView.price_range || "—"}</b>
          </div>
          <div className="wc-irow">
            <span>Area</span>
            <b>{contactForView.area || "—"}</b>
          </div>
          <div className="wc-irow">
            <span>Timeline</span>
            <b>{contactForView.timeline || "—"}</b>
          </div>
          <div className="wc-irow">
            <span>Pre-Approved</span>
            <b className={contactForView.pre_approved ? "ok" : ""}>
              {contactForView.pre_approved == null
                ? "—"
                : contactForView.pre_approved
                  ? "Yes"
                  : "No"}
            </b>
          </div>
        </div>
      )}

      {/* 4. Notes */}
      <div className="wc-intel-sec">
        <div className="wc-intel-sech">Notes</div>
        <textarea
          key={contactForView.id}
          className="wc-notes-ta"
          defaultValue={contactForView.notes || ""}
          placeholder="Add a note about this lead…"
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (contactForView.notes || ""))
              void saveLeadField({ notes: v }, "Note saved.");
          }}
        />
      </div>

      {/* 5. Call history */}
      {contactForView.phone ? (
        <div className="wc-intel-sec">
          <div className="wc-intel-sech">Call History</div>
          <CallHistoryList phoneNumber={contactForView.phone} />
        </div>
      ) : null}

      {/* 6. Per-Contact Notifications */}
      <div className="wc-intel-sec">
        <div className="wc-intel-sech">Notifications</div>
        <div className="wc-cc-notif">
          <button
            type="button"
            onClick={() => handleToggleNotifications("email")}
            className="wc-cc-notifrow"
          >
            <div>
              <div className="wc-cc-notif-t">Email Notifications</div>
              <div className="wc-cc-notif-s">
                {contactForView.email_notifications_enabled
                  ? `${contactForView.email_unread_count || 0} unread email${
                      (contactForView.email_unread_count || 0) === 1 ? "" : "s"
                    }`
                  : "Notifications off"}
              </div>
            </div>
            <Bell
              size={18}
              className={`wc-cc-bell ${
                contactForView.email_notifications_enabled ? "is-on" : "is-off"
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => handleToggleNotifications("sms")}
            className="wc-cc-notifrow"
          >
            <div>
              <div className="wc-cc-notif-t">SMS Notifications</div>
              <div className="wc-cc-notif-s">
                {contactForView.sms_notifications_enabled
                  ? `${contactForView.sms_unread_count || 0} unread SMS${
                      (contactForView.sms_unread_count || 0) === 1 ? "" : "s"
                    }`
                  : "Notifications off"}
              </div>
            </div>
            <Bell
              size={18}
              className={`wc-cc-bell ${
                contactForView.sms_notifications_enabled ? "is-on" : "is-off"
              }`}
            />
          </button>
        </div>
      </div>
    </>
  ) : null;

  const handleUploadComposeAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingComposeAttachments(true);
    try {
      const uploaded = await uploadMessageAttachments(API_BASE, token, files);
      setComposeAttachments((current) => [...current, ...uploaded]);
    } catch (error) {
      toast.error((error as Error)?.message || "Failed to upload attachments");
    } finally {
      setUploadingComposeAttachments(false);
    }
  };


  // const handleGenerateComposeAi = async () => {
  //   if (!contactForView) {
  //     toast.error("Select a contact first.");
  //     return;
  //   }
  //   // setComposeLoadingAI(true);
  //   try {
  //     const result = await generateAiLeadMessageDraft({
  //       apiBase: API_BASE,
  //       token,
  //       channel: currentChannel,
  //       currentMessage: composeBody,
  //       leadData: [contactForView],
  //       prompt:
  //         currentChannel === "sms"
  //           ? "Create a concise, personalized SMS outreach message for this lead."
  //           : "Create a personalized outreach email message for this lead.",
  //     });
  //     const text = result.text.trim();
  //     setComposeBody(text);
  //     if (bodyRef.current) {
  //       bodyRef.current.textContent = text;
  //     }
  //   } catch (error) {
  //     toast.error((error as Error)?.message || "Failed to generate AI message.");
  //   } finally {
  //     // setComposeLoadingAI(false);
  //   }
  // };

  const handleAppointment = () => {
    setAppointmentModalEditing(null);
    setIsOpen(true);
  };

  const handleRescheduleThreadAppointment = (row: InboxAppointmentRecord) => {
    setAppointmentModalEditing(row);
    setIsOpen(true);
  };

  const handleCancelThreadAppointment = (row: InboxAppointmentRecord) => {
    const leadId = contactForView?.id ?? selectedLeadId;
    if (!leadId) {
      toast.error("Select a conversation first.");
      return;
    }
    setAppointmentPendingCancel(row);
    setCancelConfirmOpen(true);
  };

  const handleDismissCancelConfirm = () => {
    setCancelConfirmOpen(false);
    setAppointmentPendingCancel(null);
  };

  const handleConfirmCancelAppointment = async (channels: {
    sendSms: boolean;
    sendEmail: boolean;
  }) => {
    const row = appointmentPendingCancel;
    const leadId = contactForView?.id ?? selectedLeadId;
    if (!row || !leadId) {
      handleDismissCancelConfirm();
      return;
    }
    setCancelingAppointment(true);
    try {
      const res = await postInboxAppointmentCancel(leadId, row.id, channels);
      if (res?.success) {
        toast.success("Appointment cancelled.");
        const confirmations = (
          res as { confirmations?: { email?: string; sms?: string } }
        )?.confirmations;
        if (
          confirmations?.sms &&
          String(confirmations.sms).toLowerCase().startsWith("failed")
        ) {
          const msg = String(confirmations.sms).replace(/^failed:?\s*/i, "").trim();
          toast.error(msg || "SMS cancellation notice failed.");
        }
        if (
          confirmations?.email &&
          String(confirmations.email).toLowerCase().startsWith("failed")
        ) {
          const msg = String(confirmations.email).replace(/^failed:?\s*/i, "").trim();
          toast.error(msg || "Email cancellation notice failed.");
        }
        setLeadAppointmentsByLead((prev) => {
          const list = prev[leadId] || [];
          return {
            ...prev,
            [leadId]: list.map((a) =>
              a.id === row.id ? { ...a, status: "cancelled" } : a,
            ),
          };
        });
        // Quiet refresh: the optimistic status flip above already shows the
        // cancelled state, so we converge silently instead of replacing the
        // whole thread with the "Loading thread..." spinner.
        await fetchContactDetail(leadId, true, { quiet: true });
        // Keep the dashboard + calendar caches in sync so the cancelled
        // appointment drops off the "Upcoming Schedule" without a hard refresh.
        queryClient.invalidateQueries({ queryKey: ["org_appointments"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard_data"] });
      }
    } finally {
      setCancelingAppointment(false);
      handleDismissCancelConfirm();
    }
  };

  const handleInboxAppointmentSubmit = async (
    payload: InboxAppointmentPayload,
  ) => {
    const leadId = contactForView?.id ?? selectedLeadId;
    if (!leadId) {
      toast.error("Select a conversation first.");
      return;
    }
    const res = appointmentModalEditing
      ? await patchInboxAppointment(leadId, appointmentModalEditing.id, payload)
      : await postInboxAppointment(leadId, payload);

    const appointment = (res as { appointment?: InboxAppointmentRecord })
      ?.appointment;
    if (!res?.success || !appointment?.id) {
      return;
    }

    const confirmations = (
      res as { confirmations?: { email?: string; sms?: string } }
    )?.confirmations;
    const contactPatch = (res as { contact?: Partial<InboxContact> })?.contact;

    setLeadAppointmentsByLead((prev) => ({
      ...prev,
      [leadId]: mergeAppointmentsById(prev[leadId] || [], [appointment]),
    }));

    if (contactPatch && typeof contactPatch === "object") {
      setSelectedContact((cur) =>
        cur?.id === leadId ? { ...cur, ...contactPatch } : cur,
      );
      setContacts((current) =>
        current.map((c) => (c.id === leadId ? { ...c, ...contactPatch } : c)),
      );
    }

    if (
      confirmations?.sms &&
      String(confirmations.sms).toLowerCase().startsWith("failed")
    ) {
      const msg = String(confirmations.sms)
        .replace(/^failed:?\s*/i, "")
        .trim();
      toast.error(msg || "SMS confirmation failed.");
    }
    if (
      confirmations?.email &&
      String(confirmations.email).toLowerCase().startsWith("failed")
    ) {
      const msg = String(confirmations.email)
        .replace(/^failed:?\s*/i, "")
        .trim();
      toast.error(msg || "Email confirmation failed.");
    }

    toast.success(
      appointmentModalEditing ? "Appointment updated!" : "Appointment booked!",
    );

    setIsOpen(false);
    setAppointmentModalEditing(null);
    // The appointment is already merged into leadAppointmentsByLead above, so
    // the timeline picks it up immediately. Skip the full conversation reload -
    // that was causing the chat to flicker/reload instead of appending.
    // Invalidate the shared caches the dashboard + calendar read from so their
    // "Upcoming Schedule" / KPI strip reflect the new appointment without a hard
    // refresh (these read ["org_appointments"] / ["dashboard_data"]).
    queryClient.invalidateQueries({ queryKey: ["org_appointments"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_data"] });
  };

  /**
   * Persist newLeadForm. When editingLeadIdInbox is non-null we PUT to update
   * the lead; otherwise we delegate to createLeadFromInbox (the existing add
   * flow). This is the single onSave the unified AddLeadModal uses.
   */
  const saveLeadFromInbox = async (): Promise<{ ok: boolean; error?: string }> => {
    if (editingLeadIdInbox != null) {
      try {
        const tags = newLeadForm.tags
          ? newLeadForm.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [];
        await updateLead(
          editingLeadIdInbox,
          { ...newLeadForm, sms_consent_status: newLeadConsent, tags },
          { silent: true },
        );
        setShowAddContactModal(false);
        setEditingLeadIdInbox(null);
        toast.success("Lead updated.");
        return { ok: true };
      } catch (error) {
        const msg = (error as Error)?.message || "Failed to update lead";
        toast.error(msg);
        return { ok: false, error: msg };
      }
    }
    return createLeadFromInbox();
  };

  // Step 1: create the lead from the inbox "Add lead" modal (same AddLeadModal +
  // two-step flow the Leads page uses). Validation + duplicate check happen here,
  // before the campaign step. Returns a result so the modal can show errors.
  const createLeadFromInbox = async (): Promise<{ ok: boolean; error?: string }> => {
    setAddContactSaving(true);
    try {
      const hasPhone = Boolean(newLeadForm.phone?.trim());
      const payload = {
        ...newLeadForm,
        lead_type: newLeadForm.lead_type ? newLeadForm.lead_type.toLowerCase() : newLeadForm.lead_type,
        ai_status: "off",
        tags: newLeadForm.tags ? newLeadForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        org_id: orgId,
        owner_id: userId,
        source: newLeadForm.source?.trim() || "Manual Add",
        sms_consent_status: newLeadConsent,
        send_sms_opt_in_request: hasPhone && newLeadConsent === "unknown",
        sms_consent_attested: hasPhone,
        opt_in_source: "manual_lead_entry",
        consent_page_url: `${window.location.origin}/inbox`,
        auto_followup_action: "dont_send",
      };
      const res = await fetch(`${API_BASE}/leads/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.message || "Failed to add lead" };
      const newLeadId = Number((data as { lead?: { id?: number } })?.lead?.id);
      setInboxPendingEnrollLeadId(Number.isInteger(newLeadId) ? newLeadId : null);
      await fetchLeads();
      setShowAddContactModal(false);
      setShowInboxCampaignGate(true);
      toast.success("Lead added.");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error)?.message || "Failed to add lead" };
    } finally {
      setAddContactSaving(false);
    }
  };

  // Step 2: enroll the just-created lead via the shared apply-ai path.
  const enrollInboxLead = async (choice: AddLeadCampaignChoice) => {
    const leadId = inboxPendingEnrollLeadId;
    setShowInboxCampaignGate(false);
    if (Number.isInteger(leadId)) {
      try {
        await fetch(`${API_BASE}/leads/import/${orgId}/apply-ai`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_ids: [leadId],
            enabled: true,
            channel: "sms",
            automation_id: choice.automationId ?? 0,
            inbound_enabled: choice.inboundEnabled,
          }),
        });
        await fetchLeads();
      } catch {
        /* lead created; enrollment failure is non-fatal */
      }
    }
    setInboxPendingEnrollLeadId(null);
    setNewLeadForm({ ...DEFAULT_NEW_LEAD });
    setNewLeadConsent("opted_in");
  };

  const handleDeleteLead = async () => {
    if (!contactForView) return;
    const deletedId = contactForView.id;
    try {
      const res = await fetch(`${API_BASE}/leads/delete/${deletedId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          (data as { message?: string }).message || "Could not delete contact.",
        );
        return;
      }
      toast.success("Contact deleted.");
      setShowDeleteLeadConfirm(false);
      setIsHeaderMenuOpen(false);
      // Close the open conversation AND drop the deleted contact from the list
      // immediately (optimistic) so the inbox reflects the removal at once - and
      // shows the empty state if it was the last one - rather than waiting for
      // the refetch. The explicit refetch below (no empty-guard) reconciles.
      closeConversation();
      setContacts((current) => current.filter((c) => c.id !== deletedId));
      await fetchContacts(true);
    } catch {
      toast.error("Network error while deleting.");
    }
  };

  // The "Block contact" handler is inlined directly in the menu button's
  // onClick (see the right-panel header above). Inlining was chosen over a
  // hoisted handler to keep react-hooks/immutability happy and because this
  // is the action's only call site.


  // Warn (confirm) before generating once the post-spend balance would be at or
  // below this many AI credits, so the user isn't surprised when they run out.
  const AI_CREDITS_LOW_THRESHOLD = 10;

  // AI Assist ▾ presets. Each rewrites the current draft in place by calling
  // callAiImprove with `tone` as the steering instruction. "Follow-up
  // suggestion" / "Appointment push" can draft from scratch when empty; the
  // tone-only rewrites no-op on an empty draft.
  const AI_ASSIST_PRESETS: {
    label: string;
    tone: string;
    allowEmpty: boolean;
  }[] = [
    { label: "Make professional", tone: "Professional", allowEmpty: false },
    {
      label: "Make shorter",
      tone: "Concise — shorter and tighter",
      allowEmpty: false,
    },
    { label: "Make friendlier", tone: "Friendly and warm", allowEmpty: false },
    {
      label: "Appointment push",
      tone: "Encourage booking an appointment / showing",
      allowEmpty: true,
    },
    {
      label: "Follow-up suggestion",
      tone: "A gentle follow-up nudge",
      allowEmpty: true,
    },
  ];

  // Set the contentEditable composer body programmatically and sync state. Uses
  // the same mechanism the AI suggestion apply path uses (textContent + caret to
  // end) so it behaves like the rest of the composer.
  const setComposerDraft = (text: string, focusComposer = true) => {
    const el = bodyRef.current;
    if (el) el.textContent = text;
    setComposeBody(text);
    if (focusComposer && el) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  };

  const applyAssist = async (preset: (typeof AI_ASSIST_PRESETS)[number]) => {
    setAssistOpen(false);
    const draft = composerInnerPlain(bodyRef.current).trim();
    if (!draft && !preset.allowEmpty) {
      toast.error("Type a message first");
      return;
    }
    if (assistBusy) return;

    // Credit check/warning before generating. SMS costs 1, email costs 2 (these
    // map onto the org's monthly AI quota). remaining === null => unlimited.
    const cost = aiCredits?.cost?.[currentChannel === "email" ? "email" : "sms"]
      ?? (currentChannel === "email" ? 2 : 1);
    const remaining = aiCredits?.remaining ?? null;
    if (remaining !== null) {
      if (remaining < cost) {
        toast.error(
          `Not enough AI credits — this ${currentChannel === "email" ? "email" : "SMS"} needs ${cost}, you have ${remaining} left this month.`,
        );
        return;
      }
      if (remaining - cost <= AI_CREDITS_LOW_THRESHOLD) {
        const ok = window.confirm(
          `You have ${remaining} AI credits left this month. This will use ${cost}. Continue?`,
        );
        if (!ok) return;
      }
    }

    // Recent thread context (last 10 real messages, oldest first) so the draft
    // continues the conversation instead of guessing.
    const history = selectedMessages
      .filter((m) => m.direction !== "system" && (m.body || "").trim())
      .slice(-10)
      .map((m) => ({
        direction: m.direction === "outbound" ? ("outbound" as const) : ("inbound" as const),
        text: (m.body || "").trim(),
      }));

    setAssistBusy(true);
    try {
      const res = await callAiImprove(token, {
        message: draft,
        mode: "rewrite_full",
        channel: currentChannel,
        tone: preset.tone,
        persona: "Real Estate Agent",
        lead_data: contactForView ? [contactForView] : [],
        want_subject: currentChannel === "email",
        history,
      });
      // Email: drop the generated subject into the subject field, body into the
      // composer. SMS: body only.
      if (currentChannel === "email" && res.subject) setComposeSubject(res.subject);
      setComposerDraft(res.improved_message);
      // Credits were spent only on success — refresh the meter.
      refreshAiCredits();
    } catch (error) {
      toast.error(
        (error as Error)?.message || "AI Assist failed. Try again.",
      );
    } finally {
      setAssistBusy(false);
    }
  };

  const handleSendCurrentMessage = async () => {
    if (!contactForView) {
      toast.error("Select a conversation first.");
      return;
    }

    const draftPlain = composerInnerPlain(bodyRef.current).trim();

    const validationError = validatePersonalization(
      currentChannel === "email" ? composeSubject : undefined,
      draftPlain,
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!draftPlain && composeAttachments.length === 0) {
      toast.error("Write a message or attach a file before sending.");
      return;
    }

    const renderedBody = renderPersonalizedText(
      draftPlain,
      contactForView,
      senderPreview,
    );
    const renderedSubject =
      currentChannel === "email"
        ? renderPersonalizedText(
            composeSubject.trim(),
            contactForView,
            senderPreview,
          )
        : "";

    if (
      currentChannel === "sms" &&
      smsSegmentCount(renderedBody) > SMS_MAX_SEGMENTS
    ) {
      const maxChars = SMS_SEGMENT_LENGTH * SMS_MAX_SEGMENTS;
      toast.error(
        `SMS must stay within ${maxChars} characters after personalization (${SMS_MAX_SEGMENTS} segments max).`,
      );
      return;
    }

    setSending(true);
    try {
      const attemptSend = async (confirmQuietHours: boolean): Promise<boolean> => {
        if (currentChannel === "email") {
          if (!contactForView.email) {
            toast.error("This contact does not have an email address.");
            return false;
          }

          const resolvedSenderType: SenderType = hasVerifiedBusinessEmail
            ? "business"
            : "personal";

          if (resolvedSenderType === "personal" && gmailStatus !== "connected") {
            toast.error("Connect Gmail before sending email.");
            return false;
          }

          if (resolvedSenderType === "business" && domainStatus !== "verified") {
            toast.error("Verify a business email before sending from it.");
            return false;
          }

          const { res, data } = await sendInboxEmail({
            apiBase: API_BASE,
            token,
            userId,
            orgId,
            senderName: userName,
            to: contactForView.email,
            subject: renderedSubject,
            body: renderedBody,
            leadId: contactForView.id,
            threadId: contactForView.latest_email_thread_id,
            senderType: resolvedSenderType,
            attachments: composeAttachments,
            confirmQuietHours,
          });

          if (res.status === 403 && data?.code === "NEEDS_REAUTH") {
            toast.error("Reconnect Gmail before sending email.");
            return false;
          }

          if (res.status === 403 && data?.upgrade_required) {
            toast.error(data?.message || "Upgrade required to continue sending.");
            return false;
          }

          if (!res.ok) {
            toast.error(data?.error || data?.message || "Failed to send email.");
            return false;
          }
          return true;
        }

        if (!contactForView.phone) {
          toast.error("This contact does not have a phone number.");
          return false;
        }

        if (!smsConnected) {
          toast.error("Complete SMS activation before sending SMS.");
          return false;
        }

        const { res, data } = await sendInboxSms({
          smsApiBase: SMS_API_BASE,
          token,
          to: contactForView.phone,
          body: renderedBody,
          leadId: contactForView.id,
          attachments: composeAttachments,
          confirmQuietHours,
        });

        if (!res.ok) {
          const errorMessage = extractSmsErrorMessage(data);
          if (isSmsPendingConfirmationError(errorMessage)) {
            toast.error(
              "SMS opt-in is pending. The contact must reply YES first.",
            );
            return false;
          }
          if (isSmsConsentError(errorMessage)) {
            toast.error("SMS consent is required before sending.");
            return false;
          }
          toast.error(errorMessage || "Failed to send SMS.");
          return false;
        }
        return true;
      };

      let succeeded = false;
      try {
        succeeded = await attemptSend(false);
      } catch (err) {
        if (err instanceof QuietHoursError) {
          const proceed = await askQuietHours({
            timezone: err.timezone,
            hour: err.hour,
            until: err.until,
          });
          if (!proceed) return;
          succeeded = await attemptSend(true);
        } else {
          throw err;
        }
      }
      if (!succeeded) return;

      // First-value-moment analytics. Mirrors NewMessage; the helper is
      // globally gated (once per user across every surface), so firing it for
      // whichever channel sent the first message restores the reply tracking the
      // removed standalone SMS/email thread pages used to own.
      trackFirstMessageSent({
        channel: currentChannel === "email" ? "Email" : "SMS",
        recipient_count: 1,
        surface: "thread_reply",
        ...(currentChannel === "email"
          ? { sender_type: hasVerifiedBusinessEmail ? "business" : "personal" }
          : {}),
      });

      resetComposer(contactForView);
      // Quiet refresh so the new message appends to the bottom instead of the
      // whole thread blanking to the "Loading thread..." spinner. The composer
      // was already reset above, so preserveComposer=true avoids a double reset.
      await Promise.all([
        fetchContacts(true),
        fetchContactDetail(contactForView.id, true, { quiet: true }),
      ]);
      toast.success(
        `${currentChannel === "email" ? "Email" : "SMS"} sent to ${contactDisplayName(contactForView)}.`,
      );
    } finally {
      setSending(false);
    }
  };

  const contactsEmpty = !contactsLoading && contacts.length === 0;
  const hasScheduledQueue = !!scheduledSummary && scheduledSummary.pending > 0;

  // Calls tab: same MainLayout chrome + the Messages|Calls switcher, with the
  // embedded CallsPage body. Early-return keeps the large messages JSX below
  // untouched.
  if (inboxTopTab === "calls") {
    return (
      <MainLayout flush title="Inbox">
        <div className="mb-4">
          <InboxTabs active="calls" onChange={setTab} />
        </div>
        <CallsPage embedded />
      </MainLayout>
    );
  }

  return (
    <MainLayout flush title="Inbox">
      <Toaster position="top-right" />
      {quietHoursModal}

      <div
        className="wcv2 wc-inboxwrap"
        data-bp={bp}
        data-view={mobileView === "list" ? "list" : "thread"}
        data-intel={intelOpen ? "open" : "closed"}
      >
        <div>
          <InboxTabs active="messages" onChange={setTab} />
        </div>

      <div className="wcv2 flex min-h-0 min-w-0 flex-col gap-3 overflow-x-hidden lg:min-h-[calc(100dvh-4rem-53px)] xl:h-[calc(100dvh-4rem-53px)] xl:overflow-hidden">
        {contactsLoading && contacts.length === 0 ? (
          <section className="flex min-h-80 flex-1 items-center justify-center overflow-hidden rounded-4xl bg-white text-sm text-gray-500 shadow-xs ring-1 ring-black/5 mb-2.5">
            <Loader2 size={18} className="mr-2 animate-spin" />
            Loading conversations...
          </section>
        ) : contactsEmpty ? (
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-4xl bg-white shadow-xs ring-1 ring-black/5 mb-2.5">
            <div className="flex min-h-0 flex-1 flex-col p-6 sm:p-10 *:flex-1">
              <EmptyStateCard
                icon="mail"
                title="No conversations yet"
                description="Start your first message to a lead."
                primaryLabel="New Message"
                secondaryLabel="Add Lead"
                onPrimary={() => setShowNewMessageModal(true)}
                onSecondary={openAddLead}
                footer={hasScheduledQueue ? <ScheduledStrip summary={scheduledSummary} /> : undefined}
              />
            </div>
          </section>
        ) : (
          <div className="wc-inbox flex min-h-0 flex-1 overflow-hidden bg-white">
            {/* LEFT COLUMN - conversation list (spec section 2) */}
            <div
              className="wc-ibx-list"
              style={
                isContactsCollapsed && (bp === "xl" || bp === "lg")
                  ? { display: "none" }
                  : undefined
              }
            >
            <section className="flex h-full w-full min-w-0 flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Conversations
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => setShowNewMessageModal(true)}
                    className="inline-flex items-center gap-1 rounded-xl bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600"
                  >
                    <Plus size={12} />
                    New
                  </button>
                  <button
                    onClick={openAddLead}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-orange-200 bg-white text-orange-600 transition hover:border-orange-300"
                    title="Add Lead"
                    aria-label="Add Lead"
                  >
                    <UserPlus size={13} />
                  </button>
                  <button
                    onClick={() => setIsContactsCollapsed(true)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
                    title="Collapse contacts"
                    aria-label="Collapse contacts panel"
                  >
                    <PanelLeftClose size={14} />
                  </button>
                </div>
              </div>

              {hasScheduledQueue ? (
                <div className="border-b border-gray-100 px-3 py-2">
                  <ScheduledStrip summary={scheduledSummary} />
                </div>
              ) : null}

              <div className="wc-ibx-listhead">
                <div className="wc-ibx-search">
                  <Icon name="search" size={15} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search conversations..."
                  />
                  {contactsSearchPending ? (
                    <Loader2 size={13} className="animate-spin text-gray-400" />
                  ) : null}
                </div>
                <div className="wc-ibx-filters">
                  {INBOX_LIST_FILTERS.map((chip) => {
                    // Prefer the server's true org-wide count; fall back to the
                    // loaded-window count until the first response lands.
                    const n = serverFilterCounts?.[chip.key] ?? filterCounts[chip.key] ?? 0;
                    return (
                      <button
                        key={chip.key}
                        type="button"
                        className={`wc-ibx-fchip${
                          listFilter === chip.key ? " is-on" : ""
                        }`}
                        onClick={() => setListFilter(chip.key)}
                      >
                        {chip.label}
                        <span className="wc-ibx-fcount">{n}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                ref={contactsScrollRef}
                onScroll={handleContactsScroll}
                className="wc-ibx-convos min-h-0 flex-1 overflow-y-auto"
              >
                {contactsLoading ? (
                  <div className="flex items-center justify-center rounded-3xl border border-gray-100 bg-gray-50 px-4 py-10 text-sm text-gray-500">
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Loading conversations...
                  </div>
                ) : displayedContacts.length === 0 ? (
                  filteredContacts.length > 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-gray-500">
                      No conversations match this filter.
                    </div>
                  ) : (
                    <EmptyStateCard
                      title="No Messages Yet"
                      description="When a contact replies or you start a conversation, it will appear here with CRM context and separate SMS and email unread counts."
                      primaryLabel="Add Message"
                      secondaryLabel="Add Lead"
                      onPrimary={() => setShowNewMessageModal(true)}
                      onSecondary={openAddLead}
                    />
                  )
                ) : (
                  <>
                    {displayedContacts.map((contact) => {
                    const active = selectedLeadId === contact.id;
                    const unread = contact.total_unread_count || 0;
                    const needsReply = Boolean(contact.needs_reply);
                    const stage = contact.stage || contact.status || null;
                    const leadType = getLeadType(contact as Record<string, unknown>);
                    const hot = isHotStage(contact as Record<string, unknown>);
                    return (
                      <div
                        key={contact.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleConversationClick(contact)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleConversationClick(contact);
                          }
                        }}
                        className={`wc-convo cursor-pointer${active ? " is-active" : ""}${unread ? " is-unread" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openDetailsForContact(contact);
                          }}
                          className="wc-convo-av transition hover:ring-2 hover:ring-orange-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange-300"
                          aria-label={`Open details for ${contactDisplayName(contact)}`}
                        >
                          {initials(contactDisplayName(contact))}
                        </button>

                        <div className="wc-convo-body">
                          <div className="wc-convo-top">
                            <span className="wc-convo-name truncate">
                              {contactDisplayName(contact)}
                            </span>
                            <span className="wc-convo-time">
                              {formatRelativeTime(contact.last_activity_at)}
                            </span>
                          </div>

                          {/* Badges row - all derived from existing contact data */}
                          {(needsReply ||
                            hot ||
                            stage ||
                            leadType !== "Unknown" ||
                            (contact.tags && contact.tags.length > 0)) && (
                            <div className="wc-convo-badges">
                              {needsReply ? (
                                <span
                                  className="wc-cbadge mini"
                                  style={{ color: "#D97706", background: "#FEF3C7" }}
                                >
                                  <Icon name="message" size={11} />
                                  Needs Reply
                                </span>
                              ) : null}
                              {hot ? (
                                <span
                                  className="wc-cbadge mini"
                                  style={{ color: "#DC2626", background: "#FEE2E2" }}
                                >
                                  <Icon name="flame" size={11} />
                                  Hot
                                </span>
                              ) : null}
                              {leadType !== "Unknown" ? (
                                <span className="wc-convo-stage">{leadType}</span>
                              ) : null}
                              {stage ? (
                                <span className="wc-convo-stage">{stage}</span>
                              ) : null}
                              {contact.tags?.slice(0, 2).map((tag) => (
                                <span key={tag} className="wc-convo-stage">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="wc-convo-last">
                            {contact.preview || "No recent messages"}
                          </div>
                        </div>

                        {unread > 0 ? (
                          <span className="wc-convo-unread">{unread}</span>
                        ) : null}
                      </div>
                    );
                  })}
                    {contactsLoadingMore ? (
                      <div className="flex items-center justify-center py-3 text-xs text-gray-400">
                        <Loader2 size={14} className="mr-2 animate-spin" />
                        Loading more...
                      </div>
                    ) : contactsHasMore ? (
                      <div className="py-2 text-center text-[11px] text-gray-300">
                        Scroll to load more
                      </div>
                    ) : displayedContacts.length > CONTACTS_PAGE_SIZE ? (
                      <div className="py-2 text-center text-[11px] text-gray-300">
                        You're all caught up
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
            </div>
            {/* End collapsible contacts panel */}

            {/* CENTER COLUMN - message thread (spec section 3) */}
            <section className="wc-ibx-thread flex min-h-0 min-w-0 flex-1 flex-col">
              {!contactForView ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-5 p-10 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
                    <MessageSquare size={36} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Select a conversation</h3>
                    <p className="mt-1 text-sm text-gray-500">Choose a contact from the left to start messaging</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isContactsCollapsed && (
                      <button
                        type="button"
                        onClick={() => setIsContactsCollapsed(false)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:text-orange-600"
                      >
                        <PanelLeftOpen size={16} />
                        Show contacts
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowNewMessageModal(true)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                    >
                      <Plus size={16} />
                      New Message
                    </button>
                  </div>
                  {hasScheduledQueue ? (
                    <ScheduledStrip summary={scheduledSummary} />
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="wc-thread-head">
                      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                        {/* Phone: back to list. (CSS shows only <768px.) */}
                        <button
                          type="button"
                          onClick={closeConversation}
                          className="wc-thread-back"
                          aria-label="Back to conversations"
                          title="Back to conversations"
                        >
                          <ArrowLeft size={16} />
                        </button>
                        {isContactsCollapsed && (bp === "xl" || bp === "lg") && (
                          <button
                            type="button"
                            onClick={() => setIsContactsCollapsed(false)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-orange-200 hover:text-orange-600"
                            aria-label="Show contacts"
                            title="Show contacts"
                          >
                            <PanelLeftOpen size={16} />
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="wc-thread-name">
                            <button
                              type="button"
                              onClick={openContactDetails}
                              className="min-w-0 truncate text-left hover:text-orange-600"
                            >
                              {contactDisplayName(contactForView)}
                            </button>
                            {/* Narrow screens: icon-only Call sits beside the
                                name; the right-cluster Call is hidden then. */}
                            <CallButton
                              className="wc-call-inline shrink-0"
                              hideMenu
                              iconOnly
                              size="sm"
                              phoneNumber={contactForView.phone}
                              name={contactDisplayName(contactForView)}
                            />
                          </div>
                          {/* Sub line: AI On/Off toggle + stage chip (moved off
                              the name line to save horizontal space) + quiet-hours
                              alert. Lead details live in the sidebar. */}
                          <div className="wc-thread-sub">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={aiStatusIsOn(contactForView)}
                              onClick={() => void handleToggleAiStatus()}
                              className={`wc-ai-toggle${aiStatusIsOn(contactForView) ? " is-on" : ""}`}
                              title="Toggle AI handling for this lead"
                            >
                              <span className="wc-ai-toggle-track">
                                <span className="wc-ai-toggle-knob" />
                              </span>
                              {aiStatusIsOn(contactForView) ? "AI On" : "AI Off"}
                            </button>
                            {(contactForView.stage || contactForView.status) ? (
                              <span className="wc-convo-stage">
                                {contactForView.stage || contactForView.status}
                              </span>
                            ) : null}
                            <QuietHoursBadge
                              timezone={contactForView.timezone}
                              orgTimezone={orgTimezone}
                              quietWindow={orgQuietHours}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="wc-thread-actions">
                        <ThreadClock timezone={contactForView.timezone} orgTimezone={orgTimezone} />
                        {/* Tablet/phone only: open the lead-intelligence drawer. */}
                        <button
                          type="button"
                          className="wc-thread-infobtn"
                          aria-expanded={intelOpen}
                          aria-label="Lead information"
                          onClick={() => setIntelOpen((o) => !o)}
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                  </div>

                  <div className="border-b border-gray-100 px-5 py-2.5">
                    <div className="flex flex-wrap items-center justify-center gap-2 xl:justify-start">
                      {(["sms", "email"] as ViewTab[]).map((tab) => {
                        const smsLocked = tab === "sms" && isFreePlan;
                        // Locked SMS stays clickable so it can route to upgrade;
                        // only truly unavailable channels are disabled.
                        const disabled = smsLocked
                          ? false
                          : tab === "sms"
                            ? !contactForView.phone &&
                              !contactForView.has_sms_history
                            : !contactForView.email &&
                              !contactForView.has_email_history;
                        const count =
                          tab === "sms"
                            ? contactForView.sms_unread_count || 0
                            : contactForView.email_unread_count || 0;
                        const label = tab === "sms" ? "SMS" : "Email";

                        return (
                          <button
                            key={tab}
                            disabled={disabled}
                            onClick={() =>
                              smsLocked ? navigate("/upgrade") : setActiveTab(tab)
                            }
                            title={
                              smsLocked
                                ? "SMS is available on paid plans - upgrade to unlock"
                                : undefined
                            }
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                              activeTab === tab
                                ? "bg-orange-50 text-orange-600"
                                : "text-gray-500 hover:bg-gray-50"
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            <Icon
                              name={tab === "sms" ? "message" : "mail"}
                              size={14}
                            />
                            {smsLocked ? <Lock size={13} /> : null}
                            {label}
                            {count ? (
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                  activeTab === tab
                                    ? "bg-orange-500 text-white"
                                    : "bg-gray-200 text-gray-700"
                                }`}
                              >
                                {count}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    ref={messagesScrollRef}
                    onScroll={handleMessagesScroll}
                    className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
                  >
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                        <Loader2 size={18} className="mr-2 animate-spin" />
                        Loading thread...
                      </div>
                    ) : unifiedTimeline && unifiedTimeline.length === 0 ? (
                      <div className="flex h-full items-center justify-center">
                        <EmptyStateCard
                          title={
                            activeTab === "unified"
                              ? "No messages yet"
                              : `No ${activeTab} history yet`
                          }
                          description="This contact can still be messaged from inbox. Pick a channel below, personalize the draft, and send."
                          primaryLabel="New Message"
                          secondaryLabel="Edit Lead"
                          onPrimary={() => setShowNewMessageModal(true)}
                          onSecondary={() => openEditLead()}
                        />
                      </div>
                    ) : unifiedTimeline ? (
                      <div className="flex flex-col gap-3.5">
                        {unifiedTimeline.map((entry) =>
                          entry.kind === "message" ? (
                            <MessageBubble
                              key={entry.id}
                              message={entry.message}
                              highlight={highlightMsgId === entry.message.id}
                            />
                          ) : (
                            <AppointmentThreadCard
                              key={entry.id}
                              appointment={entry.appointment}
                              onReschedule={handleRescheduleThreadAppointment}
                              onCancel={handleCancelThreadAppointment}
                            />
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3.5">
                        {selectedMessages.map((message) => (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            highlight={highlightMsgId === message.id}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 border-t border-gray-100 px-3 pb-2 2xl:px-5 2xl:pb-3">
                    <div className="space-y-2 2xl:space-y-4">
                      {currentChannel === "email" && !emailConnected ? (
                        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5">
                          <div className="flex items-start gap-3">
                            <AlertTriangle
                              className="mt-0.5 text-amber-600"
                              size={18}
                            />
                            <div className="flex-1">
                              <div className="font-semibold text-amber-900">
                                Email is not connected
                              </div>
                              <p className="mt-1 text-sm text-amber-800">
                                Connect Gmail or complete business email setup
                                from the Automations page to send from inbox.
                              </p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  onClick={startGmailOAuth}
                                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                                >
                                  Connect Gmail
                                </button>
                                <button
                                  onClick={() => navigate("/ai/agent?tab=outbound")}
                                  className="rounded-2xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-900"
                                >
                                  Manage Business Email
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : currentChannel === "sms" && !smsConnected ? (
                        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5">
                          <div className="flex items-start gap-3">
                            <AlertTriangle
                              className="mt-0.5 text-amber-600"
                              size={18}
                            />
                            <div className="flex-1">
                              <div className="font-semibold text-amber-900">
                                SMS is not connected
                              </div>
                              <p className="mt-1 text-sm text-amber-800">
                                Complete SMS activation before sending text
                                messages from inbox.
                              </p>
                              <div className="mt-4">
                                <button
                                  onClick={() => navigate("/connect-phone")}
                                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                                >
                                  Open SMS Activation
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* <div className="mt-2 flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1.5">
                           
                          </div> */}

                          <div className="mt-1 2xl:mt-2">
                            {/* Top toolbar - AI actions + attach/image/preview/
                                format + schedule, all on one wrapping line so the
                                composer stays short and the history gets room. */}
                            <div className="mb-2 flex flex-wrap items-center gap-1.5 2xl:mb-3 2xl:gap-2">
                              {/* Primary toolbar — matches the composer spec
                                  left→right: Attach file · Add image · AI Assist ▾
                                  · Book Appointment. Lives in .wc-compose-actions
                                  so the container-query collapses these to
                                  icon-only on a narrow thread. */}
                              <div className="wc-compose-actions flex flex-wrap items-center gap-1.5 2xl:gap-2">
                                <label
                                  title="Attach file"
                                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 transition hover:shadow-xs 2xl:h-9 2xl:px-3 2xl:text-sm"
                                >
                                  <Paperclip size={15} className="shrink-0" />
                                  <span className="wc-btn-label">Attach file</span>
                                  <input
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={(event) =>
                                      handleUploadComposeAttachments(event.target.files)
                                    }
                                  />
                                </label>
                                <label
                                  title="Add image"
                                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 transition hover:shadow-xs 2xl:h-9 2xl:px-3 2xl:text-sm"
                                >
                                  <ImageIcon size={15} className="shrink-0" />
                                  <span className="wc-btn-label">Add image</span>
                                  <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) =>
                                      handleUploadComposeAttachments(event.target.files)
                                    }
                                  />
                                </label>
                                {/* AI Assist ▾ — rewrites the current draft in
                                    place. Opens an upward dropdown of presets. */}
                                <div
                                  ref={assistWrapRef}
                                  className="wc-assistwrap relative"
                                >
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setAssistOpen((open) => !open);
                                    }}
                                    disabled={assistBusy}
                                    aria-haspopup="menu"
                                    aria-expanded={assistOpen}
                                    title="AI Assist — rewrite your draft"
                                    className="wc-assistbtn inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#FBE0CC] bg-orange-50 px-2 text-xs font-semibold text-orange-600 transition hover:shadow-xs disabled:cursor-not-allowed disabled:opacity-60 2xl:h-9 2xl:px-3 2xl:text-sm"
                                  >
                                    {assistBusy ? (
                                      <Loader2
                                        size={15}
                                        className="shrink-0 animate-spin"
                                      />
                                    ) : (
                                      <Icon name="sparkles" size={15} />
                                    )}
                                    <span className="wc-btn-label">AI Assist</span>
                                    <Icon
                                      name="chevronDown"
                                      size={13}
                                      className="wc-assist-chevron"
                                    />
                                  </button>
                                  {assistOpen ? (
                                    <div
                                      role="menu"
                                      className="wc-assistmenu absolute bottom-[42px] left-0 z-20 w-[210px] rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
                                    >
                                      {AI_ASSIST_PRESETS.map((preset) => (
                                        <button
                                          key={preset.label}
                                          type="button"
                                          role="menuitem"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => applyAssist(preset)}
                                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                                        >
                                          <Icon
                                            name="sparkles"
                                            size={13}
                                            className="text-orange-600"
                                          />
                                          {preset.label}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={handleAppointment}
                                  title="Book Appointment"
                                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-2 text-xs font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100 2xl:h-9 2xl:px-3 2xl:text-sm"
                                >
                                  <Calendar size={15} className="shrink-0" />
                                  <span className="wc-btn-label">
                                    Book Appointment
                                  </span>
                                </button>
                              </div>
                            </div>
                            {currentChannel === "email" ? (
                              <input
                                ref={subjectRef}
                                value={composeSubject}
                                onChange={(event) =>
                                  setComposeSubject(event.target.value)
                                }
                                className="mb-2 w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-hidden transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100 2xl:px-4 2xl:py-2.5"
                                placeholder={`Subject — to ${contactForView?.email || "the lead"}`}
                              />
                            ) : null}
                            <div className="relative rounded-3xl border border-gray-200 bg-white transition focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100">
                              {/* Uploaded files/images preview INSIDE the textbox. */}
                              {composeAttachments.length > 0 ? (
                                <div className="px-3 pt-3">
                                  <AttachmentChips
                                    attachments={composeAttachments}
                                    removable
                                    onRemove={(id) =>
                                      setComposeAttachments((current) =>
                                        current.filter(
                                          (attachment) => attachment.id !== id,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                              ) : null}
                              {!composeBody.trim() && composeAttachments.length === 0 ? (
                                <span className="pointer-events-none absolute left-4 top-3 z-1 max-w-[calc(100%-2rem)] text-sm leading-relaxed text-gray-400">
                                  {currentChannel === "sms"
                                    ? "Click here to type your text message..."
                                    : "Hi {firstname}, - click here to compose. Use the toolbar for bold, lists, and links."}
                                </span>
                              ) : null}
                              <div
                                ref={bodyRef}
                                contentEditable
                                suppressContentEditableWarning
                                role="textbox"
                                aria-multiline="true"
                                aria-label="Message body"
                                spellCheck
                                onInput={() =>
                                  setComposeBody(
                                    composerInnerPlain(bodyRef.current),
                                  )
                                }
                                onBlur={() =>
                                  setComposeBody(
                                    composerInnerPlain(bodyRef.current),
                                  )
                                }
                                onPaste={(event) => {
                                  // SMS is plain-text only. Email keeps basic
                                  // structure but strips colors/styles so pasted
                                  // text can't end up white-on-white.
                                  if (currentChannel === "sms") {
                                    const text =
                                      event.clipboardData?.getData("text/plain");
                                    if (text == null) return;
                                    event.preventDefault();
                                    document.execCommand("insertText", false, text);
                                    setComposeBody(
                                      composerInnerPlain(bodyRef.current),
                                    );
                                    return;
                                  }
                                  const html =
                                    event.clipboardData?.getData("text/html");
                                  event.preventDefault();
                                  if (html) {
                                    document.execCommand(
                                      "insertHTML",
                                      false,
                                      sanitizePastedHtml(html),
                                    );
                                  } else {
                                    const text =
                                      event.clipboardData?.getData("text/plain") ||
                                      "";
                                    document.execCommand("insertText", false, text);
                                  }
                                  setComposeBody(
                                    composerInnerPlain(bodyRef.current),
                                  );
                                }}
                                className="wc-compose-body w-full resize-y px-4 pt-3 pb-14 text-sm leading-relaxed outline-hidden [&_a]:text-blue-600 [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4 min-h-30"
                              />
                              {currentChannel === "sms" ? (
                                <div
                                  className={`pointer-events-none absolute right-4 top-2 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-xs ring-1 ${
                                    smsSegmentCount(composeBody) > SMS_MAX_SEGMENTS
                                      ? "bg-red-50 text-red-700 ring-red-200"
                                      : "bg-white/95 text-gray-600 ring-gray-200"
                                  }`}
                                >
                                  {composeBody.length}/
                                  {SMS_SEGMENT_LENGTH * SMS_MAX_SEGMENTS}
                                </div>
                              ) : null}
                              {/* Send overlaid INSIDE the textbox, bottom-right.
                                  Icon-only on a narrow thread; label on wide. */}
                              <button
                                type="button"
                                disabled={composeSendDisabled}
                                onClick={handleSendCurrentMessage}
                                title={currentChannel === "email" ? "Send Email" : "Send SMS"}
                                className="wc-send-btn absolute bottom-2.5 right-2.5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-orange-500 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {sending ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Send size={16} />
                                )}
                                <span>
                                  {currentChannel === "email"
                                    ? "Send Email"
                                    : "Send SMS"}
                                </span>
                              </button>
                            </div>
                          </div>

                          {currentChannel === "sms" && smsSegmentWarning ? (
                            <p className="mt-2 text-xs text-amber-600">
                              {smsSegmentWarning}
                            </p>
                          ) : null}

                          {showPreview ? (
                            <div className="rounded-[28px] border border-gray-200 bg-slate-50 p-5">
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                                Preview
                              </div>
                              <div className="mt-3 space-y-3">
                                {currentChannel === "email" ? (
                                  <div className="rounded-2xl bg-white px-4 py-3">
                                    <div className="text-xs text-gray-500">
                                      Subject
                                    </div>
                                    <div className="mt-1 font-semibold text-gray-900">
                                      {renderPersonalizedText(
                                        composeSubject,
                                        previewContact,
                                        senderPreview,
                                      )}
                                    </div>
                                  </div>
                                ) : null}
                                <div className="whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-gray-700">
                                  {renderPersonalizedText(
                                    composeBody,
                                    previewContact,
                                    senderPreview,
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : null}

                          

                          <p className="hidden text-xs text-gray-500 2xl:block">
                            {currentChannel === "email"
                              ? "Tokens stay visible while drafting; subject and body personalize at send. Preview shows the selected contact."
                              : `Up to ${SMS_MAX_SEGMENTS} SMS segments (${SMS_SEGMENT_LENGTH} chars each, ${SMS_SEGMENT_LENGTH * SMS_MAX_SEGMENTS} total after personalization). Preview shows the selected contact.`}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* RIGHT COLUMN - lead intelligence (spec section 4) */}
            {/* Hide/open bar for the lead-intelligence panel - grip only, no
                arrow icon (desktop). */}
            {contactForView && (bp === "xl" || bp === "lg") ? (
              <div
                className="wc-intel-handle"
                role="button"
                tabIndex={0}
                aria-label={intelOpen ? "Hide lead information" : "Show lead information"}
                title={intelOpen ? "Hide details" : "Show details"}
                onClick={() => setIntelOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIntelOpen((o) => !o);
                  }
                }}
              >
                <span className="wc-intel-grip" />
              </div>
            ) : null}

            {/* Dim scrim behind the drawer/sheet on tablet & phone. */}
            {contactForView ? (
              <button
                type="button"
                className="wc-intel-scrim"
                aria-label="Close lead information"
                onClick={() => setIntelOpen(false)}
              />
            ) : null}

            {contactForView && (intelOpen || bp === "md" || bp === "sm") ? (
              <div className="wc-ibx-intel">
                {contactDetailsPanelContent}
              </div>
            ) : null}
          </div>
        )}
      </div>
      </div>

      <DeleteLeadConfirmModal
        open={showDeleteLeadConfirm}
        contact={contactForView}
        onCancel={() => setShowDeleteLeadConfirm(false)}
        onConfirm={() => void handleDeleteLead()}
      />


      <SendLaterModal
        open={showSendLaterModal}
        token={token}
        channel={currentChannel}
        contactId={contactForView?.id ?? null}
        toAddress={
          currentChannel === "email"
            ? contactForView?.email || ""
            : contactForView?.phone || ""
        }
        body={composeBody}
        subject={currentChannel === "email" ? composeSubject : null}
        attachments={composeAttachments as unknown as Record<string, unknown>[]}
        onClose={() => setShowSendLaterModal(false)}
        onScheduled={(_id, sendAtIso) => {
          const when = new Date(sendAtIso);
          const human = when.toLocaleString();
          toast.success(`Scheduled to send at ${human}`);
        }}
      />

      {/* Unified Add / Edit Lead modal (single source of truth). When
          editingLeadIdInbox is non-null, this renders the "Edit Lead" UI;
          otherwise it's the "Add New Lead" UI. The Leads page uses the same
          component the same way - we no longer have a separate EditLeadModal. */}
      {showAddContactModal
        ? createPortal(
            <AddLeadModal
              open={showAddContactModal}
              form={newLeadForm}
              onFormChange={setNewLeadForm}
              editingLeadId={editingLeadIdInbox}
              leadSmsConsent={newLeadConsent}
              onLeadSmsConsentChange={setNewLeadConsent}
              saving={addContactSaving}
              onClose={() => {
                setShowAddContactModal(false);
                setEditingLeadIdInbox(null);
              }}
              onSave={saveLeadFromInbox}
              // Lock the consent radios when the edited contact has SMS
              // opt-out set (texted STOP, admin/agent blocked, etc.). The
              // contactForView snapshot may be stale, so authoritatively
              // check both `contactForView` (inbox projection) AND the
              // matching row in `leads` if present.
              lockedForOptOut={
                editingLeadIdInbox != null &&
                Boolean(
                  contactForView?.sms_opt_out ||
                    (leads.find((l) => l.id === editingLeadIdInbox) as { sms_opt_out?: boolean } | undefined)?.sms_opt_out,
                )
              }
            />,
            document.body,
          )
        : null}

      {showInboxCampaignGate
        ? createPortal(
            <AddLeadCampaignModal
              open={showInboxCampaignGate}
              onClose={() => {
                setShowInboxCampaignGate(false);
                setInboxPendingEnrollLeadId(null);
                setNewLeadForm({ ...DEFAULT_NEW_LEAD });
                setNewLeadConsent("opted_in");
              }}
              onConfirm={(choice) => void enrollInboxLead(choice)}
            />,
            document.body,
          )
        : null}

      {showNewMessageModal ? (
        <NewMessageModal
          apiBase={API_BASE}
          smsApiBase={SMS_API_BASE}
          token={token}
          userId={userId}
          orgId={orgId}
          userName={userName}
          orgName={orgName}
          leads={mergedComposeContacts}
          gmailStatus={gmailStatus}
          domainStatus={domainStatus}
          domainEmail={domainEmail}
          telnyxApproved={telnyxApproved}
          onClose={() => setShowNewMessageModal(false)}
          onConnectGmail={startGmailOAuth}
          onManageBusinessEmail={() => navigate("/ai/agent?tab=outbound")}
          onSent={async (leadId) => {
            await Promise.all([
              fetchContacts(true),
              fetchContactDetail(leadId, false),
            ]);
          }}
        />
      ) : null}

      <BookingMessageModal
        open={showBookingMessageModal}
        smsApiBase={SMS_API_BASE}
        token={token}
        leadId={contactForView?.id ?? selectedLeadId ?? null}
        toPhone={contactForView?.phone ?? null}
        handoffUserId={bookingHandoffUserId}
        onClose={() => setShowBookingMessageModal(false)}
        onSent={() => {
          const id = contactForView?.id ?? selectedLeadId;
          if (id != null) {
            void fetchContactDetail(id, false);
          }
        }}
      />

      <AppointmentCancelConfirmModal
        open={cancelConfirmOpen}
        message="You can book a new one anytime. Are you sure you want to cancel this appointment?"
        defaultSendSms={Boolean(appointmentPendingCancel?.sms_confirmation_sent_at)}
        defaultSendEmail={Boolean(appointmentPendingCancel?.email_confirmation_sent_at)}
        smsAvailable={Boolean(contactForView?.phone)}
        emailAvailable={Boolean(contactForView?.email)}
        busy={cancelingAppointment}
        onYes={handleConfirmCancelAppointment}
        onNo={handleDismissCancelConfirm}
      />

      <AppointmentModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          setAppointmentModalEditing(null);
        }}
        contactName={
          contactForView ? contactDisplayName(contactForView) : "Contact"
        }
        contactPhone={contactForView?.phone || undefined}
        contactEmail={contactForView?.email || undefined}
        leadId={contactForView?.id ?? selectedLeadId ?? undefined}
        editingAppointment={appointmentModalEditing}
        onSubmit={handleInboxAppointmentSubmit}
      />
    </MainLayout>
  );
}
