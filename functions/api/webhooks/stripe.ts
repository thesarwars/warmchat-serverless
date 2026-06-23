/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { execute, queryFirst } from "../../_shared/db.ts";
import { planFromPriceId } from "../../_shared/billing.ts";
import { notify } from "../../_shared/notify.ts";
import { mockElasticSendEmail } from "../../_shared/mockSendApi.ts";

/**
 * POST /api/webhooks/stripe - subscription state sync.
 *
 * Stripe is the source of truth; we mirror status + plan onto `organization`
 * so the app can gate features without a round-trip. Handlers are idempotent
 * (write-the-final-state UPDATEs) so duplicate deliveries from Stripe's retry
 * pipeline are harmless and no event-id dedupe table is needed.
 *
 * Subscribed events (configure in Stripe dashboard):
 *   - checkout.session.completed
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.payment_failed
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (!env.STRIPE_WEBHOOK_SECRET) return error("Stripe webhook secret not configured", 503);

  const raw = await request.text();
  const sigHeader = request.headers.get("Stripe-Signature") || "";
  const verified = await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, raw, sigHeader);
  if (!verified) return error("Invalid signature", 400);

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return error("Malformed JSON body", 400);
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(env, event.data.object as CheckoutSession);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(env, event.data.object as StripeSubscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(env, event.data.object as StripeSubscription);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(env, event.data.object as StripeInvoice);
      break;
    default:
      // 200 so Stripe stops retrying; we just don't care about this event.
      break;
  }

  return json({ received: true });
};

// ---------- Event payload types (subset of fields we read) ----------

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

type CheckoutSession = {
  payment_status?: string;
  status?: string;
  subscription?: string | null;
  customer?: string | null;
  metadata?: Record<string, string> | null;
};

type StripeSubscription = {
  id: string;
  status: string;
  customer: string;
  items?: { data?: Array<{ price?: { id?: string } }> };
};

type StripeInvoice = {
  customer?: string | null;
  subscription?: string | null;
};

// ---------- Event handlers ----------

async function handleCheckoutCompleted(env: Env, sess: CheckoutSession): Promise<void> {
  const orgIdMeta = Number(sess.metadata?.org_id);
  const planId = sess.metadata?.plan_id ?? null;
  const paid = sess.payment_status === "paid" || sess.status === "complete";
  if (!paid || !planId || !Number.isInteger(orgIdMeta)) return;

  await execute(
    env.D1DB,
    `UPDATE organization SET plan = ?, subscription_status = 'active',
            plan_started_at = COALESCE(plan_started_at, CURRENT_TIMESTAMP),
            stripe_customer_id = COALESCE(stripe_customer_id, ?),
            stripe_subscription_id = COALESCE(?, stripe_subscription_id)
      WHERE id = ?`,
    planId, sess.customer ?? null, sess.subscription ?? null, orgIdMeta,
  );
}

// Stripe statuses that mean the subscription has TERMINALLY ended. 'past_due' is
// deliberately excluded - it's still recoverable (dunning/retries) and must keep
// the paid plan so a card update can restore it.
const ENDED_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

async function handleSubscriptionUpdated(env: Env, sub: StripeSubscription): Promise<void> {
  if (!sub.customer) return;
  const org = await orgByCustomer(env, sub.customer);
  if (!org) return;

  // Terminal status => the subscription has ended: downgrade + alert (scoped to
  // THIS subscription so a later resubscribe isn't clobbered by a stale event).
  if (ENDED_STATUSES.has(sub.status)) {
    await downgradeToFree(env, org, sub.id, sub.status);
    return;
  }

  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const plan = planFromPriceId(env, priceId);

  // Always sync status. Only overwrite plan when we recognize the price id -
  // an unknown price means an out-of-band Stripe edit we shouldn't second-guess.
  if (plan) {
    await execute(
      env.D1DB,
      `UPDATE organization SET subscription_status = ?, plan = ?, stripe_subscription_id = ?,
              plan_started_at = COALESCE(plan_started_at, CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP END)
        WHERE id = ?`,
      sub.status, plan, sub.id, sub.status, org.id,
    );
  } else {
    await execute(
      env.D1DB,
      `UPDATE organization SET subscription_status = ?, stripe_subscription_id = ? WHERE id = ?`,
      sub.status, sub.id, org.id,
    );
  }
}

async function handleSubscriptionDeleted(env: Env, sub: StripeSubscription): Promise<void> {
  if (!sub.customer) return;
  const org = await orgByCustomer(env, sub.customer);
  if (!org) return;
  await downgradeToFree(env, org, sub.id, "canceled");
}

type OrgOwner = { id: number; owner_id: number | null; owner_email: string | null };

/**
 * A subscription terminally ended -> revert the org to the free tier and alert
 * the owner to resubscribe (in-app notification + transactional email).
 *
 * SUBSCRIPTION-SCOPED for idempotency + resubscribe safety: the UPDATE only
 * fires when the ended subscription is still the org's current one
 * (`AND stripe_subscription_id = ?`). So a duplicate/late Stripe delivery, or a
 * stale event for an OLD subscription after the customer already resubscribed to
 * a NEW one, changes 0 rows -> we no-op and skip re-alerting. This is the fix for
 * the resubscribe race a naive plan/status pre-read would miss.
 */
