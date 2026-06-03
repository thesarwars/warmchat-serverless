import { createContext, useContext } from "react";
import type { CallStatus, MissedWhileBusyEvent } from "@/types/calling";

export type SdkCall = {
  id: string;
  state?: string;
  direction?: string;
  cause?: string;
  options?: { remoteCallerNumber?: string; cause?: string };
  remoteStream?: MediaStream;
  remoteMediaStream?: MediaStream;
  peer?: { remoteStream?: MediaStream };
  answer?: () => void;
  hangup?: () => void;
  muteAudio?: () => void;
  unmuteAudio?: () => void;
};

export interface ActiveCall {
  callId: string;
  sdkCall: SdkCall | null;
  direction: "INBOUND" | "OUTBOUND";
  origin: "phone" | "web";
  remotePhoneNumber: string;
  remoteName?: string | null;
  status: CallStatus;
  answeredVia?: "web" | "phone" | null;
  startedAt: number;
}

export interface CallingContextValue {
  ready: boolean;
  telnyxReady: boolean;
  online: boolean;
  incomingCall: {
    callId: string;
    fromNumber: string;
    leadName?: string | null;
    sdkCall: SdkCall | null;
  } | null;
  activeCall: ActiveCall | null;
  missedBanner: MissedWhileBusyEvent | null;
  startWebCall: (args: {
    phoneNumber: string;
    name?: string;
    leadId?: string;
  }) => Promise<void>;
  startPhoneCall: (args: {
    phoneNumber: string;
    name?: string;
    leadId?: string;
  }) => Promise<void>;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  hangup: () => void;
  toggleMute: () => void;
  isMuted: boolean;
  dismissMissedBanner: () => void;
}

export const CallingContext = createContext<CallingContextValue | null>(null);

export function useCalling(): CallingContextValue {
  const ctx = useContext(CallingContext);
  if (!ctx) {
    throw new Error("useCalling must be used inside <CallingProvider>");
  }
  return ctx;
}
