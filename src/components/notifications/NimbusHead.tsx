import { useEffect, useRef } from "react";

/**
 * Nimbus head-only mascot - the friendly face that peeks out of the top-left of
 * the in-app notification toast. Pupils gently track the cursor for a touch of
 * life. The light-blue palette matches the AI Command Center hero companion
 * (NimbusMascot), just cropped to the head via the viewBox.
 *
 * Self-contained (literal colors, no design tokens) so it renders correctly in
 * the Sonner toast portal, which lives outside the `.wcv2` styling subtree.
 */
export function NimbusHead({ size = 64 }: { size?: number }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const leftRef = useRef<SVGGElement>(null);
  const rightRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const r = host.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.5;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const ang = Math.atan2(dy, dx);
      const reach = Math.min(Math.hypot(dx, dy) / 120, 1);
      const max = 5;
      const t = `translate(${(Math.cos(ang) * max * reach).toFixed(2)}px,${(Math.sin(ang) * max * reach).toFixed(2)}px)`;
      if (leftRef.current) leftRef.current.style.transform = t;
      if (rightRef.current) rightRef.current.style.transform = t;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <span
      ref={hostRef}
      style={{ display: "inline-block", width: size, height: size, filter: "drop-shadow(0 6px 12px rgba(40,90,130,.22))" }}
      aria-hidden
    >
      <svg viewBox="112 34 176 196" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="nbhBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eafaff" />
            <stop offset="0.55" stopColor="#d7f0fe" />
            <stop offset="1" stopColor="#9ad4f4" />
          </linearGradient>
          <radialGradient id="nbhEye" cx="50%" cy="36%" r="68%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e3f3ff" />
          </radialGradient>
        </defs>
        {/* head */}
        <path
          d="M152 50 L248 50 Q274 50 274 76 L274 176 Q274 212 238 212 L162 212 Q126 212 126 176 L126 76 Q126 50 152 50 Z"
          fill="url(#nbhBody)"
          stroke="#bfe3f6"
          strokeWidth="1.5"
        />
        {/* glossy highlight */}
        <path d="M150 64 C 132 80 124 108 126 142 C 110 104 122 70 150 64 Z" fill="#ffffff" opacity="0.42" />
        {/* left eye */}
        <ellipse cx="166" cy="126" rx="21" ry="25" fill="url(#nbhEye)" stroke="#cfe7f6" strokeWidth="2" />
        <g ref={leftRef} style={{ transition: "transform .08s linear" }}>
          <circle cx="166" cy="127" r="12" fill="#1b2c3c" />
          <circle cx="162" cy="122" r="4.2" fill="#ffffff" />
        </g>
        {/* right eye */}
        <ellipse cx="234" cy="126" rx="21" ry="25" fill="url(#nbhEye)" stroke="#cfe7f6" strokeWidth="2" />
        <g ref={rightRef} style={{ transition: "transform .08s linear" }}>
          <circle cx="234" cy="127" r="12" fill="#1b2c3c" />
          <circle cx="230" cy="122" r="4.2" fill="#ffffff" />
        </g>
        {/* smile */}
        <path d="M184 166 q16 16 32 0" fill="none" stroke="#1b2c3c" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
