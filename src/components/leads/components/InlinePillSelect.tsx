import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

type Option = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  /** Per-option pill color classes; when set the option renders as a colored pill. */
  pillClass?: string;
};

type Props = {
  value: string;
  options: Option[];
  pillClass: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
};

const MENU_MAX_H = 220;
const MENU_MARGIN = 4;

type MenuPos = {
  left: number;
  top?: number;
  bottom?: number;
  dropUp: boolean;
};

export default function InlinePillSelect({ value, options, pillClass, ariaLabel, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        (!menuRef.current || !menuRef.current.contains(e.target as Node))
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Smart position: drop up when there's not enough room below
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePos = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < MENU_MAX_H + MENU_MARGIN;

      if (dropUp) {
        setMenuPos({
          bottom: window.innerHeight - rect.top + MENU_MARGIN,
          left: rect.left,
          dropUp: true,
        });
      } else {
        setMenuPos({
          top: rect.bottom + MENU_MARGIN,
          left: rect.left,
          dropUp: false,
        });
      }
    };

    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  const portalStyle: React.CSSProperties = menuPos
    ? menuPos.dropUp
      ? { bottom: menuPos.bottom, left: menuPos.left }
      : { top: menuPos.top,    left: menuPos.left }
    : {};

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center justify-between gap-1 px-2 py-1 rounded-full text-xs font-semibold min-w-24 whitespace-nowrap ${pillClass}`}
      >
        <span className="flex items-center gap-1">
          {current?.icon}
          <span>{current?.label ?? value}</span>
        </span>
        <ChevronDown size={10} className="opacity-60 shrink-0 ml-1" />
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed w-48 max-h-56 overflow-y-auto rounded-lg border bg-white shadow-xl p-1 z-9999"
          style={portalStyle}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition hover:bg-gray-100 ${
                opt.value === value ? "ring-1 ring-inset ring-gray-300" : ""
              }`}
            >
              {opt.pillClass ? (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${opt.pillClass}`}
                >
                  {opt.icon}
                  {opt.label}
                </span>
              ) : (
                <span className={`flex items-center gap-2 ${opt.value === value ? "text-gray-900" : "text-gray-700"}`}>
                  {opt.icon}
                  {opt.label}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