async function downgradeToFree(env: Env, org: OrgOwner, subId: string, status: string): Promise<void> {
  const upd = await execute(
    env.D1DB,
    `UPDATE organization
        SET subscription_status = ?, plan = 'free_channel',
            plan_started_at = NULL, stripe_subscription_id = NULL
      WHERE id = ? AND stripe_subscription_id = ?`,
    status, org.id, subId,
  );
  if (Number(upd.meta.changes) !== 1) return; // already downgraded OR resubscribed
  if (!org.owner_id) return;

  const link = `${env.FRONTEND_URL || "https://warmchats.com"}/settings?tab=billing`;
  try {
    await notify(env, {
      userId: org.owner_id,
      orgId: org.id,
      kind: "subscription_changed",
      channel: "system",
      severity: "warning",
      title: "Your subscription ended",
      body: "Your subscription has ended and your account is back on the free plan. Resubscribe to keep using SMS, calling and AI features.",
      data: { path: "/settings?tab=billing", cta: "resubscribe" },
    });
  } catch (err) {
    console.warn("[stripe-notify] subscription_ended notify failed", err);
  }
  if (org.owner_email) {
    try {
      await mockElasticSendEmail(env, {
        to: org.owner_email,
        subject: "Your WarmChats subscription ended",
        isHtml: true,
        transactional: true,
        body: `<p>Your WarmChats subscription has ended and your account has been moved to the free plan.</p>`
          + `<p>To keep using SMS, calling and AI features, add a card and resubscribe:</p>`
          + `<p><a href="${link}">Resubscribe to WarmChats</a></p>`,
      }, { orgId: org.id });
    } catch (err) {
      console.warn("[stripe-email] subscription_ended email failed", err);
    }
  }
}

async function handleInvoicePaymentFailed(env: Env, inv: StripeInvoice): Promise<void> {
  if (!inv.customer) return;
  const org = await orgByCustomer(env, inv.customer);
  if (!org) return;

  await execute(
    env.D1DB,
    `UPDATE organization SET subscription_status = 'past_due' WHERE id = ?`,
    org.id,
  );
  if (org.owner_id) {
    try {
      await notify(env, {
        userId: org.owner_id,
        orgId: org.id,
        kind: "payment_failed",
        channel: "system",
        severity: "error",
        title: "Payment failed",
        body: "Update your payment method to avoid service interruption.",
        data: { path: "/settings?tab=billing" },
      });
    } catch (err) {
      console.warn("[stripe-notify] payment_failed failed", err);
    }
  }
}

async function orgByCustomer(env: Env, customerId: string): Promise<OrgOwner | null> {
  return queryFirst<OrgOwner>(
    env.D1DB,
    `SELECT o.id, o.owner_id, u.email AS owner_email
       FROM organization o LEFT JOIN "user" u ON u.id = o.owner_id
      WHERE o.stripe_customer_id = ? LIMIT 1`,
    customerId,
  );
}

// ---------- Signature verification ----------

const MAX_SKEW_SECONDS = 300;

async function verifyStripeSignature(secret: string, rawBody: string, header: string): Promise<boolean> {
  if (!header) return false;

  let timestamp: string | null = null;
  const v1Sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (!k || !v) continue;
    if (k === "t") timestamp = v;
    else if (k === "v1") v1Sigs.push(v);
  }
  if (!timestamp || v1Sigs.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_SECONDS) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = bytesToHex(new Uint8Array(mac));

  // Constant-time compare against each v1 signature offered.
  return v1Sigs.some((sig) => timingSafeEqualHex(sig, expected));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
