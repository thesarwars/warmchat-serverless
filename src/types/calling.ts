type CallDirection = "INBOUND" | "OUTBOUND";

export type CallStatus =
  | "INITIATED"
  | "RINGING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "NO_ANSWER"
  | "BUSY"
  | "FAILED"
  | "CANCELED";

type CallOrigin = "phone" | "web";

// Used internally by the socket event payloads below (the admin configuration
// UI that consumed it directly was removed), so it stays unexported.
type RingStrategy = "parallel" | "web_first" | "phone_first";

export type CallSentiment = "positive" | "neutral" | "negative";

export interface CallSummary {
  id: string;
  direction: CallDirection;
  status: CallStatus;
  duration: number;
  initiatedAt: string;
  answeredAt?: string | null;
  completedAt?: string | null;
  fromNumber: string;
  toNumber: string;
  origin?: CallOrigin | null;
  answeredVia?: "web" | "phone" | null;
  isVoicemail: boolean;
  voicemailHeard: boolean;
  hasRecording: boolean;
  sentiment?: CallSentiment;
  summary?: string;
  hasTasks: boolean;
  agent?: { id: string; name?: string; email?: string };
  businessNumber?: { id: string; phoneNumber: string };
  leadId?: string;
  leadName?: string;
}

export interface CallsListResponse {
  calls: CallSummary[];
  total: number;
  limit: number;
  offset: number;
}

export type CallListType = "all" | "missed" | "voicemail" | "follow-up" | "ai-task";
export type CallListDirection = "incoming" | "outgoing";

export interface CallStats {
  range: { startDate: string; endDate: string };
  totalCalls: { today: number; deltaPct: number | null };
  missed: { today: number; unrecovered: number };
  voicemails: { pending: number; highPriority: number };
  avgDuration: { seconds: number; deltaPct: number | null };
  booked: { count: number; conversionPct: number };
}

export type CallTaskType = "email" | "calendar" | "task" | "automation";

interface CallTask {
  id: string;
  type: CallTaskType;
  label: string;
  done: boolean;
}

export interface CallNote {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
}

interface CallAiInsight {
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  transcript: string | null;
  summary: string | null;
  sentiment: CallSentiment | null;
  intent: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
}

export interface CallInsightsResponse {
  insight: CallAiInsight | null;
  tasks: CallTask[];
  notes: CallNote[];
}

export interface CallDetails extends CallSummary {
  providerCallSid?: string;
  customerNumber?: string;
  agentPhoneNumber?: string;
  lead?: { id: string; name?: string; phoneNumber: string };
  callEvents?: Array<{
    id: string;
    eventType: string;
    timestamp: string;
    payload?: Record<string, unknown>;
  }>;
  errorMessage?: string | null;
}

export interface WorkspaceUsage {
  billingCycle: {
    id: string;
    startDate: string;
    endDate: string;
    planLimit: number;
  };
  usage: {
    totalMinutes: number;
    totalCost: number;
    totalCalls: number;
    percentageUsed: number;
    remainingMinutes: number;
    isOverLimit: boolean;
  };
  breakdown?: { byStatus?: Record<string, number> };
}

export interface CanCallResponse {
  canCall: boolean;
  reasons: string[];
}

export interface WebRtcToken {
  loginToken: string;
  sipUri: string;
  expiresAt: string;
}

// Socket event payloads (server → client)
export interface IncomingCallEvent {
  callId: string;
  fromNumber: string;
  leadId?: string;
  leadName?: string | null;
  businessNumber: string;
  ringStrategy: RingStrategy;
  at: string;
}

export interface CallStateEvent {
  callId: string;
  status: CallStatus;
  duration?: number;
  answeredVia?: "web" | "phone" | null;
  direction?: CallDirection;
  origin?: CallOrigin;
  terminal?: boolean;
  destination?: string;
}

export interface MissedWhileBusyEvent {
  callId: string;
  fromNumber: string;
  leadId?: string;
  leadName?: string | null;
  at: string;
}

export interface CallTakenElsewhereEvent {
  callId: string;
  answeredVia: "web" | "phone";
}

/** The ring ended with no winner: timeout, caller hung up, or agent declined. */
export interface CallRingEndedEvent {
  callId: string;
  reason: string;
}
