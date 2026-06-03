/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";

/** GET /api/inbox/fetch/:userId/:orgId - list threads for an org. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId) || !(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const threads = await queryAll(
    env.D1DB,
    `SELECT t.id, t.subject, t.created_at, t.updated_at, t.unread_count
       FROM thread t JOIN inbox i ON i.id = t.inbox_id
      WHERE i.org_id = ? ORDER BY t.updated_at DESC LIMIT 200`,
    orgId,
  );
  return json({ threads });
};
