/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { queryFirst } from "../../_shared/db.ts";
import { buildFollowupSteps, createSequence } from "../../_shared/sequenceService.ts";

/** POST /api/sequences - create a sequence definition. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{
    title?: string; org_id?: number; channel?: "email" | "sms";
    steps?: Array<{ delay_days?: number; delay_seconds?: number; subject?: string | null; message: string }>;
  }>(request);
  if (!body?.title || !Array.isArray(body?.steps)) return error("title and steps are required", 400);
  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  const orgId = body.org_id ?? m?.org_id;
  if (!orgId) return error("User not in any organization", 403);

  const steps = buildFollowupSteps(body.steps, body.channel || "email");
  if (steps.length === 0) return error("steps cannot be empty", 400);
  const id = await createSequence(env, user.id, orgId, body.title, steps);
  return json({ success: true, id }, 201);
};
