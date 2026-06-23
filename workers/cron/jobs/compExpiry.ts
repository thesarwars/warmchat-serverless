/// <reference types="@cloudflare/workers-types" />
import type { CronEnv } from "../env.ts";
import { execute } from "../_shared/db.ts";
import { notify } from "../_shared/notify.ts";
import { isMockSendsEnabled } from "../_shared/appSettings.ts";
import { currentSecondBucket } from "../_shared/sendRateLimiter.ts";

/**
 * Comp-expiry sweep.
 *
 * A "comp" is a 100%-off promo grant (organization.subscription_status = 'comp')
 * that bypasses Stripe entirely - the org carries a paid plan in D1 with NO
 * Stripe customer/subscription. `comp_expires_at` (stamped at grant time from the
 * coupon's duration: forever -> NULL, once -> +1mo, repeating -> +N mo) is the
 * clock. When it lapses we revert the org to the free plan and alert the owner to
 * add a card to keep the paid features.
 *
 * Idempotent: the WHERE clause only matches still-comped, still-expired rows, so
 * a downgraded org no longer qualifies on the next tick. A FOREVER comp has
 * comp_expires_at NULL and is never swept.
 */
interface ExpiredComp {
  id: number;
  owner_id: number | null;
  org_name: string | null;
  email: string | null;
  promo_code: string | null;
}

export async function runCompExpiry(env: CronEnv): Promise<void> {
  const nowIso = new Date().toISOString();
  const due = await env.D1DB.prepare(
    `SELECT o.id, o.owner_id, o.name AS org_name, o.promo_code, u.email AS email
       FROM organization o LEFT JOIN "user" u ON u.id = o.owner_id
      WHERE o.subscription_status = 'comp'
        AND o.comp_expires_at IS NOT NULL
        AND o.comp_expires_at < ?
      LIMIT 200`,
  ).bind(nowIso).all<ExpiredComp>();
  const rows = due.results || [];
  if (!rows.length) return;
  console.log(`[cron:compExpiry] ${rows.length} comp(s) expired`);

  for (const org of rows) {
    // Scope the downgrade to the still-'comp' state so a concurrent
    // upgrade/resubscribe (which moves subscription_status off 'comp') isn't
    // clobbered. changes !== 1 => already handled this tick -> skip the alert.
    const upd = await execute(
      env.D1DB,
      `UPDATE organization
          SET plan = 'free_channel', subscription_status = 'free',
              comp_expires_at = NULL, plan_started_at = NULL
        WHERE id = ? AND subscription_status = 'comp'`,
      org.id,
    );
    if (Number(upd.meta.changes) !== 1) continue;
    await alertCompEnded(env, org);
  }
}

async function alertCompEnded(env: CronEnv, org: ExpiredComp): Promise<void> {
  if (!org.owner_id) return;
  const title = "Your free promo has ended";
  const body =
    "Your promotional access has ended and your account is back on the free plan. "
    + "Add a card to keep using SMS, calling and AI features.";
  try {
    await notify(env, {
      userId: org.owner_id,
      orgId: org.id,
      kind: "subscription_changed",
      channel: "system",
      severity: "warning",
      title,
      body,
      data: { path: "/settings?tab=billing", cta: "resubscribe" },
    });
  } catch (err) {
    console.warn("[cron:compExpiry] notify failed", err);
  }
  if (org.email) {
    await sendCompEndedEmail(env, org.id, org.email, title, body);
  }
}

async function sendCompEndedEmail(
  env: CronEnv,
  orgId: number,
  to: string,
  title: string,
  body: string,
): Promise<void> {
  const baseUrl = env.PUBLIC_BASE_URL || "https://warmchats.com";
  const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#222; line-height:1.5;">
  <h2 style="margin:0 0 12px 0;">${title}</h2>
  <p>${body}</p>
  <p>
    <a href="${baseUrl}/settings?tab=billing" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">
      Add a card &amp; resubscribe
    </a>
  </p>
  <p style="color:#666;font-size:12px;margin-top:24px;">You're receiving this because you're the workspace owner.</p>
</div>`.trim();

  // Mock-aware: when mock sends are on, record to mock_send_log and skip the wire
  // (mirrors workers/cron/_shared/quotaNotify.ts:sendOwnerEmail - the cron can't
  // import the Pages mockSendApi wrapper).
  if (await isMockSendsEnabled(env, orgId)) {
    try {
      await execute(
        env.D1DB,
        `INSERT INTO mock_send_log
           (channel, provider, from_address, to_address, subject, body, org_id, rate_acquired, second_bucket)
         VALUES ('email', 'elastic', ?, ?, ?, ?, ?, 1, ?)`,
        env.ELASTIC_SENDER_EMAIL || null, to, title || null, html || null, orgId, currentSecondBucket(),
      );
    } catch (err) {
      console.warn("[cron:compExpiry] mock_send_log insert failed", err);
    }
    return;
  }
  if (!env.ELASTIC_EMAIL_API_KEY || !env.ELASTIC_SENDER_EMAIL) return;
  const params = new URLSearchParams();
  params.set("apikey", env.ELASTIC_EMAIL_API_KEY);
  params.set("subject", title);
  params.set("from", env.ELASTIC_SENDER_EMAIL);
  params.set("fromName", env.ELASTIC_SENDER_NAME || "WarmChats");
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
    console.warn("[cron:compExpiry] elastic email send failed", err);
  }
}
