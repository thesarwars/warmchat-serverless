/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryAll } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";
import { isOrgMember } from "../../_shared/orgAccess.ts";

interface ActivityRow {
  id: number; created_at: string | null; subject: string | null; body: string | null;
  sender_email: string | null; sender_name: string | null; is_read: number;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("");
}
function relTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(diffMs)) return "";
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}

/**
 * GET /api/recent/:orgId - recent inbound activity feed.
 * ?limit=10 (default), ?since=ISO (optional).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const orgId = Number(params.orgId);
  if (!Number.isInteger(orgId)) return error("Invalid org id", 400);
  if (!(await isOrgMember(env, user.id, orgId))) return error("Forbidden", 403);

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 10, 100));
  const since = url.searchParams.get("since");

  const emails = await queryAll<ActivityRow>(
    env.D1DB,
    `SELECT im.id, COALESCE(im.message_date, im.created_at) AS created_at,
            im.subject, im.body, im.sender_email, im.sender_name, im.is_read
       FROM inbox_messages im JOIN thread t ON im.thread_id=t.id JOIN inbox i ON t.inbox_id=i.id
      WHERE i.org_id = ? AND im.direction = 'inbound'
        ${since ? "AND datetime(COALESCE(im.message_date, im.created_at)) >= datetime(?)" : ""}
      ORDER BY COALESCE(im.message_date, im.created_at) DESC LIMIT ?`,
    ...(since ? [orgId, since, limit] : [orgId, limit]),
  );

  const items = emails.map((m) => ({
    id: `email-${m.id}`,
    type: "message",
    source: "email",
    person: { id: m.id, name: m.sender_name || m.sender_email || "Unknown", avatarInitials: initials(m.sender_name || m.sender_email) },
    text: (m.body || "").slice(0, 240),
    meta: m.subject,
    time_iso: m.created_at,
    time: relTime(m.created_at),
    unread: !m.is_read,
    channel: "email",
    created_at: m.created_at,
  }));

  return json({
    items,
    replies: items.slice(0, 5),
    count: items.length,
    last_updated: new Date().toISOString(),
  });
};
