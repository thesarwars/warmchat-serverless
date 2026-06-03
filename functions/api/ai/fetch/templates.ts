/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/** GET /api/ai/fetch/templates?org_id=N */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(new URL(request.url).searchParams.get("org_id"));
  if (!Number.isInteger(orgId)) return error("org_id is required", 400);
  const rows = await queryAll(
    env.D1DB,
    `SELECT id, title, content, subject, channel, delay_days, delay_seconds, send_at, timezone,
            image_url, prompt, tone_id, preset_id, category_id, is_active, created_by
       FROM message_templates WHERE org_id = ? AND is_active = 1 ORDER BY id DESC`,
    orgId,
  );
  return json({ templates: rows });
};
