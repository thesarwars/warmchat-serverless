/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import { isSiteAdmin } from "../../../_shared/adminAccess.ts";

/**
 * GET /api/admin/mock-inbound/accounts - data for the /admin/debug "simulate
 * inbound reply" picker. Site-admin only.
 *
 * Without params: returns the agents (org members) across every org, each with
 * the channels available to mock an inbound on (an SMS number / a connected
 * inbox address) and their lead count. Agents are listed even when they own no
 * leads yet (a fresh seed / new account has none) - otherwise the picker is
 * empty and there is nobody to simulate against.
 *
 * With ?owner_id=N: returns that agent's leads so the second dropdown can be
 * populated lazily.
 */

interface AccountRow {
  user_id: number;
  name: string | null;
  email: string | null;
  telnyx_phone_number: string | null;
  org_id: number | null;
  inbox_email: string | null;
  gmail_email: string | null;
  lead_count: number;
}

interface LeadRow {
  id: number;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await isSiteAdmin(env, user.id))) return error("Admin access required", 403);

  const url = new URL(request.url);
  const ownerIdRaw = url.searchParams.get("owner_id");

  // Lead list for a chosen agent.
  if (ownerIdRaw != null) {
    const ownerId = Number(ownerIdRaw);
    if (!Number.isInteger(ownerId)) return error("owner_id must be an integer", 400);
    const leads = await queryAll<LeadRow>(
      env.D1DB,
      `SELECT id, name, first_name, last_name, email, phone
         FROM lead
        WHERE owner_id = ?
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 1000`,
      ownerId,
    );
    return json({ leads });
  }

  // Agent list = org members (not just lead owners, so the picker is populated
  // before any leads exist). A receiving email is whatever inbox the agent has
  // connected, falling back to their login email so an email reply is always
  // possible. lead_count is a subquery so agents with zero leads still appear.
  const rows = await queryAll<AccountRow>(
    env.D1DB,
    `SELECT u.id AS user_id, u.name, u.email, u.telnyx_phone_number,
            (SELECT org_id        FROM membership       WHERE user_id = u.id LIMIT 1) AS org_id,
            (SELECT email_address FROM inbox_connection  WHERE user_id = u.id LIMIT 1) AS inbox_email,
            (SELECT email_address FROM email_connections WHERE user_id = u.id LIMIT 1) AS gmail_email,
            (SELECT COUNT(*)      FROM lead              WHERE owner_id = u.id) AS lead_count
       FROM "user" u
      WHERE EXISTS (SELECT 1 FROM membership WHERE user_id = u.id)
      ORDER BY lead_count DESC, u.id`,
  );

  const accounts = rows.map((r) => {
    const emailAddress = r.inbox_email || r.gmail_email || r.email || null;
    return {
      user_id: r.user_id,
      name: r.name,
      email: r.email,
      org_id: r.org_id,
      lead_count: r.lead_count,
      telnyx_phone_number: r.telnyx_phone_number,
      email_address: emailAddress,
      can_sms: Boolean(r.telnyx_phone_number),
      can_email: Boolean(emailAddress),
    };
  });

  return json({ accounts });
};
