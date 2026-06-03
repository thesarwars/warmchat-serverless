# Usage & Billing - Implementation Requirements

> Source of truth: `docs/Pricing.pdf`, `docs/Billing__.pdf`, `docs/Account & Usage__.pdf`.
> Scope: the backend billing/usage surface. Call-minutes billing for the calling
> feature is tracked separately.

---

## 1. Purpose & scope

Deliver three things end-to-end on the backend:

1. **Pricing** - three plans (Starter $49, Growth $89, Enterprise/Custom) with correct SMS / Email / AI limits and SMS overage pricing.
2. **Billing tab** (full management) - current plan + renewal date, usage with overage breakdown, upgrade/downgrade, payment-method management, invoice history with PDF download, Stripe webhook handling.
3. **Account & Usage page** (lightweight overview) - profile editing, password change (while logged in), plan & limits summary, current-month usage with warnings near limit.


---

## 2. Decisions to confirm before coding

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Growth plan price | **$89/mo** (per Pricing.pdf) | Code currently has `growth.price = 49` - placeholder bug |
| D2 | Enterprise self-serve? | **No** - sales-led, "Contact us" form only | Pricing.pdf says "Contact us for custom pricing" |
| D3 | SMS overage policy | **Soft-stop + charge $0.015 each** | Starter/Growth advertise "Extra SMS: $0.015" |
| D4 | Email & AI overage policy | **Hard-stop** at limit | PDFs do not list per-unit overage rates |
| D5 | Period rollover | **Subscription anniversary** (Stripe period) | Avoids edge cases at month boundaries; aligns with Stripe invoices |
| D6 | Payment-method storage | **Live-read from Stripe** (no local cache) | Avoids sync drift; only `default_payment_method_id` stored |
| D7 | Profile fields location | `company_name` and `about_business` on **`Organization`**, `name` stays on `User` | Org is the billing entity; multiple users may share company |

If any of D1-D7 is wrong, change before implementing - the rest of this doc assumes them.

---

## 3. Plan catalog

The plan catalog must match Pricing.pdf exactly:

```
PLANS = {
    "free_channel": {
        "price": 0,
        "stripe_product_id": None,
        "stripe_price_id": None,
        "extra_sms_rate_cents": 0,
        "limits": {
            "monthly_sms_sends": 0,
            "monthly_email_sends": 50,
            "ai_limit": 0,
            "team_members": 1,
        },
        "features": ["lead_inbox", "templates"],
    },
    "starter": {
        "price": 49,
        "stripe_product_id": "prod_TfttQnk9VTSPgt",
        "stripe_price_id": os.getenv("STRIPE_PRICE_ID_STARTER"),
        "extra_sms_rate_cents": 15,           # $0.015 per extra SMS (15/10 cents)
        "limits": {
            "monthly_sms_sends": 1250,
            "monthly_email_sends": 10000,
            "ai_limit": 5000,
            "team_members": 1,
        },
        "features": [
            "ai_instant_reply",
            "lead_inbox",
            "templates",
        ],
    },
    "growth": {
        "price": 89,                           # FIX: was 49
        "stripe_product_id": "prod_TfttaboeXPrxgp",
        "stripe_price_id": os.getenv("STRIPE_PRICE_ID_GROWTH"),
        "extra_sms_rate_cents": 15,
        "limits": {
            "monthly_sms_sends": 2500,
            "monthly_email_sends": 20000,
            "ai_limit": 20000,
            "team_members": 1,
        },
        "features": [
            "ai_instant_reply",
            "ai_followup_sequences",
            "campaign_automation",
            "appointment_alerts",
            "advanced_templates",
            "lead_inbox",
        ],
    },
    "enterprise": {
        "price": None,                         # custom
        "is_custom": True,
        "stripe_product_id": None,
        "stripe_price_id": None,
        "extra_sms_rate_cents": None,
        "limits": {
            "monthly_sms_sends": None,         # null = unlimited / agreed out-of-band
            "monthly_email_sends": None,
            "ai_limit": None,
            "team_members": None,
        },
        "features": [
            "ai_instant_reply",
            "ai_followup_sequences",
            "campaign_automation",
            "appointment_alerts",
            "advanced_templates",
            "advanced_playbooks",
            "multi_user_team",
            "api_access",
            "advanced_analytics",
            "white_glove_onboarding",
            "priority_support",
        ],
    },
}
```

The usage counter must treat a `None` limit as unlimited.

---

## 4. Data model changes

### 4.1 `Organization`

Add columns:

