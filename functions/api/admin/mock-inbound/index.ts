/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error, readJson } from "../../../_shared/http.ts";
import { queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isSiteAdmin } from "../../../_shared/adminAccess.ts";
import { processInboundSms, processInboundEmail } from "../../../_shared/inboundProcessing.ts";

/**
 * POST /api/admin/mock-inbound - simulate an inbound SMS or email reply for
 * testing, writing the same DB rows the real provider webhooks would and
 * driving the same downstream flow (notifications, opt-out, AI follow-up for
 * SMS). Site-admin only.
 *
 * Body (one of two shapes):
 *   { channel, lead_id, body, subject? }   - reply AS the lead (resolves the
 *                                            lead's email/phone and the owning
 *                                            agent's inbox/number).
 *   { channel, from, to, body, subject? }  - explicit addresses, used by the
 *                                            per-row "Reply" button in the
 *                                            mock-send log (swap of from/to).
 *
 * `channel` is 'sms' | 'mms' | 'email' (mms is treated as an inbound SMS).
 */

interface Body {
  channel?: string;
  lead_id?: number;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
}

interface LeadRow {
  id: number;
  email: string | null;
  phone: string | null;
  owner_id: number | null;
  org_id: number | null;
}

interface OwnerRow {
  telnyx_phone_number: string | null;
  inbox_email: string | null;
  gmail_email: string | null;
  user_email: string | null;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isSiteAdmin(env, user.id))) return error("Admin access required", 403);

  const body = (await readJson<Body>(request)) || {};
  const rawChannel = (body.channel || "").toLowerCase();
  const channel = rawChannel === "mms" ? "sms" : rawChannel;
  if (channel !== "sms" && channel !== "email") {
    return error("channel must be 'sms', 'mms' or 'email'", 400);
  }
  const text = (body.body || "").trim();
  if (!text) return error("body is required", 400);

  // Resolve the lead + owning agent when replying by lead.
  let lead: LeadRow | null = null;
  let owner: OwnerRow | null = null;
  if (body.lead_id != null) {
    if (!Number.isInteger(body.lead_id)) return error("lead_id must be an integer", 400);
    lead = await queryFirst<LeadRow>(
      env.D1DB,
      `SELECT id, email, phone, owner_id, org_id FROM lead WHERE id = ?`,
      body.lead_id,
    );
    if (!lead) return error("Lead not found", 404);
    if (lead.owner_id != null) {
      owner = await queryFirst<OwnerRow>(
        env.D1DB,
        `SELECT telnyx_phone_number,
                (SELECT email_address FROM inbox_connection  WHERE user_id = ? LIMIT 1) AS inbox_email,
                (SELECT email_address FROM email_connections WHERE user_id = ? LIMIT 1) AS gmail_email,
                email AS user_email
           FROM "user" WHERE id = ?`,
        lead.owner_id, lead.owner_id, lead.owner_id,
      );
    }
  }

  if (channel === "sms") {
    const fromNumber = (lead ? lead.phone : body.from) || "";
    const toNumber = (lead ? owner?.telnyx_phone_number : body.to) || "";
    if (!fromNumber) return error(lead ? "Lead has no phone number" : "'from' is required", 400);
    if (!toNumber) return error(lead ? "Agent has no SMS number connected" : "'to' is required", 400);

    const result = await processInboundSms(env, { fromNumber, toNumber, text });
    if (result.ignored) {
      return error(`Nothing recorded - ${result.ignored} (recipient ${toNumber})`, 422);
    }
    return json({ ...result, channel: "sms" }, 201);
  }

  // email
  const from = (lead ? lead.email : body.from) || "";
  const to = (lead ? (owner?.inbox_email || owner?.gmail_email || owner?.user_email) : body.to) || "";
  if (!from) return error(lead ? "Lead has no email address" : "'from' is required", 400);
  if (!to) return error(lead ? "Agent has no connected inbox" : "'to' is required", 400);

  const result = await processInboundEmail(env, {
    from,
    to,
    subject: body.subject || "(no subject)",
    body: text,
    orgId: lead?.org_id ?? null,
    leadId: lead?.id ?? null,
    ensureThread: true,
  });
  if (result.ignored) {
    return error(`Nothing recorded - ${result.ignored} (recipient ${to})`, 422);
  }
  return json({ ...result, channel: "email" }, 201);
};
