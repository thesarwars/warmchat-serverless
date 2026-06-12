import { useEffect, useRef } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useCalling } from "@/context/useCalling";

/**
 * Full-screen incoming-call ringer. Mounted at app root via MainLayout so it
 * overlays whatever screen the agent is on.
 *
 * Plays a looped ringtone file from /sounds while an incoming call is
 * pending; stops as soon as the call is accepted, rejected, or the ring ends
 * (answered elsewhere / timeout / caller hung up). If file playback is
 * blocked by the browser's autoplay policy, falls back to a Web Audio tone
 * loop (an AudioContext can sometimes start where media elements can't).
 *
 * To use a different/custom tone, drop the file in public/sounds/ and point
 * RINGTONES + RINGTONE at it (any mp3/wav works).
 */
const RINGTONES = {
  custom: "/sounds/ringtone-custom.mp3",   // owner-provided tone (docs/updated-docs/custom_tone.mp3)
  classic: "/sounds/ringtone-classic.wav", // telephone-style dual-tone brrring
  chime: "/sounds/ringtone-chime.wav",     // soft two-note bell
} as const;
const RINGTONE = RINGTONES.custom;

export function IncomingCallModal() {
  const { incomingCall, acceptIncoming, rejectIncoming, telnyxReady } = useCalling();
  const ringElRef = useRef<HTMLAudioElement | null>(null);
  const ringAudioRef = useRef<{
    ctx: AudioContext;
    osc: OscillatorNode;
    gain: GainNode;
    interval: number;
  } | null>(null);

  useEffect(() => {
    const stopAll = () => {
      const el = ringElRef.current;
      if (el) {
        try {
          el.pause();
          el.src = "";
        } catch {
          /* noop */
        }
        ringElRef.current = null;
      }
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
    };

    if (!incomingCall) {
      stopAll();
      return;
    }
    if (ringElRef.current || ringAudioRef.current) return;

    const startSynthFallback = () => {
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
    };

    const el = new Audio(RINGTONE);
    el.loop = true;
    el.volume = 0.8;
    ringElRef.current = el;
    el.play().catch(() => {
      ringElRef.current = null;
      startSynthFallback();
    });
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

          {!telnyxReady && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Browser calling is reconnecting&hellip; answering may not work for
              this call. If it fails, the caller goes to voicemail.
            </p>
          )}

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
