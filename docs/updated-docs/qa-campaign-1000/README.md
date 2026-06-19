# 1,000-Lead Campaign — messages sending (video)

`1000-lead-campaign-sending.webm` (~85s) shows a single SMS campaign with
**1,000 people enrolled** and the **messages actively sending** in mock mode
(nothing reaches a real phone).

What you see:
- `01-campaign-live` / `02-campaign-recipients` — the **1,000-Lead Campaign**, Live.
- `03-feed-start` → `04-feed-climbing` → `06-feed-more` → `07-feed-after` — the
  Debug send-log **Total counter climbing** (0 → 545) as messages send in batches.
- `05-message-rows` — the live feed of **individual messages** (each row = one
  SMS: To `+1558…`, body "Hi … reply STOP to opt out").

Result this run: **545 messages sent, 545 unique recipients, 0 duplicates**,
peak throughput **12/sec vs the 49/sec Telnyx cap** (24%).

> The drain is driven by a manual pump that stands in for **Workers Paid**
> throughput (the free plan drains only ~6–12/min). On Paid the same 1,000 would
> finish on its own in ~10 minutes. See `../qa-campaign/README.md` for the full
> pre-launch findings, including the free-plan duplicate caveat at heavier load.
