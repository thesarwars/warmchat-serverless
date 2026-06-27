/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { requireCallerOrgRole } from "../../_shared/roleRequired.ts";

/**
 * GET /api/auth/users - users in the caller's org(s) with their role.
 * Owner/Manager only.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  if (!(await requireCallerOrgRole(env, user.id, "Owner", "Manager"))) {
    return error("Access forbidden: insufficient role", 403);
  }

  // Per-user live aggregates (leads owned, conversations, appointments, open
  // pipeline, won deals) via correlated subqueries on indexed columns
  // (lead.owner_id, deal.lead_id, lead_appointment.lead_id, inbox_messages.lead_id).
  const rows = await queryAll<{
    id: number; name: string | null; email: string; business_address: string | null;
    org_id: number; org_name: string; role_id: number | null; role_name: string | null;
    leads_count: number; conversations: number; appointments: number;
    pipeline_value: number; won_deals: number;
  }>(
    env.D1DB,
    `SELECT u.id, u.name, u.email, u.business_address,
            o.id AS org_id, o.name AS org_name,
            r.id AS role_id, r.name AS role_name,
            (SELECT COUNT(*) FROM lead l
               WHERE l.owner_id = u.id AND l.org_id = m.org_id) AS leads_count,
            (SELECT COUNT(DISTINCT im.lead_id) FROM inbox_messages im
               JOIN lead l2 ON l2.id = im.lead_id
               WHERE l2.owner_id = u.id AND l2.org_id = m.org_id) AS conversations,
            (SELECT COUNT(*) FROM lead_appointment la
               JOIN lead l3 ON l3.id = la.lead_id
               WHERE l3.owner_id = u.id AND l3.org_id = m.org_id
                 AND LOWER(IFNULL(la.status,'')) <> 'cancelled') AS appointments,
            (SELECT COALESCE(SUM(d.value),0) FROM deal d
               JOIN lead l4 ON l4.id = d.lead_id
               WHERE l4.owner_id = u.id AND l4.org_id = m.org_id
                 AND LOWER(IFNULL(d.status,'open')) = 'open') AS pipeline_value,
            (SELECT COUNT(*) FROM deal d2
               JOIN lead l5 ON l5.id = d2.lead_id
               WHERE l5.owner_id = u.id AND l5.org_id = m.org_id
                 AND LOWER(IFNULL(d2.status,'')) = 'won') AS won_deals
       FROM membership m
       JOIN "user" u ON u.id = m.user_id
       JOIN organization o ON o.id = m.org_id
       LEFT JOIN role r ON r.id = m.role_id
      WHERE m.org_id IN (SELECT org_id FROM membership WHERE user_id = ?)
      ORDER BY u.id ASC`,
    user.id,
  );
  const users = rows.map((u) => ({
    ...u,
    conversion_rate: u.leads_count > 0 ? `${Math.round((u.won_deals / u.leads_count) * 100)}%` : "0%",
  }));
  return json({ users });
};
