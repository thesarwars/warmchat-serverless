/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { execute } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * POST /api/flows/activate - flips onboarding_progress.flow_activated = 1.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  await execute(
    env.D1DB,
    `INSERT INTO onboarding_progress (user_id, flow_activated) VALUES (?, 1)
     ON CONFLICT(user_id) DO UPDATE SET flow_activated = 1, updated_at = CURRENT_TIMESTAMP`,
    user.id,
  );
  return json({ success: true });
};
