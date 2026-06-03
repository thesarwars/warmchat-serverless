/// <reference types="@cloudflare/workers-types" />
/**
 * Estimated Pipeline Value calculation.
 *
 * Formula (per the product spec), per lead:
 *     price       = lead.estimated_price if set/positive else org.average_deal_price
 *     probability = STAGE_PROBABILITY[lead.status]   (DEFAULT_PROBABILITY if unknown)
 *     commission  = org.commission_percent / 100
 *     lead_value  = price * probability * commission
 * pipeline_value = sum(lead_value for all leads)
 */

export const DEFAULT_AVERAGE_DEAL_PRICE = 400000;
export const DEFAULT_COMMISSION_PERCENT = 2.5;
export const DEFAULT_PROBABILITY = 0.05; // used when stage is unknown / blank

/**
 * Canonical Stage -> close probability. The current stages mirror the
 * Stage/Score model (probability = score / 100); legacy keys are kept so old
 * rows still value sensibly. Matched case-insensitively.
 */
const STAGE_PROBABILITY: Record<string, number> = {
  // Current stages (probability = STAGE_SCORE / 100).
  "new lead": 0.10,
  "contacted": 0.25,
  "engaged": 0.45,
  "qualified": 0.65,
  "appointment set": 0.80,
  "active client": 0.90,
  "under contract": 0.98,
  "closed": 1.00,
  "lost": 0.05,
  // Legacy keys.
  "new": 0.05,
  "warm": 0.20,
  "warm lead": 0.20,
  "new warm lead": 0.20,
  "hot": 0.40,
  "hot prospect": 0.40,
  "hot lead": 0.40,
  "appointment pending": 0.60,
  "pending confirmation": 0.60,
  "appointment": 0.80,
  "appointment booked": 0.80,
  "closed won": 1.00,
  "won": 1.00,
  "cold / lost": 0.00,
  "cold/lost": 0.00,
  "dead / lost": 0.00,
  "dead/lost": 0.00,
  "closed lost": 0.00,
};

export function getStageProbability(stage: string | null | undefined): number {
  if (!stage) return DEFAULT_PROBABILITY;
  const key = String(stage).trim().toLowerCase();
  const p = STAGE_PROBABILITY[key];
  return p === undefined ? DEFAULT_PROBABILITY : p;
}

function toNumber(value: unknown, fallback: number | null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export interface PipelineLead {
  id?: number | string | null;
  status?: string | null;
  estimated_price?: number | null;
}

export interface PipelineResult {
  total: number;
  lead_count: number;
  average_deal_price: number;
  commission_percent: number;
}

/** Compute the estimated pipeline value across leads. */
export function calculatePipelineValue(
  leads: Iterable<PipelineLead>,
  opts: { averageDealPrice?: unknown; commissionPercent?: unknown },
): PipelineResult {
  const avg = toNumber(opts.averageDealPrice, DEFAULT_AVERAGE_DEAL_PRICE) ?? DEFAULT_AVERAGE_DEAL_PRICE;
  const commission = toNumber(opts.commissionPercent, DEFAULT_COMMISSION_PERCENT) ?? DEFAULT_COMMISSION_PERCENT;

  let total = 0;
  let counted = 0;
  for (const lead of leads) {
    const price = toNumber(lead.estimated_price, null);
    const priceUsed = price && price > 0 ? price : avg;
    const probability = getStageProbability(lead.status);
    total += priceUsed * probability * (commission / 100);
    counted += 1;
  }

  return {
    total,
    lead_count: counted,
    average_deal_price: avg,
    commission_percent: commission,
  };
}
