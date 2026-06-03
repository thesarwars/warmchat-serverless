/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { sendEmail as elasticSendEmail, type SendEmailInput, type SendEmailResult } from "./elasticEmail.ts";
import { telnyxSendSms } from "./telnyx.ts";
import type { TelnyxResult } from "./telnyx.ts";
import { execute } from "./db.ts";
import { currentSecondBucket } from "./sendRateLimiter.ts";
import { isMockSendsEnabled } from "./appSettings.ts";

/**
 * Mock send layer. When `app_settings.mock_sends_enabled` is set (or, as a
 * fallback, `env.MOCK_SEND_APIS` is truthy), all outbound provider calls
 * insert a row into `mock_send_log` and return a synthetic success. When
 * unset, they pass straight through to the real helpers so auth flows
 * (forgot-password, OTPs) continue to work in prod.
 *
 * The DB-backed toggle is per-org (with a system-wide fallback row) so an
 * Owner can flip mocking on/off from /admin/debug without redeploying.
 *
 * Compliance: callers MUST pass `redact: true` for OTP / password-reset
 * sends so the plain-text body never lands in the debug log.
 */

type EnvLike = { D1DB: D1Database; MOCK_SEND_APIS?: string } & Partial<Env>;

/**
 * Back-compat sync probe that only checks the env-var fallback. Existing
 * callers that still need a sync answer (e.g. inside non-async tight loops)
 * can keep using this, but prefer `isMockSendsEnabled` for the live toggle.
 */
export function mockSendEnabled(env: EnvLike): boolean {
  const v = (env.MOCK_SEND_APIS || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export interface MockLogContext {
  orgId?: number | null;
  leadId?: number | null;
  automationId?: number | null;
  /** When true, body/subject are replaced with "[redacted: OTP]". */
  redact?: boolean;
  /** Whether the slot was acquired through the rate limiter (defaults true). */
  rateAcquired?: boolean;
  /** Override the second-bucket (defaults to current). */
  secondBucket?: number;
}

async function logToMockTable(
  env: EnvLike,
  channel: "sms" | "mms" | "email",
  provider: "telnyx" | "elastic" | "gmail",
  fromAddress: string | null,
  toAddress: string,
  subject: string | null,
  body: string | null,
  ctx: MockLogContext,
): Promise<void> {
  const redactedBody = ctx.redact ? "[redacted: OTP]" : (body ?? null);
  const redactedSubject = ctx.redact ? "[redacted]" : (subject ?? null);
  try {
    await execute(
      env.D1DB,
      `INSERT INTO mock_send_log
         (channel, provider, from_address, to_address, subject, body,
          org_id, lead_id, automation_id, rate_acquired, second_bucket)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      channel,
      provider,
      fromAddress,
      toAddress,
      redactedSubject,
      redactedBody,
      ctx.orgId ?? null,
      ctx.leadId ?? null,
      ctx.automationId ?? null,
      ctx.rateAcquired === false ? 0 : 1,
      ctx.secondBucket ?? currentSecondBucket(),
    );
  } catch (err) {
    // Failing the log row must not break the actual send result in mocked
    // mode - log to console and proceed with the synthetic success.
    console.error("mockSendApi: failed to insert mock_send_log", err);
  }
}

/** Mock-aware wrapper for telnyx.ts:telnyxSendSms. */
export async function mockTelnyxSendSms(
  env: Env,
  from: string,
  to: string,
  body: string,
  ctx: MockLogContext = {},
  opts: { messagingProfileId?: string; webhookUrl?: string; mediaUrls?: string[] } = {},
): Promise<TelnyxResult<{ id: string; to: Array<{ phone_number: string; status: string }> }>> {
  if (await isMockSendsEnabled(env, ctx.orgId ?? null)) {
    const channel: "sms" | "mms" = opts.mediaUrls && opts.mediaUrls.length ? "mms" : "sms";
    await logToMockTable(env, channel, "telnyx", from || null, to, null, body, ctx);
    const fakeId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      ok: true,
      data: { id: fakeId, to: [{ phone_number: to, status: "queued" }] },
    };
  }
  return telnyxSendSms(env, from, to, body, opts);
}

/** Mock-aware wrapper for elasticEmail.ts:sendEmail. */
export async function mockElasticSendEmail(
  env: Env,
  input: SendEmailInput,
  ctx: MockLogContext = {},
): Promise<SendEmailResult> {
  if (await isMockSendsEnabled(env, ctx.orgId ?? null)) {
    const to = Array.isArray(input.to) ? input.to.join(",") : input.to;
    const from = input.fromEmail || env.ELASTIC_SENDER_EMAIL || null;
    await logToMockTable(env, "email", "elastic", from, to, input.subject, input.body, ctx);
    return { ok: true, messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
  return elasticSendEmail(env, input);
}

/**
 * Mock-aware wrapper for Gmail sends. Returns a `{ id }` shaped object like
 * sendGmailMessage. Real callers wrap this in try/catch so the error path is
 * unchanged when mocking is off.
 */
export interface GmailLikeSendResult { id?: string; threadId?: string }
export async function mockGmailSendMessage(
  env: Env,
  fromEmail: string,
  to: string,
  subject: string,
  body: string,
  ctx: MockLogContext = {},
  realSend?: () => Promise<GmailLikeSendResult>,
): Promise<GmailLikeSendResult> {
  if (await isMockSendsEnabled(env, ctx.orgId ?? null)) {
    await logToMockTable(env, "email", "gmail", fromEmail || null, to, subject, body, ctx);
    return { id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
  if (!realSend) throw new Error("Gmail real-send callback missing");
  return realSend();
}
