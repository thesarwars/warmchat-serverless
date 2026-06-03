/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * GET / POST / PUT /api/onboarding/:userId/plan - read or update the
 * organization's plan (Free / Paid). Mutates organization.plan since the org
 * (not the user) owns billing state.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const targetId = Number(params.userId);
  if (targetId !== user.id) return error("Forbidden", 403);

  const row = await queryFirst<{ plan: string | null; subscription_status: string | null; org_id: number }>(
    env.D1DB,
    `SELECT o.plan, o.subscription_status, o.id AS org_id
       FROM membership m JOIN organization o ON o.id = m.org_id
      WHERE m.user_id = ? LIMIT 1`,
    user.id,
  );
  if (!row) return error("Not part of an organization", 403);
  return json({ plan: row.plan, subscription_status: row.subscription_status, org_id: row.org_id });
};

async function write(env: Env, userId: number, plan: string) {
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId);
  if (!m) return null;
  await execute(env.D1DB, `UPDATE organization SET plan = ? WHERE id = ?`, plan, m.org_id);
  return m.org_id;
}

async function handle(context: EventContext<Env, "userId", Record<string, unknown>>) {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const targetId = Number(params.userId);
  if (targetId !== user.id) return error("Forbidden", 403);

  const body = (await readJson<{ plan?: string; plan_id?: string }>(request)) || {};
  const plan = (body.plan || body.plan_id || "").trim();
  if (!plan) return error("plan is required", 400);
  const orgId = await write(env, user.id, plan);
  if (!orgId) return error("Not part of an organization", 403);
  return json({ user_id: user.id, plan, org_id: orgId });
}
export const onRequestPost: PagesFunction<Env> = handle;
export const onRequestPut: PagesFunction<Env> = handle;
