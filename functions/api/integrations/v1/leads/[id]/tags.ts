/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { queryFirst, execute } from "../../../../../_shared/db.ts";
import { requireApiKey } from "../../../../../_shared/apiAuth.ts";

/**
 * POST /api/integrations/v1/leads/:id/tags { tag } - attach a tag to a lead,
 * creating the org-scoped tag on demand (same model as the CSV import path).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const auth = await requireApiKey(env, request, "leads:write");
  if (!auth) return error("Invalid or missing API key", 401);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid lead id", 400);

  const body = (await readJson<{ tag?: string; name?: string }>(request)) || {};
  const tagName = (body.tag || body.name || "").trim();
  if (!tagName) return error("tag is required", 400);

  const lead = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM lead WHERE id = ? AND org_id = ?`,
    id,
    auth.orgId,
  );
  if (!lead) return error("Lead not found", 404);

  let tag = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM tags WHERE name = ? AND org_id = ?`,
    tagName,
    auth.orgId,
  );
  if (!tag) {
    const ins = await execute(env.D1DB, `INSERT INTO tags (name, org_id) VALUES (?, ?)`, tagName, auth.orgId);
    tag = { id: Number(ins.meta.last_row_id) };
  }
  await execute(env.D1DB, `INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)`, id, tag.id);

  return json({ ok: true, lead_id: id, tag: tagName });
};