| Column | Type | Notes |
|---|---|---|
| `default_payment_method_id` | `String(64)` nullable | Referenced by the attach-payment-method handler but missing - **runtime error today** |
| `current_period_start` | `DateTime` nullable | Populated by Stripe webhook |
| `current_period_end` | `DateTime` nullable | "Renews on ..." date for Billing tab |
| `cancel_at_period_end` | `Boolean` default `False` | Set/unset by cancel/resume endpoints |
| `trial_ends_at` | `DateTime` nullable | For Start Free Trial button |
| `company_name` | `String(255)` nullable | Account & Usage profile field |
| `about_business` | `Text` nullable | Account & Usage profile field |

### 4.2 New `Invoice` model

```
class Invoice(db.Model):
    __tablename__ = "invoices"
    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), index=True, nullable=False)
    stripe_invoice_id = db.Column(db.String(128), unique=True, nullable=False)
    period_start = db.Column(db.DateTime, nullable=True)
    period_end = db.Column(db.DateTime, nullable=True)
    amount_cents = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(8), default="usd")
    status = db.Column(db.String(32))           # paid / open / uncollectible / void
    hosted_invoice_url = db.Column(db.String(512))
    invoice_pdf = db.Column(db.String(512))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

### 4.3 New `StripeEvent` model (idempotency)

```
class StripeEvent(db.Model):
    __tablename__ = "stripe_events"
    id = db.Column(db.String(128), primary_key=True)   # Stripe event id
    type = db.Column(db.String(64))
    received_at = db.Column(db.DateTime, default=datetime.utcnow)
