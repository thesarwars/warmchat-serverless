/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { addInboundRoute } from "../../../_shared/elasticEmail.ts";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ domain?: string }>(request);
  const domain = (body?.domain || "").trim().toLowerCase();
  if (!domain) return error("domain is required", 400);
  const res = await addInboundRoute(env, domain, env.ELASTIC_WEBHOOK_URL);
  if (!res.ok) return error(res.error || "Inbound route retry failed", 502);
  return json({ success: true });
};
