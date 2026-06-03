/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { mockElasticSendEmail } from "../../../_shared/mockSendApi.ts";

/** POST /api/domains/:domainId/send - verify outbound on a domain by sending a probe. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const id = Number(params.domainId);
  if (!Number.isInteger(id)) return error("Invalid id", 400);

  const row = await queryFirst<{ domain: string }>(env.D1DB, `SELECT domain FROM email_domain WHERE id = ?`, id);
  if (!row) return error("Domain not found", 404);

  const body = await readJson<{ to?: string }>(request);
  const to = (body?.to || user.email || "").trim();
  const res = await mockElasticSendEmail(env, {
    to,
    fromEmail: `noreply@${row.domain}`,
    subject: `WarmChats sender probe for ${row.domain}`,
    isHtml: true,
    body: `<p>Outbound delivery from <code>${row.domain}</code> is configured.</p>`,
  });
  if (!res.ok) return error(res.error || "Send failed", 502);
  return json({ success: true, messageId: res.messageId });
};
