import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { createWcSocket, type WcSocket } from "@/utils/wsClient";
import { TelnyxRTC, INotification } from "@telnyx/webrtc";
import { callingApi } from "@/api/calling";
import {
  getStoredAuthSession,
  subscribeToAuthSession,
} from "@/utils/authSession";
import {
  CallingContext,
  type ActiveCall,
  type CallingContextValue,
  type SdkCall,
} from "./useCalling";


import type {
  CallStateEvent,
  CallStatus,
  IncomingCallEvent,
  MissedWhileBusyEvent,
  CallTakenElsewhereEvent,
} from "@/types/calling";

const TERMINAL_STATUSES: CallStatus[] = [
  "COMPLETED",
  "NO_ANSWER",
  "BUSY",
  "FAILED",
  "CANCELED",
];

/** Telnyx plays remote (callee) audio into this element - required to hear the other party. */
const TELNYX_REMOTE_AUDIO_ELEMENT_ID = "telnyx-webrtc-remote";

function attachRemoteAudio(sdkCall?: SdkCall) {
  const el = document.getElementById(
    TELNYX_REMOTE_AUDIO_ELEMENT_ID,
  ) as HTMLAudioElement | null;
  if (!el) return;

  const stream =
    sdkCall?.remoteStream ??
    sdkCall?.remoteMediaStream ??
    sdkCall?.peer?.remoteStream;
  if (stream && el.srcObject !== stream) {
    el.srcObject = stream;
  }

  el.muted = false;
  el.volume = 1;
  void el.play().catch((err) => {
    console.warn("[calling] remote audio play() failed", err);
  });
}

