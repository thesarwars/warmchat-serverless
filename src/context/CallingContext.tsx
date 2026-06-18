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
  CallRingEndedEvent,
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

function attachRemoteAudio(sdkCall?: SdkCall, attempt = 0) {
  const el = document.getElementById(
    TELNYX_REMOTE_AUDIO_ELEMENT_ID,
  ) as HTMLAudioElement | null;
  if (!el) return;

  const stream =
    sdkCall?.remoteStream ??
    sdkCall?.remoteMediaStream ??
    sdkCall?.peer?.remoteStream;

  // The remote track can land a beat AFTER the SDK reports the call active
  // (ICE/DTLS still settling). A one-shot attach at that moment left the
  // element streamless until some later event re-attached it - retry briefly
  // instead of giving up. If the SDK's own remoteElement management already
  // attached a stream our probes can't see, just make sure it's playing.
  if (!stream) {
    if (el.srcObject) {
      el.muted = false;
      el.volume = 1;
      void el.play().catch((err) => {
        console.warn("[calling] remote audio play() failed", err);
      });
    } else if (sdkCall && attempt < 6) {
      window.setTimeout(() => attachRemoteAudio(sdkCall, attempt + 1), 250 * (attempt + 1));
    }
    return;
  }

  if (el.srcObject !== stream) {
    el.srcObject = stream;
    // Timing diagnostic for the answer->audio gap; correlate with the
    // "[calling] accept clicked" log.
    console.log(`[calling] remote stream attached (attempt ${attempt}) at`, new Date().toISOString());
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
  // Accept clicked while the WebRTC INVITE hadn't reached this tab yet (the
  // modal opens off the backend WS event, which races the SIP leg). The old
  // behavior "answered" a null sdkCall - the UI showed a connected call while
  // the backend kept ringing and eventually recorded a MISSED call. Instead:
  // remember the intent, answer the INVITE the moment it pairs, and fail
  // loudly if it never arrives.
  const acceptPendingRef = useRef<{ callId: string; timer: number } | null>(null);
  // SDK leg ids whose failure toast already showed (hangup + destroy both fire).
  const toastedHangupRef = useRef<Set<string>>(new Set());
  // Answer-confirmation watch: after Accept we show "Connecting..." and only
  // flip to connected when Telnyx confirms (SDK active state / backend
  // IN_PROGRESS). If neither confirms in time, the answer silently failed
  // (dead socket -> -32002): tear the UI down honestly instead of showing an
  // answered call while the caller still hears ringing.
  const answerWatchRef = useRef<{ callId: string; timer: number } | null>(null);
  const startAnswerWatch = (callId: string) => {
    if (answerWatchRef.current) window.clearTimeout(answerWatchRef.current.timer);
    const timer = window.setTimeout(() => {
      if (answerWatchRef.current?.callId !== callId) return;
      answerWatchRef.current = null;
      setActiveCall((ac) => (ac && ac.callId === callId && ac.status !== "IN_PROGRESS" ? null : ac));
      console.warn("[calling] answer never confirmed by Telnyx - tearing down and re-registering");
      toast.error(
        "Call could not be connected - the calling connection dropped. Reconnecting now; please try again.",
        { duration: 8000 },
      );
      forceTelnyxReconnectRef.current();
    }, 10_000);
    answerWatchRef.current = { callId, timer };
  };
  const clearAnswerWatch = () => {
    if (!answerWatchRef.current) return;
    window.clearTimeout(answerWatchRef.current.timer);
    answerWatchRef.current = null;
  };
  // Telnyx reconnect plumbing: without it, one socket drop (laptop sleep,
  // network blip, token expiry) leaves a dead client and inbound calls can
  // never ring the browser again until a full page reload.
  const telnyxReadyRef = useRef(false);
  const telnyxReconnectAttemptRef = useRef(0);
  const telnyxReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleTelnyxReconnectRef = useRef<() => void>(() => {});
  // True from the start of initTelnyx until the client is ready or fails - stops
  // overlapping clients (the getWebRtcToken await window let a second trigger
  // create a duplicate registration, and two clients on one credential PUNT each
  // other in a loop). Also debounces forced reconnects.
  const telnyxConnectingRef = useRef(false);
  const lastForceReconnectRef = useRef(0);

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
    // Guard the whole async setup, not just telnyxRef: getWebRtcToken() awaits,
    // and a second trigger in that window would build a duplicate client that
    // PUNTs the first. One in-flight connect at a time.
    if (telnyxConnectingRef.current) return;
    telnyxConnectingRef.current = true;

    try {
      const { loginToken } = await callingApi.getWebRtcToken();

      const client = new TelnyxRTC({
        login_token: loginToken,
        // Pin the WebRTC registration to a US region. With the default ("auto")
        // the browser was registering on the EU edge (ld6-prod / London), while
        // our number, Call Control app and inbound fork-dial all anchor in the
        // US - so inbound INVITEs to sip:<cred>@sip.telnyx.com couldn't find the
        // EU registration and returned SIP 480 (every inbound call missed). The
        // business numbers are California (747/559), so us-west matches.
        region: "us-west",
        // The SDK posts periodic call analytics to https://rtc.telnyx.com/call_report.
        // In some environments this can surface as a CORS error (noise) even though
        // calling still works. Disable it by default.
        enableCallReports: false,
      });
      client.remoteElement = TELNYX_REMOTE_AUDIO_ELEMENT_ID;

      client.on("telnyx.ready", () => {
        telnyxReadyRef.current = true;
        telnyxConnectingRef.current = false;
        telnyxReconnectAttemptRef.current = 0;
        setTelnyxReady(true);
        // Diagnostic: no "registered" line in the console = inbound calls
        // cannot ring this browser (the backend will go to voicemail).
        console.log("[calling] telnyx registered (ready) at", new Date().toISOString());
      });
      client.on("telnyx.error", (err: unknown) => {
        console.warn("[calling] telnyx.error", err);
        const s = (() => {
          try { return JSON.stringify(err ?? ""); } catch { return String(err); }
        })();
        // Socket-level errors (45002 WEBSOCKET_ERROR / "Connection to server
        // lost") are handled by the SDK's OWN auto-reconnect - the error body
        // literally says so. Forcing our own teardown here raced the SDK's
        // reconnect, killing the socket mid-handshake ("closed before
        // established") and spinning a connect->PUNT->reconnect loop. Let the
        // SDK recover; the liveness heartbeat is the backstop if it can't.
        // Only force a re-register for CALL-LEVEL dead sessions, where the
        // socket looks alive but the server lost our session so answering /
        // hanging up silently fail.
        const callLevelDead =
          s.includes("-32002") || s.includes("CALL DOES NOT EXIST") ||
          s.includes("BYE_SEND_FAILED") || s.includes("44003");
        if (!callLevelDead) return;
        // Debounce: at most one forced reconnect per 8s, and never while a
        // connect is already in flight.
        const now = Date.now();
        if (telnyxConnectingRef.current || now - lastForceReconnectRef.current < 8_000) return;
        lastForceReconnectRef.current = now;
        console.warn("[calling] dead session detected - forcing re-registration");
        forceTelnyxReconnectRef.current();
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
          console.log("[calling] inbound INVITE received at", new Date().toISOString());
          // The agent already pressed Accept (INVITE lost the race against the
          // WS event): answer this leg immediately instead of re-ringing.
          const pendingAccept = acceptPendingRef.current;
          if (pendingAccept) {
            acceptPendingRef.current = null;
            window.clearTimeout(pendingAccept.timer);
            try {
              sdkCall.answer?.();
              attachRemoteAudio(sdkCall);
            } catch (err) {
              console.warn("[calling] late-INVITE answer failed", err);
            }
            console.log("[calling] INVITE paired with pending accept - answered");
            // Still "Connecting..." - the answer-confirmation watch flips it
            // to connected only when Telnyx confirms.
            startAnswerWatch(pendingAccept.callId);
            setActiveCall((ac) =>
              ac && ac.callId === pendingAccept.callId
                ? { ...ac, sdkCall, status: "INITIATED", startedAt: Date.now() }
                : ac,
            );
            return;
          }
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
          console.log("[calling] sdk call active at", new Date().toISOString());
          // Telnyx confirmed the leg is up - the answer is real.
          clearAnswerWatch();
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
          // Expected endings never toast:
          //  - NORMAL_CLEARING / ORIGINATOR_CANCEL / UNKNOWN: ordinary hangups.
          //  - USER_BUSY on an INBOUND leg: that's the SDK's own 486 when WE
          //    decline (or the ring ended elsewhere and this tab rejected its
          //    fork) - the "Call Failed: USER_BUSY" toasts after End Call were
          //    exactly this. CALL_REJECTED likewise.
          const expected =
            cause === "NORMAL_CLEARING" ||
            cause === "ORIGINATOR_CANCEL" ||
            cause === "UNKNOWN" ||
            (sdkCall.direction === "inbound" && (cause === "USER_BUSY" || cause === "CALL_REJECTED"));
          // hangup AND destroy both fire for the same leg - toast at most once.
          if (!expected && !toastedHangupRef.current.has(sdkCallId)) {
            toastedHangupRef.current.add(sdkCallId);
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
      telnyxConnectingRef.current = false;
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
      if (telnyxConnectingRef.current) return; // a connect is already in flight
      try {
        telnyxRef.current?.disconnect();
      } catch {
        /* noop */
      }
      telnyxRef.current = null;
      telnyxConnectingRef.current = false;
      void initTelnyx();
    }, delay);
  }, [initTelnyx]);
  useEffect(() => {
    scheduleTelnyxReconnectRef.current = scheduleTelnyxReconnect;
  }, [scheduleTelnyxReconnect]);

  // Immediate teardown + re-register (no backoff). For the moments we KNOW the
  // session is dead: heartbeat found a half-open socket, the SDK reported
  // "CALL DOES NOT EXIST"/BYE_SEND_FAILED, the network came back, or a call is
  // ringing while we're disconnected. A half-open WebSocket never fires
  // socket.close client-side, so waiting for that event left tabs that LOOKED
  // registered but couldn't answer or hang up (the -32002 / 44003 errors).
  const forceTelnyxReconnect = useCallback(() => {
    if (!sessionActiveRef.current) return;
    // Don't tear down a connect that's still establishing - that's exactly what
    // caused the "closed before established" / PUNT loop. Let it finish (or fail
    // and clear the flag itself).
    if (telnyxConnectingRef.current) return;
    if (telnyxReconnectTimerRef.current) {
      clearTimeout(telnyxReconnectTimerRef.current);
      telnyxReconnectTimerRef.current = null;
    }
    telnyxReadyRef.current = false;
    setTelnyxReady(false);
    telnyxReconnectAttemptRef.current = 0;
    try {
      telnyxRef.current?.disconnect();
    } catch {
      /* noop */
    }
    telnyxRef.current = null;
    telnyxConnectingRef.current = false;
    void initTelnyx();
  }, [initTelnyx]);
  const forceTelnyxReconnectRef = useRef<() => void>(() => {});
  useEffect(() => {
    forceTelnyxReconnectRef.current = forceTelnyxReconnect;
  }, [forceTelnyxReconnect]);

  // Liveness heartbeat: every 20s, verify the SDK's socket is actually up.
  // Also re-register the moment the network returns.
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (!sessionActiveRef.current) return;
      const client = telnyxRef.current as unknown as { connected?: boolean } | null;
      if (telnyxReadyRef.current && client && client.connected === false) {
        console.warn("[calling] heartbeat: telnyx socket dead - reconnecting");
        forceTelnyxReconnectRef.current();
      }
    }, 20_000);
    const onOnline = () => {
      if (!sessionActiveRef.current) return;
      console.log("[calling] network back online - re-registering calling client");
      forceTelnyxReconnectRef.current();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Waking a laptop / returning to the tab: if the calling client died while
  // the tab was hidden, reconnect immediately so inbound calls can ring.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!sessionActiveRef.current || telnyxReadyRef.current) return;
      if (telnyxConnectingRef.current) return; // a connect is already in flight
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
      // A call is ringing but this tab's calling client is dead/half-open:
      // re-register NOW. It may be too late for this call's already-forked
      // INVITE, but it restores the tab for the immediate retry instead of
      // requiring a manual refresh.
      const client = telnyxRef.current as unknown as { connected?: boolean } | null;
      if (!telnyxReadyRef.current || (client && client.connected === false)) {
        console.warn("[calling] incoming call while calling client disconnected - re-registering");
        forceTelnyxReconnectRef.current();
      }
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
      // Backend confirmed the call is live (winner claimed + bridged) - the
      // second confirmation source for the answer watch.
      if (e.status === "IN_PROGRESS") clearAnswerWatch();
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

    // Stop ringing on this tab, whatever keyed the modal. A tab that missed
    // the backend incoming_call event keys its modal `sdk:<id>`, which can
    // never equal the backend callId - matching on id left those tabs ringing
    // forever after the call was answered/declined elsewhere. Only one inbound
    // call rings at a time, so clearing unconditionally is safe.
    const stopRinging = () => {
      setIncomingCall((prev) => {
        if (!prev) return prev;
        try {
          prev.sdkCall?.hangup?.();
        } catch {
          /* noop */
        }
        return null;
      });
    };
    socket.on("call_taken_elsewhere", (_e: CallTakenElsewhereEvent) => stopRinging());
    // Ring ended with no winner: timeout, caller hung up, or declined on
    // another tab/device.
    socket.on("call_ring_ended", (_e: CallRingEndedEvent) => stopRinging());

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

  // Failsafe ring cap: the backend stops ringing after ring_timeout (25s) and
  // broadcasts call_ring_ended, but a tab with a dead socket would never hear
  // it - never let the modal + ringtone run unbounded. Keyed on callId so the
  // timer doesn't reset when the SDK leg pairs onto the same call.
  const incomingCallId = incomingCall?.callId ?? null;
  useEffect(() => {
    if (!incomingCallId) return;
    const t = window.setTimeout(() => {
      setIncomingCall((prev) => {
        if (!prev || prev.callId !== incomingCallId) return prev;
        try {
          prev.sdkCall?.hangup?.();
        } catch {
          /* noop */
        }
        return null;
      });
    }, 35_000);
    return () => window.clearTimeout(t);
  }, [incomingCallId]);

  const acceptIncoming = useCallback(() => {
    setIncomingCall((prev) => {
      if (!prev) return prev;
      console.log("[calling] accept clicked at", new Date().toISOString(), "sdkCall paired:", !!prev.sdkCall);

      if (prev.sdkCall) {
        try {
          prev.sdkCall.answer?.();
          attachRemoteAudio(prev.sdkCall);
        } catch (err) {
          console.warn("[calling] sdkCall.answer failed", err);
        }
        // "Connecting..." until Telnyx CONFIRMS (SDK active / backend
        // IN_PROGRESS). The old optimistic IN_PROGRESS showed an answered
        // call even when the answer died on a dead socket and the caller
        // kept hearing ringing.
        startAnswerWatch(prev.callId);
        setActiveCall({
          callId: prev.callId,
          sdkCall: prev.sdkCall,
          direction: "INBOUND",
          origin: "web",
          remotePhoneNumber: prev.fromNumber,
          remoteName: prev.leadName ?? null,
          status: "INITIATED",
          answeredVia: "web",
          startedAt: Date.now(),
        });
        return null;
      }

      // No WebRTC leg to answer yet. The old code "answered" anyway and showed
      // a connected call while the backend kept ringing - the caller then got
      // a MISSED-call text despite the agent pressing Accept. Hold the intent:
      // the INVITE handler answers the leg the moment it arrives; if it never
      // does (mic blocked / registration dead / leg already rejected), tell
      // the agent the truth instead of faking a call.
      const timer = window.setTimeout(() => {
        if (acceptPendingRef.current?.callId !== prev.callId) return;
        acceptPendingRef.current = null;
        setActiveCall((ac) => (ac && ac.callId === prev.callId ? null : ac));
        console.warn("[calling] accept failed - INVITE never reached this tab");
        toast.error(
          "Couldn't pick up in this browser - the call never reached it. Allow the microphone for this site and refresh, then try again.",
          { duration: 10000 },
        );
      }, 5000);
      acceptPendingRef.current = { callId: prev.callId, timer };
      setActiveCall({
        callId: prev.callId,
        sdkCall: null,
        direction: "INBOUND",
        origin: "web",
        remotePhoneNumber: prev.fromNumber,
        remoteName: prev.leadName ?? null,
        status: "RINGING",
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
      // Decline is ALWAYS authoritative server-side: the backend kills the
      // Telnyx fork legs (the caller's phone stops ringing / hits voicemail)
      // and broadcasts call_ring_ended to every tab. The local sdkCall.hangup
      // above is NOT enough on its own - on a dead SDK socket the BYE never
      // reaches Telnyx (error 44003) and the caller would ring on. Tabs that
      // never learned the backend call id (`sdk:`-keyed) decline by context.
      const req = prev.callId.startsWith("sdk:")
        ? callingApi.declineActiveIncoming()
        : callingApi.declineIncoming(prev.callId);
      void req.catch((err) => {
        console.warn("[calling] backend decline failed", err);
      });
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
