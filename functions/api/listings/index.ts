/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { callerOrgId } from "../../_shared/aiAgents.ts";
import { type ListingRow, MAX_LISTINGS_PER_USER, parseImageKeys, listingMediaUrls } from "../../_shared/listings.ts";

/** GET /api/listings - the caller's property inventory + the search toggle. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("No organization", 403);

  const rows = await queryAll<ListingRow>(
    env.D1DB,
    `SELECT * FROM listing WHERE org_id = ? AND user_id = ? ORDER BY id DESC`,
    orgId, user.id,
  );
  // Surface photos as aligned {key,url} pairs (served from R2) for display + delete.
  const listings = rows.map((l) => {
    const keys = parseImageKeys(l.image_keys);
    const urls = listingMediaUrls(env, keys, 8);
    return { ...l, images: keys.map((k, i) => ({ key: k, url: urls[i] })) };
  });
  const s = await queryFirst<{ listing_search_enabled: number }>(
    env.D1DB, `SELECT listing_search_enabled FROM auto_response_settings WHERE user_id = ?`, user.id);
  // Default ON when no settings row exists yet (matches the column default).
  const searchEnabled = s ? s.listing_search_enabled === 1 : true;
  return json({ listings, settings: { search_enabled: searchEnabled } });
};

// Numeric coercion helpers: keep nulls null, ignore non-numeric input.
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

/** POST /api/listings - add a property to the inventory. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("No organization", 403);

  const b = (await readJson<Record<string, unknown>>(request)) || {};
  const address = String(b.address ?? "").trim();
  if (!address) return error("An address is required", 400);

  const countRow = await queryFirst<{ n: number }>(
    env.D1DB, `SELECT COUNT(*) AS n FROM listing WHERE org_id = ? AND user_id = ?`, orgId, user.id);
  if ((countRow?.n ?? 0) >= MAX_LISTINGS_PER_USER) {
    return error(`You have reached the maximum of ${MAX_LISTINGS_PER_USER} listings. Delete some first.`, 400);
  }

  const imageKeys = Array.isArray(b.image_keys) ? JSON.stringify(b.image_keys.map(String).slice(0, 8)) : null;
  const ins = await execute(
    env.D1DB,
    `INSERT INTO listing
       (org_id, user_id, address, city, state, zip, price, bedrooms, bathrooms, square_feet,
        property_type, listing_type, status, url, description, image_keys, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orgId, user.id, address,
    b.city ? String(b.city) : null, b.state ? String(b.state) : null, b.zip ? String(b.zip) : null,
    num(b.price), num(b.bedrooms), num(b.bathrooms), intOrNull(b.square_feet),
    b.property_type ? String(b.property_type) : null,
    b.listing_type ? String(b.listing_type) : "sale",
    b.status ? String(b.status) : "active",
    b.url ? String(b.url) : null,
    b.description ? String(b.description) : null,
    imageKeys,
    b.enabled === false || b.enabled === 0 ? 0 : 1,
  );
  return json({ id: Number(ins.meta.last_row_id) }, 201);
};