function clearRemoteAudio() {
  const el = document.getElementById(
    TELNYX_REMOTE_AUDIO_ELEMENT_ID,
  ) as HTMLAudioElement | null;
  if (!el) return;
  try {
    el.pause();
    el.srcObject = null;
  } catch {
    /* noop */
  }
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export function CallingProvider({ children }: { children: React.ReactNode }) {
  // Tokens live in HttpOnly cookies and aren't readable from JS - gate on
  // "is there an active session" instead. The cookie rides along automatically
  // on the same-origin wss:// upgrade.
  const sessionActiveRef = useRef<boolean>(
    typeof window !== "undefined" ? !!getStoredAuthSession().userId : false,
  );
  const telnyxRef = useRef<TelnyxRTC | null>(null);
  const socketRef = useRef<WcSocket | null>(null);
  const sdkPendingByCallIdRef = useRef<Map<string, SdkCall>>(new Map());
  // Telnyx reconnect plumbing: without it, one socket drop (laptop sleep,
  // network blip, token expiry) leaves a dead client and inbound calls can
  // never ring the browser again until a full page reload.
  const telnyxReadyRef = useRef(false);
  const telnyxReconnectAttemptRef = useRef(0);
  const telnyxReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleTelnyxReconnectRef = useRef<() => void>(() => {});

  const [ready, setReady] = useState(false);
  const [telnyxReady, setTelnyxReady] = useState(false);
  const [online, setOnline] = useState(false);

  const [incomingCall, setIncomingCall] = useState<
    CallingContextValue["incomingCall"]
  >(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [missedBanner, setMissedBanner] = useState<MissedWhileBusyEvent | null>(
    null,
  );
  const [isMuted, setIsMuted] = useState(false);

  const tearDownTelnyx = useCallback(() => {
    clearRemoteAudio();
    if (telnyxReconnectTimerRef.current) {
      clearTimeout(telnyxReconnectTimerRef.current);
      telnyxReconnectTimerRef.current = null;
    }
    telnyxReconnectAttemptRef.current = 0;
    try {
      telnyxRef.current?.disconnect();
    } catch {
      /* noop */
    }
    telnyxRef.current = null;
    telnyxReadyRef.current = false;
    setTelnyxReady(false);
  }, []);

  const tearDownSocket = useCallback(() => {
    console.log("[calling] tearDownSocket() hasSocket:", !!socketRef.current);
    try {
      socketRef.current?.disconnect();
    } catch {
      /* noop */
    }
    socketRef.current = null;
    setOnline(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Telnyx WebRTC SDK lifecycle
  // ---------------------------------------------------------------------------
  const initTelnyx = useCallback(async () => {
    if (!sessionActiveRef.current) return;
    if (telnyxRef.current) return;

    try {
      const { loginToken } = await callingApi.getWebRtcToken();

      const client = new TelnyxRTC({
        login_token: loginToken,
        // The SDK posts periodic call analytics to https://rtc.telnyx.com/call_report.
        // In some environments this can surface as a CORS error (noise) even though
        // calling still works. Disable it by default.
        enableCallReports: false,
      });
      client.remoteElement = TELNYX_REMOTE_AUDIO_ELEMENT_ID;

      client.on("telnyx.ready", () => {
        telnyxReadyRef.current = true;
        telnyxReconnectAttemptRef.current = 0;
        setTelnyxReady(true);
      });
      client.on("telnyx.error", (err: unknown) => {
        console.warn("[calling] telnyx.error", err);
      });
      client.on("telnyx.socket.close", () => {
        telnyxReadyRef.current = false;
        setTelnyxReady(false);
        // Re-register with a FRESH token - a dead client means inbound calls
        // can't ring this browser.
        scheduleTelnyxReconnectRef.current();
      });

      // The SDK fires this for both inbound invites and our own outbound
      // call state changes.
      client.on("telnyx.notification", (notif: INotification) => {
        if (notif.type !== "callUpdate" || !notif.call) return;
        const sdkCall = notif.call as unknown as SdkCall;
        const state: string = sdkCall.state;

        // Try to read X-WC-Call-Id from custom SIP headers if present -
        // otherwise we associate by sdkCall.id when the backend emits
        // call_state.
        const sdkCallId: string = sdkCall.id;

        if (sdkCall.direction === "inbound" && state === "ringing") {
          // Inbound invite. The backend's incoming_call event arrives first
          // (gives us callId + lead info). Stash the SDK call so the modal
          // can answer it. Match by remote URI fallback when needed.
          const remote = sdkCall.options?.remoteCallerNumber || "";
          setIncomingCall((prev) => {
            if (prev) return { ...prev, sdkCall };
            // No backend event yet - queue under sdk id so it can be claimed
            sdkPendingByCallIdRef.current.set(`sdk:${sdkCallId}`, sdkCall);
            return {
              callId: `sdk:${sdkCallId}`,
              fromNumber: remote,
              leadName: null,
              sdkCall,
            };
          });
        }

        if (state === "active") {
          attachRemoteAudio(sdkCall);
          setActiveCall((prev) =>
            prev
              ? {
                  ...prev,
                  sdkCall,
                  status: "IN_PROGRESS",
                  answeredVia: "web",
                  startedAt: Date.now(),
                }
              : prev,
          );
        }

        if (state === "ringing" && sdkCall.direction === "outbound") {
          setActiveCall((prev) =>
            prev?.sdkCall === sdkCall
              ? { ...prev, status: "RINGING" }
              : prev,
          );
        }

        if (state === "hangup" || state === "destroy") {
          clearRemoteAudio();
          const cause = sdkCall.cause || (sdkCall.options && sdkCall.options.cause) || "UNKNOWN";
          if (cause !== "NORMAL_CLEARING" && cause !== "ORIGINATOR_CANCEL" && cause !== "UNKNOWN") {
            console.error(`[calling] Call failed with cause: ${cause}`);
            toast.error(`Call Failed: ${cause}`);
          }

          setActiveCall((prev) => {
            if (!prev) return prev;
            if (prev.sdkCall === sdkCall) {
              return { ...prev, status: "COMPLETED", sdkCall: null };
            }
            return prev;
          });
          setIncomingCall((prev) => (prev?.sdkCall === sdkCall ? null : prev));
        }
      });

      telnyxRef.current = client;
      await client.connect();
    } catch (err) {
      console.warn("[calling] telnyx init failed", err);
      // Token fetch / connect failed (offline, expired session blip...) -
      // retry with backoff instead of staying dead.
      scheduleTelnyxReconnectRef.current();
    }
  }, []);

  // Reconnect with exponential backoff (2s -> 30s cap). Tears down the dead
  // client so initTelnyx fetches a fresh login token. Kept in a ref so the
  // socket-close handler (created inside initTelnyx) can reach it.
  const scheduleTelnyxReconnect = useCallback(() => {
    if (!sessionActiveRef.current) return;
    if (telnyxReconnectTimerRef.current) return; // already scheduled
    const attempt = telnyxReconnectAttemptRef.current++;
    const delay = Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4));
    telnyxReconnectTimerRef.current = setTimeout(() => {
      telnyxReconnectTimerRef.current = null;
      if (!sessionActiveRef.current || telnyxReadyRef.current) return;
      try {
        telnyxRef.current?.disconnect();
      } catch {
        /* noop */
      }
      telnyxRef.current = null;
      void initTelnyx();
    }, delay);
  }, [initTelnyx]);
  useEffect(() => {
    scheduleTelnyxReconnectRef.current = scheduleTelnyxReconnect;
  }, [scheduleTelnyxReconnect]);

  // Waking a laptop / returning to the tab: if the calling client died while
  // the tab was hidden, reconnect immediately so inbound calls can ring.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!sessionActiveRef.current || telnyxReadyRef.current) return;
      if (telnyxReconnectTimerRef.current) {
        clearTimeout(telnyxReconnectTimerRef.current);
        telnyxReconnectTimerRef.current = null;
      }
      telnyxReconnectAttemptRef.current = 0;
      try {
        telnyxRef.current?.disconnect();
      } catch {
        /* noop */
      }
      telnyxRef.current = null;
      void initTelnyx();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [initTelnyx]);

  // ---------------------------------------------------------------------------
  // Socket.IO lifecycle
  // ---------------------------------------------------------------------------
  const initSocket = useCallback(() => {
    console.log("[calling] initSocket() sessionActive:", sessionActiveRef.current, "alreadyHasSocket:", !!socketRef.current);
    if (!sessionActiveRef.current) return;
    if (socketRef.current) return;

    // Derive the WS URL: explicit override → wss://<origin>/api/calling/ws42.
    // In dev (http), vite doesn't proxy WS upgrades, so target the wrangler
    // pages dev port (3333) directly. The access_token HttpOnly cookie rides
    // along automatically (same hostname).
    const override = import.meta.env.VITE_CALLING_WS_URL as string | undefined;
    let url = "";
    if (override && override.length > 0) {
      url = `${override.replace(/\/+$/, "")}/api/calling/ws42`;
    } else if (typeof window !== "undefined") {
      const isHttps = window.location.protocol === "https:";
      const protocol = isHttps ? "wss" : "ws";
      const port = isHttps ? "" : ":3333";
      url = `${protocol}://${window.location.hostname}${port}/api/calling/ws42`;
    }
    if (!url) return;

    const socket = createWcSocket(url);

    socket.on("connect", () => setOnline(true));
    socket.on("disconnect", () => setOnline(false));
    socket.on("auth_error", (e) => {
      console.warn("[calling] socket auth error", e);
      socket.disconnect();
    });

    socket.on("incoming_call", (e: IncomingCallEvent) => {
      setIncomingCall((prev) => {
        // If the SDK already created the inbound call, pair it.
        const sdk =
          prev?.sdkCall ||
          // Look for a pending sdk call (best-effort matching).
          (sdkPendingByCallIdRef.current.size > 0
            ? Array.from(sdkPendingByCallIdRef.current.values())[0]
            : null);
        return {
          callId: e.callId,
          fromNumber: e.fromNumber,
          leadName: e.leadName ?? null,
          sdkCall: sdk,
        };
      });
    });

    socket.on("call_state", (e: CallStateEvent) => {
      setActiveCall((prev) => {
        if (prev && prev.callId === e.callId) {
          const next: ActiveCall = {
            ...prev,
            status: e.status,
            answeredVia: e.answeredVia ?? prev.answeredVia,
            ...(e.status === "IN_PROGRESS" ? { startedAt: Date.now() } : {}),
          };
          if (e.status === "IN_PROGRESS") {
            attachRemoteAudio(next.sdkCall);
          }
          if (e.terminal && TERMINAL_STATUSES.includes(e.status)) {
            // Clear after a beat so the UI can show the terminal badge.
            setTimeout(() => setActiveCall(null), 1500);
          }
          return next;
        }
        // Outbound web call: backend created the row at webhook time and
        // emitted call_state RINGING. Adopt as active call.
        if (e.direction === "OUTBOUND" && e.status === "RINGING" && !prev) {
          const pendingSdk =
            sdkPendingByCallIdRef.current.get(`pending:${e.callId}`) ||
            (sdkPendingByCallIdRef.current.size === 1
              ? Array.from(sdkPendingByCallIdRef.current.values())[0]
              : null);
          return {
            callId: e.callId,
            sdkCall: pendingSdk,
            direction: "OUTBOUND",
            origin: e.origin || "web",
            remotePhoneNumber: e.destination || "",
            remoteName: null,
            status: "RINGING",
            startedAt: Date.now(),
          };
        }
        return prev;
      });
    });

    socket.on("call_taken_elsewhere", (e: CallTakenElsewhereEvent) => {
      setIncomingCall((prev) => {
        if (!prev) return prev;
        if (prev.callId !== e.callId) return prev;
        try {
          prev.sdkCall?.hangup?.();
        } catch {
          /* noop */
        }
        return null;
      });
    });

    socket.on("missed_while_busy", (e: MissedWhileBusyEvent) => {
      setMissedBanner(e);
      // Auto-dismiss after 8s; user can close earlier.
      setTimeout(() => {
        setMissedBanner((cur) => (cur && cur.callId === e.callId ? null : cur));
      }, 8000);
    });

    socketRef.current = socket;
  }, []);

  // Start everything once we have an active session.
  useEffect(() => {
    console.log("[calling] mount effect run, sessionActive:", sessionActiveRef.current);
    if (!sessionActiveRef.current) {
      setReady(true);
      return;
    }
    // The Telnyx WebRTC token fetch (and SDK boot) is heavy and not needed for
    // first paint - nothing call-related is visible until an inbound invite
    // arrives or the user clicks "Call". Defer it past the dashboard's render
    // wave to keep the cold-load critical path lean. The socket stays eager so
    // we don't miss server-initiated events.
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    const deferred = () => { void initTelnyx(); };
    const handle: number | ReturnType<typeof setTimeout> =
      typeof ric === "function" ? ric(deferred, { timeout: 2000 }) : setTimeout(deferred, 1200);
    initSocket();
    setReady(true);
    return () => {
      console.log("[calling] mount effect CLEANUP");
      const cancelRic = (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (typeof ric === "function" && typeof cancelRic === "function") cancelRic(handle as number);
      else clearTimeout(handle as ReturnType<typeof setTimeout>);
      tearDownTelnyx();
      tearDownSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch for session changes (login/logout in another tab).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsubscribe = subscribeToAuthSession(() => {
      const active = !!getStoredAuthSession().userId;
      if (active === sessionActiveRef.current) return;
      sessionActiveRef.current = active;
      tearDownTelnyx();
      tearDownSocket();
      if (active) {
        initTelnyx();
        initSocket();
      }
    });
    return unsubscribe;
  }, [initSocket, initTelnyx, tearDownSocket, tearDownTelnyx]);

  // ---------------------------------------------------------------------------
  // Public actions
  // ---------------------------------------------------------------------------

  const startWebCall = useCallback(
    async (args: { phoneNumber: string; name?: string; leadId?: string }) => {
      if (!telnyxRef.current) {
        await initTelnyx();
      }
      const client = telnyxRef.current;
      if (!client) throw new Error("Telnyx WebRTC client is not ready");

      // Notify backend so it can create a Call row and identify origin.
      // The backend creates a placeholder; the SIP-origin webhook handler
      // will replace it with the real row matching call_control_id.
      // It also returns this agent's assigned DID so we can pass it as the
      // caller-id on the SDK INVITE (multi-tenant: every agent shows their
      // own number, not a hard-coded one on the SIP Connection).
      let callId = "";
      let fromNumber: string | undefined;
      try {
        const leadId = args.leadId && isUuid(args.leadId) ? args.leadId : undefined;
        const r = await callingApi.initiateOutbound({
          phoneNumber: args.phoneNumber,
          name: args.name,
          leadId,
          origin: "web",
        });
        callId = r.callId;
        fromNumber = r.fromNumber;
      } catch (err) {
        console.warn("[calling] backend initiateOutbound web failed", err);
      }

      const sdkCall = client.newCall({
        destinationNumber: args.phoneNumber,
        callerName: args.name || "WarmChats Agent",
        callerNumber: fromNumber,
        audio: true,
        video: false,
        remoteElement: TELNYX_REMOTE_AUDIO_ELEMENT_ID,
        customHeaders: callId
          ? [{ name: "X-WC-Call-Id", value: callId }]
          : undefined,
      });

      const sdkCallTyped = sdkCall as unknown as SdkCall;

      if (callId) {
        sdkPendingByCallIdRef.current.set(`pending:${callId}`, sdkCallTyped);
      }

      setActiveCall({
        callId: callId || `sdk:${sdkCallTyped.id}`,
        sdkCall: sdkCallTyped,
        direction: "OUTBOUND",
        origin: "web",
        remotePhoneNumber: args.phoneNumber,
        remoteName: args.name ?? null,
        status: "RINGING",
        startedAt: Date.now(),
      });
    },
    [initTelnyx],
  );

  const startPhoneCall = useCallback(
    async (args: { phoneNumber: string; name?: string; leadId?: string }) => {
      const leadId = args.leadId && isUuid(args.leadId) ? args.leadId : undefined;
      const r = await callingApi.initiateOutbound({
        phoneNumber: args.phoneNumber,
        name: args.name,
        leadId,
        origin: "phone",
      });
      setActiveCall({
        callId: r.callId,
        sdkCall: null,
        direction: "OUTBOUND",
        origin: "phone",
        remotePhoneNumber: args.phoneNumber,
        remoteName: args.name ?? null,
        status: "RINGING",
        startedAt: Date.now(),
      });
    },
    [],
  );

  const acceptIncoming = useCallback(() => {
    setIncomingCall((prev) => {
      if (!prev) return prev;
      try {
        prev.sdkCall?.answer?.();
        attachRemoteAudio(prev.sdkCall);
      } catch (err) {
        console.warn("[calling] sdkCall.answer failed", err);
      }
      setActiveCall({
        callId: prev.callId,
        sdkCall: prev.sdkCall,
        direction: "INBOUND",
        origin: "web",
        remotePhoneNumber: prev.fromNumber,
        remoteName: prev.leadName ?? null,
        status: "IN_PROGRESS",
        answeredVia: "web",
        startedAt: Date.now(),
      });
      return null;
    });
  }, []);

  const rejectIncoming = useCallback(() => {
    setIncomingCall((prev) => {
      if (!prev) return prev;
      try {
        prev.sdkCall?.hangup?.();
      } catch {
        /* noop */
      }
      return null;
    });
  }, []);

  const hangup = useCallback(() => {
    clearRemoteAudio();
    setActiveCall((prev) => {
      if (!prev) return prev;
      try {
        prev.sdkCall?.hangup?.();
      } catch {
        /* noop */
      }
      return { ...prev, status: "COMPLETED" };
    });
    setTimeout(() => setActiveCall(null), 800);
  }, []);

  const toggleMute = useCallback(() => {
    setActiveCall((prev) => {
      if (!prev?.sdkCall) return prev;
      try {
        if (isMuted) {
          prev.sdkCall.unmuteAudio?.();
          setIsMuted(false);
        } else {
          prev.sdkCall.muteAudio?.();
          setIsMuted(true);
        }
      } catch {
        /* noop */
      }
      return prev;
    });
  }, [isMuted]);

  const dismissMissedBanner = useCallback(() => setMissedBanner(null), []);

  const value = useMemo<CallingContextValue>(
    () => ({
      ready,
      telnyxReady,
      online,
      incomingCall,
      activeCall,
      missedBanner,
      isMuted,
      startWebCall,
      startPhoneCall,
      acceptIncoming,
      rejectIncoming,
      hangup,
      toggleMute,
      dismissMissedBanner,
    }),
    [
      ready,
      telnyxReady,
      online,
      incomingCall,
      activeCall,
      missedBanner,
      isMuted,
      startWebCall,
      startPhoneCall,
      acceptIncoming,
      rejectIncoming,
      hangup,
      toggleMute,
      dismissMissedBanner,
    ],
  );

  return (
    <CallingContext.Provider value={value}>
      <audio
        id={TELNYX_REMOTE_AUDIO_ELEMENT_ID}
        autoPlay
        playsInline
        style={{
          position: "fixed",
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: "none",
        }}
        aria-hidden
      />
      {children}
    </CallingContext.Provider>
  );
}
