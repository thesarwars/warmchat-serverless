/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json } from "../../../_shared/http.ts";
import { execute, queryAll } from "../../../_shared/db.ts";
import { notify } from "../../../_shared/notify.ts";

/**
 * POST /api/webhooks/telnyx/events - Telnyx pings here for brand/campaign
 * status changes. We persist the latest status onto the user row so the UI
 * can render a real-time provisioning state.
 */
interface Payload { data?: {
  event_type?: string;
  payload?: { brand?: { id?: string; status?: string }; campaign?: { id?: string; status?: string } };
} }

const NOTIFY_STATUSES = new Set(["approved", "rejected", "failed", "active", "vetting_failed"]);

async function fanoutDlcStatus(
  env: Env,
  field: "telnyx_brand_id" | "telnyx_campaign_id",
  id: string,
  status: string,
): Promise<void> {
  if (!NOTIFY_STATUSES.has(status)) return;
  const rows = await queryAll<{ id: number }>(
    env.D1DB, `SELECT id FROM "user" WHERE ${field} = ?`, id,
  );
  const severity = status === "approved" || status === "active"
    ? "success"
    : "error";
  const titleByStatus: Record<string, string> = {
    approved: "10DLC registration approved",
    active: "10DLC campaign is live",
    rejected: "10DLC registration rejected",
    failed: "10DLC registration failed",
    vetting_failed: "10DLC vetting failed",
  };
  const title = titleByStatus[status] || `10DLC status: ${status}`;
  for (const row of rows) {
    try {
      await notify(env, {
        userId: row.id,
        kind: "dlc_status_changed",
        channel: "system",
        severity,
        title,
        body: status === "rejected" || status === "failed" || status === "vetting_failed"
          ? "Open SMS settings to review the rejection reason."
          : "Your number is ready to send SMS at full throughput.",
        data: { path: "/settings?tab=workspace", status },
      });
    } catch (err) {
      console.warn("[dlc-notify] failed", err);
    }
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  let body: Payload;
  try { body = await request.json(); } catch { return json({ ok: true, ignored: "bad json" }); }
  const d = body.data;
  const brand = d?.payload?.brand;
  const camp = d?.payload?.campaign;

  if (brand?.id && brand?.status) {
    const status = brand.status.toLowerCase();
    await execute(
      env.D1DB,
      `UPDATE "user" SET telnyx_sms_status = ? WHERE telnyx_brand_id = ?`,
      status, brand.id,
    );
    await fanoutDlcStatus(env, "telnyx_brand_id", brand.id, status);
  }
  if (camp?.id && camp?.status) {
    const status = camp.status.toLowerCase();
    await execute(
      env.D1DB,
      `UPDATE "user" SET telnyx_sms_status = ? WHERE telnyx_campaign_id = ?`,
      status, camp.id,
    );
    await fanoutDlcStatus(env, "telnyx_campaign_id", camp.id, status);
  }
  return json({ ok: true });
};
