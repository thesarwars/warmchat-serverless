/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";

/**
 * GET /api/public/agents/:slug - public agent profile (no auth).
 * Returns minimal info for the public agent page / opt-in form.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  const slug = String(params.slug || "").trim();
  if (!slug) return error("slug is required", 400);

  const row = await queryFirst<{
    id: number; name: string | null; email: string; agent_slug: string;
    telnyx_phone_number: string | null;
  }>(
    env.D1DB,
    `SELECT id, name, email, agent_slug, telnyx_phone_number FROM "user" WHERE agent_slug = ?`,
    slug,
  );
  if (!row) return error("Agent not found", 404);
  return json({
    agent_slug: row.agent_slug,
    name: row.name,
    email: row.email,
    phone: row.telnyx_phone_number,
  });
};
