/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryAll, queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

interface Row {
  id: number; title: string; content: string;
  subject: string | null; channel: string | null;
  delay_days: number | null; delay_seconds: number | null; delay_label: string | null;
  send_at: string | null; timezone: string | null; image_url: string | null;
  prompt: string | null; is_active: number; agent: string | null;
  sent_count: number | null; last_used_at: string | null;
  tone_id: number | null; preset_id: number | null; category_id: number; org_id: number;
  category_name?: string | null;
  created_by: string | null;
}

const ser = (r: Row) => ({
  id: r.id, title: r.title, content: r.content, subject: r.subject, channel: r.channel,
  delay_days: r.delay_days, delay_seconds: r.delay_seconds, delay_label: r.delay_label,
  send_at: r.send_at, timezone: r.timezone, image_url: r.image_url, prompt: r.prompt,
  is_active: Boolean(r.is_active), agent: r.agent,
  sent_count: Number(r.sent_count ?? 0), last_used_at: r.last_used_at,
  tone_id: r.tone_id, preset_id: r.preset_id, category_id: r.category_id, org_id: r.org_id,
  category_name: r.category_name ?? null,
  created_by: r.created_by,
});

async function callerOrgId(env: Env, userId: number): Promise<number | null> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId);
  return row?.org_id ?? null;
}

/** GET /api/ai/templates -> list (filtered by caller's org). */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  // Optional ?agent= filter powers the per-agent Templates tab: it shows ONLY
  // that agent's curated library (the design's t-in-*/t-out-*/t-as-* set), not
  // the 60 automation packs (which are agent IS NULL). The category name is joined
  // in so the tab can render its filter chips (Reply / Qualify / Booking / ...).
  const url = new URL(request.url);
  const agent = url.searchParams.get("agent");

  const rows = agent && agent !== "all"
    ? await queryAll<Row>(
        env.D1DB,
        `SELECT mt.*, c.name AS category_name
           FROM message_templates mt
           LEFT JOIN template_categories c ON c.id = mt.category_id
          WHERE mt.org_id = ? AND mt.is_active = 1 AND mt.agent = ?
          ORDER BY mt.sent_count DESC, mt.id DESC`,
        orgId, agent,
      )
    : await queryAll<Row>(
        env.D1DB,
        `SELECT mt.*, c.name AS category_name
           FROM message_templates mt
           LEFT JOIN template_categories c ON c.id = mt.category_id
          WHERE mt.org_id = ? AND mt.is_active = 1
          ORDER BY mt.id DESC`,
        orgId,
      );
  return json({ templates: rows.map(ser) });
};

interface CreateBody {
  title?: string; content?: string; subject?: string; channel?: string;
  delay_days?: number; delay_seconds?: number; delay_label?: string;
  send_at?: string; timezone?: string; image_url?: string; prompt?: string;
  tone_id?: number; preset_id?: number; category_id?: number; agent?: string;
}

/** POST /api/ai/templates -> create a message template in caller's org. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = await callerOrgId(env, user.id);
  if (!orgId) return error("Forbidden", 403);

  const body = (await readJson<CreateBody>(request)) || {};
  const title = (body.title || "").trim();
  const content = (body.content || "").trim();
  const categoryId = Number(body.category_id);
  if (!title) return error("title is required", 400);
  if (!content) return error("content is required", 400);
  if (!Number.isInteger(categoryId)) return error("category_id is required", 400);

  const ins = await execute(
    env.D1DB,
    `INSERT INTO message_templates
       (title, content, subject, channel, delay_days, delay_seconds, delay_label,
        send_at, timezone, image_url, prompt, agent, tone_id, preset_id, category_id, org_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    title, content, body.subject ?? null, body.channel ?? null,
    body.delay_days ?? null, body.delay_seconds ?? null, body.delay_label ?? null,
    body.send_at ?? null, body.timezone ?? null, body.image_url ?? null, body.prompt ?? null,
    body.agent ?? null, body.tone_id ?? null, body.preset_id ?? null, categoryId, orgId, user.email,
  );
  const row = await queryFirst<Row>(env.D1DB, `SELECT * FROM message_templates WHERE id = ?`, Number(ins.meta.last_row_id));
  return json(ser(row!), 201);
};
