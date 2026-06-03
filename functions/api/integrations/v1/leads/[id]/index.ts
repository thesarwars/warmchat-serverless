/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../../_shared/http.ts";
import { queryFirst, execute } from "../../../../../_shared/db.ts";
import { requireApiKey } from "../../../../../_shared/apiAuth.ts";
import { tryNormalizeE164 } from "../../../../../_shared/phone.ts";
import { toLeadView } from "../../../../../_shared/integrationApi.ts";

interface UpdateBody {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  platform?: string;
  status?: string;
  notes?: string;
  lead_type?: string;
  intent?: string;
  estimated_price?: number;
  external_id?: string;
}

/** PATCH /api/integrations/v1/leads/:id - partial update, org-scoped. */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const auth = await requireApiKey(env, request, "leads:write");
  if (!auth) return error("Invalid or missing API key", 401);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return error("Invalid lead id", 400);

  const lead = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM lead WHERE id = ? AND org_id = ?`,
    id,
    auth.orgId,
  );
  if (!lead) return error("Lead not found", 404);

  const body = (await readJson<UpdateBody>(request)) || {};

  // Map provided fields to columns; COALESCE(?, col) leaves untouched values.
  const phone =
    body.phone != null ? (tryNormalizeE164(String(body.phone)) ?? String(body.phone)) : null;
  await execute(
    env.D1DB,
    `UPDATE lead SET
       name = COALESCE(?, name),
       first_name = COALESCE(?, first_name),
       last_name = COALESCE(?, last_name),
       email = COALESCE(?, email),
       phone = COALESCE(?, phone),
       company = COALESCE(?, company),
       source = COALESCE(?, source),
       platform = COALESCE(?, platform),
       status = COALESCE(?, status),
       notes = COALESCE(?, notes),
       lead_type = COALESCE(?, lead_type),
       intent = COALESCE(?, intent),
       estimated_price = COALESCE(?, estimated_price),
       external_id = COALESCE(?, external_id),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    body.name ?? null,
    body.first_name ?? null,
    body.last_name ?? null,
    body.email ?? null,
    phone,
    body.company ?? null,
    body.source ?? null,
    body.platform ?? null,
    body.status ?? null,
    body.notes ?? null,
    body.lead_type ?? null,
    body.intent ?? null,
    body.estimated_price ?? null,
    body.external_id ?? null,
    id,
  );

  const row = await queryFirst<Record<string, unknown>>(env.D1DB, `SELECT * FROM lead WHERE id = ?`, id);
  return json({ lead: toLeadView(row) });
};
