/// <reference types="@cloudflare/workers-types" />
import { execute, queryFirst } from "./db.ts";
import { notify, type NotifyEnv } from "./notify.ts";
import { planLimitsFor } from "./plans.ts";
import { isMockSendsEnabled } from "./appSettings.ts";
import { currentSecondBucket } from "./sendRateLimiter.ts";

/**
 * One-shot "usage limit exceeded" notifier.
 *
 * Fires in-app + web push + email to the org owner the first time a plan
 * quota is hit in a given billing period, then stays silent for every
 * subsequent blocked send in that same period. Cron jobs can loop through
 * hundreds of blocked dispatches and only the first one will pierce through.
 *
 * The dedupe is done by atomically stamping a *_notified_at column:
 *   - SMS / Email / AI: usage.{sms,email,ai}_limit_notified_at  (per month row)
 *   - Voice           : billing_cycles.limit_notified_at        (per cycle row)
 *
 * Because the row is keyed (org_id, month) for usage and gets a fresh row on
 * each billing-cycle rollover for voice, the stamp auto-resets when the
 * period flips - no separate cron job needed.
 */

export type QuotaChannel = "email" | "sms" | "ai" | "voice";

// Both the Pages Env and the cron CronEnv satisfy this structural shape.
export interface QuotaNotifyEnv extends NotifyEnv {
  ELASTIC_EMAIL_API_KEY?: string;
  ELASTIC_SENDER_EMAIL?: string;
  ELASTIC_SENDER_NAME?: string;
  PUBLIC_BASE_URL?: string;
  FRONTEND_URL?: string;
}

interface OrgOwner {
  owner_id: number | null;
  org_name: string | null;
  plan: string | null;
  email: string | null;
}

interface ChannelMeta {
  label: string;
  unitPlural: string;
  notifyChannel: "sms" | "email" | "call" | "system";
}

const META: Record<QuotaChannel, ChannelMeta> = {
  sms:   { label: "SMS",            unitPlural: "messages", notifyChannel: "sms" },
  email: { label: "email",          unitPlural: "messages", notifyChannel: "email" },
  ai:    { label: "AI",             unitPlural: "messages", notifyChannel: "system" },
  voice: { label: "calling minutes", unitPlural: "minutes",  notifyChannel: "call" },
};

function limitForChannel(plan: string, channel: QuotaChannel): number | "unlimited" {
  if (channel === "voice") {
    // Voice limit lives on billing_cycles.plan_minute_limit; resolved by caller.
    return "unlimited";
  }
  const lim = planLimitsFor(plan);
  if (channel === "email") return lim.monthly_email_sends;
  if (channel === "sms")   return lim.monthly_sms_sends;
  return lim.ai_limit;
}

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Atomically claim the "we've notified" stamp for this (org, channel,
 * period). Returns true exactly once per period; subsequent callers see
 * `changes === 0` and bail.
 */
async function claimStamp(
  env: QuotaNotifyEnv, orgId: number, channel: QuotaChannel,
): Promise<{ claimed: boolean; voiceLimit?: number }> {
  if (channel === "voice") {
    // Find the active cycle and stamp it. We also return the cycle's
    // plan_minute_limit so the email body can include it.
    const cycle = await queryFirst<{ id: string; plan_minute_limit: number }>(
      env.D1DB,
      `SELECT id, plan_minute_limit FROM billing_cycles
        WHERE org_id = ? AND status = 'ACTIVE' LIMIT 1`,
      orgId,
    );
    if (!cycle) return { claimed: false };
    const upd = await execute(
      env.D1DB,
      `UPDATE billing_cycles SET limit_notified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND limit_notified_at IS NULL`,
      cycle.id,
    );
    return { claimed: Number(upd.meta.changes) === 1, voiceLimit: cycle.plan_minute_limit };
  }

  const col = channel === "sms" ? "sms_limit_notified_at"
            : channel === "email" ? "email_limit_notified_at"
            : "ai_limit_notified_at";
  const month = monthKey();
  // Ensure a row exists first - otherwise the UPDATE hits zero rows on a
  // brand-new month where the org has yet to record a send. The
  // checkUsageLimit() path normally creates this row via incrementUsage,
  // but an "over limit on first attempt" path (cron skipping a step before
  // any successful send this month) would miss the row entirely.
  await execute(
    env.D1DB,
    `INSERT INTO usage (org_id, month) VALUES (?, ?)
       ON CONFLICT(org_id, month) DO NOTHING`,
    orgId, month,
  );
  const upd = await execute(
    env.D1DB,
    `UPDATE usage SET ${col} = CURRENT_TIMESTAMP
      WHERE org_id = ? AND month = ? AND ${col} IS NULL`,
    orgId, month,
  );
  return { claimed: Number(upd.meta.changes) === 1 };
}

