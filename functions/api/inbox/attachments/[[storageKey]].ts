/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * DELETE /api/inbox/attachments/:storage_key - remove one of the current
 * user's uploaded files from the ATTACHMENTS R2 bucket. Ownership is enforced
 * by requiring the key to live under the caller's `u{userId}/` prefix.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const bucket = (env as unknown as { ATTACHMENTS?: R2Bucket }).ATTACHMENTS;
  if (!bucket) return error("Attachment storage not configured", 503);

  const raw = params.storageKey;
  const key = Array.isArray(raw) ? raw.join("/") : String(raw || "");
  if (!key) return error("Missing key", 400);

  if (key !== `u${user.id}` && !key.startsWith(`u${user.id}/`)) {
    return error("You can only delete your own attachments", 403);
  }

  await bucket.delete(key);
  return json({ success: true, storage_key: key });
};
