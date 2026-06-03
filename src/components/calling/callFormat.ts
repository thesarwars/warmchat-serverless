import type { CallSentiment, CallStatus, CallTaskType } from "@/types/calling";

/** "10:42 AM" for today, else "May 24, 10:42 AM". */
export function formatCallTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

/** Seconds → "6m 12s" / "38s". */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function sentimentStyle(sentiment: CallSentiment): string {
  switch (sentiment) {
    case "positive":
      return "bg-[#ECFDF3] text-[#067647]";
    case "negative":
      return "bg-[#FEF3F2] text-[#B42318]";
    default:
      return "bg-[#F2F4F7] text-[#475467]";
  }
}

export function taskTypeLabel(type: CallTaskType): string {
  switch (type) {
    case "email":
      return "Email";
    case "calendar":
      return "Calendar";
    case "automation":
      return "Automation";
    default:
      return "Task";
  }
}

/** Status → { label, className } for a call-row badge. */
export function statusBadge(status: CallStatus, isVoicemail: boolean): { label: string; className: string } {
  if (isVoicemail) return { label: "Voicemail", className: "bg-[#EEF4FF] text-[#3538CD]" };
  switch (status) {
    case "COMPLETED":
      return { label: "Completed", className: "bg-[#ECFDF3] text-[#067647]" };
    case "NO_ANSWER":
      return { label: "No Answer", className: "bg-[#FFFAEB] text-[#B54708]" };
    case "BUSY":
    case "FAILED":
    case "CANCELED":
      return { label: "Missed", className: "bg-[#FEF3F2] text-[#B42318]" };
    case "IN_PROGRESS":
      return { label: "In Progress", className: "bg-[#FFF1EC] text-[#FF6B35]" };
    case "RINGING":
    case "INITIATED":
      return { label: "Ringing", className: "bg-[#F2F4F7] text-[#475467]" };
    default:
      return { label: status, className: "bg-[#F2F4F7] text-[#475467]" };
  }
}
