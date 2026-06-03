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
