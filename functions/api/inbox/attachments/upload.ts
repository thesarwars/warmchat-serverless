/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * POST /api/inbox/attachments/upload - multipart upload, returns a storage
 * key + downloadable URL. Requires the ATTACHMENTS R2 bucket binding (added
 * to wrangler.toml). If the binding isn't present we 503 with a clear message.
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
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

  const MAX_FILE_BYTES = 20 * 1024 * 1024;

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return error("No files uploaded", 400);

  const attachments = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return error(`${file.name || "File"} exceeds the 20MB limit`, 400);
    }

    const ext = file.name.split(".").pop() || "bin";
    const storageKey = `u${user.id}/${crypto.randomUUID()}.${ext}`;
    const contentType = file.type || "application/octet-stream";
    await bucket.put(storageKey, await file.arrayBuffer(), {
      httpMetadata: { contentType },
      customMetadata: { name: file.name },
    });

    attachments.push({
      id: storageKey,
      storage_key: storageKey,
      name: file.name,
      content_type: contentType,
      size: file.size,
      url: `${env.PUBLIC_BASE_URL}/api/media/message-attachments/${storageKey.split("/").map(encodeURIComponent).join("/")}`,
    });
  }

  return json({ attachments }, 200);
};
