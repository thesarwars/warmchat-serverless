/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error } from "../../_shared/http.ts";
import { queryFirst } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET /api/ai-agent/stats - headline numbers for the AI Agent page.
 * Today-window counts for outbound conversations, qualified leads (status =
 * 'Qualified' or qualification_status set), appointments booked today, and a
 * rough "typing saved" estimate (~40 chars per minute typed).
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const m = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!m) return error("User not part of organization", 403);
  const orgId = m.org_id;

  const startOfDay = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  // Conversations replied to today = distinct threads with outbound message today.
  const replied = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(DISTINCT im.thread_id) AS n
       FROM inbox_messages im
       JOIN thread t ON im.thread_id = t.id
       JOIN inbox i ON t.inbox_id = i.id
      WHERE i.org_id = ? AND im.direction = 'outbound'
        AND datetime(COALESCE(im.message_date, im.created_at)) >= datetime(?)`,
    orgId, startOfDay,
  );

  // Qualified new leads today.
  const qualified = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM lead
      WHERE org_id = ?
        AND (LOWER(COALESCE(status, '')) = 'qualified'
             OR LOWER(COALESCE(qualification_status, '')) IN ('qualified','warm','hot'))
        AND datetime(updated_at) >= datetime(?)`,
    orgId, startOfDay,
  );

  // Appointments booked today.
  const booked = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(id) AS n FROM lead_appointment
      WHERE org_id = ? AND datetime(created_at) >= datetime(?)`,
    orgId, startOfDay,
  );

  // Rough typing-saved estimate: total length of AI-sent outbound messages /
  // (40 chars per minute typing rate). Outbound rows with no `sender_id`
  // (i.e. no human user attributed) are treated as AI-sent.
  const aiChars = await queryFirst<{ chars: number | null }>(
    env.D1DB,
    `SELECT SUM(LENGTH(COALESCE(im.body, ''))) AS chars
       FROM inbox_messages im
       JOIN thread t ON im.thread_id = t.id
       JOIN inbox i ON t.inbox_id = i.id
      WHERE i.org_id = ? AND im.direction = 'outbound'
        AND im.sender_id IS NULL
        AND datetime(COALESCE(im.message_date, im.created_at)) >= datetime(?)`,
    orgId, startOfDay,
  );
  const charsTyped = Number(aiChars?.chars ?? 0);
  const hoursSaved = +(charsTyped / (40 * 60)).toFixed(1);

  return json({
    replied_to: Number(replied?.n ?? 0),
    qualified: Number(qualified?.n ?? 0),
    booked: Number(booked?.n ?? 0),
    hours_saved: hoursSaved,
  });
};
