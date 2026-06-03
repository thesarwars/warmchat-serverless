import { useEffect, useRef } from "react";

export type MascotState = "awake" | "sleeping" | "off";

// Per-state label shown on the pill under the companion's feet.
const STATE_LABEL: Record<MascotState, { text: string; dot: string }> = {
  awake: { text: "Awake", dot: "#16A34A" },
  sleeping: { text: "Sleeping", dot: "#7c6cf0" },
  off: { text: "Off", dot: "#97a2af" },
};

/**
 * Nimbus - the big light-blue companion mascot for the AI Command Center hero.
 *
 * Three states (driven by the parent from the AI master switch + org quiet hours):
 * - awake    : pupils track the cursor (per-eye on-screen centers so the gaze
 *              stays accurate while he bobs), he blinks on a random interval, and
 *              clicking him plays a happy "boop" hop.
 * - sleeping : org is in quiet hours - eyes close into happy curves, "z z z"
 *              float up, the companion breathes slowly.
 * - off      : the AI master switch is off - the whole companion goes grayscale
 *              and dim with flat "powered-down" eyes, no tracking, no animation.
 *
 * The status pill under his feet is ours (the design has none) - it is kept so
 * the agent can see awake/sleeping/off at a glance. It sits below the SVG so it
 * never covers his legs.
 *
 * Desktop-only by design - the parent decides whether to mount this (pointer:fine
 * + wide viewport) or fall back to the static bot icon, so there is no pointer
 * tracking on touch devices.
 */
