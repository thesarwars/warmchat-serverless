import axios from "axios";
import type {
  CallDetails,
  CallInsightsResponse,
  CallListDirection,
  CallListType,
  CallNote,
  CallStats,
  CallSummary,
  CallsListResponse,
  CanCallResponse,
  WebRtcToken,
  WorkspaceUsage,
} from "@/types/calling";

// Calling endpoints now live in the same Pages project as the main API, so
// they're reachable on the same origin. An override env var lets dev/staging
// point at a different host (e.g. a preview deploy); empty = same origin.
const baseURL = (import.meta.env.VITE_CALLING_API_BASE as string | undefined) || "";

/**
 * Axios instance bound to the calling endpoints. Auth rides on the HttpOnly
 * `access_token` cookie (same as the main API), so we set
 * `withCredentials: true` and don't inject any Authorization header.
 */
const client = axios.create({ baseURL, withCredentials: true });

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await client.get<T>(path, { params });
  return res.data;
}
async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await client.post<T>(path, body);
  return res.data;
}
async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await client.patch<T>(path, body);
  return res.data;
}

// ---------------------------------------------------------------------------
// Agent endpoints
// ---------------------------------------------------------------------------

export const callingApi = {
  canCall: () => get<CanCallResponse>("/api/calling/can-call"),

  initiateOutbound: (body: {
    phoneNumber?: string;
    leadId?: string;
    name?: string;
    origin?: "phone" | "web";
    metadata?: Record<string, unknown>;
  }) =>
    post<{ callId: string; status: string; fromNumber?: string }>(
      "/api/calling/calls/outbound",
      body,
    ),

  getCall: (callId: string) =>
    get<CallDetails>(`/api/calling/calls/${callId}`),

  // Decline a ringing inbound call: stops the ring on every tab/device and
  // routes the caller to voicemail / missed-call handling.
  declineIncoming: (callId: string) =>
    post<{ ok: boolean }>(`/api/calling/calls/${callId}/decline`),

  // Decline whatever inbound call is currently ringing for this agent - used
  // when the tab never learned the backend call id.
  declineActiveIncoming: () =>
    post<{ ok: boolean }>(`/api/calling/calls/decline-active`),

  getCallsByLead: (leadId: string, params?: { limit?: number; offset?: number }) =>
    get<{ calls: CallSummary[]; total: number; limit: number; offset: number }>(
      `/api/calling/leads/${leadId}/calls`,
      params,
    ),

  getCallsByPhone: (
    phoneNumber: string,
    params?: { limit?: number; offset?: number },
  ) =>
    get<{ calls: CallSummary[]; total: number; limit: number; offset: number }>(
      `/api/calling/calls/by-phone/${encodeURIComponent(phoneNumber)}`,
      params,
    ),

  getWorkspaceUsage: (billingCycleId?: string) =>
    get<WorkspaceUsage>(
      "/api/calling/usage/workspace",
      billingCycleId ? { billingCycleId } : undefined,
    ),

  getDashboard: (params?: { startDate?: string; endDate?: string }) =>
    get<Record<string, unknown>>("/api/calling/analytics/dashboard", params),

  getWebRtcToken: () => post<WebRtcToken>("/api/calling/webrtc/token", {}),

  // ---- Calls page ----
  listCalls: (params?: {
    direction?: CallListDirection;
    type?: CallListType;
    search?: string;
    limit?: number;
    offset?: number;
  }) => get<CallsListResponse>("/api/calling/calls", params),

  getStats: (params?: { startDate?: string; endDate?: string }) =>
    get<CallStats>("/api/calling/stats", params),

  getCallInsights: (callId: string) =>
    get<CallInsightsResponse>(`/api/calling/calls/${callId}/insights`),

  toggleCallTask: (callId: string, taskId: string, done: boolean) =>
    patch<{ id: string; done: boolean }>(
      `/api/calling/calls/${callId}/tasks/${taskId}`,
      { done },
    ),

  addCallNote: (callId: string, body: string) =>
    post<CallNote>(`/api/calling/calls/${callId}/notes`, { body }),

  /** Relative URL for an authenticated <audio> src (cookie rides along). */
  recordingUrl: (callId: string, kind: "recording" | "voicemail" = "recording") =>
    `${baseURL}/api/calling/calls/${callId}/recording${kind === "voicemail" ? "?type=voicemail" : ""}`,
};

