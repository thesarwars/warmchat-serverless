/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { execute, queryFirst } from "./db.ts";

// Hard cap on deals per org - high but finite, to bound storage/queries.
export const MAX_DEALS_PER_ORG = 5000;

/**
 * Deal pipeline taxonomy - the 4 categories and their ordered stages. MIRRORS
 * STAGE_SETS in src/components/deals/DealsPage.tsx (keep both in sync). The
 * inbound agent gets this in its system prompt so upsert_deal can set a valid
 * deal_type + stage key, and the AI "sees" the whole pipeline.
 */
const DEAL_PIPELINES: Record<string, { key: string; name: string }[]> = {
  buyer: [
    { key: "consult", name: "Buyer Consultation" }, { key: "search", name: "Home Search" },
    { key: "tours", name: "Property Tours" }, { key: "writing", name: "Offer Writing" },
    { key: "submitted", name: "Offer Submitted" }, { key: "contract", name: "Under Contract" },
    { key: "escrow", name: "Escrow" }, { key: "closed", name: "Closed Won" },
  ],
  seller: [
    { key: "consult", name: "Listing Consultation" }, { key: "signed", name: "Agreement Signed" },
    { key: "prepping", name: "Prepping Property" }, { key: "active", name: "Active Listing" },
    { key: "received", name: "Offer Received" }, { key: "contract", name: "Under Contract" },
    { key: "escrow", name: "Escrow" }, { key: "closed", name: "Closed Won" },
  ],
  renter: [
    { key: "consult", name: "Renter Consultation" }, { key: "search", name: "Property Search" },
    { key: "showings", name: "Showings" }, { key: "application", name: "Application Submitted" },
    { key: "screening", name: "Screening" }, { key: "approved", name: "Approved" },
    { key: "lease", name: "Lease Signed" }, { key: "closed", name: "Moved In" },
  ],
};

/** Render DEAL_PIPELINES as prompt text (one line per category, key (Name) chain). */
export function dealPipelineText(): string {
  return Object.entries(DEAL_PIPELINES)
    .map(([type, stages]) => `- ${type}: ${stages.map((s) => `${s.key} (${s.name})`).join(" -> ")}`)
    .join("\n");
}

/** Display name for a stage key within a pipeline (falls back to the key). */
export function dealStageName(dealType: string | null, key: string | null): string {
  if (!key) return "";
  const stages = DEAL_PIPELINES[(dealType || "").toLowerCase()] || [];
  return stages.find((s) => s.key === key)?.name || key;
}

/**
 * Major (money/legal) milestones the AI may NOT apply directly - per Deals.md
 * "AI should not make major stage changes without confidence". These become an
 * ai_suggested_stage the agent confirms from the deal card.
 */
const MAJOR_DEAL_STAGES = new Set(["signed", "contract", "escrow", "closed", "lease"]);

const stageIndex = (dealType: string, key: string): number =>
  (DEAL_PIPELINES[dealType] || []).findIndex((s) => s.key === key);

/**
 * Shared deal upsert - one deal per lead (deal.lead_id is UNIQUE) when a lead is
 * linked; pass leadId = null to create a standalone deal (the Deals board "Add
 * Deal" with no lead). Used by POST /api/deals and the AI agent's upsert_deal
 * tool (move pipeline stage / set value as a conversation progresses).
 */
export interface DealUpsert {
  name?: string | null;
  dealType?: string | null;       // buyer | seller | renter
  stage?: string | null;
  value?: number | null;
  commission?: number | null;
  closeDate?: string | null;
  description?: string | null;
  probability?: number | null;
  status?: string | null;        // open | won | lost | archived
  statusSource?: "auto" | "manual";
}

// Maps DealUpsert keys -> deal columns (only the simple scalar columns).
const COL: Array<[keyof DealUpsert, string]> = [
  ["name", "name"],
  ["dealType", "deal_type"],
  ["stage", "stage"],
  ["value", "value"],
  ["commission", "commission"],
  ["closeDate", "close_date"],
  ["description", "description"],
  ["probability", "probability"],
];

