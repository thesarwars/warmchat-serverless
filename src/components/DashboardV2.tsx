'use client';
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import MainLayout from "./MainLayout";
import MissingBusinessAddressBanner from "./MissingBusinessAddressBanner";
import SmsSetupBanner from "./SmsSetupBanner";
import FreePlanNudges from "./FreePlanNudges";
import MonthlyKPIStrip from "./V2/Dashboard/MonthlyKPIStrip";
import WaitingBanner from "./V2/Dashboard/WaitingBanner";
import NeedsReply from "./V2/Dashboard/NeedsReply";
import HotLead from "./V2/Dashboard/HotLead";
import AIIntelligence, { type PriorityActionsData } from "./V2/Dashboard/AIIntelligence";
import AIWinsToday from "./V2/Dashboard/AIWinsToday";
import ConversionFunnel from "./V2/Dashboard/ConversionFunnel";
import TodaySchedule from "./V2/Dashboard/TodaySchedule";
import QuickActions from "./V2/Dashboard/QuickActions";
// import AiNextSteps from "./V2/Dashboard/AiNextSteps"; // hidden per request
import AppointmentModal from "./V2/Dashboard/AppointmentModal";
import ConfirmDialog from "./V2/Dashboard/ConfirmDialog";
import KpiGoalsModal from "./V2/Dashboard/KpiGoalsModal";
import { useFetch, useInvalidate } from "@/helpers/hooks";
import {
  fetchDashboardData,
  fetchDashboardHotLeads,
  fetchDashboardPerformance,
  fetchDashboardPriroty,
  fetchOrgLeads,
  fetchOrgHotLeads,
  fetchOrgAppointments,
  fetchInboxContacts,
  fetchMeBootstrap,
  fetchOrgKpiGoals,
  updateOrgKpiGoals,
  updateLead,
  postInboxAppointment,
  type OrgKpiGoals,
} from "@/helpers/backend";
import { isHotStage } from "@/components/leads/utils/leadDisplay";
import { hasActivePaidPlan, type BillingLike } from "@/utils/entitlements";
import toast from "react-hot-toast";

const formatYmd = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Maps the conversion-funnel 30/60/90-day toggle to the performance endpoint's
// start_date/end_date params. (Range params only; no contract change.)
const getDateRangeForDays = (days: number) => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  return { start_date: formatYmd(start), end_date: formatYmd(now) };
};

const getGreeting = () => {
  // User's local (device) timezone. Morning 4am-12pm, afternoon 12pm-5pm,
  // evening 5pm-4am (covers late night).
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
};

type ApptItem = {
  id?: number;
  lead_id?: number | null;
  title?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  meeting_type?: string | null;
  status?: string | null;
  with_name?: string | null;
  notes?: string | null;
  external_meeting_url?: string | null;
};

// Hot is derived from the lead's Stage (score > 45) - the single canonical rule.
const isHotLeadRow = (l: { status?: string | null }): boolean =>
  isHotStage(l as Record<string, unknown>);

const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Heuristic: appointments the AI booked. The API carries no explicit flag, so we
// infer from status/notes/meeting_type until a dedicated field exists.
const inferByAi = (a: ApptItem): boolean => {
  const blob = `${a.status ?? ""} ${a.notes ?? ""} ${a.meeting_type ?? ""}`.toLowerCase();
  return blob.includes("ai") || String(a.status ?? "").toLowerCase() === "proposed";
};

