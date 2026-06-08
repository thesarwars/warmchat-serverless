import { get, patch, post, put, del } from "./api";

export type InboxAppointmentRecord = {
  id: number;
  status: string;
  appointment_type: string;
  starts_at: string;
  ends_at?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
  meeting_type?: string | null;
  external_meeting_url?: string | null;
  lead_id?: number | null;
  sms_confirmation_sent_at?: string | null;
  email_confirmation_sent_at?: string | null;
  [key: string]: unknown;
};

export type InboxAppointmentPayload = {
  appointment_type: string;
  starts_at: string;
  meeting_type?: string;
  notes?: string;
  external_meeting_url?: string;
  send_sms_confirmation?: boolean;
  send_email_confirmation?: boolean;
};

export const fetchGmailConnection = () => get(`/gmail/connection`);
export const fetchBusinessEmailStatus = () => get(`/elastic/business-email/status`);
export const fetchInboxContacts = () => get(`/inbox/contacts`);

export type MeBootstrap = {
  profile: Record<string, unknown>;
  billing: Record<string, unknown> | null;
  notification_settings: Record<string, boolean>;
  channels: { sms: Record<string, unknown>; email: Record<string, unknown> };
  phone_number: { phone_number: string | null };
};
export const fetchMeBootstrap = () => get(`/bootstrap/me`) as Promise<MeBootstrap>;

export const fetchDashboardData = (id: number | string) => get(`/dashboard/org/${id}?reply_overdue_hours=24`);
export const fetchDashboardHotLeads = (id: number | string) => get(`/dashboard/org/${id}/hot-leads`);
export const fetchDashboardPerformance = (id: number | string, params: Record<string, unknown>) =>
  get(`/dashboard/org/${id}/performance`, params);
export const fetchDashboardPriroty = (id: number | string) => get(`/dashboard/org/${id}/priority-actions`);

export type OrgKpiGoals = {
  goal_pipeline_value: number;
  goal_hot_leads: number;
  goal_appointments: number;
  goal_deals_closed: number;
};
export const fetchOrgKpiGoals = (id: number | string) =>
  get(`/orgs/${id}/kpi-goals`) as Promise<OrgKpiGoals>;
export const updateOrgKpiGoals = (id: number | string, data: Partial<OrgKpiGoals>) =>
  patch(`/orgs/${id}/kpi-goals`, data, {}, true);
export const fetchLeadSummary = (id: number | string) => get(`/leads/summary/${id}`);
// const fetchLeadsFilter = (id: number | string) => get(`/leads/filters/${id}`);
export const fetchOrgLeads = (id: number | string) => get(`/leads/${id}`);
// Search org leads by name/email/phone (server-side) for pickers - covers every
// lead, not just those with message history (which /inbox/contacts limits to).
export const searchOrgLeads = (id: number | string, q: string) =>
  get(`/leads/${id}`, { q, page_size: 25 });
/** Fetch only hot-status leads for the dashboard widget (bypasses pagination). */
export const fetchOrgHotLeads = (id: number | string) => get(`/leads/${id}?quick=hot_leads&page_size=50`);
export const updateLead = (leadId: number | string, data: Record<string, unknown>) => patch(`/leads/${leadId}`, data);
export const fetchOrgAppointments = (id: number | string, params: Record<string, unknown> = {}) =>
  get(`/dashboard/org/${id}/appointments`, params);

// Create an appointment from the Calendar. lead_id is optional (standalone
// meetings have none); when present the appointment attaches to that lead.
export const createOrgAppointment = (id: number | string, data: Record<string, unknown>) =>
  post(`/dashboard/org/${id}/appointments`, data);


export const postInboxAppointment = (leadId: number, data: Record<string, unknown>) =>
  post(`/inbox/contacts/${leadId}/appointments`, data);

export const patchInboxAppointment = (
  leadId: number,
  appointmentId: number,
  data: Record<string, unknown>,
) => patch(`/inbox/contacts/${leadId}/appointments/${appointmentId}`, data);

export const postInboxAppointmentCancel = (
  leadId: number,
  appointmentId: number,
  channels?: { sendSms?: boolean; sendEmail?: boolean },
) =>
  post(`/inbox/contacts/${leadId}/appointments/${appointmentId}/cancel`, {
    lead_id: leadId,
    appointment_id: appointmentId,
    send_sms_confirmation: channels?.sendSms ?? false,
    send_email_confirmation: channels?.sendEmail ?? false,
  });

