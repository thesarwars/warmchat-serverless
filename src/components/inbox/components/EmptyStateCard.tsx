import { Layers3, Mail, Plus, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

export default function EmptyStateCard({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  icon = "layers",
  footer,
}: {
  title: string;
  description: string;
  primaryLabel?: string;
  secondaryLabel: string;
  onPrimary?: () => void;
  onSecondary: () => void;
  icon?: "mail" | "layers";
  /** Optional content rendered inside the card, beneath the action buttons. */
  footer?: ReactNode;
}) {
  const Icon = icon === "mail" ? Mail : Layers3;
  return (
    <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-[28px] border border-dashed border-gray-200 bg-linear-to-br from-white via-orange-50/30 to-slate-50 p-8 text-center">
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-xs">
        <Icon className="text-orange-500" size={40} strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {primaryLabel && onPrimary ? (
          <button
            onClick={onPrimary}
            className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            <Plus size={16} />
            {primaryLabel}
          </button>
        ) : null}
        <button
          onClick={onSecondary}
          className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300"
        >
          <UserPlus size={16} />
          {secondaryLabel}
        </button>
      </div>
      {footer ? <div className="mt-6">{footer}</div> : null}
    </div>
  );
}
