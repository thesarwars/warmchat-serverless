import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Phone, Smartphone } from "lucide-react";
import { useCalling } from "@/context/useCalling";

/** Local ringback while an outbound web call is ringing (Telnyx may be silent). */
function useOutboundRingback(active: boolean) {
  const ringRef = useRef<{
    ctx: AudioContext;
    osc: OscillatorNode;
    gain: GainNode;
    interval: number;
  } | null>(null);

  useEffect(() => {
    if (!active) {
      const r = ringRef.current;
      if (r) {
        try {
          r.osc.stop();
          r.ctx.close();
          window.clearInterval(r.interval);
        } catch {
          /* noop */
        }
        ringRef.current = null;
      }
      return;
    }
    if (ringRef.current) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 440;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      let on = false;
      const interval = window.setInterval(() => {
        on = !on;
        gain.gain.setTargetAtTime(on ? 0.1 : 0, ctx.currentTime, 0.02);
      }, 1000);
      ringRef.current = { ctx, osc, gain, interval };
    } catch {
      /* WebAudio unavailable */
    }
    return () => {
      const r = ringRef.current;
      if (r) {
        try {
          r.osc.stop();
          r.ctx.close();
          window.clearInterval(r.interval);
        } catch {
          /* noop */
        }
        ringRef.current = null;
      }
    };
  }, [active]);
}

const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
};

/**
 * Floating mini-window for the agent's active call. Renders only when a
 * call is in progress (web or phone). For phone-origin calls (or calls
 * answered on the cell), the audio is on the agent's phone, so we just
 * show status - no mute, no DTMF. For web calls we expose mute/hangup.
 */
export function ActiveCallWindow() {
  const { activeCall, hangup, toggleMute, isMuted } = useCalling();
  const [now, setNow] = useState(() => Date.now());

  const onWeb =
    activeCall?.answeredVia === "web" || activeCall?.origin === "web";
  const playOutboundRingback = Boolean(
    activeCall &&
      onWeb &&
      activeCall.direction === "OUTBOUND" &&
      activeCall.status === "RINGING",
  );
  useOutboundRingback(playOutboundRingback);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!activeCall) return null;
  const duration =
    activeCall.status === "IN_PROGRESS"
      ? formatDuration(now - activeCall.startedAt)
      : null;

  const statusLabel: Record<string, string> = {
    INITIATED: "Connecting...",
    RINGING: activeCall.direction === "OUTBOUND" ? "Ringing..." : "Incoming...",
    IN_PROGRESS: onWeb ? "On call (web)" : "On call (cell)",
    COMPLETED: "Call ended",
    NO_ANSWER: "No answer",
    BUSY: "Busy",
    FAILED: "Call failed",
    CANCELED: "Canceled",
  };

  return (
    <div className="fixed bottom-24 right-4 z-50 w-72 rounded-xl bg-gray-900 text-white shadow-2xl">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600">
          {onWeb ? (
            <Phone className="h-5 w-5" />
          ) : (
            <Smartphone className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {activeCall.remoteName || activeCall.remotePhoneNumber || "Caller"}
          </p>
          <p className="truncate text-xs text-gray-400">
            {statusLabel[activeCall.status] ?? activeCall.status}
            {duration ? ` * ${duration}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-around border-t border-white/10 p-2">
        <button
          type="button"
          onClick={toggleMute}
          disabled={!onWeb || activeCall.status !== "IN_PROGRESS"}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          onClick={hangup}
          className="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-sm hover:bg-red-700"
        >
          <PhoneOff className="h-4 w-4" />
          Hang up
        </button>
      </div>
    </div>
  );
}