export function NimbusMascot({ state }: { state: MascotState }) {
  const hostRef = useRef<HTMLSpanElement>(null);

  // Cursor-tracking pupils - awake only. Each eye's real on-screen center is
  // cached (and re-cached on scroll/resize) so the gaze stays accurate as the
  // body bobs; pointer moves are throttled to one update per animation frame.
  useEffect(() => {
    if (state !== "awake") return;
    const host = hostRef.current;
    if (!host) return;
    const eyes = Array.from(host.querySelectorAll<SVGGElement>(".wc-nb-eye-open"));
    const pupils = Array.from(host.querySelectorAll<SVGGElement>(".wc-nb-pupil"));
    if (!eyes.length || !pupils.length) return;
    const MAX = 6;
    let centers: { x: number; y: number }[] = [];
    let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let queued = false;
    const cache = () => {
      centers = eyes.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    };
    const update = () => {
      pupils.forEach((p, i) => {
        const c = centers[i];
        if (!c) return;
        const dx = pointer.x - c.x;
        const dy = pointer.y - c.y;
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, dist / 220);
        p.style.transform = `translate(${((dx / dist) * MAX * reach).toFixed(2)}px,${((dy / dist) * MAX * reach).toFixed(2)}px)`;
      });
    };
    const onMove = (e: MouseEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (!queued) {
        queued = true;
        requestAnimationFrame(() => { queued = false; update(); });
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", cache, { passive: true });
    window.addEventListener("resize", cache);
    cache();
    const settle = window.setTimeout(cache, 400);
    update();
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", cache);
      window.removeEventListener("resize", cache);
    };
  }, [state]);

  // Random eye-blink loop (awake only). The class is toggled straight on the host
  // to avoid a React re-render per blink - renders happen only when `state` flips.
  useEffect(() => {
    if (state !== "awake") return;
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    let blinkTimer = 0;
    let closeTimer = 0;
    const schedule = () => {
      blinkTimer = window.setTimeout(() => {
        if (!alive) return;
        host.classList.add("is-blinking");
        closeTimer = window.setTimeout(() => host.classList.remove("is-blinking"), 150);
        schedule();
      }, 2200 + Math.random() * 3200);
    };
    schedule();
    return () => {
      alive = false;
      window.clearTimeout(blinkTimer);
      window.clearTimeout(closeTimer);
      host.classList.remove("is-blinking");
    };
  }, [state]);

  // Click-to-boop: a quick happy hop + blink. Awake only.
  const boop = () => {
    const host = hostRef.current;
    if (!host || state !== "awake") return;
    host.classList.remove("is-booped");
    void host.offsetWidth; // restart the animation if booped mid-hop
    host.classList.add("is-booped", "is-happy", "is-blinking");
    window.setTimeout(() => host.classList.remove("is-booped", "is-happy", "is-blinking"), 600);
  };

  const label = STATE_LABEL[state];

  return (
    <span ref={hostRef} className={"wc-nimbus is-" + state} onClick={boop}>
      <svg viewBox="0 0 400 500" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <linearGradient id="nimbusBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eafaff" />
            <stop offset="0.5" stopColor="#d7f0fe" />
            <stop offset="1" stopColor="#9ad4f4" />
          </linearGradient>
          <radialGradient id="nimbusEye" cx="50%" cy="36%" r="68%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e3f3ff" />
          </radialGradient>
        </defs>

        {/* ground shadow */}
        <ellipse cx="200" cy="472" rx="72" ry="13" fill="#1c2330" opacity="0.14" />
        <ellipse cx="200" cy="472" rx="96" ry="18" fill="none" stroke="#cdd6df" strokeWidth="1" opacity="0.7" />

        <g id="nimbusFloat">
          {/* legs (slim, bare) */}
          <path d="M186 372 C 184 408 184 438 186 456" fill="none" stroke="#9ad4f4" strokeWidth="22" strokeLinecap="round" />
          <path d="M214 372 C 216 408 216 438 214 456" fill="none" stroke="#9ad4f4" strokeWidth="22" strokeLinecap="round" />
          {/* feet */}
          <ellipse cx="183" cy="461" rx="18" ry="10" fill="#5398cb" />
          <ellipse cx="217" cy="461" rx="18" ry="10" fill="#5398cb" />

          {/* neck */}
          <rect x="190" y="198" width="20" height="34" rx="9" fill="#9ad4f4" />

          {/* torso (slim, structured) */}
          <path
            d="M200 224 C 178 224 167 231 157 247 C 151 283 151 302 159 314 C 152 340 153 364 170 378 L 230 378 C 247 364 248 340 241 314 C 249 302 249 283 243 247 C 233 231 222 224 200 224 Z"
            fill="url(#nimbusBody)"
          />
          {/* soft highlight */}
          <path d="M178 250 C 166 272 166 320 174 360 C 158 320 160 268 178 250 Z" fill="#ffffff" opacity="0.22" />

          {/* arms (slim, bare) */}
          <path d="M160 250 C 144 278 142 326 148 358" fill="none" stroke="#9ad4f4" strokeWidth="21" strokeLinecap="round" />
          <path d="M240 250 C 256 278 258 326 252 358" fill="none" stroke="#9ad4f4" strokeWidth="21" strokeLinecap="round" />
          {/* hands */}
          <circle cx="148" cy="362" r="11" fill="#9ad4f4" />
          <circle cx="252" cy="362" r="11" fill="#9ad4f4" />

          {/* head (blocky monitor-style: flat top, straight sides, soft jaw) */}
          <path
            d="M152 50 L248 50 Q274 50 274 76 L274 176 Q274 212 238 212 L162 212 Q126 212 126 176 L126 76 Q126 50 152 50 Z"
            fill="url(#nimbusBody)"
          />
          {/* glossy highlight */}
          <path d="M150 64 C 132 80 124 108 126 142 C 110 104 122 70 150 64 Z" fill="#ffffff" opacity="0.42" />

          {state === "awake" && (
            <>
              {/* left eye - the .wc-nb-eye-open group is what blinks (scaleY) and
                  whose center we track; the .wc-nb-pupil group translates to follow
                  the cursor. */}
              <g className="wc-nb-eye-open">
                <ellipse cx="166" cy="126" rx="21" ry="25" fill="url(#nimbusEye)" stroke="#cfe7f6" strokeWidth="2" />
                <g className="wc-nb-pupil">
                  <circle cx="166" cy="127" r="12" fill="#1b2c3c" />
                  <circle cx="162" cy="122" r="4.2" fill="#ffffff" />
                  <circle cx="170" cy="131" r="1.8" fill="#ffffff" opacity="0.7" />
                </g>
              </g>
              {/* right eye */}
              <g className="wc-nb-eye-open">
                <ellipse cx="234" cy="126" rx="21" ry="25" fill="url(#nimbusEye)" stroke="#cfe7f6" strokeWidth="2" />
                <g className="wc-nb-pupil">
                  <circle cx="234" cy="127" r="12" fill="#1b2c3c" />
                  <circle cx="230" cy="122" r="4.2" fill="#ffffff" />
                  <circle cx="238" cy="131" r="1.8" fill="#ffffff" opacity="0.7" />
                </g>
              </g>
              {/* smile */}
              <path d="M184 166 q16 16 32 0" fill="none" stroke="#1b2c3c" strokeWidth="5" strokeLinecap="round" />
            </>
          )}

          {state === "sleeping" && (
            <>
              {/* closed, content eyes */}
              <path d="M150 127 q16 13 32 0" fill="none" stroke="#1b2c3c" strokeWidth="5" strokeLinecap="round" />
              <path d="M218 127 q16 13 32 0" fill="none" stroke="#1b2c3c" strokeWidth="5" strokeLinecap="round" />
              {/* resting mouth */}
              <path d="M192 166 q8 6 16 0" fill="none" stroke="#1b2c3c" strokeWidth="4.5" strokeLinecap="round" />
            </>
          )}

          {state === "off" && (
            <>
              {/* flat, powered-down eyes */}
              <path d="M148 127 h36" fill="none" stroke="#1b2c3c" strokeWidth="5" strokeLinecap="round" />
              <path d="M216 127 h36" fill="none" stroke="#1b2c3c" strokeWidth="5" strokeLinecap="round" />
              {/* flat mouth */}
              <path d="M186 166 h28" fill="none" stroke="#1b2c3c" strokeWidth="4.5" strokeLinecap="round" />
            </>
          )}
        </g>
      </svg>

      {state === "sleeping" && (
        <span className="wc-nimbus-zzz" aria-hidden>
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </span>
      )}

      <span className="wc-nimbus-state">
        <span className="wc-nimbus-dot" style={{ background: label.dot }} />
        {label.text}
      </span>
    </span>
  );
}
