/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

interface StepBody {
  step?: number;
  // Business-profile / pipeline fields collected by the redesigned wizard.
  brokerage?: string;
  market?: string;
  // Stored as biz_role (the `role` identifier is a table name in this schema).
  role?: string;
  goal_appts?: number;
  goal_deals?: number;
}

/** PUT/POST /api/onboarding/:userId/step - advance onboarding step. */
async function setStep(env: Env, userId: number, step: number) {
  const existing = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM onboarding_progress WHERE user_id = ?`, userId);
  if (existing) {
    await execute(
      env.D1DB,
      `UPDATE onboarding_progress SET step = ?, updated_at = ? WHERE user_id = ?`,
      step, nowIso(), userId,
    );
  } else {
    await execute(
      env.D1DB,
      `INSERT INTO onboarding_progress (user_id, step, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      userId, step, nowIso(), nowIso(),
    );
  }
}

/**
 * Persist the redesigned wizard's business-profile + pipeline answers. Brokerage
 * mirrors onto organization.name (so it shows app-wide); goals mirror onto the
 * org's KPI targets; market/role live on onboarding_progress (no org column).
 * All fields are optional - only what the current step sent is written.
 */
async function saveProfile(env: Env, userId: number, body: StepBody) {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (typeof body.brokerage === "string") { sets.push("brokerage = ?"); args.push(body.brokerage.trim().slice(0, 120)); }
  if (typeof body.market === "string") { sets.push("market = ?"); args.push(body.market.trim().slice(0, 120)); }
  if (typeof body.role === "string") { sets.push("biz_role = ?"); args.push(body.role.trim().slice(0, 40)); }
  if (typeof body.goal_appts === "number" && Number.isFinite(body.goal_appts)) { sets.push("goal_appts = ?"); args.push(Math.max(0, Math.round(body.goal_appts))); }
  if (typeof body.goal_deals === "number" && Number.isFinite(body.goal_deals)) { sets.push("goal_deals = ?"); args.push(Math.max(0, Math.round(body.goal_deals))); }
  if (sets.length) {
    await execute(env.D1DB, `UPDATE onboarding_progress SET ${sets.join(", ")} WHERE user_id = ?`, ...args, userId);
  }

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, userId);
  if (!membership) return;
  const brokerage = (body.brokerage || "").trim();
  if (brokerage) {
    await execute(env.D1DB, `UPDATE organization SET name = ? WHERE id = ?`, brokerage.slice(0, 120), membership.org_id);
  }
  const orgSets: string[] = [];
  const orgArgs: unknown[] = [];
  if (typeof body.goal_appts === "number" && Number.isFinite(body.goal_appts)) { orgSets.push("goal_appointments = ?"); orgArgs.push(Math.max(0, Math.round(body.goal_appts))); }
  if (typeof body.goal_deals === "number" && Number.isFinite(body.goal_deals)) { orgSets.push("goal_deals_closed = ?"); orgArgs.push(Math.max(0, Math.round(body.goal_deals))); }
  if (orgSets.length) {
    await execute(env.D1DB, `UPDATE organization SET ${orgSets.join(", ")} WHERE id = ?`, ...orgArgs, membership.org_id);
  }
}

async function handle(context: EventContext<Env, "userId", Record<string, unknown>>) {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const targetId = Number(params.userId);
  if (!Number.isInteger(targetId)) return error("Invalid user id", 400);
  if (targetId !== user.id) return error("Forbidden", 403);

  const body = (await readJson<StepBody>(request)) || {};
  const step = Number(body.step);
  if (!Number.isInteger(step)) return error("step must be an integer", 400);

  await setStep(env, targetId, step);
  await saveProfile(env, targetId, body);
  return json({ step });
}
export const onRequestPut: PagesFunction<Env> = handle;
export const onRequestPost: PagesFunction<Env> = handle;
