/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/** Shared SMS+email connection snapshot. Reused by /api/bootstrap/me. */
export async function getChannelsSnapshot(env: Env, userId: number) {
  const u = await queryFirst<{
    telnyx_phone_number: string | null;
    telnyx_sms_status: string | null;
    telnyx_campaign_number_status: string | null;
  }>(
    env.D1DB,
    `SELECT telnyx_phone_number, telnyx_sms_status, telnyx_campaign_number_status FROM "user" WHERE id = ?`,
    userId,
  );

  const email = await queryFirst<{
    provider: string | null; email_address: string | null; status: string | null;
  }>(
    env.D1DB,
    `SELECT provider, email_address, status FROM email_connections
      WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
    userId,
  );
  const fallbackRow = email
    ? null
    : await queryFirst<{ provider: string | null; email_address: string | null; is_verified: number; can_receive: number }>(
        env.D1DB,
        `SELECT provider, email_address, is_verified, can_receive FROM inbox_connection
          WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
        userId,
      );

  return {
    sms: {
      connected: Boolean(u?.telnyx_phone_number),
      provider: "telnyx",
      phone_number: u?.telnyx_phone_number ?? null,
      status: u?.telnyx_sms_status ?? "not_connected",
      campaign_number_status: u?.telnyx_campaign_number_status ?? null,
    },
    email: {
      connected: Boolean(email || fallbackRow),
      provider: email?.provider ?? fallbackRow?.provider ?? null,
      address: email?.email_address ?? fallbackRow?.email_address ?? null,
      verified: email ? true : Boolean(fallbackRow?.is_verified),
      can_receive: email ? true : Boolean(fallbackRow?.can_receive),
    },
  };
}

/**
 * GET /api/me/channels -> { sms:{...}, email:{...} } connection status
 * (Telnyx SMS + email connection).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  return json(await getChannelsSnapshot(env, user.id));
};
