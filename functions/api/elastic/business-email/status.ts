/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * GET /api/elastic/business-email/status - caller's business-email connection.
 * Real Elastic provisioning (OTP / domain DNS records) is Phase 4; today we
 * report what's in the inbox_connection / business_email_verification tables.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const conn = await queryFirst<{ status: string | null; email_address: string | null; is_verified: number; can_receive: number }>(
    env.D1DB,
    `SELECT status, email_address, is_verified, can_receive FROM inbox_connection
      WHERE user_id = ? AND provider = 'elastic' ORDER BY id DESC LIMIT 1`,
    user.id,
  );
  if (!conn) {
    const pending = await queryFirst<{ email: string; verified_at: string | null }>(
      env.D1DB,
      `SELECT email, verified_at FROM business_email_verification
        WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      user.id,
    );
    return json({
      status: pending ? (pending.verified_at ? "otp_verified" : "otp_pending") : "not_connected",
      email: pending?.email ?? null,
      sending_records_verified: false,
      all_records_verified: false,
    });
  }
  return json({
    status: conn.status || "verified",
    email: conn.email_address,
    sending_records_verified: Boolean(conn.is_verified),
    all_records_verified: Boolean(conn.is_verified),
  });
};
