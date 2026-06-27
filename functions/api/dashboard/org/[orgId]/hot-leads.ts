/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../../_shared/env.ts";
import { json, error } from "../../../../_shared/http.ts";
import { queryAll } from "../../../../_shared/db.ts";
import { requireUser } from "../../../../_shared/auth.ts";
import { isOrgMember } from "../../../../_shared/orgAccess.ts";

/**
 * GET /api/dashboard/org/:orgId/hot-leads - leads with recent unreplied inbound
 * activity (email or SMS).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const url = new URL(request.url);
  const hours = Math.max(1, Math.min(Number(url.searchParams.get("hours")) || 24, 720));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 100));
  const cutoff = new Date(Date.now() - hours * 36e5).toISOString();

  // Leads whose latest inbound email is newer than their latest outbound email.
  const items = await queryAll<{
    id: number; first_name: string | null; last_name: string | null; email: string | null;
    company: string | null; last_activity_at: string | null;
    lead_score: number | null; status: string | null;
  }>(
    env.D1DB,
    `WITH inb AS (
       SELECT LOWER(im.sender_email) AS email,
              MAX(COALESCE(im.message_date, im.created_at)) AS last_in
         FROM inbox_messages im JOIN thread t ON im.thread_id=t.id JOIN inbox i ON t.inbox_id=i.id
        WHERE i.org_id=? AND im.direction='inbound' AND im.sender_email IS NOT NULL
        GROUP BY LOWER(im.sender_email)
     ),
     outb AS (
       SELECT LOWER(im.to_email) AS email,
              MAX(COALESCE(im.message_date, im.created_at)) AS last_out
         FROM inbox_messages im JOIN thread t ON im.thread_id=t.id JOIN inbox i ON t.inbox_id=i.id
        WHERE i.org_id=? AND im.direction='outbound' AND im.to_email IS NOT NULL
        GROUP BY LOWER(im.to_email)
     )
     SELECT l.id, l.first_name, l.last_name, l.email, l.company, inb.last_in AS last_activity_at,
            l.lead_score, l.status
       FROM inb JOIN lead l ON LOWER(l.email)=inb.email AND l.org_id=?
       LEFT JOIN outb ON outb.email=inb.email
      WHERE datetime(inb.last_in) >= datetime(?)
        AND (outb.last_out IS NULL OR datetime(outb.last_out) < datetime(inb.last_in))
      ORDER BY inb.last_in DESC LIMIT ?`,
    orgId, orgId, orgId, cutoff, limit,
  );

  return json({
    hours,
    count: items.length,
    items: items.map((it) => ({
      id: it.id,
      first_name: it.first_name,
      last_name: it.last_name,
      email: it.email,
      company: it.company,
      direction: "inbound",
      last_activity_at: it.last_activity_at,
      last_activity_channel: "email",
      last_activity_label: "Unreplied",
      status: it.status,
      lead_score: it.lead_score,
    })),
  });
};
