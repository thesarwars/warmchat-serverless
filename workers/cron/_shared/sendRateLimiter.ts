/// <reference types="@cloudflare/workers-types" />

/**
 * Per-second send-rate limiter backed by the `send_rate_counter` D1 table.
 *
 * Why D1 and not KV? Two callers from the same cron tick may race to acquire
 * a slot on the same (channel, sender, second). KV is eventually consistent;
 * D1 gives us a unique index + an atomic conditional UPDATE so we never blow
 * past the cap. The trade-off is two queries per slot, which is acceptable
 * because we only fire this from the cron worker (not user-facing latency).
 *
 * Caps (defaults below) come from each provider's documented limits:
 *   - Telnyx SMS: 49/sec per 10DLC number
 *   - Telnyx MMS: 14/sec per 10DLC number
 *   - ElasticEmail: 10/sec per sending domain (conservative; raise once
 *     production data backs a higher number)
 */

type EnvLike = { D1DB: D1Database };

export type SendChannel = "sms" | "mms" | "email";

export interface RateLimits {
  sms_per_sec: number;
  mms_per_sec: number;
  email_per_sec: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  sms_per_sec: 49,
  mms_per_sec: 14,
  email_per_sec: 10,
};

function limitFor(channel: SendChannel, limits: RateLimits): number {
  switch (channel) {
    case "sms": return limits.sms_per_sec;
    case "mms": return limits.mms_per_sec;
    case "email": return limits.email_per_sec;
  }
}

/**
 * Per-hour, per-org send caps for OUTBOUND campaign drips. This paces bulk
 * campaigns so a large audience drips out over hours instead of a spike that
 * harms sender reputation or trips Telnyx/ElasticEmail limits. Inbound AI
 * replies are NOT capped by this (they're time-sensitive). Kept comfortably
 * under provider ceilings; raise once reputation/usage data supports it.
 */
export interface HourlyLimits {
  sms_per_hour: number;
  email_per_hour: number;
}

export const DEFAULT_HOURLY_LIMITS: HourlyLimits = {
  sms_per_hour: 150,
  email_per_hour: 400,
};

/** Floor of the current epoch hour. Bucket key for the hourly limiter. */
export function currentHourBucket(): number {
  return Math.floor(Date.now() / 3_600_000);
}

/**
 * Try to reserve one OUTBOUND send slot for an org+channel in the current hour.
 * Returns true if within budget (dispatch), false if the hour's cap is reached
 * (caller HOLDS the row in 'scheduled' so it resumes next hour - never dropped).
 * Reuses the atomic send_rate_counter pattern with an "hour:org:<id>" sender key
 * and an hour bucket, so it can't collide with the per-second rows.
 */
export async function tryAcquireHourlySlot(
  env: EnvLike,
  channel: SendChannel,
  orgId: number,
  limits: HourlyLimits = DEFAULT_HOURLY_LIMITS,
  bucket: number = currentHourBucket(),
): Promise<boolean> {
  const limit = channel === "email" ? limits.email_per_hour : limits.sms_per_hour; // mms shares the sms budget
  if (limit <= 0) return false;
  const key = `hour:org:${orgId}`;

  await env.D1DB.prepare(
    `INSERT OR IGNORE INTO send_rate_counter (channel, sender_key, second_bucket, count)
     VALUES (?, ?, ?, 0)`,
  ).bind(channel, key, bucket).run();

  const res = await env.D1DB.prepare(
    `UPDATE send_rate_counter
        SET count = count + 1
      WHERE channel = ? AND sender_key = ? AND second_bucket = ? AND count < ?`,
  ).bind(channel, key, bucket, limit).run();

  return Number((res.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
}

/** Floor of the current epoch second. Used as the bucket key. */
export function currentSecondBucket(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Try to reserve one send slot for (channel, senderKey) in the current
 * second. Returns true if the slot was acquired (caller may dispatch);
 * false if the bucket is full (caller defers to the next tick).
 *
 * The implementation does:
 *   1. INSERT OR IGNORE the row at count=0 to guarantee it exists.
 *   2. UPDATE ... SET count = count + 1 WHERE count < <limit>
 *   3. Inspect meta.changes - 1 means we won the slot, 0 means full.
 */
export async function tryAcquireSlot(
  env: EnvLike,
  channel: SendChannel,
  senderKey: string,
  limits: RateLimits = DEFAULT_RATE_LIMITS,
  bucket: number = currentSecondBucket(),
): Promise<boolean> {
  const limit = limitFor(channel, limits);
  if (limit <= 0) return false;

  await env.D1DB.prepare(
    `INSERT OR IGNORE INTO send_rate_counter (channel, sender_key, second_bucket, count)
     VALUES (?, ?, ?, 0)`,
  ).bind(channel, senderKey, bucket).run();

  const res = await env.D1DB.prepare(
    `UPDATE send_rate_counter
        SET count = count + 1
      WHERE channel = ? AND sender_key = ? AND second_bucket = ? AND count < ?`,
  ).bind(channel, senderKey, bucket, limit).run();

  const changes = Number((res.meta as { changes?: number } | undefined)?.changes ?? 0);
  return changes > 0;
}

/**
 * Compute how long a batch of messages will take given a number of parallel
 * senders (10DLC phones for SMS, domains for email). Used by the automation
 * builder UI to show "Estimated send time" before the user hits Send.
 */
export function estimateSendDuration(
  channel: SendChannel,
  numMessages: number,
  numSenders: number,
  limits: RateLimits = DEFAULT_RATE_LIMITS,
): { seconds: number; bottleneck: keyof RateLimits } {
  const perSec = limitFor(channel, limits);
  const senders = Math.max(1, numSenders);
  const seconds = Math.ceil(Math.max(0, numMessages) / (perSec * senders));
  const bottleneck: keyof RateLimits =
    channel === "sms" ? "sms_per_sec" : channel === "mms" ? "mms_per_sec" : "email_per_sec";
  return { seconds, bottleneck };
}

/**
 * Format a duration in seconds as e.g. "3m 17s" / "1h 4m" for the UI. Pure
 * helper, kept here so both the FE and BE can share the formatting if needed.
 */
export function formatDurationShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s - m * 60;
  if (m < 60) return remS > 0 ? `${m}m ${remS}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m - h * 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}
