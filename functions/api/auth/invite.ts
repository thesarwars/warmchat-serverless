/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute, nowIso } from "../../_shared/db.ts";
import { requireUser, randomId } from "../../_shared/auth.ts";
import { requireOrgRole } from "../../_shared/roleRequired.ts";
import { mockElasticSendEmail } from "../../_shared/mockSendApi.ts";

/**
 * POST /api/auth/invite - Owner/Manager invites a teammate by email.
 * Creates an `invite` row + emails the token link.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const body = await readJson<{ email?: string; role?: string; org_id?: number }>(request);
  const email = (body?.email || "").trim().toLowerCase();
  const roleName = (body?.role || "Representative").trim();
  if (!email) return error("email is required", 400);

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  const orgId = body?.org_id ?? membership?.org_id;
  if (!orgId) return error("User is not part of any organization", 403);

  const role = await requireOrgRole(env, user.id, orgId, "Owner", "Manager");
  if (!role) return error("Access forbidden: insufficient role", 403);

  const roleRow = await queryFirst<{ id: number }>(
    env.D1DB, `SELECT id FROM role WHERE name = ?`, roleName,
  );
  if (!roleRow) return error(`Unknown role: ${roleName}`, 400);

  const token = randomId(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await execute(
    env.D1DB,
    `INSERT INTO invite (email, org_id, role_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    email, orgId, roleRow.id, token, expiresAt, nowIso(),
  );

  const link = `${env.FRONTEND_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  // redact: invite token is in the body and must not be logged.
  await mockElasticSendEmail(env, {
    to: email,
    subject: `You've been invited to join WarmChats`,
    isHtml: true,
    body: `<p>${user.name || user.email} invited you to join their WarmChats workspace as a <b>${roleName}</b>.</p>
           <p><a href="${link}">Accept invitation</a></p>
           <p>Link expires in 7 days.</p>`,
  }, { redact: true, orgId });

  return json({ success: true });
};
