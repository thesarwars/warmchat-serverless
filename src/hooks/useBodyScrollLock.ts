import { useEffect } from "react";

/**
 * Lock the page (body) scroll while a modal/overlay is mounted, then restore it.
 * Without this, scrolling over a fixed overlay scrolls the page behind it on
 * small screens. Call from inside a component that only renders while open.
 */
export function useBodyScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevOverflow;
    };
  }, [active]);
}