// const postInboxAppointmentConfirm = (leadId: number, appointmentId: number) =>
//     post(`/inbox/contacts/${leadId}/appointments/${appointmentId}/confirm`, {});
  
// const postInboxAppointmentApproveReschedule = (leadId: number, appointmentId: number) =>
//     post(`/inbox/contacts/${leadId}/appointments/${appointmentId}/approve-reschedule`, {});

// --- Settings (/settings: Workspace Settings + Billing & Usage tabs) ---
// These ride the HttpOnly session cookie (get/patch/post/put/del are all
// withCredentials). NOTE: the connected-accounts + integrations wrappers in
// src/api/* instead send an Authorization: Bearer header with the localStorage
// "token" sentinel ("cookie"); on the same-origin API the cookie still
// authenticates, so the two auth styles share one session. Don't "fix" that to
// match - it works as-is and the Connected Accounts page (/connect-email) relies on it.
// (Notification settings are read via fetchMeBootstrap; only the PATCH is needed.)
export const patchNotificationSettings = (data: Record<string, boolean>) =>
  patch(`/me/notification-settings`, data, {}, true);
export const saveProfileMe = (data: Record<string, unknown>) => put(`/profile/me`, data, {}, true);
export const changePassword = (data: { current_password: string; new_password: string }) =>
  post(`/profile/change-password`, data, {}, false, true);
export const deleteAccount = () => del(`/auth/account`, {}, true);
export const fetchOrgTimezone = (id: number | string) => get(`/orgs/${id}/timezone`);
export const patchOrgTimezone = (id: number | string, data: { timezone: string }) =>
  patch(`/orgs/${id}/timezone`, data, {}, true);
export const fetchOrgQuietHours = (id: number | string) => get(`/orgs/${id}/quiet-hours`);
export const patchOrgQuietHours = (id: number | string, data: { start: number; end: number }) =>
  patch(`/orgs/${id}/quiet-hours`, data, {}, true);
export const fetchSendingAddress = () => get(`/elastic/sending-address`);
export const saveSendingPrefix = (data: { sending_prefix: string }) =>
  post(`/elastic/sending-address`, data, {}, false, true);
export const openBillingPortal = () => post(`/billing/portal-session`, {}, {}, false, true);
export const sendTestNotification = (body?: Record<string, unknown>) =>
  post(`/notifications/test`, body ?? {}, {}, false, true);
export const fetchComplianceSummary = () => get(`/compliance/summary`);
// Organization tab (Custom Brokerage). Users + Teams are read-only here (full
// management lives on the dedicated /team/* pages); Offices is a small CRUD.
export const fetchOrgUsers = () => get(`/auth/users`);
export const fetchOrgTeams = (orgId: number | string) => get(`/teams`, { org_id: orgId });
export const fetchOffices = (orgId: number | string) => get(`/offices`, { org_id: orgId });
export const createOffice = (data: Record<string, unknown>) => post(`/offices`, data, {}, false, true);
export const deleteOffice = (id: number) => del(`/offices/${id}`, {}, true);

// const fetchVapidPublicKey = () =>
//   get('/notifications/vapid-public-key');

// const postPushSubscribe = (data: Record<string, unknown>) =>
//   post('/notifications/subscribe', data, {}, false, true);

// const postPushUnsubscribe = (endpoint: string) =>
//   post('/notifications/unsubscribe', { endpoint }, {}, false, true);

// const postDeviceToken = (token: string, platform: 'ios' | 'android' | 'web') =>
//   post('/notifications/device-token', { token, platform }, {}, false, true);

// const deleteDeviceToken = (token: string) =>
//   del('/notifications/device-token', { data: { token } }, true);

// const createScheduledMessage = (data: Record<string, unknown>) =>
//   post('/inbox/scheduled', data, {}, false, true);

// ─── AI Agents (restructured AI section) ──────────────────────────────────────
export type AgentKey = "assistant" | "inbound" | "outbound";

export const fetchAiAgents = () => get(`/ai/agents`);
export const updateAiAgent = (key: AgentKey, data: Record<string, unknown>) =>
  patch(`/ai/agents/${key}`, data, {}, true);
