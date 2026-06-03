/** Display helpers for lead rows, cards, and pills. */
import { STAGE_SCORE, HOT_SCORE_THRESHOLD, STAGE_OPTIONS } from "../constants";

export const formatRelativeUpdated = (iso?: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / (1000 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (diff < 60 * 1000) return "Just now";
  if (diff < 60 * 60 * 1000) return `${mins}m ago`;
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
};

/**
 * Normalize any stored stage/status string to one of the canonical
 * STAGE_OPTIONS. Exact (case-insensitive) matches win; legacy values
 * (Hot Prospect / Warm / New / Nurture / Cold-Lost / appointment / won / ...)
 * are mapped onto the nearest new stage so old data still renders sensibly.
 */
export const getStageValue = (lead: Record<string, unknown>): string => {
  const raw = String(lead.stage || lead.pipeline_stage || lead.status || "").trim();
  const lower = raw.toLowerCase();
  if (!lower) return "New Lead";

  const exact = STAGE_OPTIONS.find((s) => s.toLowerCase() === lower);
  if (exact) return exact;

  if (lower === "new") return "New Lead";
  if (lower === "nurture") return "Contacted";
  if (lower === "warm" || lower === "warm lead" || lower === "new warm lead") return "Engaged";
  if (lower.includes("hot")) return "Qualified";
  if (lower.includes("appointment") || lower === "pending confirmation") return "Appointment Set";
  if (lower === "active client" || lower === "active_client") return "Active Client";
  if (lower === "under contract" || lower === "pending") return "Under Contract";
  if (lower === "closed" || lower === "closed won" || lower === "won") return "Closed";
  if (
    lower === "lost" || lower === "closed lost" || lower === "archived" ||
    lower.includes("cold") || lower.includes("dead")
  )
    return "Lost";
  return "New Lead";
};

/** The lead's Score (%) - deterministic from its Stage. */
export const stageScore = (lead: Record<string, unknown>): number =>
  STAGE_SCORE[getStageValue(lead)] ?? 0;

/**
 * Bar + number colors for the Score column / pipeline cards. Low scores read
 * neutral gray (not orange), warming to orange in the mid range and emerald at
 * the top. Below 60 = gray, 60-89 = orange, 90+ = emerald.
 */
export const scoreColor = (score: number): { bar: string; text: string } => {
  if (score < 60) return { bar: "bg-gray-300", text: "text-gray-500" };
  if (score < 90) return { bar: "bg-orange-500", text: "text-orange-600" };
  return { bar: "bg-emerald-500", text: "text-emerald-600" };
};

/** Normalize lead_type from any backend variation. Falls back to "Unknown". */
export const getLeadType = (lead: Record<string, unknown>): string => {
  const raw = String(lead?.lead_type ?? "").trim().toLowerCase();
  if (raw === "buyer") return "Buyer";
  if (raw === "seller") return "Seller";
  if (raw === "both") return "Both";
  if (raw === "investor") return "Investor";
  if (raw === "renter") return "Renter";
  if (raw === "agent referral" || raw === "agent_referral") return "Agent Referral";
  return "Unknown";
};

/** Normalize AI status. */
export const getAiStatus = (lead: Record<string, unknown>): string => {
  const raw = String(lead?.ai_status ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "ai off" || raw === "ai_off") return "AI Off";
  if (raw === "outbound" || raw === "automation only" || raw === "automation_only") return "Automation Only";
  if (raw === "active" || raw === "ai active" || raw === "ai_active") return "AI Active";
  if (raw === "paused" || raw === "ai paused" || raw === "ai_paused") return "AI Paused";
  if (raw === "awaiting reply" || raw === "awaiting_reply") return "Awaiting Reply";
  if (raw === "human takeover" || raw === "human_takeover") return "Human Takeover";
  if (raw === "appointment booked" || raw === "appointment_booked") return "Appointment Booked";
  if (raw === "ai complete" || raw === "ai_complete" || raw === "completed" || raw === "complete") return "AI Complete";
  return "";
};

/** Returns the lead's area string if set, otherwise empty string. */
export const getAreaValue = (lead: Record<string, unknown>): string => {
  const raw = lead?.area ?? lead?.property_address ?? lead?.city;
  return raw != null ? String(raw).trim() : "";
};

export const leadTypePillClass = (t: string) => {
  const map: Record<string, string> = {
    Buyer: "bg-sky-100 text-sky-700",
    Seller: "bg-orange-100 text-orange-700",
    Unknown: "bg-gray-100 text-gray-600",
    Both: "bg-indigo-100 text-indigo-700",
    Investor: "bg-emerald-100 text-emerald-700",
    Renter: "bg-cyan-100 text-cyan-700",
    "Agent Referral": "bg-rose-100 text-rose-700",
  };
  return map[t] || "bg-gray-100 text-gray-600";
};

export const aiStatusPillClass = (s: string) => {
  const map: Record<string, string> = {
    "AI Off":            "bg-gray-50 text-gray-500 border border-gray-200",
    "Automation Only":   "bg-sky-50 text-sky-700 border border-sky-200",
    "AI Active":         "bg-emerald-50 text-emerald-700 border border-emerald-200",
    "AI Paused":         "bg-amber-50 text-amber-800 border border-amber-200",
    "Awaiting Reply":    "bg-blue-50 text-blue-700 border border-blue-200",
    "Human Takeover":    "bg-orange-50 text-orange-700 border border-orange-200",
    "Appointment Booked":"bg-purple-50 text-purple-700 border border-purple-200",
    "AI Complete":       "bg-teal-50 text-teal-700 border border-teal-200",
  };
  return map[s] || "bg-gray-100 text-gray-600";
};

export const stagePillClass = (stage: string) => {
  const map: Record<string, string> = {
    "New Lead": "bg-orange-100 text-orange-700",
    "Contacted": "bg-sky-100 text-sky-700",
    "Engaged": "bg-indigo-100 text-indigo-700",
    "Qualified": "bg-orange-100 text-orange-700",
    "Appointment Set": "bg-amber-100 text-amber-800",
    "Active Client": "bg-emerald-100 text-emerald-700",
    "Under Contract": "bg-teal-100 text-teal-700",
    "Closed": "bg-green-100 text-green-700",
    "Lost": "bg-gray-200 text-gray-600",
  };
  return map[stage] || "bg-gray-100 text-gray-700";
};

/** A small dot color per stage for the Pipeline column headers. */
export const stageDotColor = (stage: string): string => {
  const map: Record<string, string> = {
    "New Lead": "#F97316",
    "Contacted": "#F59E0B",
    "Engaged": "#3B82F6",
    "Qualified": "#F97316",
    "Appointment Set": "#8B5CF6",
    "Active Client": "#10B981",
    "Under Contract": "#14B8A6",
    "Closed": "#22C55E",
    "Lost": "#9CA3AF",
  };
  return map[stage] || "#9CA3AF";
};

export const getPriceRange = (lead: Record<string, unknown>): string => {
  const raw = lead.price_range ?? lead.budget ?? lead.list_price;
  if (raw == null || String(raw).trim() === "") return "-";
  return String(raw);
};

export const leadInitials = (name?: string | null) => {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return n.slice(0, 2).toUpperCase();
};

/** A lead is hot when its stage-derived score is above the hot threshold. */
export const isHotStage = (lead: Record<string, unknown>) =>
  stageScore(lead) > HOT_SCORE_THRESHOLD;
