/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryAll, queryFirst } from "./db.ts";

/**
 * The agent's property inventory. The inbound AI matches a buyer's criteria
 * against these via the search_listings tool. One source of truth for both the
 * /api/listings endpoints and the orchestrator tool.
 */
export interface ListingRow {
  id: number;
  org_id: number;
  user_id: number;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  property_type: string | null;
  listing_type: string;
  status: string;
  url: string | null;
  description: string | null;
  image_keys: string | null;   // JSON array of R2 object keys (listing photos)
  enabled: number;
  created_at: string;
  updated_at: string;
}

/** Parse a listing's image_keys JSON into an array of R2 keys. */
export function parseImageKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(String).filter(Boolean) : []; } catch { return []; }
}

/** Public, Telnyx-fetchable media URLs for a listing's photos (served from R2). */
export function listingMediaUrls(env: Env, keys: string[], max = 5): string[] {
  const base = (env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return keys.slice(0, max).map(
    (k) => `${base}/api/media/message-attachments/${k.split("/").map(encodeURIComponent).join("/")}`,
  );
}

export interface ListingCriteria {
  area?: string;          // matched against city / zip / address text
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  propertyType?: string;
  listingType?: string;   // sale | rent
  limit?: number;
}

// Hard cap on listings per agent - high but finite.
export const MAX_LISTINGS_PER_USER = 1000;

// Statuses the AI may offer to a buyer (a sold/off-market home is never shown).
const OFFERABLE = ["active", "coming_soon", "pending"];

/** Count of listings the AI could currently offer (enabled + offerable). */
export async function countOfferableListings(env: Env, orgId: number, userId: number): Promise<number> {
  const row = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM listing
      WHERE org_id = ? AND user_id = ? AND enabled = 1
        AND status IN ('active', 'coming_soon', 'pending')`,
    orgId, userId,
  );
  return row?.n ?? 0;
}

/**
 * Search the agent's offerable listings by a buyer's criteria. Filters that are
 * omitted are not applied; `area` is a fuzzy match across city/zip/address.
 * Ordered cheapest-first so the AI can lead with budget-friendly options.
 */
export async function searchListings(
  env: Env, orgId: number, userId: number, c: ListingCriteria,
): Promise<ListingRow[]> {
  const where: string[] = [
    "org_id = ?", "user_id = ?", "enabled = 1",
    `status IN (${OFFERABLE.map(() => "?").join(", ")})`,
  ];
  const args: unknown[] = [orgId, userId, ...OFFERABLE];

  if (c.area && c.area.trim()) {
    const like = `%${c.area.trim()}%`;
    where.push("(city LIKE ? OR zip LIKE ? OR address LIKE ? OR state LIKE ?)");
    args.push(like, like, like, like);
  }
  if (typeof c.minPrice === "number" && !Number.isNaN(c.minPrice)) { where.push("price >= ?"); args.push(c.minPrice); }
  if (typeof c.maxPrice === "number" && !Number.isNaN(c.maxPrice)) { where.push("price <= ?"); args.push(c.maxPrice); }
  if (typeof c.minBedrooms === "number" && !Number.isNaN(c.minBedrooms)) { where.push("bedrooms >= ?"); args.push(c.minBedrooms); }
  if (typeof c.minBathrooms === "number" && !Number.isNaN(c.minBathrooms)) { where.push("bathrooms >= ?"); args.push(c.minBathrooms); }
  if (c.propertyType && c.propertyType.trim()) { where.push("property_type = ?"); args.push(c.propertyType.trim()); }
  if (c.listingType && c.listingType.trim()) { where.push("listing_type = ?"); args.push(c.listingType.trim()); }

  const limit = Math.min(Math.max(c.limit ?? 6, 1), 25);
  return queryAll<ListingRow>(
    env.D1DB,
    `SELECT * FROM listing WHERE ${where.join(" AND ")} ORDER BY price ASC, id DESC LIMIT ?`,
    ...args, limit,
  );
}