```

### 4.4 Extend `Usage`

Add columns for the overage breakdown in Billing__.pdf:

| Column | Type | Notes |
|---|---|---|
| `sms_overage_count` | `Integer` default `0` | Extras past `monthly_sms_sends` |
| `sms_overage_cents` | `Integer` default `0` | `overage_count * extra_sms_rate_cents` |

### 4.5 No new `PaymentMethod` table

Read live from Stripe (per D6). Only persist the default's id on `Organization`.

---

## 5. API surface

Legend: ✓ exists, ⚠ extend existing, ✗ new.

### Billing - full management

| Status | Method | Route | Body / Returns |
|---|---|---|---|
| ⚠ | `GET` | `/billing/status` | extend with `renewal_date`, `cancel_at_period_end`, `trial_ends_at` |
| ✗ | `GET` | `/billing/plans` | returns full PLANS dict (frontend stops hardcoding) |
| ✓ | `POST` | `/billing/create-checkout-session` | unchanged; switch to using `stripe_price_id` from env instead of inline `price_data` |
| ✗ | `POST` | `/billing/subscription/change-plan` | `{plan: "growth"}` -> `stripe.Subscription.modify(items=[{id, price}])`, proration_behavior `create_prorations` |
| ✗ | `POST` | `/billing/subscription/cancel` | sets `cancel_at_period_end=True` on Stripe sub |
| ✗ | `POST` | `/billing/subscription/resume` | reverses cancel |
| ✗ | `GET` | `/billing/payment-methods` | live list via `stripe.PaymentMethod.list(customer=..., type='card')` |
| ✗ | `DELETE` | `/billing/payment-methods/<pm_id>` | `stripe.PaymentMethod.detach`; refuse if it's the default and others exist (require setting a new default first) |
| ✗ | `POST` | `/billing/payment-methods/<pm_id>/default` | `stripe.Customer.modify(invoice_settings={...})` + persist `default_payment_method_id` |
| ✓ | `POST` | `/billing/stripe/setup-intent` | unchanged |
| ⚠ | `POST` | `/billing/stripe/attach-payment-method` | **fix bug** in the attach handler: `org.default_payment_method` -> `org.default_payment_method_id` (column added in §4.1) |
| ✗ | `GET` | `/billing/invoices?limit=20&starting_after=...` | list from local `Invoice` table; fall back to Stripe if empty |
| ✗ | `GET` | `/billing/invoices/<id>/download` | redirect to `invoice.invoice_pdf` (signed Stripe URL) |
| ✗ | `POST` | `/billing/stripe/webhook` | signature-verified handler - see §6 |
| ✗ | `GET` | `/billing/usage/current` | unified payload - see §10 |

### Account & Usage - lightweight overview

| Status | Method | Route | Body / Returns |
|---|---|---|---|
| ✓ | `GET` | `/auth/profile/me` | already returns user + org + plan + usage - keep |
| ✗ | `PATCH` | `/account/profile` | `{name?, company_name?, about_business?}` - updates `User.name`, `Organization.company_name`, `Organization.about_business` |
| ✗ | `POST` | `/account/password/change` | `{current_password, new_password}` - verify via `check_password_hash`, update `password_hash`, invalidate other sessions if applicable |
| ✗ | `GET` | `/account/overview` | single payload for the Account & Usage page (composition of profile + plan summary + usage) - frontend gets one call |

---

## 6. Stripe webhook handler

Route: `POST /billing/stripe/webhook`. Must:

1. Read `Stripe-Signature` header, verify with `stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)`.
2. Reject duplicates: insert event id into `StripeEvent`; on `IntegrityError` return 200 (already processed).
3. Handle:
   - `customer.subscription.created` / `customer.subscription.updated` -> set `org.plan` from price/product, `subscription_status`, `stripe_subscription_id`, `current_period_start`, `current_period_end`, `cancel_at_period_end`.
   - `customer.subscription.deleted` -> `plan="free_channel"`, `subscription_status="canceled"`, clear period fields.
   - `invoice.paid` -> upsert `Invoice` row (status `paid`, `invoice_pdf`, `hosted_invoice_url`, period, amount).
   - `invoice.payment_failed` -> upsert `Invoice` row (status `open` or `uncollectible`), set `org.subscription_status="past_due"` so the frontend can show a banner.

Add `STRIPE_WEBHOOK_SECRET` to the environment config.

---

## 7. Usage counter wiring

Current state is solid (`UsageCounter.increment` / `check_limit` / `usage_status`). Required additions:

### 7.1 SMS overage (soft-stop)

In `UsageCounter.check_limit` when `channel == "sms"`:

- If under limit -> allow + increment as today.
- If over limit AND plan has `extra_sms_rate_cents` AND `extra_sms_rate_cents > 0` -> allow, increment `sms_sent` AND `sms_overage_count`, accumulate `sms_overage_cents`. Return `(allowed=True, overage=True)`.
- If over limit AND plan has no overage rate (e.g. `free_channel`) -> block (return 403 in caller).

At Stripe period close (handled in webhook on `invoice.created` for the next cycle, or via the rollover job §9), push overage as an invoice item:

```
stripe.InvoiceItem.create(
    customer=org.stripe_customer_id,
    amount=usage.sms_overage_cents,           # cents
    currency="usd",
    description=f"Extra SMS ({usage.sms_overage_count} @ $0.015)",
)
```

### 7.2 Email & AI hard-stop

No change - the email and AI send paths already return 403 on `check_limit=False`. Confirm the response shape is consistent so the frontend can render the upgrade modal:

```json
{ "error": "limit_exceeded", "channel": "email", "used": 10000, "limit": 10000, "upgrade_url": "/billing" }
```

### 7.3 Warning signal at ≥80%

`UsageCounter.usage_status()` already returns used/limit. Extend it to compute `warning_level`:

- `none` if `<80%`
- `warning` if `>=80% and <100%`
- `exceeded` if `>=100%`

These three levels drive every in-app upgrade prompt (Dashboard, AI Follow-Up Engine, hit-limit modal) - backend remains the single source of truth.

---

## 8. Overage policy table

| Plan | SMS | Email | AI |
|---|---|---|---|
| free_channel | hard-stop | hard-stop | n/a (disabled) |
| starter | soft-stop @ $0.015/extra | hard-stop | hard-stop |
| growth | soft-stop @ $0.015/extra | hard-stop | hard-stop |
| enterprise | unlimited (negotiated) | unlimited | unlimited |

---

## 9. Monthly rollover / billing close job

Add a scheduled job (next to the existing `sequence_tick` and `scheduled_messages_tick` jobs) that runs daily at 00:05 UTC:

```
scheduler.add_job(close_billing_periods,
    CronTrigger(hour=0, minute=5),
    kwargs={"app": app},
    id="billing_close_tick")
