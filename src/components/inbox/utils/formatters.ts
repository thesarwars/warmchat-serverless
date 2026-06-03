import type { InboxAppointmentRecord } from "@/helpers/backend";
import type { ContactMessage } from "../types";

export function formatRelativeTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))}h`;
  if (diff < 7 * 86_400_000) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function stageBadgeClass(stage?: string | null) {
  const normalized = String(stage || "New").toLowerCase();
  if (normalized.includes("hot"))
    return "bg-red-50 text-red-700 border-red-200";
  if (normalized.includes("warm"))
    return "bg-amber-50 text-amber-700 border-amber-200";
  if (normalized.includes("appoint"))
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized.includes("nurture"))
    return "bg-sky-50 text-sky-700 border-sky-200";
  if (normalized.includes("cold") || normalized.includes("lost")) {
    return "bg-slate-100 text-slate-600 border-slate-200";
  }
  return "bg-orange-50 text-orange-700 border-orange-200";
}

export function latestPreviewMessage(messages: ContactMessage[]) {
  const latest = [...messages].sort((left, right) => {
    return (
      new Date(right.timestamp || 0).getTime() -
      new Date(left.timestamp || 0).getTime()
    );
  })[0];
  return latest?.body || "";
}

export function latestTimestamp(messages: ContactMessage[]) {
  const latest = [...messages].sort((left, right) => {
    return (
      new Date(right.timestamp || 0).getTime() -
      new Date(left.timestamp || 0).getTime()
    );
  })[0];
  return latest?.timestamp || null;
}

export function mergeAppointmentsById(
  existing: InboxAppointmentRecord[],
  incoming: InboxAppointmentRecord[],
): InboxAppointmentRecord[] {
  const map = new Map<number, InboxAppointmentRecord>();
  existing.forEach((a) => map.set(a.id, a));
  incoming.forEach((a) => map.set(a.id, a));
  return Array.from(map.values()).sort(
    (x, y) => new Date(x.starts_at).getTime() - new Date(y.starts_at).getTime(),
  );
}

function formatAppointmentTypeLabel(raw: string) {
  const s = String(raw || "")
    .replace(/_/g, " ")
    .trim();
  if (!s) return "Appointment";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatAppointmentCardLine(appointment: InboxAppointmentRecord) {
  const typeLabel = formatAppointmentTypeLabel(appointment.appointment_type);
  const d = new Date(appointment.starts_at);
  if (Number.isNaN(d.getTime())) return typeLabel;
  const dateStr = d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${typeLabel} - ${dateStr} @ ${timeStr}`;
}
