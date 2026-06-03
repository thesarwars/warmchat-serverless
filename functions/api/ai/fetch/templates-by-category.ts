/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isOrgMember } from "../../../_shared/orgAccess.ts";

/**
 * GET /api/ai/fetch/templates-by-category?org_id=:id
 * Groups templates under their categories (used by AutomationTemplates.tsx).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(new URL(request.url).searchParams.get("org_id"));
  if (!Number.isInteger(orgId)) return error("org_id is required", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const categories = await queryAll<{ id: number; name: string }>(
    env.D1DB,
    `SELECT id, name FROM template_categories WHERE org_id = ? AND is_active = 1 ORDER BY id ASC`,
    orgId,
  );
  const templates = await queryAll<{
    id: number; title: string; content: string; subject: string | null;
    channel: string | null; category_id: number;
  }>(
    env.D1DB,
    `SELECT id, title, content, subject, channel, category_id
       FROM message_templates WHERE org_id = ? AND is_active = 1`,
    orgId,
  );
  const byCat = new Map<number, typeof templates>();
  for (const t of templates) {
    const list = byCat.get(t.category_id) ?? [];
    list.push(t);
    byCat.set(t.category_id, list);
  }
  return json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      templates: byCat.get(c.id) ?? [],
    })),
  );
};
