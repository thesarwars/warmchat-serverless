/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { requireUser } from "../../_shared/auth.ts";
import { mockElasticSendEmail } from "../../_shared/mockSendApi.ts";

/**
 * POST /api/inbox/test-smtp - send a noop test email so the user can see
 * outbound delivery is working. Uses ElasticEmail REST since Workers can't
 * open raw SMTP.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ to?: string }>(request);
  const to = (body?.to || user.email || "").trim();
  if (!to) return error("to address is required", 400);

  const res = await mockElasticSendEmail(env, {
    to,
    subject: "WarmChats email test",
    isHtml: true,
    body: `<p>This is a test from WarmChats. If you received this, outbound email is working.</p>`,
  });
  if (!res.ok) return error(res.error || "Send failed", 502);
  return json({ success: true, messageId: res.messageId });
};
