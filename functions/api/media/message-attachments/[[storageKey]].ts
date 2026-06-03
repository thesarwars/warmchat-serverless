/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { error } from "../../../_shared/http.ts";

/**
 * GET /api/media/message-attachments/:storage_key - serve a file from R2.
 * Supports nested keys (catch-all `[[storageKey]]`).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  const bucket = (env as unknown as { ATTACHMENTS?: R2Bucket }).ATTACHMENTS;
  if (!bucket) return error("Attachment storage not configured", 503);

  const raw = params.storageKey;
  let key = Array.isArray(raw) ? raw.join("/") : String(raw || "");
  // Older links encoded the `/` separator as %2F; decode so the R2 key matches.
  if (key.includes("%")) {
    try {
      key = decodeURIComponent(key);
    } catch {
      /* leave key as-is if it isn't valid percent-encoding */
    }
  }
  if (!key) return error("Missing key", 400);

  const obj = await bucket.get(key);
  if (!obj) return error("Not found", 404);
  const headers = new Headers();
  if (obj.httpMetadata?.contentType) headers.set("Content-Type", obj.httpMetadata.contentType);
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(obj.body, { headers });
};
