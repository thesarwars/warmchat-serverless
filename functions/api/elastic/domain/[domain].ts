/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { getDomainRecords } from "../../../_shared/elasticEmail.ts";

/** GET /api/elastic/domain/:domain - return persisted row + live ElasticEmail data. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const domain = String(params.domain || "").toLowerCase();
  if (!domain) return error("domain is required", 400);

  const local = await queryFirst(env.D1DB, `SELECT * FROM email_domain WHERE domain = ?`, domain);
  const live = await getDomainRecords(env, domain);
  return json({ local, live: live.ok ? live.data : null });
};
