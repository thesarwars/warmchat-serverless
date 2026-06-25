import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import MainLayout from "../MainLayout";
import "../ai-v2/prototype.css";
import AIAgentPanel from "../AIAgentPanel";
import ConfirmDialog from "../V2/Dashboard/ConfirmDialog";
import { useCRM } from "../../context/useCRM";
import {
  Plus,
  Upload,
  Mail,
  Loader2,
  MessageSquare,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Star,
  Users,
  Sparkles,
  Flame,
  CheckCircle2,
  ShieldOff,
  MailX,
  Search,
  X,
  Clock,
  Download,
  Pencil,
  Trash2,
  Home,
  Tag,
  HelpCircle,
  PauseCircle,
  PlayCircle,
  CircleOff,
  Megaphone,
  TrendingUp,
  Zap,
  Bot,
  CalendarCheck,
  Users2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import PipelineBoard from "./PipelineBoard";
import { useFetch } from "@/helpers/hooks";
import { fetchLeadSummary, fetchMeBootstrap } from "@/helpers/backend";
import { resolvePlanName } from "../settings/profileShared";

import ImportLeadsModal from "./components/ImportLeadsModal";
import AddLeadModal from "./components/AddLeadModal";
import AddLeadCampaignModal, {
  type AddLeadCampaignChoice,
} from "./components/AddLeadCampaignModal";
// EditLeadModal was removed - AddLeadModal (above) is the single Add/Edit
// modal for leads, mirrored by the inbox's edit flow.
import DeleteLeadModal from "./components/DeleteLeadModal";
import InlinePillSelect from "./components/InlinePillSelect";
import LeadDetailPanel from "./components/LeadDetailPanel";
import { useLeadImport } from "./hooks/useLeadImport";
import {
  AI_STATUS_OPTIONS,
  COUNTRY_CODES,
  DEFAULT_NEW_LEAD,
  FIRST_HOT_STAGE,
  HIGHEST_NON_HOT_STAGE,
  LEAD_TYPE_OPTIONS,
  LEADS_PAGE_SIZE_OPTIONS,
  PRICE_RANGE_OPTIONS,
  QUICK_FILTERS,
  SOURCE_OPTIONS,
  STAGE_OPTIONS,
  VIEW_OPTIONS,
  type LeadsPageSize,
} from "./constants";
import type {
  EditingLead,
  LeadSummary,
  NewLeadForm,
  QuickFilterId,
  SmsConsentStatus,
} from "./types";
import {
  aiStatusPillClass,
  formatRelativeUpdated,
  getAiStatus,
  getAreaValue,
  getLeadType,
  getStageValue,
  isHotStage,
  leadInitials,
  leadTypePillClass,
  scoreColor,
  stagePillClass,
  stageScore,
} from "./utils/leadDisplay";


export default function Leads() {
  const { contacts, setContacts } = useCRM();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const openLeadInInbox = (leadId: number) => {
    localStorage.setItem("selectedLeadIdFromDashboard", String(leadId));
    navigate("/inbox");
  };

  const [loading, setLoading] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [showAiFollowUpGate, setShowAiFollowUpGate] = useState(false);
  // The lead created in step 1, awaiting optional campaign enrollment in step 2.
  const [pendingEnrollLeadId, setPendingEnrollLeadId] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deepLinkedLeadHandled, setDeepLinkedLeadHandled] = useState<string | null>(null);
  const [unhotLead, setUnhotLead] = useState<EditingLead | null>(null);
  const [deleteTargetIds, setDeleteTargetIds] = useState<number[]>([]);
  const [deletingLeads, setDeletingLeads] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const [message, setMessage] = useState("");
  const [viewFilter, setViewFilter] = useState("All Leads");
  const [dateFilterDays, setDateFilterDays] = useState<number | null>(null);
  // Quick filters are multi-select - each selected chip ANDs another constraint
  // onto the server query.
  const [quickFilters, setQuickFilters] = useState<QuickFilterId[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // KPI window toggles (7d / 14d / 30d) for the New Leads + Hot Leads cards.
  // The summary endpoint returns all three windows at once, so toggling is
  // purely client-side - no refetch.
  const [newPeriod, setNewPeriod] = useState<"7" | "14" | "30">("30");
  const [hotPeriod, setHotPeriod] = useState<"7" | "14" | "30">("30");

  // Dynamic team + agent lists still power the inline Team/Agent table editors.
  const [dynamicTeams, setDynamicTeams] = useState<string[]>([]);
  const [dynamicAgents, setDynamicAgents] = useState<{ id: string; name: string }[]>([]);

  const [leadsView, setLeadsView] = useState<"pipeline" | "list">("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<LeadsPageSize>(100);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(() => new Set());

  const [newLead, setNewLead] = useState<NewLeadForm>({ ...DEFAULT_NEW_LEAD });
  // Default new-lead SMS consent is "opted_in" - agents adding leads
  // manually almost always have direct consent from the contact (live
  // sign-up, open-house card, web form). The attestation friction lives in
  // the per-action save path, not in the radio default.
  const [leadSmsConsent, setLeadSmsConsent] = useState<SmsConsentStatus>("opted_in");
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null);

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [selectedAiLead, setSelectedAiLead] = useState<EditingLead | null>(null);

  // The slide-in lead-detail drawer (spec DetailPanel). Opened by clicking a
  // lead's name in the table or a card on the Kanban board.
  const [detailLead, setDetailLead] = useState<EditingLead | null>(null);
  const openDetail = (lead: EditingLead) => setDetailLead(lead);
  // Keep the open drawer in sync with the freshest row data after edits.
  const detailLeadLive = useMemo(
    () => (detailLead ? contacts.find((c) => c.id === detailLead.id) ?? detailLead : null),
    [detailLead, contacts],
  );

  const openAiPanel = (lead: EditingLead) => {
    setSelectedAiLead(lead);
    setAiPanelOpen(true);
  };

  useEffect(() => {
    if (!aiPanelOpen) return;
    if (selectedLeadIds.size === 1) {
      const [onlyId] = Array.from(selectedLeadIds);
      const found = contacts.find((c) => c.id === onlyId);
      if (found && found.id !== selectedAiLead?.id) {
        setSelectedAiLead(found);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadIds, aiPanelOpen]);

  const token = localStorage.getItem("token");
  const API_BASE = import.meta.env.VITE_API_BASE;
  const org_id = localStorage.getItem("org_id");
  const smsConsentVersion = import.meta.env.VITE_SMS_CONSENT_TEXT_VERSION || "v1";

  const queryClient = useQueryClient();
  const refreshLeadSummary = () =>
    queryClient.invalidateQueries({ queryKey: ["lead_summary", org_id] });

  // Fetch dynamic teams + agents for filter dropdowns (graceful empty on 404/error)
  useEffect(() => {
    if (!token || !org_id) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API_BASE}/teams?org_id=${org_id}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d) ? d : Array.isArray(d?.teams) ? d.teams : [];
        setDynamicTeams(list.map((t: { name?: string } | string) => String(typeof t === "object" ? t?.name || "" : t)).filter(Boolean));
      })
      .catch(() => {});
    fetch(`${API_BASE}/auth/users`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d) ? d : Array.isArray(d?.users) ? d.users : [];
        setDynamicAgents(
          list
            .map((u: { id?: number | string; user_id?: number | string; name?: string; email?: string }) => ({ id: String(u.id ?? u.user_id ?? ""), name: String(u.name || u.email || "") }))
            .filter((u: { id: string; name: string }) => u.name),
        );
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leadSummaryQuery = useFetch<LeadSummary>(
    ["lead_summary", org_id],
    () => fetchLeadSummary(org_id as string),
    {},
    { enabled: Boolean(org_id) },
  );
  const lead_summary = leadSummaryQuery.data as LeadSummary | undefined;

  // Selected-window KPI values for the New Leads / Hot Leads cards. The summary
  // payload carries all three windows, so the 7d/14d/30d toggles never refetch.
  const emptyKpi = { current: 0, prev: 0, delta: 0 };
  const newKpi = lead_summary?.new_leads_by_period?.[newPeriod] ?? emptyKpi;
  const hotKpi = lead_summary?.hot_leads_by_period?.[hotPeriod] ?? emptyKpi;

  // The Assigned-Agent column is a multi-agent (brokerage) feature - only shown
  // on the Custom Brokerage plan.
  const bootstrapQuery = useFetch(["me_bootstrap"], fetchMeBootstrap, {}, {});
  const isCustomBrokerage = (() => {
    const boot = bootstrapQuery.data;
    const billingPlan = (boot?.billing as { plan?: string } | null)?.plan ?? null;
    const orgPlan = (boot?.profile as { org?: { plan?: string } } | undefined)?.org?.plan;
    return resolvePlanName(billingPlan, orgPlan, localStorage.getItem("selectedPlan")) === "custom_brokerage";
  })();

  const fetchLeads = async () => {
    if (!token || !org_id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("include_meta", "1");
      params.set("view", viewFilter);
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      params.set(
        "date_range",
        viewFilter === "All Leads" || dateFilterDays === null
          ? "all"
          : String(dateFilterDays),
      );

      const searchTerm = debouncedSearch.trim();
      if (searchTerm) params.set("q", searchTerm);

      // Send every selected quick filter; the server ANDs them. "hot" maps to
      // the server's "hot_leads" key.
      for (const qf of quickFilters) {
        params.append("quick", qf === "hot" ? "hot_leads" : qf);
      }

      const res = await fetch(
        `${API_BASE}/leads/${org_id}?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch((): unknown[] => []);

      type LeadsResponse = {
        message?: string;
        items?: EditingLead[];
        pagination?: { total?: number; total_pages?: number };
        counts?: { filtered_total?: number };
      };
      if (!res.ok) {
        throw new Error((data as LeadsResponse)?.message || "Error fetching leads");
      }

      const rawData = data as LeadsResponse;
      const items = Array.isArray(data)
        ? data
        : Array.isArray(rawData?.items)
          ? rawData.items
          : [];
      const pagination = rawData?.pagination;
      const total =
        typeof pagination?.total === "number"
          ? pagination.total
          : typeof rawData?.counts?.filtered_total === "number"
            ? rawData.counts.filtered_total
            : items.length;
      const pages =
        typeof pagination?.total_pages === "number"
          ? Math.max(1, pagination.total_pages)
          : Math.max(1, Math.ceil(total / pageSize));

      setContacts(items);
      setTotalLeads(total);
      setTotalPages(pages);
      if (page > pages) setPage(pages);
    } catch (err) {
      setContacts([]);
      setTotalLeads(0);
      setTotalPages(1);
      setMessage(`Error: ${(err as Error)?.message || "Error fetching leads"}`);
    } finally {
      setLoading(false);
    }
  };

  // Sync the search + quick filter to the browser URL for deep linking.
  useEffect(() => {
    const params = new URLSearchParams();
    if (viewFilter !== "All Leads") params.set("view", viewFilter);
    if (dateFilterDays !== null) params.set("date_range", String(dateFilterDays));
    if (quickFilters.length > 0) params.set("quick", quickFilters.join(","));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());

    const queryString = params.toString();
    const newUrl = queryString ? `${location.pathname}?${queryString}` : location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [
    viewFilter,
    dateFilterDays,
    quickFilters,
    searchQuery,
    location.pathname,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    void fetchLeads();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewFilter,
    dateFilterDays,
    quickFilters,
    debouncedSearch,
    page,
    pageSize,
  ]);

  const leadImport = useLeadImport({ fetchLeads, refreshSummary: refreshLeadSummary });

  // Initialize the search + quick filter from URL params on mount.
  useEffect(() => {
    const view = searchParams.get("view");
    const dateRange = searchParams.get("date_range");
    const quick = searchParams.get("quick");
    const q = searchParams.get("q");

    if (view && VIEW_OPTIONS.includes(view)) setViewFilter(view);
    if (dateRange && !isNaN(Number(dateRange))) setDateFilterDays(Number(dateRange));
    if (quick) {
      const valid = quick
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is QuickFilterId => QUICK_FILTERS.some((f) => f.id === s));
      if (valid.length) setQuickFilters(valid);
    }
    if (q) setSearchQuery(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  useEffect(() => {
    if (viewFilter === "All Leads" && dateFilterDays !== null) {
      setDateFilterDays(null);
    }
  }, [viewFilter, dateFilterDays]);

  // Open import modal from router navigation state
  useEffect(() => {
    const state = location.state as { openImportModal?: boolean } | null;
    if (!state?.openImportModal) return;
    leadImport.openImportModal();
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, location.state, navigate]);

  // handleEditLead is declared lower (after fillNewLeadFromLead) so the
  // closure reference is statically resolvable - see the const below.

  useEffect(() => {
    const leadId = searchParams.get("lead");
    if (!leadId || deepLinkedLeadHandled === leadId || contacts.length === 0) return;
    const target = contacts.find((lead) => String(lead.id) === String(leadId));
    if (!target) return;
    // fillNewLeadFromLead is declared further down with the other lead
    // handlers; the effect body runs after first commit so the closure
    // reference resolves correctly even though static analysis flags it.
    // eslint-disable-next-line react-hooks/immutability
    fillNewLeadFromLead(target as unknown as Record<string, unknown>);
    setEditingLeadId(target.id);
    setShowAddLeadModal(true);
    setDeepLinkedLeadHandled(leadId);
    // fillNewLeadFromLead is intentionally excluded - it's stable for the
    // useful lifetime of this effect (closes over only useState setters).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, deepLinkedLeadHandled, searchParams]);

  /* ---------- ADD LEAD ----------
   * Two-step flow: step 1 creates the lead (server validation + duplicate check
   * happen HERE, before step 2 opens), then step 2 (AddLeadCampaignModal) only
   * enrolls the new lead via apply-ai. Returns a result so the modal can show a
   * duplicate / validation error inline. */
  const createNewLeadFromForm = async (): Promise<{ ok: boolean; error?: string }> => {
    const hasPhone = Boolean(newLead.phone?.trim());
    const sendSmsOptInRequest = hasPhone && leadSmsConsent === "unknown";
    const payload = {
      ...newLead,
      lead_type: newLead.lead_type ? newLead.lead_type.toLowerCase() : newLead.lead_type,
      ai_status: "off",
      tags: newLead.tags ? newLead.tags.split(",").map((t) => t.trim()) : [],
      org_id,
      owner_id: localStorage.getItem("user_id"),
      source: newLead.source?.trim() || "Manual Add",
      sms_consent_status: leadSmsConsent,
      send_sms_opt_in_request: sendSmsOptInRequest,
      sms_consent_attested: hasPhone,
      opt_in_source: "manual_lead_entry",
      consent_text_version: smsConsentVersion,
      consent_page_url: `${window.location.origin}/leads`,
      auto_followup_action: "dont_send",
    };
    try {
      const res = await fetch(`${API_BASE}/leads/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.message || "Error adding lead" };
      const newLeadId = Number(data?.lead?.id);
      setPendingEnrollLeadId(Number.isInteger(newLeadId) ? newLeadId : null);
      const smsOptInStatus = data?.sms_opt_in?.status;
      if (smsOptInStatus === "pending_confirmation") {
        setMessage("Lead added. SMS opt-in request sent; contact must reply YES.");
      } else if (smsOptInStatus === "already_subscribed") {
        setMessage("Lead added. Contact is already SMS subscribed.");
      } else {
        setMessage("Lead added successfully.");
      }
      await fetchLeads();
      refreshLeadSummary();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error)?.message || "Error adding lead" };
    }
  };

  // Step 2 confirm: enroll the just-created lead through the shared apply-ai path
  // (same as the import wizard) so ai_status + automation drip are set identically.
  const handleEnrollNewLead = async (choice: AddLeadCampaignChoice) => {
    const leadId = pendingEnrollLeadId;
    setShowAiFollowUpGate(false);
    if (Number.isInteger(leadId)) {
      try {
        await fetch(`${API_BASE}/leads/import/${org_id}/apply-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
        /* lead is created; enrollment failure is non-fatal */
      }
    }
    setPendingEnrollLeadId(null);
    setLeadSmsConsent("opted_in");
    setNewLead({ ...DEFAULT_NEW_LEAD });
  };

  const resetNewLead = () => setNewLead({ ...DEFAULT_NEW_LEAD });

  const closeLeadModal = () => {
    setShowAddLeadModal(false);
    setEditingLeadId(null);
    setLeadSmsConsent("opted_in");
    resetNewLead();
  };

  const leadFormString = (value: unknown, fallback = ""): string =>
    value == null || value === "" ? fallback : String(value);

  const fillNewLeadFromLead = (lead: Record<string, unknown>) => {
    const tagsArray: string[] = Array.isArray(lead.tags)
      ? lead.tags.map((t) => String(t))
      : typeof lead.tags === "string"
        ? (lead.tags as string).split(",").map((t) => t.trim()).filter(Boolean)
        : [];
    const phoneStr = leadFormString(lead.phone);
    // Pick the country code by LONGEST matching prefix from our known list - a
    // naive /^\+\d+/ is greedy and swallows the whole E.164 number (e.g.
    // "+15551234567"), which then strips the entire number out of the phone
    // input and leaves it blank when editing.
    const cc =
      leadFormString(lead.countryCode) ||
      [...COUNTRY_CODES]
        .map((c) => c.code)
        .sort((a, b) => b.length - a.length)
        .find((code) => phoneStr.startsWith(code)) ||
      "+1";
    setNewLead({
      name: leadFormString(lead.name),
      email: leadFormString(lead.email),
      company: leadFormString(lead.company),
      status: leadFormString(lead.status, "New"),
      phone: phoneStr,
      countryCode: cc,
      source: leadFormString(lead.source),
      price_range: leadFormString(lead.price_range),
      notes: leadFormString(lead.notes),
      email_notifications_enabled: lead.email_notifications_enabled !== false,
      sms_notifications_enabled: lead.sms_notifications_enabled !== false,
      tags: tagsArray.join(","),
      tagsArray: [...tagsArray],
      lead_type: leadFormString(lead.lead_type, "Unknown"),
      intent: leadFormString(lead.intent),
      // NO "AI Off" fallback: a NULL ai_status means "follow the account
      // default" (AI responds). Defaulting the form to "AI Off" made ANY edit
      // of such a lead silently hard-disable its AI on save - which is exactly
      // how a live test lead stopped getting AI replies.
      ai_status: leadFormString(lead.ai_status),
      area: leadFormString(lead.area),
      timezone: leadFormString(lead.timezone),
      // AI Qualification fields (ported from EditLeadModal). All optional.
      property_address: leadFormString(lead.property_address),
      timeline: leadFormString(lead.timeline),
      pre_approved: typeof lead.pre_approved === "boolean" ? (lead.pre_approved as boolean) : null,
      motivation: leadFormString(lead.motivation),
      occupancy_status: leadFormString(lead.occupancy_status),
      interest_level: leadFormString(lead.interest_level),
      financing_status: leadFormString(lead.financing_status),
      bedrooms: leadFormString(lead.bedrooms),
      bathrooms: leadFormString(lead.bathrooms),
      property_type: leadFormString(lead.property_type),
      seller_price_expectations: leadFormString(lead.seller_price_expectations),
      qualification_step: Number(lead.qualification_step) || 0,
      qualification_status: leadFormString(lead.qualification_status),
    });
    // Hydrate the consent radio from the lead row (was previously dropped on
    // the floor when editing through this path, so the modal landed on
    // "unknown" even for opted-in leads).
    const consent = String(lead.sms_consent_status || "").toLowerCase();
    if (consent === "opted_in" || consent === "no_sms" || consent === "unknown") {
      setLeadSmsConsent(consent as typeof leadSmsConsent);
    } else {
      setLeadSmsConsent("unknown");
    }
  };

  /* ---------- EDIT ----------
   * Edits route through the SAME AddLeadModal the add flow uses, in edit
   * mode (`editingLeadId` non-null). One modal owns lead editing across the
   * whole app (the inbox does the same thing). The old EditLeadModal +
   * editingLead state path is gone.
   */
  const handleEditLead = (lead: EditingLead) => {
    fillNewLeadFromLead(lead as unknown as Record<string, unknown>);
    setEditingLeadId(lead.id);
    setShowAddLeadModal(true);
  };

  const openEditLeadFromDetails = (lead: Record<string, unknown>) => {
    const leadId = Number(lead?.id);
    if (!leadId) return;
    // Trust the row data. Calling GET /api/leads/:id here used to wipe the
    // form, because that path is the org-scoped list endpoint (not a
    // single-lead fetch); a "success" response was an empty list and
    // re-populating with it cleared every field. The Leads page already
    // has the full row in `contacts`/`lead` from the list query.
    fillNewLeadFromLead(lead);
    setEditingLeadId(leadId);
    setShowAddLeadModal(true);
  };

  const handleSaveLeadFromAddModal = async (): Promise<{ ok: boolean; error?: string }> => {
    // New lead: create now (validation + duplicate check), then open step 2.
    if (editingLeadId == null) {
      const r = await createNewLeadFromForm();
      if (r.ok) {
        setShowAddLeadModal(false);
        // Skip the automation/AI-follow-up prompt when the agent chose
        // "Do not SMS" - enrolling them would just queue messages that the
        // suppression layer then refuses. The lead lands with ai_status='off'
        // (set in leadIntake.ts) so this is consistent end-to-end.
        if (leadSmsConsent !== "no_sms") {
          setShowAiFollowUpGate(true);
        }
      }
      return r;
    }
    // Editing an existing lead: straight update, no campaign step.
    try {
      const payload = {
        ...newLead,
        // The SMS opt-in radio is held in its own state (leadSmsConsent), not in
        // newLead - include it explicitly or edits to the consent never persist.
        sms_consent_status: leadSmsConsent,
        tags: newLead.tags
          ? newLead.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      };
      const res = await fetch(`${API_BASE}/leads/${editingLeadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.message || "Update failed" };
      toast.success("Edited successfully");
      await fetchLeads();
      refreshLeadSummary();
      closeLeadModal();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Update failed" };
    }
  };

  // handleUpdateLead was the old PUT handler for the deleted EditLeadModal.
  // Updates now flow through handleSaveLeadFromAddModal's edit branch via
  // the unified AddLeadModal.

  const updateLeadField = async (leadId: number, field: string, value: unknown) => {
    setContacts((prev: EditingLead[]) =>
      prev.map((l) =>
        l && l.id === leadId ? { ...l, [field]: value } : l,
      ),
    );
    try {
      const res = await fetch(`${API_BASE}/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMessage(`Could not update ${field}`);
      await fetchLeads();
    }
  };

  const openDeleteConfirm = (ids: number[]) => {
    const unique = [...new Set(ids)].filter((id) => Number.isFinite(id));
    if (!unique.length) return;
    setDeleteTargetIds(unique);
    setMessage("");
    setShowDeleteModal(true);
  };

  const deleteLeadsPerId = async (ids: number[]) => {
    const deleted_ids: number[] = [];
    const failed: { id: number; message: string }[] = [];
    for (const id of ids) {
      const res = await fetch(`${API_BASE}/leads/delete/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        deleted?: number;
        deleted_ids?: number[];
        failed?: { id: number; message: string }[];
      };
      if (res.ok && (data.deleted ?? 1) > 0) {
        deleted_ids.push(id);
      } else {
        failed.push({
          id,
          message:
            data.failed?.[0]?.message || data.message || "Could not delete lead",
        });
      }
      // Tick progress bar for each processed id in the per-id loop.
      setDeleteProgress((prev) => ({
        done: Math.min(prev.done + 1, prev.total || ids.length),
        total: prev.total || ids.length,
      }));
    }
    const status =
      failed.length === 0 ? 200 : deleted_ids.length > 0 ? 207 : 400;
    return {
      ok: deleted_ids.length > 0,
      status,
      data: {
        message:
          failed.length === 0
            ? deleted_ids.length === 1
              ? "Lead deleted successfully"
              : `${deleted_ids.length} leads deleted successfully`
            : `${deleted_ids.length} deleted, ${failed.length} failed`,
        deleted: deleted_ids.length,
        deleted_ids,
        failed,
      },
    };
  };

  const handleDeleteLead = async () => {
    if (!deleteTargetIds.length) return;
    setDeletingLeads(true);
    const attemptedIds = [...deleteTargetIds];
    setDeleteProgress({ done: 0, total: attemptedIds.length });

    // D1 caps bound parameters per query, so the bulk endpoint is chunked
    // server-side; send in batches too so the progress bar advances and no
    // single request grows unbounded.
    const DELETE_BATCH = 90;
    const batches: number[][] = [];
    for (let i = 0; i < attemptedIds.length; i += DELETE_BATCH) {
      batches.push(attemptedIds.slice(i, i + DELETE_BATCH));
    }

    try {
      const allDeletedIds: number[] = [];
      const allFailed: { id: number; message: string }[] = [];

      for (const batch of batches) {
        // Try bulk endpoint first; fall back to the per-id loop only if unavailable.
        let r = await fetch(`${API_BASE}/leads/delete`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: batch }),
        });

        if (r.status === 404 || r.status === 405) {
          const perId = await deleteLeadsPerId(batch);
          r = new Response(JSON.stringify(perId.data), {
            status: perId.status,
            headers: { "Content-Type": "application/json" },
          });
        }

        const batchData = (await r.json().catch(() => ({}))) as {
          deleted_ids?: number[];
          failed?: { id: number; message: string }[];
        };
        const batchDeleted = Array.isArray(batchData.deleted_ids) ? batchData.deleted_ids : [];
        allDeletedIds.push(...batchDeleted);
        if (Array.isArray(batchData.failed)) allFailed.push(...batchData.failed);
        // A whole batch that the server rejected (e.g. 500) counts as failed.
        if (!r.ok && batchDeleted.length === 0) {
          for (const id of batch) {
            if (!allFailed.some((f) => f.id === id)) {
              allFailed.push({ id, message: `Could not delete lead(s) (${r.status})` });
            }
          }
        }

        setDeleteProgress((prev) => ({
          done: Math.min(prev.total, allDeletedIds.length + allFailed.length),
          total: prev.total,
        }));
      }

      const deleted = allDeletedIds.length;
      const failed = allFailed;
      const status = failed.length === 0 ? 200 : deleted > 0 ? 207 : 400;
      const res = new Response(
        JSON.stringify({
          message:
            deleted === 0
              ? "Could not delete leads"
              : failed.length === 0
                ? deleted === 1
                  ? "Lead deleted successfully"
                  : `${deleted} leads deleted successfully`
                : `${deleted} deleted, ${failed.length} failed`,
          deleted,
          deleted_ids: allDeletedIds,
          failed,
        }),
        { status, headers: { "Content-Type": "application/json" } },
      );

      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        deleted?: number;
        deleted_ids?: number[];
        failed?: { id: number; message: string }[];
      };
      const ok = res.ok && deleted > 0;

      if (ok && failed.length === 0) {
        setShowDeleteModal(false);
        setDeleteTargetIds([]);
        setMessage("");
        setSelectedLeadIds(new Set());
        toast.success(
          data.message ||
            (deleted === 1
              ? "Lead deleted successfully"
              : `${deleted} leads deleted successfully`),
        );
        await fetchLeads();
        refreshLeadSummary();
      } else if (deleted > 0) {
        setShowDeleteModal(false);
        setDeleteTargetIds([]);
        setSelectedLeadIds((prev) => {
          const next = new Set(prev);
          const removed = new Set(data.deleted_ids || []);
          attemptedIds.forEach((id) => {
            if (removed.has(id)) next.delete(id);
          });
          return next;
        });
        toast.error(
          data.message ||
            `${deleted} deleted, ${failed.length} failed. ${failed[0]?.message || ""}`,
        );
        await fetchLeads();
        refreshLeadSummary();
      } else {
        const errMsg =
          failed[0]?.message ||
          data.message ||
          (res.status === 404
            ? "Delete endpoint not found."
            : `Could not delete lead(s) (${res.status})`);
        setMessage(`Error: ${errMsg}`);
        toast.error(errMsg);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Request failed";
      const errMsg = `Could not reach the server: ${detail}. Check that the API is running and VITE_API_BASE is correct.`;
      setMessage(`Error: ${errMsg}`);
      toast.error(errMsg);
    } finally {
      setDeletingLeads(false);
      setDeleteProgress({ done: 0, total: 0 });
    }
  };

  // Hot is now purely a function of Stage (score > 45). Marking hot promotes the
  // lead to the first hot stage (Qualified); un-marking drops it to the highest
  // non-hot stage (Engaged) so it leaves the hot views. Uses the optimistic
  // single-field update (updateLeadField) so only that row re-renders - no full
  // table reload - then refreshes just the KPI summary.
  const setLeadHot = async (lead: EditingLead, hot: boolean) => {
    await updateLeadField(lead.id, "status", hot ? FIRST_HOT_STAGE : HIGHEST_NON_HOT_STAGE);
    refreshLeadSummary();
  };

  /**
   * Toggle hot mark. Marking hot is immediate; removing opens a confirm dialog
   * (and demotes the lead to "Engaged" so it leaves hot views).
   */
  const handleToggleHot = (lead: EditingLead) => {
    if (isHotStage(lead)) {
      setUnhotLead(lead);
    } else {
      void setLeadHot(lead, true);
    }
  };

  // The server applies the search, quick filter, and pagination, so the rows
  // come back ready to render.
  const filteredContacts = contacts || [];
  const paginatedLeads = filteredContacts;

  useEffect(() => {
    setPage(1);
  }, [
    viewFilter,
    dateFilterDays,
    quickFilters,
    debouncedSearch,
    pageSize,
  ]);

  const rangeLabel = useMemo(() => {
    const n = totalLeads;
    if (n === 0) return "0 of 0";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, n);
    return `${start}-${end} of ${n}`;
  }, [totalLeads, page, pageSize]);

  const pageLeadIds = useMemo(
    () => paginatedLeads.map((l) => l.id as number),
    [paginatedLeads],
  );

  const allPageSelected =
    pageLeadIds.length > 0 && pageLeadIds.every((id) => selectedLeadIds.has(id));

  useEffect(() => {
    setSelectedLeadIds(new Set());
  }, [
    viewFilter,
    dateFilterDays,
    quickFilters,
    debouncedSearch,
  ]);

  const toggleSelectAllPage = () => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageLeadIds.forEach((id) => next.delete(id));
      else pageLeadIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleLeadSelected = (id: number) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleQuickFilter = (id: QuickFilterId) => {
    // Flip loading in the same batch as the filter change so the heavy
    // 100-row re-render is skipped and the spinner appears immediately.
    setLoading(true);
    setQuickFilters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Click-and-drag to scroll the table horizontally. Grabbing empty cell space
  // (not a button / pill dropdown / input / link / checkbox) pans the table;
  // a drag past a few px suppresses the row's open-AI-panel click.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tablePan = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const [tableGrabbing, setTableGrabbing] = useState(false);
  const onTablePanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a, label, [role='button']")) return;
    const el = tableScrollRef.current;
    if (!el) return;
    tablePan.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
    setTableGrabbing(true);
  };
  const onTablePanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tablePan.current.active || !tableScrollRef.current) return;
    const dx = e.clientX - tablePan.current.startX;
    if (Math.abs(dx) > 4) tablePan.current.moved = true;
    tableScrollRef.current.scrollLeft = tablePan.current.startScroll - dx;
  };
  const endTablePan = () => {
    if (tablePan.current.active) {
      tablePan.current.active = false;
      setTableGrabbing(false);
    }
  };

  // Export the currently-loaded (filtered) leads as a CSV download.
  const exportLeadsCsv = () => {
    try {
      const rows: Record<string, string>[] = filteredContacts.map(
        (l: Record<string, unknown>) => ({
          name: String(l?.name ?? ""),
          email: String(l?.email ?? ""),
          phone: String(l?.phone ?? ""),
          lead_type: getLeadType(l),
          stage: getStageValue(l),
          score: String(stageScore(l)),
          ai_status: getAiStatus(l),
          source: String(l?.source ?? ""),
          area: getAreaValue(l),
          price_range: String(l?.price_range ?? l?.budget ?? ""),
          last_activity: String(l?.updated_at ?? ""),
        }),
      );
      if (rows.length === 0) {
        setMessage("No leads to export.");
        return;
      }
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(","),
        ...rows.map((r) =>
          headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","),
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("Could not export leads.");
    }
  };

  // JSX icon helpers for filter dropdowns - return ReactNode, defined inside component to use JSX.
  // Lead-type glyphs are intentionally neutral (grayish-white) - the colored
  // pill background carries the type's color, the icon stays subtle.
  const leadTypeIcon = (t: string) =>
    t === "Buyer"          ? <Home       className="w-4 h-4 text-gray-400" /> :
    t === "Seller"         ? <Tag        className="w-4 h-4 text-gray-400" /> :
    t === "Unknown"        ? <HelpCircle className="w-4 h-4 text-gray-400" /> :
    t === "Both"           ? <Users2     className="w-4 h-4 text-gray-400" /> :
    t === "Investor"       ? <TrendingUp className="w-4 h-4 text-gray-400" /> :
    t === "Renter"         ? <Home       className="w-4 h-4 text-gray-400" /> :
    t === "Agent Referral" ? <Users      className="w-4 h-4 text-gray-400" /> : null;

  const stageIcon = (s: string) =>
    s === "New Lead"        ? <Sparkles     className="w-4 h-4 text-orange-500"  /> :
    s === "Contacted"       ? <MessageSquare className="w-4 h-4 text-sky-500"    /> :
    s === "Engaged"         ? <TrendingUp   className="w-4 h-4 text-indigo-500"  /> :
    s === "Qualified"       ? <Flame        className="w-4 h-4 text-orange-500"  /> :
    s === "Appointment Set" ? <CalendarCheck className="w-4 h-4 text-amber-500"  /> :
    s === "Active Client"   ? <Users        className="w-4 h-4 text-emerald-500" /> :
    s === "Under Contract"  ? <Tag          className="w-4 h-4 text-teal-500"    /> :
    s === "Closed"          ? <CheckCircle2 className="w-4 h-4 text-green-600"   /> :
    s === "Lost"            ? <X            className="w-4 h-4 text-gray-400"    /> : null;

  const aiStatusIcon = (s: string) =>
    s === "AI Off"             ? <CircleOff    className="w-4 h-4 text-gray-400"    /> :
    s === "Automation Only"    ? <Megaphone    className="w-4 h-4 text-sky-500"     /> :
    s === "AI Active"          ? <PlayCircle   className="w-4 h-4 text-emerald-500" /> :
    s === "AI Paused"          ? <PauseCircle  className="w-4 h-4 text-amber-500"  /> :
    s === "Awaiting Reply"     ? <Clock        className="w-4 h-4 text-blue-500"   /> :
    s === "Human Takeover"     ? <Users        className="w-4 h-4 text-orange-500" /> :
    s === "Appointment Booked" ? <CalendarCheck className="w-4 h-4 text-purple-500" /> :
    s === "AI Complete"        ? <CheckCircle2 className="w-4 h-4 text-teal-500"   /> : null;

  // Pill-select option lists are pure functions of constant option arrays. Build
  // them ONCE instead of rebuilding 5 arrays (with JSX icons) per row on every
  // render - at 100+ rows that per-render allocation was a real cost on inline
  // edits. (icon fns are pure, so [] deps is correct.)
  /* eslint-disable react-hooks/exhaustive-deps */
  const leadTypeOptions = useMemo(() => LEAD_TYPE_OPTIONS.map((t) => ({ value: t, label: t, icon: leadTypeIcon(t), pillClass: leadTypePillClass(t) })), []);
  const stageOptions = useMemo(() => STAGE_OPTIONS.map((s) => ({ value: s, label: s, icon: stageIcon(s), pillClass: stagePillClass(s) })), []);
  const aiStatusOptions = useMemo(() => AI_STATUS_OPTIONS.map((s) => ({ value: s, label: s, icon: aiStatusIcon(s), pillClass: aiStatusPillClass(s) })), []);
  const sourceOptions = useMemo(() => [{ value: "", label: "-" }, ...SOURCE_OPTIONS.map((s) => ({ value: s, label: s }))], []);
  const priceRangeOptions = useMemo(() => [{ value: "", label: "-" }, ...PRICE_RANGE_OPTIONS.map((p) => ({ value: p, label: p }))], []);
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <MainLayout>
      <div className={`wcv2 space-y-6 transition-all duration-300 pt-4 px-4 sm:px-6 ${aiPanelOpen ? "sm:pr-85" : ""}`}>
        {/* HEADER */}
        <div className="wc-pagehead">
          <div>
            <h1>Leads</h1>
          </div>
          <div className="wc-pagehead-actions">
            <button className="wc-ghostbtn" onClick={leadImport.openImportModal}>
              <Upload size={15} /> Import Leads
            </button>
            <button
              className="wc-primary"
              onClick={() => {
                setEditingLeadId(null);
                resetNewLead();
                setLeadSmsConsent("opted_in");
                setShowAddLeadModal(true);
              }}
            >
              <Plus size={16} /> Add Lead
            </button>
          </div>
        </div>

        {/* SUMMARY STATS */}
        <div className="wc-kpis">
          {/* Total Leads - all-time pipeline size */}
          <div className="wc-kpi">
            <span className="wc-kpi-icon" style={{ color: "var(--accent-strong)", background: "var(--accent-soft)" }}>
              <Users size={18} />
            </span>
            <div className="wc-kpi-body">
              <div className="wc-kpi-label" style={{ color: "#000" }}>Total Leads</div>
              <div className="wc-kpi-row">
                <span className="wc-kpi-val">{lead_summary?.total_leads ?? 0}</span>
                <span className="wc-kpi-delta">In pipeline</span>
              </div>
            </div>
          </div>

          {/* New Leads - windowed count + delta vs the previous equal window */}
          <div className="wc-kpi">
            <div className="wc-kpi-range">
              {(["7", "14", "30"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={newPeriod === p ? "is-on" : ""}
                  onClick={() => setNewPeriod(p)}
                  aria-pressed={newPeriod === p}
                >
                  {p}d
                </button>
              ))}
            </div>
            <span className="wc-kpi-icon" style={{ color: "var(--accent-strong)", background: "var(--accent-soft)" }}>
              <Sparkles size={18} />
            </span>
            <div className="wc-kpi-body">
              <div className="wc-kpi-label" style={{ color: "#000" }}>New Leads</div>
              <div className="wc-kpi-row">
                <span className="wc-kpi-val" style={{ color: "#000" }}>{newKpi.current}</span>
                <span className={`wc-kpi-delta${newKpi.delta > 0 ? " is-up" : ""}`}>
                  {newKpi.delta >= 0 ? "+" : ""}
                  {newKpi.delta} vs prev
                </span>
              </div>
            </div>
          </div>

          {/* Hot Leads - windowed count + delta vs the previous equal window */}
          <div className="wc-kpi">
            <div className="wc-kpi-range">
              {(["7", "14", "30"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={hotPeriod === p ? "is-on" : ""}
                  onClick={() => setHotPeriod(p)}
                  aria-pressed={hotPeriod === p}
                >
                  {p}d
                </button>
              ))}
            </div>
            <span
              className="wc-kpi-icon"
              style={{ color: "var(--accent-strong)", background: "var(--accent-soft)" }}
            >
              <Flame size={18} />
            </span>
            <div className="wc-kpi-body">
              <div className="wc-kpi-label" style={{ color: "#000" }}>Hot Leads</div>
              <div className="wc-kpi-row">
                <span className="wc-kpi-val">{hotKpi.current}</span>
                <span className={`wc-kpi-delta${hotKpi.delta > 0 ? " is-up" : ""}`}>
                  {hotKpi.delta >= 0 ? "+" : ""}
                  {hotKpi.delta} vs prev
                </span>
              </div>
            </div>
          </div>

          {/* Needs Reply - leads awaiting our reply right now (alert styling).
              Clicking applies the Needs Reply quick filter. */}
          <button
            type="button"
            onClick={() => toggleQuickFilter("needs_reply")}
            className={`wc-kpi is-alert text-left${quickFilters.includes("needs_reply") ? " ring-2 ring-orange-300" : ""}`}
            aria-pressed={quickFilters.includes("needs_reply")}
          >
            <span
              className="wc-kpi-icon"
              style={{ color: "var(--accent-strong)", background: "var(--accent-soft)" }}
            >
              <MessageSquare size={18} />
            </span>
            <div className="wc-kpi-body">
              <div className="wc-kpi-label" style={{ color: "#000" }}>Needs Reply</div>
              <div className="wc-kpi-row">
                <span className="wc-kpi-val">{lead_summary?.needs_reply ?? 0}</span>
                <span className="wc-kpi-delta is-alert">now</span>
              </div>
            </div>
          </button>
        </div>

        {/* TOOLBAR - view toggle + mini search + spacer + Export, then quick
            filter chips on a second row (spec wc-toolbar). */}
        <div className="wc-toolbar">
          <div className="wc-toolbar-row">
            {/* Pipeline / Table view toggle */}
            <div className="wc-viewtoggle">
              <button
                type="button"
                onClick={() => setLeadsView("pipeline")}
                className={leadsView === "pipeline" ? "is-on" : ""}
              >
                <LayoutGrid size={16} />
                Pipeline
              </button>
              <button
                type="button"
                onClick={() => setLeadsView("list")}
                className={leadsView === "list" ? "is-on" : ""}
              >
                <List size={16} />
                Table
              </button>
            </div>

            {/* Mini search - one box spanning name, contact, type, status, AI
                status, source, budget, area + notes (server-side `q`). */}
            <div className="wc-minisearch">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leads..."
                aria-label="Search leads"
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">
                  <X size={15} />
                </button>
              ) : null}
            </div>

            <div className="wc-toolbar-spacer" />

            {leadsView === "list" && (
              <button
                type="button"
                onClick={toggleSelectAllPage}
                disabled={loading || pageLeadIds.length === 0}
                className="wc-ghostbtn disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                {allPageSelected ? "Deselect all" : "Select all"}
              </button>
            )}
            <button
              type="button"
              onClick={exportLeadsCsv}
              className="wc-ghostbtn"
              title="Export filtered leads"
            >
              <Download size={16} /> Export
            </button>
          </div>

          {/* Quick filter chips */}
          <div className="wc-chips">
            {QUICK_FILTERS.map((qf) => {
              const active = quickFilters.includes(qf.id);
              const iconMap: Record<string, React.ElementType> = {
                hot:              Flame,
                needs_reply:      Zap,
                buyers:           Home,
                sellers:          Tag,
                ai_active:        Bot,
                ai_recommended:   Sparkles,
                appointment_set:  CalendarCheck,
              };
              const Icon = iconMap[qf.id] ?? Sparkles;
              return (
                <button
                  key={qf.id}
                  type="button"
                  onClick={() => toggleQuickFilter(qf.id)}
                  className={"wc-qchip" + (active ? " is-on" : "")}
                >
                  <Icon size={13} />
                  {qf.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* PIPELINE (kanban) VIEW - one column per Stage, server-side lazy
            loading per column, drag a card to change a lead's Stage. */}
        {leadsView === "pipeline" && (
          <PipelineBoard
            apiBase={API_BASE}
            token={token}
            orgId={org_id}
            debouncedSearch={debouncedSearch}
            quickFilters={quickFilters}
            activeLeadId={detailLead?.id ?? null}
            onOpenLead={(lead) => openDetail(lead as EditingLead)}
            onChanged={() => {
              // Keep the Table view + KPIs in sync after a drag-to-restage.
              refreshLeadSummary();
              void fetchLeads();
            }}
          />
        )}

        {leadsView === "list" && selectedLeadIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50/80 px-4 py-3">
            <p className="text-sm font-medium text-gray-800">
              {selectedLeadIds.size} lead{selectedLeadIds.size === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedLeadIds(new Set())}
                className="px-3 py-1.5 text-sm text-gray-700 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={() => openDeleteConfirm(Array.from(selectedLeadIds))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white rounded-lg bg-red-600 hover:bg-red-700"
              >
                <Trash2 size={14} />
                Delete selected
              </button>
            </div>
          </div>
        )}

        {/* TABLE (list view) */}
        {leadsView === "list" && (
        <div className="bg-white shadow-sm overflow-hidden" style={{ borderRadius: 16, border: "1px solid #E8EAF0" }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-gray-500">
              <Loader2 size={18} className="animate-spin" /> Loading leads...
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-gray-500">
              {contacts.length > 0
                ? "No leads match the selected filters."
                : "No leads yet. Add one to get started."}
            </div>
          ) : (
            <div>
              <div
                ref={tableScrollRef}
                className={`overflow-x-auto overflow-y-visible ${tableGrabbing ? "cursor-grabbing select-none" : "cursor-grab"}`}
                onPointerDown={onTablePanDown}
                onPointerMove={onTablePanMove}
                onPointerUp={endTablePan}
                onPointerCancel={endTablePan}
              >
                <table className="wc-table min-w-full">
                  <thead>
                    <tr>
                      <th className="w-10 px-3 py-3 font-semibold" scope="col">
                        <span className="sr-only">Select row</span>
                      </th>
                      {[
                        "Name",
                        "Lead Type",
                        "Stage",
                        "AI Status",
                        ...(isCustomBrokerage ? ["Team", "Agent"] : []),
                        "Source",
                        "Budget",
                        "Area",
                        "Score",
                        "Last Activity",
                        "Actions",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left font-semibold whitespace-nowrap"
                          style={
                            h === "Actions"
                              ? { position: "sticky", right: 0, zIndex: 1, background: "var(--line-soft)", boxShadow: "-6px 0 8px -7px rgba(0,0,0,0.15)" }
                              : undefined
                          }
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedLeads.map((lead) => {
                      const hotRow = isHotStage(lead);
                      const leadType = getLeadType(lead);
                      const stageVal = getStageValue(lead);
                      const scoreVal = stageScore(lead);
                      // NULL ai_status = follow the account AI setting (AI does
                      // respond), so it must not be displayed as "AI Off".
                      const aiStat = getAiStatus(lead) || "AI On";
                      const areaVal = getAreaValue(lead);
                      return (
                        <tr
                          key={lead.id}
                          onClick={(e) => {
                            // Whole row opens the detail panel, except clicks on
                            // interactive controls (checkbox, inline editors,
                            // row actions, links).
                            if (
                              (e.target as HTMLElement).closest(
                                'button, a, input, select, textarea, label, [role="button"], .wc-inlsel, .wc-inlsel-menu',
                              )
                            )
                              return;
                            openDetail(lead);
                          }}
                          className={`cursor-pointer transition hover:bg-orange-50/40 ${
                            (aiPanelOpen && selectedAiLead?.id === lead.id) ||
                            searchParams.get("lead") === String(lead.id)
                              ? "bg-orange-50/70"
                              : ""
                          }`}
                        >
                          <td className="align-middle px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.has(lead.id)}
                              onChange={() => toggleLeadSelected(lead.id)}
                              className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                              aria-label={`Select ${lead.name || "lead"}`}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>

                          {/* Name */}
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => openDetail(lead)}
                              className="flex cursor-pointer items-start gap-2.5 text-left hover:opacity-90"
                            >
                              <span
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-gray-200 to-gray-100 text-[11px] font-semibold uppercase text-gray-700"
                                aria-hidden
                              >
                                {leadInitials(lead.name)}
                              </span>
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="font-semibold text-gray-900 block truncate max-w-28 sm:max-w-36"
                                    title={lead.name || undefined}
                                  >
                                    {lead.name || "-"}
                                  </span>
                                  {/* SMS consent / opt-out indicator next to the
                                      lead name. Precedence runs blocked -> no_sms
                                      -> unknown (no badge). The "opted in" badge is
                                      intentionally not shown here - opted-in is the
                                      expected baseline, so only the states that
                                      restrict sending get a badge. Hover for the
                                      precise reason. */}
                                  {lead.sms_opt_out ? (
                                    <span
                                      title={
                                        lead.sms_opt_out_reason === "keyword"
                                          ? "SMS opted out - the contact texted STOP. They must text START to re-subscribe."
                                          : lead.sms_opt_out_reason === "manual_admin"
                                          ? "SMS blocked by a site admin from /admin/blocked."
                                          : lead.sms_opt_out_reason === "manual_agent"
                                          ? "SMS blocked by an agent from this lead's profile."
                                          : lead.sms_opt_out_reason === "manual_import"
                                          ? "SMS marked opted-out at CSV import."
                                          : "SMS opted out - sends are blocked."
                                      }
                                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700"
                                    >
                                      <ShieldOff size={11} className="shrink-0" />
                                      {lead.sms_opt_out_reason === "keyword" ? "STOP" : "Blocked"}
                                    </span>
                                  ) : lead.sms_consent_status === "no_sms" ? (
                                    <span
                                      title="Do not SMS - the agent flagged this contact as no-SMS at add-time or import. Campaigns, AI follow-up, and manual sends are all blocked."
                                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700"
                                    >
                                      <CircleOff size={11} className="shrink-0" />
                                      No SMS
                                    </span>
                                  ) : null}
                                  {/* Email unsubscribed indicator - independent
                                      from the SMS state above. */}
                                  {lead.email_opt_out ? (
                                    <span
                                      title="Email unsubscribed - the contact clicked the unsubscribe link."
                                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700"
                                    >
                                      <MailX size={11} className="shrink-0" />
                                      Email
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                                  <Mail size={12} className="shrink-0 text-gray-400" />{" "}
                                  <span className="truncate">
                                    {lead.email || lead.phone || "-"}
                                  </span>
                                </span>
                              </span>
                            </button>
                          </td>

                          {/* Lead Type */}
                          <td className="px-4 py-3">
                            <InlinePillSelect
                              value={leadType}
                              pillClass={leadTypePillClass(leadType)}
                              ariaLabel="Lead Type"
                              options={leadTypeOptions}
                              onChange={(v) => updateLeadField(lead.id, "lead_type", v)}
                            />
                          </td>

                          {/* Stage (drives Score + hot). Editing it from here
                              updates lead.status. */}
                          <td className="px-4 py-3">
                            <InlinePillSelect
                              value={stageVal}
                              pillClass={stagePillClass(stageVal)}
                              ariaLabel="Stage"
                              options={stageOptions}
                              onChange={(v) => updateLeadField(lead.id, "status", v)}
                            />
                          </td>

                          {/* AI Status */}
                          <td className="px-4 py-3">
                            <InlinePillSelect
                              value={aiStat}
                              pillClass={aiStatusPillClass(aiStat)}
                              ariaLabel="AI Status"
                              options={aiStatusOptions}
                              onChange={(v) => updateLeadField(lead.id, "ai_status", v)}
                            />
                          </td>

                          {/* Team - brokerage (multi-team) only */}
                          {isCustomBrokerage && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <InlinePillSelect
                              value={String(lead.team_name || lead.team || "")}
                              pillClass="bg-blue-50 text-blue-700"
                              ariaLabel="Team"
                              options={[
                                { value: "", label: "-" },
                                ...dynamicTeams.map((t) => ({ value: t, label: t })),
                              ]}
                              onChange={(v) => updateLeadField(lead.id, "team_name", v)}
                            />
                          </td>
                          )}

                          {/* Assigned Agent - brokerage (multi-agent) only */}
                          {isCustomBrokerage && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {dynamicAgents.length > 0 ? (
                              <InlinePillSelect
                                value={String(lead.owner_id || "")}
                                pillClass="bg-purple-50 text-purple-700"
                                ariaLabel="Agent"
                                options={[
                                  { value: "", label: "-" },
                                  ...dynamicAgents.map((a) => ({ value: a.id, label: a.name })),
                                ]}
                                onChange={(v) => updateLeadField(lead.id, "owner_id", v)}
                              />
                            ) : (
                              (lead.owner_name || lead.assigned_agent) ? (
                                <span className="flex items-center gap-2">
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-purple-100 to-indigo-50 text-[10px] font-semibold uppercase text-purple-900">
                                    {leadInitials(String(lead.owner_name || lead.assigned_agent))}
                                  </span>
                                  <span className="text-sm text-gray-700 truncate max-w-28">
                                    {String(lead.owner_name || lead.assigned_agent)}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-gray-400 text-sm">-</span>
                              )
                            )}
                          </td>
                          )}

                          {/* Source */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <InlinePillSelect
                              value={lead.source?.trim() ? lead.source : ""}
                              pillClass="bg-gray-100 text-gray-700"
                              ariaLabel="Source"
                              options={sourceOptions}
                              onChange={(v) => updateLeadField(lead.id, "source", v)}
                            />
                          </td>

                          {/* Budget */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <InlinePillSelect
                              value={String(lead.price_range || lead.budget || "")}
                              pillClass="bg-emerald-50 text-emerald-700"
                              ariaLabel="Budget"
                              options={priceRangeOptions}
                              onChange={(v) => updateLeadField(lead.id, "price_range", v)}
                            />
                          </td>

                          {/* Area - inline editable */}
                          <td
                            className="min-w-40 px-4 py-3 text-gray-700"
                            title={areaVal || "No Area"}
                          >
                            <input
                              type="text"
                              defaultValue={areaVal}
                              placeholder="No Area"
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                if (next !== (areaVal || "")) {
                                  updateLeadField(lead.id, "area", next);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-700 hover:border-gray-200 focus:border-orange-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-200"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>

                          {/* Score - deterministic from Stage. Gray under 60,
                              orange in the mid range, emerald at the top. */}
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex items-center gap-2" title={`${stageVal} - ${scoreVal}%`}>
                              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                                <span
                                  className={`block h-full rounded-full ${scoreColor(scoreVal).bar}`}
                                  style={{ width: `${scoreVal}%` }}
                                />
                              </span>
                              <span className={`text-sm font-semibold tabular-nums ${scoreColor(scoreVal).text}`}>
                                {scoreVal}
                              </span>
                            </div>
                          </td>

                          {/* Last Activity */}
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                            {formatRelativeUpdated(lead.updated_at)}
                          </td>

                          {/* Actions - sticky to the right edge so they stay
                              visible while the table scrolls horizontally. */}
                          <td
                            className="px-4 py-3"
                            style={{ position: "sticky", right: 0, zIndex: 1, background: "#fff", boxShadow: "-6px 0 8px -7px rgba(0,0,0,0.15)" }}
                          >
                            {/* 2-col action grid (spec wc-rowacts): AI, edit,
                                message, star, delete. Same real handlers as
                                before. */}
                            <div className="wc-rowacts" style={{ gridTemplateColumns: "repeat(3,28px)" }}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAiPanel(lead);
                                    }}
                                    aria-label="Open AI Agent"
                                    className="wc-rowact"
                                    style={
                                      aiPanelOpen && selectedAiLead?.id === lead.id
                                        ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                                        : undefined
                                    }
                                  >
                                    <Sparkles size={14} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">AI Agent</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => openEditLeadFromDetails(lead)}
                                    aria-label="Edit lead"
                                    className="wc-rowact"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Edit Lead</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => openLeadInInbox(lead.id)}
                                    aria-label="Send message"
                                    className="wc-rowact"
                                  >
                                    <MessageSquare size={14} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Send Message</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleHot(lead);
                                    }}
                                    aria-label={hotRow ? "Hot Prospect - click to remove" : "Mark as Hot Prospect"}
                                    className={`wc-rowact is-star${hotRow ? " is-on" : ""}`}
                                  >
                                    <Star size={14} fill={hotRow ? "currentColor" : "none"} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {hotRow ? "Hot Prospect - click to remove" : "Mark as Hot Prospect"}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDeleteConfirm([lead.id]);
                                    }}
                                    aria-label="Delete lead"
                                    className="wc-rowact"
                                    style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Delete Lead</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        )}

        {/* BOTTOM PAGINATION (table view only) */}
        {leadsView === "list" && filteredContacts.length > 0 && (
          <div className={`flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4 px-1 pb-2 ${aiPanelOpen ? "sm:pr-6" : "pr-2"}`}>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{rangeLabel}</span>
              <span className="text-gray-400"> · Page {page} of {totalPages}</span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => { setLoading(true); setPage(1); }}
                  className="rounded-md p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  title="First page"
                  aria-label="First page"
                >
                  <ChevronsLeft size={17} />
                </button>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => { setLoading(true); setPage((p) => Math.max(1, p - 1)); }}
                  className="rounded-md p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="min-w-8 px-1 text-center text-sm font-medium text-gray-800 tabular-nums">
                  {page}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => { setLoading(true); setPage((p) => Math.min(totalPages, p + 1)); }}
                  className="rounded-md p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => { setLoading(true); setPage(totalPages); }}
                  className="rounded-md p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  title="Last page"
                  aria-label="Last page"
                >
                  <ChevronsRight size={17} />
                </button>
              </div>
              <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
                {LEADS_PAGE_SIZE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      setPageSize(n);
                      setPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      pageSize === n
                        ? "bg-white text-orange-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span className="pl-1 pr-2 text-xs text-gray-500">/ page</span>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE-IN LEAD DETAIL DRAWER (spec DetailPanel) - opened by clicking a
            lead name in the table or a card on the Kanban board. Wired to the
            page's real single-field update, message-to-inbox, full edit modal,
            and AI assistant handlers. */}
        {detailLeadLive && (
          <LeadDetailPanel
            lead={detailLeadLive}
            apiBase={API_BASE}
            token={token}
            onClose={() => setDetailLead(null)}
            onUpdateField={updateLeadField}
            onMessage={(id) => openLeadInInbox(id)}
            onEdit={(lead) => {
              setDetailLead(null);
              handleEditLead(lead);
            }}
            onOpenAi={(lead) => openAiPanel(lead)}
          />
        )}
      </div>

      <ImportLeadsModal
        open={leadImport.showImportModal}
        importStep={leadImport.importStep}
        csvFile={leadImport.csvFile}
        csvTotalRows={leadImport.csvTotalRows}
        csvHeaders={leadImport.csvHeaders}
        csvPreview={leadImport.csvPreview}
        importRows={leadImport.importRows}
        importExcludedRows={leadImport.importExcludedRows}
        setImportExcludedRows={leadImport.setImportExcludedRows}
        mapping={leadImport.mapping}
        setMapping={leadImport.setMapping}
        duplicateHandling={leadImport.duplicateHandling}
        setDuplicateHandling={leadImport.setDuplicateHandling}
        importSmsConsent={leadImport.importSmsConsent}
        setImportSmsConsent={leadImport.setImportSmsConsent}
        importConsentAttested={leadImport.importConsentAttested}
        setImportConsentAttested={leadImport.setImportConsentAttested}
        batchTags={leadImport.batchTags}
        setBatchTags={leadImport.setBatchTags}
        importResult={leadImport.importResult}
        importSkipReasons={leadImport.importSkipReasons}
        importPreviewLoading={leadImport.importPreviewLoading}
        importSheets={leadImport.importSheets}
        importSheetName={leadImport.importSheetName}
        setImportSheetName={leadImport.setImportSheetName}
        importDetectionSummary={leadImport.importDetectionSummary}
        importDetectionMethod={leadImport.importDetectionMethod}
        importDefaultStage={leadImport.importDefaultStage}
        setImportDefaultStage={leadImport.setImportDefaultStage}
        importInboundEnabled={leadImport.importInboundEnabled}
        setImportInboundEnabled={leadImport.setImportInboundEnabled}
        importQualificationEnabled={leadImport.importQualificationEnabled}
        setImportQualificationEnabled={leadImport.setImportQualificationEnabled}
        importHumanOnly={leadImport.importHumanOnly}
        setImportHumanOnly={leadImport.setImportHumanOnly}
        importAutomationId={leadImport.importAutomationId}
        setImportAutomationId={leadImport.setImportAutomationId}
        importAiApplying={leadImport.importAiApplying}
        message2={leadImport.message2}
        importBusy={leadImport.importBusy}
        importLoadingMessage={leadImport.importLoadingMessage}
        onClose={leadImport.closeImportModal}
        onDone={leadImport.handleImportDone}
        onBack={leadImport.handleImportBack}
        onContinue={leadImport.handleImportContinue}
        fetchImportPreview={leadImport.fetchImportPreview}
        handleCSVSelect={leadImport.handleCSVSelect}
        importMappingHasContact={leadImport.importMappingHasContact}
        getImportFieldMappingStatus={leadImport.getImportFieldMappingStatus}
        runAutoMap={leadImport.runAutoMap}
        aiMapLoading={leadImport.aiMapLoading}
        aiMapUsed={leadImport.aiMapUsed}
        aiMapMessage={leadImport.aiMapMessage}
      />

      <AddLeadModal
        open={showAddLeadModal}
        form={newLead}
        onFormChange={setNewLead}
        editingLeadId={editingLeadId}
        leadSmsConsent={leadSmsConsent}
        onLeadSmsConsentChange={setLeadSmsConsent}
        onClose={closeLeadModal}
        onSave={handleSaveLeadFromAddModal}
        // Lock the consent radios to "Do not SMS" when the edited lead is
        // already opted-out (texted STOP, admin/agent blocked, etc.). The
        // agent has to either get the contact to text START or contact
        // support with proof of consent.
        lockedForOptOut={
          editingLeadId != null &&
          Boolean(contacts.find((c) => c.id === editingLeadId)?.sms_opt_out)
        }
      />

      <AddLeadCampaignModal
        open={showAiFollowUpGate}
        onClose={() => {
          // Skip: the lead is already created, just clear the pending state.
          setShowAiFollowUpGate(false);
          setPendingEnrollLeadId(null);
          setLeadSmsConsent("opted_in");
          setNewLead({ ...DEFAULT_NEW_LEAD });
        }}
        onConfirm={(choice) => void handleEnrollNewLead(choice)}
      />

      {/* EditLeadModal was removed - editing routes through AddLeadModal in
          edit mode (handleEditLead + openEditLeadFromDetails both populate
          newLead + set editingLeadId + open showAddLeadModal). */}

      <DeleteLeadModal
        open={showDeleteModal}
        deleteTargetIds={deleteTargetIds}
        message={message}
        deletingLeads={deletingLeads}
        deleteProgress={deleteProgress}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteTargetIds([]);
          setMessage("");
        }}
        onDelete={() => void handleDeleteLead()}
      />

      {/* Floating AI button - visible when panel is closed */}
      {!aiPanelOpen && (
        <button
          type="button"
          onClick={() => setAiPanelOpen(true)}
          className="fixed bottom-12 right-6 z-40 flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-orange-600 transition"
          aria-label="Open AI Agent"
        >
          <Sparkles size={15} />
          {selectedLeadIds.size > 1
            ? `AI · ${selectedLeadIds.size} leads`
            : "AI"}
        </button>
      )}

      <AIAgentPanel
        isOpen={aiPanelOpen}
        lead={selectedAiLead && selectedAiLead.id != null ? { ...selectedAiLead, id: selectedAiLead.id } : null}
        onClose={() => setAiPanelOpen(false)}
        apiBase={API_BASE}
        token={token}
        selectedLeadIds={Array.from(selectedLeadIds)}
      />

      <ConfirmDialog
        open={unhotLead !== null}
        title="Remove hot mark?"
        message={
          <>
            <b className="font-bold text-[#15172B]">
              {unhotLead?.name ||
                `${unhotLead?.first_name ?? ""} ${unhotLead?.last_name ?? ""}`.trim() ||
                "This lead"}
            </b>{" "}
            will no longer appear in hot-lead views.
          </>
        }
        confirmLabel="Remove"
        cancelLabel="Keep hot"
        tone="danger"
        onConfirm={() => {
          if (unhotLead) void setLeadHot(unhotLead, false);
          setUnhotLead(null);
        }}
        onCancel={() => setUnhotLead(null)}
      />
    </MainLayout>
  );
}
