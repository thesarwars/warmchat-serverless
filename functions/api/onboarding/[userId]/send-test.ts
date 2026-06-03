/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * POST /api/onboarding/:userId/send-test - would dispatch a test message via
 * the connected channel. The provider integrations are Phase 4, so this
 * acknowledges the request without actually sending.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const targetId = Number(params.userId);
  if (targetId !== user.id) return error("Forbidden", 403);

  const body = (await readJson<{ channel?: string }>(request)) || {};
  const channel = (body.channel || "email").toLowerCase();
  return json({ sent: false, channel, message: "Test send is not wired yet (Phase 4 provider integration)." });
};
