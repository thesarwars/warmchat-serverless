/// <reference types="@cloudflare/workers-types" />
/**
 * Canonical lead Stage model (server side). Mirrors
 * src/components/leads/constants.ts + utils/leadDisplay.ts - keep the two in
 * sync. The lead's `status` column IS its Stage; the Score is a deterministic
 * function of the Stage, and "hot" means a score strictly above
 * HOT_SCORE_THRESHOLD. There is no separate rubric and no separate hot flag.
 */

export const STAGE_OPTIONS = [
  "New Lead",
  "Contacted",
  "Engaged",
  "Qualified",
  "Appointment Set",
  "Active Client",
  "Under Contract",
  "Closed",
  "Lost",
] as const;

export type Stage = (typeof STAGE_OPTIONS)[number];

export const STAGE_SCORE: Record<string, number> = {
  "Lost": 5,
  "New Lead": 10,
  "Contacted": 25,
  "Engaged": 45,
  "Qualified": 65,
  "Appointment Set": 80,
  "Active Client": 90,
  "Under Contract": 98,
  "Closed": 100,
};

export const HOT_SCORE_THRESHOLD = 45;

/** Stages whose score is above the hot threshold. */
export const HOT_STAGES: string[] = (STAGE_OPTIONS as readonly string[]).filter(
  (s) => (STAGE_SCORE[s] ?? 0) > HOT_SCORE_THRESHOLD,
);

/** Forward pipeline columns (Lost excluded - terminal/negative bucket). */
export const PIPELINE_STAGES: string[] = (STAGE_OPTIONS as readonly string[]).filter(
  (s) => s !== "Lost",
);

/** Normalize any stored status to one of STAGE_OPTIONS (legacy values mapped). */
export function normalizeStage(raw: string | null | undefined): string {
  const lower = String(raw ?? "").trim().toLowerCase();
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
}

/** The lead's Score (%) - deterministic from its Stage. */
export function stageScore(raw: string | null | undefined): number {
  return STAGE_SCORE[normalizeStage(raw)] ?? 0;
}

/** Is the given (normalized) stage hot? */
export function isHotStage(raw: string | null | undefined): boolean {
  return stageScore(raw) > HOT_SCORE_THRESHOLD;
}

/**
 * SQL boolean fragment: is the given status column "hot"? Matches the new hot
 * stages plus legacy hot-ish values so old rows still register. Contains only
 * hardcoded constants (no bind params, no user input) - safe to inline.
 */
export function hotStatusSql(col = "status"): string {
  const c = `LOWER(IFNULL(${col}, ''))`;
  return `(${c} IN ('qualified','appointment set','appointment booked','active client','under contract','closed') OR ${c} LIKE '%hot%' OR ${c} LIKE '%appointment%')`;
}