export async function upsertDealForLead(
  env: Env, orgId: number, leadId: number | null, fields: DealUpsert,
): Promise<number> {
  const existing = leadId == null
    ? null
    : await queryFirst<{ id: number }>(env.D1DB, `SELECT id FROM deal WHERE lead_id = ? LIMIT 1`, leadId);

  if (existing) {
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const [key, col] of COL) {
      if (fields[key] !== undefined) { sets.push(`${col} = ?`); args.push(fields[key]); }
    }
    if (fields.status !== undefined) {
      sets.push("status = ?"); args.push(fields.status);
      sets.push("status_source = ?"); args.push(fields.statusSource ?? "auto");
    }
    if (sets.length) {
      args.push(existing.id);
      await execute(env.D1DB, `UPDATE deal SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...args);
    }
    return existing.id;
  }

  const ins = await execute(
    env.D1DB,
    `INSERT INTO deal (org_id, lead_id, name, deal_type, stage, value, commission, close_date, description, probability, status, status_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orgId, leadId,
    fields.name ?? null, fields.dealType ?? null, fields.stage ?? null,
    fields.value ?? null, fields.commission ?? null, fields.closeDate ?? null,
    fields.description ?? null, fields.probability ?? null,
    fields.status ?? "open", fields.statusSource ?? "auto",
  );
  return Number(ins.meta.last_row_id);
}

/** What the AI asked to do with the lead's deal (upsert_deal tool args). */
export interface AiDealUpdate {
  dealType?: string | null;
  stage?: string | null;
  value?: number | null;
  probability?: number | null;
  status?: string | null;    // open | won | lost (archived is agent-only)
  reason?: string | null;    // short quote of what the lead said
}

export type AiDealResult =
  | { kind: "invalid"; message: string }
  | { kind: "applied"; dealId: number; stage: string | null; stageDisplay: string }
  | { kind: "suggested"; dealId: number; stage: string; stageDisplay: string; reason: string | null };

/**
 * Two-tier guard for AI deal updates (Deals.md "AI Stage Updates"):
 * - SAFE moves (forward, non-major stage) apply directly with status_source='auto'.
 * - MAJOR milestones (signed/contract/escrow/closed/lease), backward moves, and
 *   won/lost status changes are NOT applied - they are recorded as
 *   ai_suggested_stage (+ reason) for the agent to accept/dismiss on the card.
 * Creates the deal (at the requested safe stage, or the pipeline's first stage
 * when the request was major) if the lead has none yet.
 */
export async function applyAiDealUpdate(
  env: Env, orgId: number, leadId: number, update: AiDealUpdate,
): Promise<AiDealResult> {
  const existing = await queryFirst<{ id: number; deal_type: string | null; stage: string | null; status: string }>(
    env.D1DB, `SELECT id, deal_type, stage, status FROM deal WHERE lead_id = ? LIMIT 1`, leadId,
  );

  const dealType = (update.dealType || existing?.deal_type || "buyer").toLowerCase();
  const pipeline = DEAL_PIPELINES[dealType];
  if (!pipeline) {
    return { kind: "invalid", message: `Unknown deal_type "${dealType}". Use buyer, seller or renter.` };
  }
  const targetStage = update.stage ? String(update.stage).toLowerCase() : null;
  if (targetStage && stageIndex(dealType, targetStage) < 0) {
    return {
      kind: "invalid",
      message: `"${targetStage}" is not a stage of the ${dealType} pipeline. Valid keys: ${pipeline.map((s) => s.key).join(", ")}.`,
    };
  }

  // Won from the AI is a closing claim - route it through the suggestion path
  // (suggest the final stage) instead of flipping the deal's status. Lost is
  // for the agent to decide; tell the AI to hand it off instead.
  if (update.status === "lost" || update.status === "archived") {
    return { kind: "invalid", message: "Do not mark deals lost/archived directly - use create_task or escalate_to_agent so the agent can close out the deal." };
  }
  const closingStatus = update.status === "won";
  const suggestedClose = closingStatus ? pipeline[pipeline.length - 1].key : null;

  const fields: DealUpsert = { statusSource: "auto", dealType };
  if (update.value !== undefined && update.value !== null) fields.value = update.value;
  if (update.probability !== undefined && update.probability !== null) fields.probability = update.probability;
  if (update.status === "open") fields.status = "open";

  const currentIdx = existing?.stage ? stageIndex(dealType, existing.stage) : -1;
  const targetIdx = targetStage ? stageIndex(dealType, targetStage) : -1;
  const isMajor = targetStage ? MAJOR_DEAL_STAGES.has(targetStage) : false;
  const isBackward = targetStage !== null && currentIdx >= 0 && targetIdx < currentIdx;
  const wantsSuggestion = (targetStage && (isMajor || isBackward)) || closingStatus;

  if (!wantsSuggestion) {
    // Safe: apply the stage (if any) directly. New deals are created at the
    // requested stage or the pipeline's first stage.
    if (targetStage) fields.stage = targetStage;
    else if (!existing) fields.stage = pipeline[0].key;
    const dealId = await upsertDealForLead(env, orgId, leadId, fields);
    if (targetStage) {
      // A confirmed forward move supersedes any pending suggestion at or below it.
      await execute(
        env.D1DB,
        `UPDATE deal SET ai_suggested_stage = NULL, ai_suggestion_reason = NULL
          WHERE id = ? AND ai_suggested_stage = ?`,
        dealId, targetStage,
      );
    }
    const stage = targetStage ?? existing?.stage ?? fields.stage ?? null;
    return { kind: "applied", dealId, stage, stageDisplay: dealStageName(dealType, stage) };
  }

  // Major/backward/closing: keep the deal where it is (creating it at the first
  // stage when missing), and record the suggestion for the agent.
  const suggestion = (targetStage || suggestedClose) as string;
  if (!existing) fields.stage = pipeline[0].key;
  const reason = update.reason ? String(update.reason).slice(0, 300) : null;
  const dealId = await upsertDealForLead(env, orgId, leadId, fields);
  await execute(
    env.D1DB,
    `UPDATE deal SET ai_suggested_stage = ?, ai_suggestion_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    suggestion, reason, dealId,
  );
  return { kind: "suggested", dealId, stage: suggestion, stageDisplay: dealStageName(dealType, suggestion), reason };
}

/**
 * Create the lead's deal at its pipeline's first stage if none exists yet (the
 * "deal birth" moment: qualification complete / appointment booked). Never
 * moves an existing deal. Returns the new deal id, or null when one exists or
 * the lead type doesn't map to a pipeline.
 */
export async function ensureDealForLead(
  env: Env, orgId: number, leadId: number, leadType: string | null, value?: number | null,
): Promise<number | null> {
  const type = (leadType || "").toLowerCase() === "both" ? "buyer" : (leadType || "").toLowerCase();
  const pipeline = DEAL_PIPELINES[type];
  if (!pipeline) return null;
  const existing = await queryFirst<{ id: number }>(env.D1DB, `SELECT id FROM deal WHERE lead_id = ? LIMIT 1`, leadId);
  if (existing) return null;
  return upsertDealForLead(env, orgId, leadId, {
    dealType: type, stage: pipeline[0].key, value: value ?? null, statusSource: "auto",
  });
}

/**
 * Replace a deal's assigned team members. The creator is always kept; brokers
 * (Owner/Manager) may pass additional userIds. Existing rows are cleared first.
 */
export async function setDealAssignees(env: Env, dealId: number, userIds: number[]): Promise<void> {
  await execute(env.D1DB, `DELETE FROM deal_assignee WHERE deal_id = ?`, dealId);
  const unique = [...new Set(userIds.filter((n) => Number.isInteger(n)))];
  for (const uid of unique) {
    await execute(
      env.D1DB,
      `INSERT OR IGNORE INTO deal_assignee (deal_id, user_id) VALUES (?, ?)`,
      dealId, uid,
    );
  }
}