async function loadOrgOwner(env: QuotaNotifyEnv, orgId: number): Promise<OrgOwner | null> {
  return queryFirst<OrgOwner>(
    env.D1DB,
    `SELECT o.owner_id AS owner_id,
            o.name     AS org_name,
            o.plan     AS plan,
            u.email    AS email
       FROM organization o
       LEFT JOIN "user" u ON u.id = o.owner_id
      WHERE o.id = ?`,
    orgId,
  );
}

function formatLimit(limit: number | "unlimited"): string {
  if (limit === "unlimited") return "unlimited";
  return limit.toLocaleString("en-US");
}

async function sendOwnerEmail(
  env: QuotaNotifyEnv,
  orgId: number,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  // Mock-mode debug log. Cron can't import the Pages mockSendApi wrapper
  // (cross-package), so mirror the inline pattern used by the cron dispatch
  // jobs: when mock is on, record the owner alert in mock_send_log and skip
  // the wire. Mirrors functions/_shared/mockSendApi.ts:mockElasticSendEmail.
  if (await isMockSendsEnabled(env, orgId)) {
    try {
      await execute(
        env.D1DB,
        `INSERT INTO mock_send_log
           (channel, provider, from_address, to_address, subject, body, org_id, rate_acquired, second_bucket)
         VALUES ('email', 'elastic', ?, ?, ?, ?, ?, 1, ?)`,
        env.ELASTIC_SENDER_EMAIL || null,
        to,
        subject || null,
        html || null,
        orgId,
        currentSecondBucket(),
      );
    } catch (err) {
      console.warn("[quotaNotify] mock_send_log insert failed", err);
    }
    return;
  }
  if (!env.ELASTIC_EMAIL_API_KEY || !env.ELASTIC_SENDER_EMAIL) return;
  const params = new URLSearchParams();
  params.set("apikey", env.ELASTIC_EMAIL_API_KEY);
  params.set("subject", subject);
  params.set("from", env.ELASTIC_SENDER_EMAIL);
  params.set("fromName", env.ELASTIC_SENDER_NAME || "Warmchats");
  params.set("to", to);
  params.set("bodyHtml", html);
  params.set("isTransactional", "true");
  try {
    await fetch("https://api.elasticemail.com/v2/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    console.warn("[quotaNotify] elastic email send failed", err);
  }
}

/**
 * Fire-and-forget. Never throws - quota notifications must not break the
 * caller's response path. Safe to call on every blocked send; the atomic
 * stamp ensures only the first call per period actually delivers.
 */
export async function notifyQuotaExceeded(
  env: QuotaNotifyEnv,
  orgId: number,
  channel: QuotaChannel,
): Promise<void> {
  try {
    const claim = await claimStamp(env, orgId, channel);
    if (!claim.claimed) return;

    const owner = await loadOrgOwner(env, orgId);
    if (!owner || !owner.owner_id) return;

    const plan = owner.plan || "free_channel";
    const meta = META[channel];
    const limit = channel === "voice"
      ? (claim.voiceLimit ?? 0)
      : limitForChannel(plan, channel);
    const limitStr = formatLimit(limit);

    const title = `Monthly ${meta.label} limit reached`;
    const body = channel === "voice"
      ? `This billing cycle's ${limitStr} ${meta.unitPlural} have been used. Outbound calls are paused until next cycle or until auto-charge overage is enabled.`
      : `Your ${plan} plan's monthly ${meta.label} limit (${limitStr} ${meta.unitPlural}) has been reached. ${meta.label} sends are paused until next month.`;

    await notify(env, {
      userId: owner.owner_id,
      orgId,
      kind: "quota_warning",
      severity: "warning",
      channel: meta.notifyChannel,
      title,
      body,
      data: { channel, plan, limit },
    });

    if (owner.email) {
      const baseUrl = env.FRONTEND_URL || env.PUBLIC_BASE_URL || "https://www.warmchats.com";
      const orgLabel = owner.org_name ? ` for ${owner.org_name}` : "";
      const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#222; line-height:1.5;">
  <h2 style="margin:0 0 12px 0;">${title}</h2>
  <p>${body}</p>
  <p>Upgrade your plan${orgLabel} to keep sending:</p>
  <p>
    <a href="${baseUrl}/billing" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">
      Manage billing
    </a>
  </p>
  <p style="color:#666;font-size:12px;margin-top:24px;">
    You're receiving this because you're the workspace owner. Billing alerts can be muted in Settings -> Notifications.
  </p>
</div>`.trim();
      await sendOwnerEmail(env, orgId, owner.email, title, html);
    }
  } catch (err) {
    console.warn("[quotaNotify] failed", channel, err);
  }
}
