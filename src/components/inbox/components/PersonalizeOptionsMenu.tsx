import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import {
  PERSONALIZATION_TOKENS,
  type PersonalizationToken,
} from "../../../utils/personalization";

export default function PersonalizeOptionsMenu({
  includeSubject = false,
  onInsertBody,
  onInsertSubject,
  tokens,
  direction = "up",
}: {
  includeSubject?: boolean;
  onInsertBody: (token: string) => void;
  onInsertSubject?: (token: string) => void;
  tokens?: PersonalizationToken[];
  direction?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"body" | "subject">("body");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!includeSubject && target !== "body") {
      setTarget("body");
    }
  }, [includeSubject, target]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        !containerRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Position the menu with fixed coordinates anchored to the button so it
  // floats above the composer instead of being clipped/scrolled by the
  // composer's overflow container. Direction is per-caller because the inbox
  // composer opens upward (toward the conversation) while the new-message
  // popup opens downward (the composer sits near the top of the dialog).
  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 320;
      const left = Math.max(
        8,
        Math.min(rect.right - width, window.innerWidth - width - 8),
      );
      setMenuStyle({
        position: "fixed",
        ...(direction === "down"
          ? { top: rect.bottom + 8 }
          : { bottom: window.innerHeight - rect.top + 8 }),
        left,
        width,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, direction]);

  const activeTarget = includeSubject ? target : "body";
  const tokenList = tokens?.length ? tokens : PERSONALIZATION_TOKENS;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-2 text-xs font-bold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100 2xl:h-9 2xl:px-2.5 2xl:text-sm"
        aria-label="Open personalization options"
        title="Personalize"
      >
        <Sparkles size={16} className="text-orange-500" />
        Personalize
      </button>

      {open ? createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-9999 max-h-[60vh] overflow-y-auto rounded-3xl border border-gray-200 bg-white shadow-2xl"
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="text-sm font-semibold text-gray-900">
              Personalize
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Insert lead variables into the draft. Tokens stay visible until
              send time.
            </div>
          </div>

          {includeSubject ? (
            <div className="flex gap-2 border-b border-gray-100 px-3 py-3">
              <button
                type="button"
                onClick={() => setTarget("body")}
                className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                  activeTarget === "body"
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Message
              </button>
              <button
                type="button"
                onClick={() => setTarget("subject")}
                className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                  activeTarget === "subject"
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Subject
              </button>
            </div>
          ) : null}

          <div className="p-2">
            {tokenList.map((tokenItem) => (
              <button
                key={`${activeTarget}-${tokenItem.token}`}
                type="button"
                onClick={() => {
                  if (activeTarget === "subject") {
                    onInsertSubject?.(tokenItem.token);
                  } else {
                    onInsertBody(tokenItem.token);
                  }
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition hover:bg-orange-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">
                    {tokenItem.label}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {tokenItem.description}
                  </div>
                </div>
                <code className="ml-3 rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-800">
                  {tokenItem.token}
                </code>
              </button>
            ))}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
