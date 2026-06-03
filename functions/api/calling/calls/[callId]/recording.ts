/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { error } from "../../../../_shared/http.ts";
import { queryFirst } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { canAccessCall } from "../../../../_shared/callingAccess.ts";

/**
 * GET /api/calling/calls/:callId/recording[?type=voicemail] - stream a call
 * recording (or voicemail) from R2 behind the org access check. Supports HTTP
 * Range so the audio player can scrub. recording_url / voicemail_url hold the
 * R2 object key (set by the AI pipeline cron).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const callId = String(params.callId || "");
  if (!callId) return error("callId is required", 400);
  if (!(await canAccessCall(env, user.id, callId))) return error("Forbidden", 403);

  const bucket = (env as unknown as { ATTACHMENTS?: R2Bucket }).ATTACHMENTS;
  if (!bucket) return error("Recording storage not configured", 503);

  const kind = new URL(request.url).searchParams.get("type") === "voicemail" ? "voicemail" : "recording";
  const row = await queryFirst<{ recording_url: string | null; voicemail_url: string | null }>(
    env.D1DB, `SELECT recording_url, voicemail_url FROM calls WHERE id = ?`, callId,
  );
  const key = kind === "voicemail" ? row?.voicemail_url : row?.recording_url;
  if (!key) return error("No recording available", 404);

  // Range support for scrubbing.
  const rangeHeader = request.headers.get("Range");
  const range = parseRange(rangeHeader);
  const obj = await bucket.get(key, range ? { range } : undefined);
  if (!obj) return error("Recording not found", 404);

  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType || "audio/mpeg");
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Accept-Ranges", "bytes");

  if (range && obj.range && "offset" in obj.range) {
    const offset = obj.range.offset ?? 0;
    const length = obj.range.length ?? obj.size - offset;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { headers });
};

/** Parse a single `bytes=start-end` range into an R2 range option. */
function parseRange(header: string | null): { offset: number; length?: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : undefined;
  if (Number.isNaN(start)) return null;
  return end != null && !Number.isNaN(end) ? { offset: start, length: end - start + 1 } : { offset: start };
}
