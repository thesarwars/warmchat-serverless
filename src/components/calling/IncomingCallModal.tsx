import { useEffect, useRef } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useCalling } from "@/context/useCalling";

/**
 * Full-screen incoming-call ringer. Mounted at app root via MainLayout so it
 * overlays whatever screen the agent is on.
 *
 * Plays a simple ringtone (via Web Audio API tone loop) when an incoming
 * call is pending. The ringtone stops as soon as the call is accepted,
 * rejected, or `call_taken_elsewhere` fires.
 */
export function IncomingCallModal() {
  const { incomingCall, acceptIncoming, rejectIncoming } = useCalling();
  const ringAudioRef = useRef<{
    ctx: AudioContext;
    osc: OscillatorNode;
    gain: GainNode;
    interval: number;
  } | null>(null);

  useEffect(() => {
    if (!incomingCall) {
      const r = ringAudioRef.current;
      if (r) {
        try {
          r.osc.stop();
          r.ctx.close();
          window.clearInterval(r.interval);
        } catch {
          /* noop */
        }
        ringAudioRef.current = null;
      }
      return;
    }
    if (ringAudioRef.current) return;
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
        gain.gain.setTargetAtTime(on ? 0.12 : 0, ctx.currentTime, 0.02);
      }, 500);
      ringAudioRef.current = { ctx, osc, gain, interval };
    } catch {
      /* WebAudio not available */
    }
  }, [incomingCall]);

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-3 animate-pulse">
            <Phone className="h-9 w-9 text-emerald-600" />
          </div>
          <p className="text-xs uppercase tracking-wider text-gray-500">
            Incoming call
          </p>
          <p className="mt-1 text-xl font-semibold text-gray-900">
            {incomingCall.leadName || "Unknown caller"}
          </p>
          <p className="text-sm text-gray-600">{incomingCall.fromNumber}</p>

          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <button
              type="button"
              onClick={rejectIncoming}
              className="flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-3 text-white hover:bg-red-700"
            >
              <PhoneOff className="h-5 w-5" />
              Decline
            </button>
            <button
              type="button"
              onClick={acceptIncoming}
              className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-white hover:bg-emerald-700"
            >
              <Phone className="h-5 w-5" />
              Accept
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Or pick up on your cell phone - both are ringing.
          </p>
        </div>
      </div>
    </div>
  );
}
