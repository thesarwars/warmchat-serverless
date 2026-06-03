import { useCallback, useEffect } from "react";
import { queryClient } from "../../helpers/queryClient";
import {
  fetchAiSettings, fetchAiKpis, fetchAiNextSteps, fetchAiActivityLog, fetchAiActionCenter,
  fetchAgentProfile, fetchAiKnowledge, fetchAiAgents, fetchAiRules,
  fetchOrgQuietHours, fetchOrgTimezone, fetchAiLogs, fetchAiWorkflows, fetchAiTemplates,
  fetchOrgAutomations, fetchInboundResponders,
} from "../../helpers/backend";

/* Shared data layer for the AI Command Center (AssistantV2 / AgentV2).

   The page is one tabbed view; previously each tab refired its own endpoints on
   every switch (React Query's default staleTime is 0, so remounting a tab always
   refetched). That made flipping between tabs spray requests at a dozen routes
   and feel like it "loads forever".

   Fix: every AI-page query uses AI_QUERY_OPTS (staleTime: Infinity), so once a
   value is in the cache it is reused across tab switches and never refetched on
   its own. The page is loaded ONCE on entry (useAiCommandCenterData prefetches
   everything) and reloads on each re-entry. */

// Once loaded, treat AI Command Center data as fresh forever - switching tabs
// reuses the cache. A 30-minute gcTime keeps it around if you briefly leave the
// page; re-entering force-reloads it anyway (see useAiCommandCenterData).
export const AI_QUERY_OPTS = { staleTime: Infinity, gcTime: 1000 * 60 * 30 } as const;

interface QueryDescriptor { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }

// Every query the AI Command Center page reads, with the EXACT key each tab's
// useQuery uses (so prefetch/refresh populate the same cache entries). Keep this
// in sync when adding a tab query.
function aiDescriptors(orgId: string): QueryDescriptor[] {
  const list: QueryDescriptor[] = [
    { queryKey: ["ai-settings"], queryFn: () => fetchAiSettings() },
    { queryKey: ["agent-profile"], queryFn: () => fetchAgentProfile() },
    { queryKey: ["ai-knowledge"], queryFn: () => fetchAiKnowledge() },
    { queryKey: ["ai-rules"], queryFn: () => fetchAiRules() },
    { queryKey: ["ai-agents"], queryFn: () => fetchAiAgents() },
    { queryKey: ["inbound-responders"], queryFn: () => fetchInboundResponders() },
    { queryKey: ["ai-workflows", "inbound"], queryFn: () => fetchAiWorkflows("inbound") },
    { queryKey: ["ai-workflows", "outbound"], queryFn: () => fetchAiWorkflows("outbound") },
    { queryKey: ["ai-logs", "inbound"], queryFn: () => fetchAiLogs("inbound", { limit: 40 }) },
    { queryKey: ["ai-logs", "outbound"], queryFn: () => fetchAiLogs("outbound", { limit: 40 }) },
    { queryKey: ["ai-templates", "inbound", "agent"], queryFn: () => fetchAiTemplates("inbound") },
    { queryKey: ["ai-templates", "outbound", "agent"], queryFn: () => fetchAiTemplates("outbound") },
  ];
  if (orgId) {
    list.push(
      { queryKey: ["ai-kpis", orgId], queryFn: () => fetchAiKpis(orgId) },
      { queryKey: ["ai-next-steps", orgId], queryFn: () => fetchAiNextSteps(orgId) },
      { queryKey: ["ai-action-center", orgId], queryFn: () => fetchAiActionCenter(orgId) },
      { queryKey: ["ai-agents-ops", orgId], queryFn: () => fetchAiAgents() },
      { queryKey: ["ai-activity-overview", orgId], queryFn: () => fetchAiActivityLog(orgId, { limit: 8 }) },
      { queryKey: ["ai-activity-feed", orgId], queryFn: () => fetchAiActivityLog(orgId, { limit: 40 }) },
      { queryKey: ["ai-activity-autopilot", orgId], queryFn: () => fetchAiActivityLog(orgId, { limit: 200 }) },
      { queryKey: ["org-automations", orgId], queryFn: () => fetchOrgAutomations(orgId) },
      { queryKey: ["org-quiet-hours", orgId], queryFn: () => fetchOrgQuietHours(orgId) },
      { queryKey: ["org-timezone", orgId], queryFn: () => fetchOrgTimezone(orgId) },
    );
  }
  return list;
}

// Loads every AI Command Center endpoint once on page entry. fetchQuery with
// staleTime:0 forces the (re)fetch; React Query dedupes against the tab
// observers, which keep the data fresh forever (AI_QUERY_OPTS) so subsequent tab
// switches never refetch.
export function useAiCommandCenterData(orgId: string): void {
  const reload = useCallback(async () => {
    await Promise.allSettled(
      aiDescriptors(orgId).map((d) =>
        queryClient.fetchQuery({ queryKey: d.queryKey, queryFn: d.queryFn, staleTime: 0, gcTime: AI_QUERY_OPTS.gcTime }),
      ),
    );
  }, [orgId]);
  // Load once when the page is entered (AgentPage mounts on route entry and stays
  // mounted across tab switches, so this fires once per visit, not per tab).
  useEffect(() => { void reload(); }, [reload]);
}
