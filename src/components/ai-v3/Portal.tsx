import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/* Portals modal overlays to <body> and re-wraps them in `.wcv3` so the V3
   scoped wc-* styles still apply. Self-contained — no dependency on V2. */
export function V3Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className="wcv3">{children}</div>, document.body);
}