export const fetchAiLogs = (key: AgentKey, params: Record<string, unknown> = {}) =>
  get(`/ai/agents/${key}/logs`, params);

// The fully assembled system prompt the agent runs with (transparency/debug).
export const fetchAgentSystemPrompt = (key: AgentKey) => get(`/ai/agents/${key}/system-prompt`);

// Brand + escalation rules (always_say / never_say / escalation_keywords) -
// persisted on auto_response_settings, fed into the prompt + the escalation guard.
export const fetchAiRules = () => get(`/ai/rules`);
export const updateAiRules = (data: Record<string, unknown>) => patch(`/ai/rules`, data, {}, true);

// Custom inbound auto-responders (AI Agent -> Inbound -> Workflows). Real CRUD;
// injected into the inbound system prompt so the AI applies them.
export const fetchInboundResponders = () => get(`/ai/responders`);
export const createInboundResponder = (data: Record<string, unknown>) => post(`/ai/responders`, data, {}, true, true);
export const updateInboundResponder = (id: number, data: Record<string, unknown>) => patch(`/ai/responders/${id}`, data, {}, true);
export const deleteInboundResponder = (id: number) => del(`/ai/responders/${id}`, {}, true);

export const fetchAiWorkflows = (key: AgentKey) => get(`/ai/agents/${key}/workflows`);
export const updateAiWorkflow = (key: AgentKey, workflowKey: string, enabled: boolean) =>
  patch(`/ai/agents/${key}/workflows/${workflowKey}`, { enabled }, {}, true);

// Create an outbound automation (the AI Agent Outbound wizard). isReturnError
// so the caller's mutation can surface success/failure itself.
export const createAutomation = (data: Record<string, unknown>) =>
  post(`/automations`, data, {}, true, true);

// Org members (the team) - used by the Deals "Add Deal" TEAM picker. Reuses the
// existing handoff-users endpoint, which returns every member of the caller's org.
export const fetchOrgMembers = () => get(`/ai-agent/handoff-users`);

// Property listings (the agent's inventory the inbound AI matches buyers to).
// fetchListings returns { listings, settings:{ search_enabled } }.
export const fetchListings = () => get(`/listings`);
export const createListing = (data: Record<string, unknown>) => post(`/listings`, data, {}, true, true);
export const updateListing = (id: number, data: Record<string, unknown>) => patch(`/listings/${id}`, data, {}, true);
export const deleteListing = (id: number) => del(`/listings/${id}`, {}, true);
// Listing photos reuse the SHARED message-attachments gallery (the same one the
// inbox composer uses): src/utils/messageAttachments.ts handles upload/list/
// delete, and a listing stores the picked storage_keys in image_keys. No
// separate listings gallery endpoint.
export const updateListingSearch = (enabled: boolean) =>
  patch(`/listings/settings`, { search_enabled: enabled }, {}, true);

// Deals pipeline (deal table; a lead is optional). list joins the lead in.
export const fetchOrgDeals = (orgId: number | string, params: Record<string, unknown> = {}) =>
  get(`/deals/org/${orgId}`, params);
export const createDeal = (data: Record<string, unknown>) => post(`/deals`, data, {}, true, true);
export const updateDeal = (id: number, data: Record<string, unknown>) => patch(`/deals/${id}`, data, {}, true);
export const deleteDeal = (id: number) => del(`/deals/${id}`, {}, true);

// Tasks (task table; manual + AI-created). list joins the lead + owner name in.
export type TaskRecord = {
  id: number; title: string; description: string | null; why: string | null; recommendation: string | null;
  score: string | null; score_label: string | null;
  type: string | null;
  priority: string; due_at: string | null; status: string; source: string;
  lead_id: number | null; deal_id: number | null; user_id: number;
  lead_name: string | null; owner_name: string | null; created_at: string; updated_at: string;
};
export const fetchOrgTasks = (orgId: number | string, params: Record<string, unknown> = {}) =>
  get(`/tasks/org/${orgId}`, params) as Promise<{ tasks: TaskRecord[] }>;
export const createTask = (data: Record<string, unknown>) => post(`/tasks`, data, {}, true, true);
export const updateTask = (id: number, data: Record<string, unknown>) => patch(`/tasks/${id}`, data, {}, true);

