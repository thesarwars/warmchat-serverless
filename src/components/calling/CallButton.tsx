import { useState } from "react";
import { Phone, ChevronDown, Smartphone } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCalling } from "@/context/useCalling";
import { useCanCall } from "@/hooks/useCanCall";

interface Props {
  phoneNumber?: string | null;
  name?: string | null;
  leadId?: string;
  size?: "sm" | "md";
  className?: string;
}

export function CallButton({
  phoneNumber,
  name,
  leadId,
  size = "md",
  className = "",
}: Props) {
  const { canCall, reasons, loading } = useCanCall();
  const { startWebCall, startPhoneCall, activeCall, telnyxReady } =
    useCalling();
  const [busy, setBusy] = useState(false);

  const disabled =
    loading ||
    !canCall ||
    !phoneNumber ||
    busy ||
    !!activeCall;

  const tooltip = !phoneNumber
    ? "No phone number on file"
    : !canCall
      ? reasons.join(" * ") || "Calling unavailable"
      : activeCall
        ? "Already on a call"
        : "";

  const handleWeb = async () => {
    if (!phoneNumber) return;
    setBusy(true);
    try {
      await startWebCall({
        phoneNumber,
        name: name ?? undefined,
        leadId,
      });
    } catch (e) {
      console.warn("Web call failed", e);
    } finally {
      setBusy(false);
    }
  };

  const handlePhone = async () => {
    if (!phoneNumber) return;
    setBusy(true);
    try {
      await startPhoneCall({
        phoneNumber,
        name: name ?? undefined,
        leadId,
      });
    } catch (e) {
      console.warn("Phone call failed", e);
    } finally {
      setBusy(false);
    }
  };

  const sizeClasses =
    size === "sm" ? "h-8 text-xs px-2" : "h-9 text-sm px-3";

  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded-md border border-orange-500 ${className}`}
      title={tooltip}
    >
      <button
        type="button"
        onClick={handleWeb}
        disabled={disabled || !telnyxReady}
        className={`${sizeClasses} inline-flex items-center gap-1.5 bg-orange-500 text-white hover:bg-orange-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed`}
      >
        <Phone className="h-4 w-4" />
        <span>Call</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={`${sizeClasses} inline-flex items-center bg-orange-500 text-white border-l border-orange-600 hover:bg-orange-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed`}
            aria-label="Call options"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={handleWeb}
            disabled={disabled || !telnyxReady}
          >
            <Phone className="mr-2 h-4 w-4" />
            <div className="flex flex-col">
              <span>Call from web</span>
              <span className="text-xs text-gray-500">
                {telnyxReady ? "Ready" : "Connecting..."}
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePhone} disabled={disabled}>
            <Smartphone className="mr-2 h-4 w-4" />
            <div className="flex flex-col">
              <span>Call from my phone</span>
              <span className="text-xs text-gray-500">
                Rings your cell first
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
