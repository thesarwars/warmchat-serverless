/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * GET /api/inbox/attachments - list the current user's uploaded attachments
 * (the `u{userId}/` prefix in the ATTACHMENTS R2 bucket) so the gallery
 * dropdown can show files, sizes and totals. Requires the ATTACHMENTS binding.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const bucket = (env as unknown as { ATTACHMENTS?: R2Bucket }).ATTACHMENTS;
  if (!bucket) {
    return error(
      "Attachment storage is not configured. Set up the ATTACHMENTS R2 binding in wrangler.toml.",
      503,
    );
  }

  const prefix = `u${user.id}/`;
  const attachments = [];
  let totalBytes = 0;
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({ prefix, cursor, include: ["customMetadata", "httpMetadata"] } as Parameters<typeof bucket.list>[0]);
    for (const obj of listed.objects) {
      const ext = obj.key.split(".").pop() || "bin";
      totalBytes += obj.size;
      attachments.push({
        id: obj.key,
        storage_key: obj.key,
        name: obj.customMetadata?.name || obj.key.slice(prefix.length),
        content_type: obj.httpMetadata?.contentType || `application/octet-stream`,
        size: obj.size,
        uploaded_at: obj.uploaded?.toISOString?.() ?? null,
        url: `${env.PUBLIC_BASE_URL}/api/media/message-attachments/${obj.key.split("/").map(encodeURIComponent).join("/")}`,
        _ext: ext,
      });
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  attachments.sort((a, b) => (b.uploaded_at || "").localeCompare(a.uploaded_at || ""));

  return json({
    attachments: attachments.map(({ _ext, ...rest }) => rest),
    total_bytes: totalBytes,
    count: attachments.length,
  });
};
