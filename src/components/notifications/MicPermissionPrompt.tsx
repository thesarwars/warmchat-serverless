import { useEffect, useState } from "react";
import { Mic } from "lucide-react";

/**
 * One-time microphone pre-grant. Browsers only ask for the mic when
 * getUserMedia first runs - which used to be the moment the agent ANSWERED a
 * call, stalling pickup ~5-10s behind a permission dialog. This card surfaces
 * right after login and grants the permission up front, so answering a call
 * connects instantly. It renders only while the permission is in the "prompt"
 * state and disappears forever once granted.
 */
export default function MicPermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snoozed, setSnoozed] = useState(
    () =>
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem("wc_mic_prompt_snoozed") === "1",
  );

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!localStorage.getItem("token")) return; // logged-out: never prompt
    let cancelled = false;
    const check = async () => {
      try {
        const perms = navigator.permissions as Permissions | undefined;
        if (!perms?.query) return;
        const status = await perms.query({
          name: "microphone" as PermissionName,
        });
        if (cancelled) return;
        setVisible(status.state === "prompt");
        status.onchange = () => setVisible(status.state === "prompt");
      } catch {
        /* Permissions API unsupported (e.g. older Safari) - skip the card. */
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission granted - we don't need the stream itself.
      stream.getTracks().forEach((t) => t.stop());
      setVisible(false);
    } catch {
      // Denied or hardware error - hide for this session; the browser
      // remembers a hard deny anyway.
      setVisible(false);
    } finally {
      setBusy(false);
    }
  };

  if (!visible || snoozed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-orange-200 bg-white p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
          <Mic size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900">
            Enable your microphone
          </div>
          <p className="mt-0.5 text-xs leading-5 text-gray-600">
            Grant it once now so answering a call connects instantly - instead
            of waiting on a browser permission popup mid-call.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void enable()}
              disabled={busy}
              className="rounded-xl bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {busy ? "Requesting…" : "Enable microphone"}
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem("wc_mic_prompt_snoozed", "1");
                setSnoozed(true);
              }}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
