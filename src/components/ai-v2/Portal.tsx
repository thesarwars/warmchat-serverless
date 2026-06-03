import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/* Portals modal overlays to <body> so a `position:fixed` scrim truly covers the
   viewport instead of being trapped inside the page content. The v2 pages wrap
   content in `.wc-page.wc-fade`, whose entrance animation can promote it to a
   containing block for fixed descendants - so a modal rendered inline only
   covers the content area. Rendering at <body> escapes that; re-wrapping in
   `.wcv2` keeps the design's wc-* styles (scoped under .wcv2 in prototype.css)
   applying to the portaled content. */
export function Wcv2Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className="wcv2">{children}</div>, document.body);
}
