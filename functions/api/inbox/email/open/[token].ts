/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { execute, nowIso } from "../../../../_shared/db.ts";

/**
 * GET /api/inbox/email/open/:token(.gif)? - open-tracking pixel.
 *
 * The outbound email body includes an `<img>` pointing here. When the
 * recipient's client loads remote images we flip `opened_at` on the matching
 * inbox_messages row (only if it was NULL - we keep the first open). The
 * response is always a 1x1 transparent GIF so mail clients never see an
 * error placeholder, regardless of whether the token matches.
 */

// 43-byte 1x1 transparent GIF.
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function pixelResponse(): Response {
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.byteLength),
      // Some mail clients cache the pixel aggressively; busting helps but
      // some opens still won't be counted. That's a known limitation of
      // image-based open tracking.
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  const raw = String(params.token || "");
  // The URL embeds the token as "<uuid>.gif" so mail clients treat it like
  // an image. Strip any trailing extension before the lookup.
  const token = raw.replace(/\.(gif|png|jpg|jpeg)$/i, "");

  if (token) {
    try {
      // Only set opened_at the first time so we don't churn the row on every
      // image refresh. Errors here must never break the pixel response - the
      // recipient should always see a clean 1x1 image.
      await execute(
        env.D1DB,
        `UPDATE inbox_messages
            SET opened_at = ?
          WHERE tracking_token = ? AND opened_at IS NULL`,
        nowIso(),
        token,
      );
    } catch {
      // swallow - tracking failure must not affect rendering
    }
  }

  return pixelResponse();
};