```

`close_billing_periods` logic:

1. For each `Organization` with `current_period_end <= utcnow()`:
   - Fetch latest `Usage` row for previous period.
   - If `sms_overage_cents > 0` -> `stripe.InvoiceItem.create` (idempotent: only if not already pushed - use `metadata={"period_month": "YYYY-MM"}` to dedupe).
   - Stripe issues the invoice on its own schedule; we update `current_period_end` from the webhook.

No need to "reset" usage - `Usage` is keyed by `(org_id, YYYY-MM)`, so a new period auto-creates a new row.

---

## 10. `GET /billing/usage/current` - unified payload

This is the **single endpoint** that feeds the Billing tab, the Account & Usage page, the dashboard indicators, the AI Follow-Up Engine banner, and the hit-limit modal:

```json
{
  "plan": {
    "code": "growth",
    "name": "Growth",
    "price_cents": 8900,
    "extra_sms_rate_cents": 15,
    "is_custom": false
  },
  "subscription": {
    "status": "active",
    "current_period_start": "2026-04-12T00:00:00Z",
    "current_period_end": "2026-05-12T00:00:00Z",
    "cancel_at_period_end": false,
    "trial_ends_at": null
  },
  "usage": {
    "sms":   { "used": 1240, "limit": 2500,  "warning_level": "none",    "overage_count": 0, "overage_cents": 0 },
    "email": { "used": 8500, "limit": 20000, "warning_level": "none" },
    "ai":    { "used": 320,  "limit": 1000,  "warning_level": "none" }
  },
  "warnings": []        // array of {channel, level} for anything >= warning
}
```

---

## 11. Config & env

Add to the environment config / `.env`:

| Key | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | webhook signature verification |
| `STRIPE_PRICE_ID_STARTER` | switch checkout from inline `price_data` to a real Price object |
| `STRIPE_PRICE_ID_GROWTH` | same |
| `BILLING_FRONTEND_BASE` | already used; reaffirm - success/cancel URLs |

---

## 12. Schema & seed plan

Schema changes (one logical change at a time, so rollbacks are clean):

1. `add_org_billing_columns` - `default_payment_method_id`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `trial_ends_at`.
2. `add_org_profile_columns` - `company_name`, `about_business`.
3. `create_invoice_and_stripe_event_tables`.
4. `extend_usage_with_overage` - `sms_overage_count`, `sms_overage_cents`.
5. **Backfill** (one-off):
   - For each org with `stripe_subscription_id`: `stripe.Subscription.retrieve(...)` -> write `current_period_start/end`, `cancel_at_period_end`, `status`.
   - For each org with `stripe_customer_id`: pull default payment method id into `default_payment_method_id`.
   - Pull last 12 months of invoices into the new `Invoice` table.

No DB seed for plans (the catalog is code-defined); only Stripe Price IDs go in env.

---

## 13. Verification checklist

End-to-end, on a Stripe test account:

- [ ] Sign up -> `free_channel` plan -> `GET /account/overview` returns profile + plan summary + usage at 0.
- [ ] Visit `GET /billing/plans` -> returns 4 plans with corrected Growth = $89 and Enterprise placeholder.
- [ ] Upgrade Starter -> Growth via `POST /billing/subscription/change-plan` -> webhook fires -> `current_period_end` populated -> Billing tab shows renewal date.
- [ ] Send SMS up to 80% of limit -> `GET /billing/usage/current` returns `warnings: [{channel: "sms", level: "warning"}]`.
- [ ] Send SMS past 100% -> send still succeeds, `sms_overage_count` increments, `warnings` shows `level: "exceeded"`.
- [ ] Send email past limit -> 403 `{error: "limit_exceeded", ...}`.
- [ ] Send AI request past limit -> 403 same shape.
- [ ] Add new card via SetupIntent -> `GET /billing/payment-methods` lists it -> set as default -> delete the old one (refused if old card is still default).
- [ ] `POST /billing/subscription/cancel` -> `cancel_at_period_end` true in `/billing/status` -> `resume` -> false.
- [ ] At period close (or via Stripe CLI `trigger invoice.paid`), `Invoice` row appears in `GET /billing/invoices`; PDF download redirects to a working `invoice_pdf` URL.
- [ ] `POST /account/password/change` with wrong `current_password` -> 401; with correct -> 200 + new password works.
- [ ] `PATCH /account/profile` -> name / company_name / about_business persist; `GET /auth/profile/me` reflects them.
- [ ] Webhook idempotency: replay the same `invoice.paid` event -> no duplicate `Invoice` row.

---

## 14. Out of scope

- Frontend visual implementation (lives in the Vite app under `src/` - separate doc).
- Call-minutes billing (handled by the calling feature - separate doc).
- Email deliverability / Telnyx 10DLC compliance (separate doc).
- Multi-user team seating beyond `team_members` limit-check (Enterprise rollout).

---

## Quick gap summary (what's missing today)

- ❌ Growth plan price ($49 -> $89) and limits wrong in the plan catalog.
- ❌ Enterprise plan not defined.
- ❌ `Organization.default_payment_method_id` column - referenced by the attach-payment-method handler, **runtime error**.
- ❌ Stripe webhook handler (subscription + invoice events).
- ❌ `Invoice` model + history endpoint + PDF download.
- ❌ List / delete / set-default payment-method endpoints.
- ❌ `current_period_end` / renewal date surface.
- ❌ Change-password-while-logged-in endpoint.
- ❌ Update-profile endpoint + `company_name` / `about_business` columns.
- ❌ Downgrade / cancel / resume subscription endpoints.
- ❌ SMS overage tracking ($0.015 per extra) + monthly close job pushing overage to Stripe.
- ❌ Unified `GET /billing/usage/current` payload for in-app upgrade prompts.
- ❌ `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_ID_*` env keys.

Everything else listed in the PDFs (basic Stripe checkout, monthly usage counters per channel, quota enforcement, forgot-password flow, profile read endpoint) already exists.