const DashboardV2: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // After a direct Gmail connect, ConnectAccount routes here with router state.
  // Show the success toast + the "add leads?" prompt inside the normal app UI,
  // then clear the state so a refresh / back-nav doesn't replay it.
  const [showAddLeads, setShowAddLeads] = useState(false);
  useEffect(() => {
    if ((location.state as { gmailConnected?: boolean } | null)?.gmailConnected) {
      toast.success("Gmail connected!");
      setShowAddLeads(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);
  const [, setBillingOpen] = useState(false);
  // Conversion-funnel range (days). Drives the performance fetch params.
  const [funnelDays, setFunnelDays] = useState<30 | 60 | 90>(30);
  const performanceDateRange = getDateRangeForDays(funnelDays);
  const orgId = localStorage.getItem("org_id");

  // Five user-scoped reads (billing/profile/phone-number/channels/...) bundled
  // into a single /api/bootstrap/me request. Saves four round-trips on cold
  // load and keeps each handler well under the free-tier 10ms CPU cap.
  const hasToken = Boolean(localStorage.getItem("token"));
  const { data: meBootstrap, isLoading: meBootstrapLoading } =
    useFetch<import("@/helpers/backend").MeBootstrap>(
      ["me_bootstrap"],
      () => fetchMeBootstrap(),
      {},
      { enabled: hasToken, staleTime: 1000 * 60 * 2 },
    );

  const billing = meBootstrap?.billing as BillingLike;
  const connectedNumber = meBootstrap?.phone_number?.phone_number ?? null;
  const channelsEmail = meBootstrap?.channels?.email as
    | { connected?: boolean; address?: string | null; provider?: string | null }
    | undefined;
  const connectedEmail = channelsEmail?.connected ? channelsEmail.address ?? null : null;
  const emailProvider = channelsEmail?.connected ? channelsEmail.provider ?? null : null;
  // SMS access keys off ACTIVE PAID access (paid plan that is active/trialing/
  // comp), not the plan name alone - so a promo/trial user isn't sent to billing.
  const hasSmsAccess = hasActivePaidPlan(billing);

  const smsState: "loading" | "connected" | "available" | "locked" =
    meBootstrapLoading
      ? "loading"
      : connectedNumber
        ? "connected"
        : hasSmsAccess
          ? "available"
          : "locked";

  const emailState: "loading" | "connected" | "available" = meBootstrapLoading
    ? "loading"
    : connectedEmail
      ? "connected"
      : "available";

  const handleSmsConnection = () => {
    if (smsState === "connected") return;
    if (smsState === "available") navigate("/connect-phone");
    else if (smsState === "locked") navigate("/upgrade");
  };

  const handleEmailConnection = () => {
    if (emailState === "connected") return;
    if (emailState === "available") navigate("/connect-email");
  };

  const firstName =
    (localStorage.getItem("name") || "there").trim().split(/\s+/)[0] || "there";
  // Uppercase date eyebrow above the greeting (design: "THURSDAY, JUNE 11").
  const dateEyebrow = new Date()
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();

  // Always refetch on mount so returning from the Inbox/booking flow shows fresh
  // counts + schedule without a hard page refresh.
  // Dashboard data freshness: refetch on mount AND keep auto-refreshing while
  // the dashboard stays open - every 30 minutes in the background, plus
  // immediately whenever the user returns to the tab. Keeps the daily-summary
  // banner / KPIs / Needs Reply live without a manual reload.
  const freshOnMount = {
    // Keep the 30-min background refresh, but don't re-fire all ~7 heavy
    // dashboard queries on every return to the page or window focus - the
    // 2-min cache makes returning to the dashboard instant.
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  };

  const { data, isLoading: dataLoading } = useFetch(["dashboard_data"], () => fetchDashboardData(orgId), {}, freshOnMount);
  const { data: hot_leads, isLoading: hotLeadsLoading } = useFetch(["hot_leads_data"], () => fetchDashboardHotLeads(orgId), {}, freshOnMount);
  // Dedicated fetch for leads with hot status/intent - used as the primary fallback
  // so the widget always shows actually-hot leads regardless of page order.
  const { data: hot_status_leads, isLoading: hotStatusLoading } = useFetch(["org_hot_status_leads"], () => fetchOrgHotLeads(orgId), {}, { ...freshOnMount, enabled: Boolean(orgId) });
  // General all-leads fallback (secondary - used when hot_status_leads is empty).
  const { data: all_leads } = useFetch(["org_leads"], () => fetchOrgLeads(orgId), {}, freshOnMount);
  const { data: inbox_contacts, isLoading: inboxLoading } = useFetch(["inbox_contacts"], () => fetchInboxContacts(), {}, freshOnMount);
  const { data: appointments_data } = useFetch<{ items?: ApptItem[] }>(["org_appointments"], () => fetchOrgAppointments(orgId), {}, freshOnMount);
  const { data: perfomances, isLoading: perfLoading } = useFetch(
    ["performances", funnelDays, performanceDateRange.start_date, performanceDateRange.end_date],
    () => fetchDashboardPerformance(orgId, performanceDateRange),
  );
  const { data: priroty_actions, isLoading: priorityLoading } = useFetch<PriorityActionsData>(
    ["priorty"],
    () => fetchDashboardPriroty(orgId) as Promise<PriorityActionsData>,
  );
  const { data: kpiGoals } = useFetch<OrgKpiGoals>(["kpi_goals"], () => fetchOrgKpiGoals(orgId), {}, { enabled: Boolean(orgId) });

  const { invalidate } = useInvalidate();

  // KPI goals editor state.
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);

  const handleSaveGoals = async (next: OrgKpiGoals) => {
    if (!orgId) return;
    setSavingGoals(true);
    try {
      await updateOrgKpiGoals(orgId, next);
      toast.success("Goals updated");
      setGoalsOpen(false);
      invalidate(["kpi_goals"]);
    } catch {
      toast.error("Could not update goals");
    } finally {
      setSavingGoals(false);
    }
  };

  // Lead the booking modal is currently open for (intent-signal calendar action).
  const [bookingLead, setBookingLead] = useState<{ id: number; name: string } | null>(null);
  // Lead pending hot-mark removal (shows a themed confirm dialog).
  const [unhotLead, setUnhotLead] = useState<{ id: number; name: string } | null>(null);

  // Hot-lead count for the KPI strip: prefer status-hot leads, then the dashboard
  // hot-leads count, then the summary value.
  const hotLeadItems: Array<{ status?: string | null; intent?: string | null }> =
    (Array.isArray(hot_status_leads) ? hot_status_leads : (hot_status_leads as { items?: unknown[] } | undefined)?.items) as
    | Array<{ status?: string | null; intent?: string | null }>
    | undefined ?? [];
  const statusHotCount = hotLeadItems.filter(isHotLeadRow).length;
  const dashHotCount =
    hot_leads && !Array.isArray(hot_leads)
      ? toNumber((hot_leads as { count?: unknown }).count)
      : Array.isArray(hot_leads)
        ? (hot_leads as unknown[]).length
        : 0;
  const hotLeadsCount = Math.max(statusHotCount, dashHotCount);

  // Live "needs reply" count from the inbox contacts feed - leads where the lead
  // spoke last (needs_reply) or that still carry unread inbound messages. Drives
  // the Needs Reply KPI and the urgency banner copy.
  const inboxContactList: Array<{
    needs_reply?: boolean | null;
    total_unread_count?: number | string | null;
    unread_count?: number | string | null;
  }> =
    (Array.isArray(inbox_contacts)
      ? inbox_contacts
      : (inbox_contacts as { contacts?: unknown[] } | undefined)?.contacts) as
      | Array<{ needs_reply?: boolean | null; total_unread_count?: number | string | null; unread_count?: number | string | null }>
      | undefined ?? [];
  const needsReplyCount = inboxContactList.filter(
    (c) => Boolean(c.needs_reply) || toNumber(c.total_unread_count ?? c.unread_count) > 0,
  ).length;

  // One-line overnight AI-activity summary, built from real dashboard counts.
  const dashSummary = (data as { summary?: Record<string, unknown> } | undefined)?.summary ?? {};
  const overnightConversations = toNumber(
    (dashSummary as { new_conversations?: unknown }).new_conversations,
  );
  const overnightBooked = toNumber(
    (dashSummary as { ai_appointments?: unknown; appointments?: unknown }).ai_appointments ??
      (dashSummary as { appointments?: unknown }).appointments,
  );
  const summaryParts: string[] = [];
  if (overnightConversations > 0) {
    summaryParts.push(
      `Your AI handled ${overnightConversations} conversation${overnightConversations === 1 ? "" : "s"}`,
    );
  }
  if (overnightBooked > 0) {
    summaryParts.push(
      `${summaryParts.length ? "and booked" : "Your AI booked"} ${overnightBooked} showing${overnightBooked === 1 ? "" : "s"}`,
    );
  }
  const overnightSummary = summaryParts.length
    ? `${summaryParts.join(" ")}.`
    : "Here's what's happening with your business today.";

  // Map appointments endpoint items into the shape TodaySchedule consumes, tagging
  // AI-booked items so they render a "BY AI" pill.
  const scheduleData = {
    upcoming_appointments: (appointments_data?.items ?? []).map((a) => ({
      ...a,
      by_ai: inferByAi(a),
    })),
  };

  const findLeadName = (leadId: string | number): string => {
    const pools = [
      (hot_leads as { items?: unknown[] } | undefined)?.items,
      (all_leads as { items?: unknown[] } | undefined)?.items,
      all_leads,
    ];
    for (const pool of pools) {
      if (!Array.isArray(pool)) continue;
      const m = pool.find((l: { id?: number | string; name?: string; first_name?: string; last_name?: string; email?: string }) => String(l.id) === String(leadId));
      if (m) {
        return (
          m.name ||
          `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() ||
          m.email ||
          "Lead"
        );
      }
    }
    return "Lead";
  };

  const handleHotLeadReplayNow = (leadId: string | number) => {
    localStorage.setItem("selectedLeadIdFromDashboard", String(leadId));
    navigate("/inbox");
  };

  const markHot = async (leadId: string | number, hot: boolean) => {
    const res = await updateLead(
      leadId,
      // Hot = Stage with score > 45; promote to Qualified / drop back to Engaged.
      hot ? { status: "Qualified" } : { status: "Engaged" },
    );
    if (res?.success) {
      toast.success(hot ? "Lead marked as hot" : "Removed hot mark");
      invalidate(["hot_leads_data"]);
      invalidate(["org_hot_status_leads"]);
      invalidate(["org_leads"]);
    }
  };

  const handleMarkHot = (leadId: string | number, currentlyHot: boolean) => {
    if (currentlyHot) {
      setUnhotLead({ id: Number(leadId), name: findLeadName(leadId) });
      return;
    }
    void markHot(leadId, true);
  };

  const handleBook = (leadId: string | number) => {
    setBookingLead({ id: Number(leadId), name: findLeadName(leadId) });
  };

  const handleViewLead = (leadId: string | number) => {
    // The Leads page opens the edit modal when it sees a ?lead=<id> param.
    navigate(`/leads?lead=${encodeURIComponent(String(leadId))}`);
  };

  const handleSubmitAppointment = async (payload: {
    appointment_type: string;
    starts_at: string;
    meeting_type: string;
    notes: string;
    external_meeting_url: string;
    send_sms_confirmation: boolean;
    send_email_confirmation: boolean;
  }) => {
    if (!bookingLead) return;
    const res = await postInboxAppointment(bookingLead.id, { ...payload });
    if (res) {
      toast.success("Appointment booked");
      setBookingLead(null);
      invalidate(["dashboard_data"]);
      invalidate(["org_appointments"]);
    }
  };

  const connectionChipBase =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition";

  return (
    <MainLayout onUpgradeClick={() => setBillingOpen(true)} title="Dashboard">
      <div className="w-full space-y-4 overflow-x-hidden bg-white px-3 pt-0 pb-10 font-['Plus_Jakarta_Sans',system-ui,sans-serif] sm:pt-2 md:pt-4">
        <MissingBusinessAddressBanner />
        <SmsSetupBanner />
        <FreePlanNudges hotLeadsCount={hotLeadsCount} />

        {/* Greeting header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8c7d6f]">
              {dateEyebrow}
            </div>
            <h1 className="text-[28px] font-extrabold leading-[1.04] tracking-[-0.02em] text-[#211a14] sm:text-[40px]">
              {getGreeting()}, {firstName}.
            </h1>
            <p className="mt-2 text-[15px] text-[#6a5d50]">
              {overnightSummary}
              {needsReplyCount > 0 && (
                <>
                  {" "}
                  <span className="font-semibold text-[#C0530F]">
                    {needsReplyCount} need{needsReplyCount === 1 ? "s" : ""} you
                  </span>{" "}
                  today.
                </>
              )}
            </p>
          </div>

          {/* Connection chips - shown only where the Topbar pills are hidden (<xl). */}
          <div className="flex flex-wrap items-center gap-2 xl:hidden">
            {emailState !== "loading" && (
              <button
                type="button"
                onClick={handleEmailConnection}
                disabled={emailState === "connected"}
                title={
                  emailState === "connected"
                    ? `Email connected${connectedEmail ? `: ${connectedEmail}` : ""}${emailProvider ? ` (${emailProvider})` : ""}`
                    : "Connect Gmail or a custom domain via Elastic"
                }
                className={`${connectionChipBase} ${emailState === "connected"
                    ? "cursor-default border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                  }`}
              >
                {emailState === "connected" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6 9 17l-5-5" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6 6 18M6 6l12 12" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {emailState === "connected" ? "Email Connected" : "Connect Email"}
              </button>
            )}
            {smsState !== "loading" && (
              <button
                type="button"
                onClick={handleSmsConnection}
                disabled={smsState === "connected"}
                title={
                  smsState === "connected"
                    ? `SMS number connected${connectedNumber ? `: ${connectedNumber}` : ""}`
                    : smsState === "available"
                      ? "Connect an SMS number"
                      : "SMS is a paid feature - upgrade to connect a number"
                }
                className={`${connectionChipBase} ${smsState === "connected"
                    ? "cursor-default border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                  }`}
              >
                {smsState === "connected" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6 9 17l-5-5" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6 6 18M6 6l12 12" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {smsState === "connected" ? "SMS Connected" : "Connect SMS"}
              </button>
            )}
          </div>
        </header>

        {/* Urgency strip: leads waiting on a human reply (live inbox data) */}
        <WaitingBanner contacts={inbox_contacts} isLoading={inboxLoading} />

        {/* KPI strip with monthly goals */}
        <MonthlyKPIStrip
          data={data}
          hotLeadsCount={hotLeadsCount}
          needsReplyCount={needsReplyCount}
          goals={kpiGoals}
          onEditGoals={() => setGoalsOpen(true)}
          onOpenNeedsReply={() => navigate("/inbox?filter=needs_reply")}
          isLoading={dataLoading}
        />

        {/* Main grid: left stack (1.6fr) + right rail (1fr) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {/* LEFT COLUMN */}
          <div className="flex min-w-0 flex-col gap-4">
            <NeedsReply
              priority={priroty_actions}
              contacts={inbox_contacts}
              isLoading={priorityLoading || inboxLoading}
            />
            <HotLead
              data={hot_leads}
              fallbackLeads={hot_status_leads ?? all_leads}
              isLoading={hotLeadsLoading || hotStatusLoading}
              onReplayNow={handleHotLeadReplayNow}
              onMarkHot={handleMarkHot}
              onBook={handleBook}
              onViewLead={handleViewLead}
            />
            <AIIntelligence data={priroty_actions} isLoading={priorityLoading} />
          </div>

          {/* RIGHT RAIL */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* AI Next Steps hidden per request */}
            {/* <AiNextSteps /> */}
            <AIWinsToday data={data} isLoading={dataLoading} />
            <ConversionFunnel
              data={perfomances}
              onRangeChange={setFunnelDays}
              isLoading={perfLoading}
            />
            <TodaySchedule data={scheduleData} isLoading={dataLoading} />
            <QuickActions onNewMessage={() => navigate("/inbox")} onAddLead={() => navigate("/leads")} />
          </div>
        </div>
      </div>

      <KpiGoalsModal
        open={goalsOpen}
        goals={kpiGoals}
        saving={savingGoals}
        onSave={handleSaveGoals}
        onCancel={() => setGoalsOpen(false)}
      />

      <AppointmentModal
        isOpen={bookingLead !== null}
        onClose={() => setBookingLead(null)}
        contactName={bookingLead?.name ?? "Lead"}
        leadId={bookingLead?.id}
        onSubmit={handleSubmitAppointment}
      />

      <ConfirmDialog
        open={unhotLead !== null}
        title="Remove hot mark?"
        message={
          <>
            <b className="font-bold text-[#15172B]">{unhotLead?.name}</b> will no
            longer appear in your hot leads.
          </>
        }
        confirmLabel="Remove"
        cancelLabel="Keep hot"
        tone="danger"
        onConfirm={() => {
          if (unhotLead) void markHot(unhotLead.id, false);
          setUnhotLead(null);
        }}
        onCancel={() => setUnhotLead(null)}
      />

      <ConfirmDialog
        open={showAddLeads}
        title="Connected Successfully!"
        message="Your Gmail is connected. Do you want to add leads now?"
        confirmLabel="Yes, add leads"
        cancelLabel="Later"
        tone="primary"
        onConfirm={() => {
          setShowAddLeads(false);
          navigate("/leads");
        }}
        onCancel={() => setShowAddLeads(false)}
      />
    </MainLayout>
  );
};

export default DashboardV2;
