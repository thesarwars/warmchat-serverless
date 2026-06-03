/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error, readJson } from "../../../../_shared/http.ts";
import { execute } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { canAccessCall } from "../../../../_shared/callingAccess.ts";

/**
 * POST /api/calling/calls/:callId/notes - add a manual note to a call (detail
 * panel "Add note"). Body: { body: string }.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const callId = String(params.callId || "");
  if (!callId) return error("callId is required", 400);
  if (!(await canAccessCall(env, user.id, callId))) return error("Forbidden", 403);

  const payload = (await readJson<{ body?: string }>(request)) || {};
  const noteBody = (payload.body ?? "").trim();
  if (!noteBody) return error("Note body is required", 400);

  const id = crypto.randomUUID();
  await execute(
    env.D1DB,
    `INSERT INTO call_notes (id, call_id, author_id, body) VALUES (?, ?, ?, ?)`,
    id, callId, user.id, noteBody,
  );
  return json({
    id, body: noteBody, authorId: String(user.id),
    authorName: user.name ?? null, createdAt: new Date().toISOString(),
  });
};