// Existing automations for the org (the Outbound agent's Automations tab).
export const fetchOrgAutomations = (orgId: number | string, params: Record<string, unknown> = {}) =>
  get(`/automations/org/${orgId}`, params);
export const pauseAutomation = (id: number) => post(`/automations/pause/${id}`, {}, {}, true, true);
export const resumeAutomation = (id: number) => post(`/automations/resume/${id}`, {}, {}, true, true);
export const archiveAutomation = (id: number) => post(`/automations/${id}/archive`, {}, {}, true, true);
// NB: there is intentionally NO frontend bulk-enroll wrapper. Leads only enter
// an outbound workflow one at a time as they opt in (intake form / integration)
// - never by mass-adding a saved lead list. The /automations/:id/enroll route
// stays server-side for that opt-in intake path to call per lead.

// Agent booking availability (one source of truth - Calendar / Settings v2 / AI Inbound).
export const fetchAvailability = () => get(`/availability`);
export const updateAvailability = (data: Record<string, unknown>) =>
  patch(`/availability`, data, {}, true);

// AI Agent live surfaces (replace the v2 sample data).
export const fetchAiKpis = (orgId: number | string, params: Record<string, unknown> = {}) =>
  get(`/dashboard/org/${orgId}/kpis`, params);
export const fetchAiNextSteps = (orgId: number | string) => get(`/ai/next-steps/${orgId}`);
export const fetchAiActivityLog = (orgId: number | string, params: Record<string, unknown> = {}) =>
  get(`/ai/activity-log/${orgId}`, params);
export const fetchAiActionCenter = (orgId: number | string) => get(`/ai/action-center/${orgId}`);

// Sandbox: reply as the live inbound agent (uses the real profile/persona/FAQ prompt).
export const aiTestChat = (data: Record<string, unknown>) => post(`/ai-agent/test-chat`, data, {}, true, true);

// Message templates (per-agent library). seedAgentTemplates is idempotent + silent.
export const fetchAiTemplates = (agent: string) => get(`/ai/templates`, { agent });
export const seedAgentTemplates = () => post(`/ai/templates/seed-agent-library`, {}, {}, false);
export const createAiTemplate = (data: Record<string, unknown>) => post(`/ai/templates`, data, {}, true, true);
export const updateAiTemplate = (id: number, data: Record<string, unknown>) => patch(`/ai/templates/${id}`, data, {}, true);
export const deleteAiTemplate = (id: number) => del(`/ai/templates/${id}`, {}, true);

// AI knowledge base (FAQs / custom answers) - fed into the agent's prompt.
export const fetchAiKnowledge = (params: Record<string, unknown> = {}) => get(`/ai/knowledge`, params);
export const createAiKnowledge = (data: Record<string, unknown>) => post(`/ai/knowledge`, data, {}, true, true);
export const updateAiKnowledge = (id: number, data: Record<string, unknown>) => patch(`/ai/knowledge/${id}`, data, {}, true);
export const deleteAiKnowledge = (id: number) => del(`/ai/knowledge/${id}`, {}, true);

// AI qualification questions (per lead type) - fed into the agent's prompt.
export const fetchAiQualifications = (params: Record<string, unknown> = {}) => get(`/ai/qualifications`, params);
export const createAiQualification = (data: Record<string, unknown>) => post(`/ai/qualifications`, data, {}, true, true);
export const updateAiQualification = (id: number, data: Record<string, unknown>) => patch(`/ai/qualifications/${id}`, data, {}, true);
export const deleteAiQualification = (id: number) => del(`/ai/qualifications/${id}`, {}, true);

export const fetchAgentProfile = () => get(`/ai/agent-profile`);
export const updateAgentProfile = (data: Record<string, unknown>) =>
  patch(`/ai/agent-profile`, data, {}, true);

export const fetchAiSettings = () => get(`/ai/settings`);
export const updateAiSettings = (data: Record<string, unknown>) =>
  patch(`/ai/settings`, data, {}, true);

export const fetchScheduledMessages = (params: Record<string, unknown> = {}) =>
  get('/inbox/scheduled', params);

export const patchScheduledMessage = (id: number, data: Record<string, unknown>) =>
  patch(`/inbox/scheduled/${id}`, data, {}, true);

export const deleteScheduledMessage = (id: number) =>
  del(`/inbox/scheduled/${id}`, {}, true);