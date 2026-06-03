/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";
import type { AgentKey } from "../../../_shared/aiAgents.ts";
import { isAgentKey } from "../../../_shared/aiAgents.ts";

/**
 * POST /api/ai/templates/seed-agent-library  (optional body { agent })
 * Seeds the curated per-agent template library shown on each agent's Templates
 * tab (the design's t-in-* / t-out-* / t-as-* set). Idempotent: upserts by
 * (org_id, category_id, channel, title) and never touches the automation packs
 * seeded by seed-defaults (those have agent IS NULL). The agent Templates tab
 * calls this when it finds no templates, then waits for it to finish.
 */

interface SeedTpl {
  agent: AgentKey;
  title: string;
  channel: "sms" | "email" | "style";
  category: string;
  body: string;
  sent: number;
  minsAgo: number;
}

const LIBRARY: SeedTpl[] = [
  // ── Inbound ──────────────────────────────────────────────────────────────
  { agent: "inbound", title: "New Zillow lead - instant reply", channel: "sms", category: "Reply", sent: 142, minsAgo: 2,
    body: "Hey {{first_name}}! This is Joseph w/ JOV Realty - saw you were checking out {{property}}. Are you still looking in {{area}}, or just browsing? Happy to send a few that match what you want." },
  { agent: "inbound", title: "Qualifying - timeline", channel: "sms", category: "Qualify", sent: 96, minsAgo: 8,
    body: "Great! When are you hoping to move? Just trying to figure out if we should look this week or play the long game." },
  { agent: "inbound", title: "Qualifying - budget & pre-approval", channel: "sms", category: "Qualify", sent: 88, minsAgo: 12,
    body: "Got it. What's your comfortable price range? And are you already pre-approved? No worries either way - I can connect you with someone if not." },
  { agent: "inbound", title: "Missed call -> auto text", channel: "sms", category: "Reply", sent: 54, minsAgo: 32,
    body: "Hey {{first_name}}, sorry I missed your call! Text me here whenever - I'm usually faster on text anyway. - Joseph" },
  { agent: "inbound", title: "Website form confirmation", channel: "email", category: "Reply", sent: 38, minsAgo: 60,
    body: "Hi {{first_name}},\n\nThanks for reaching out about {{property}}. I'll have a couple of options for you within the next 10 minutes.\n\nQuick Q so I can tailor what I send: are you looking to be in by a certain date?\n\n- Joseph Velasquez\nJOV Realty" },
  { agent: "inbound", title: "Booking offer - 3 slots", channel: "sms", category: "Booking", sent: 31, minsAgo: 17,
    body: "Want to walk through it this week? I've got {{slot_1}}, {{slot_2}}, or {{slot_3}} open. Reply with one and I'll lock it in." },

  // ── Outbound ─────────────────────────────────────────────────────────────
  { agent: "outbound", title: "Cold follow-up - day 1", channel: "sms", category: "Cold", sent: 412, minsAgo: 1,
    body: "Hey {{first_name}} - circling back on {{property}}. Still on your radar? No pressure, just want to make sure I'm not the one dropping the ball." },
  { agent: "outbound", title: "Cold follow-up - day 3", channel: "sms", category: "Cold", sent: 298, minsAgo: 4,
    body: "{{first_name}}, two more just came on in {{area}} similar to what you were looking at. Want me to send them over?" },
  { agent: "outbound", title: "Open house thank-you", channel: "sms", category: "Event", sent: 64, minsAgo: 120,
    body: "Thanks for stopping by {{property}} today! What'd you think? Worth a second look or not really your vibe?" },
  { agent: "outbound", title: "Re-engagement - 90 day check-in", channel: "sms", category: "Re-engage", sent: 184, minsAgo: 180,
    body: "Hey {{first_name}}, been a minute. Quick {{area}} market update: prices are {{trend}}. Still on the fence, or has life moved on? Either's a fine answer." },
  { agent: "outbound", title: "Buyer match - weekly digest", channel: "email", category: "Nurture", sent: 128, minsAgo: 1440,
    body: "Hi {{first_name}},\n\n3 new listings hit this week that match what you're after in {{area}}:\n\n{{listing_block}}\n\nWant me to schedule any?\n\n- Joseph" },
  { agent: "outbound", title: "Seller - quarterly home value", channel: "email", category: "Nurture", sent: 42, minsAgo: 360,
    body: "Hi {{first_name}},\n\nYour Q{{quarter}} home value report for {{address}} is ready. Estimated: {{value}} (that's {{change}} since last quarter).\n\nNot selling yet? Totally fine - I'll keep these coming so you've got the data when you need it.\n\n- Joseph" },

  // ── Assistant (style / tone guides) ────────────────────────────────────────
  { agent: "assistant", title: "Reply tone - friendly & casual", channel: "style", category: "Tone", sent: 0, minsAgo: 5,
    body: "Match how the lead writes. Use contractions, short sentences, one question at a time. Drop a 'yeah' or 'got it' if it fits. Never sound like a brochure." },
  { agent: "assistant", title: "Reply tone - firm but warm", channel: "style", category: "Tone", sent: 0, minsAgo: 60,
    body: "Direct, no hedging. Get to the point in the first sentence. Still warm - no robotic 'per my last message'. Use when leads ghost, miss appointments, or push on price." },
  { agent: "assistant", title: "Lead summary format", channel: "style", category: "Format", sent: 0, minsAgo: 12,
    body: "3 lines max:\n• Where they are (stage, last contact)\n• What they want (criteria + urgency)\n• Best next move (1 specific action with timing)" },
  { agent: "assistant", title: "Next-step coach", channel: "style", category: "Coach", sent: 0, minsAgo: 8,
    body: "Suggest the highest-leverage action, not the safest one. Push for a call or showing when intent is high. Suggest patience (drip -> wait) when lead is cold or unresponsive." },
];

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);

  const membership = await queryFirst<{ org_id: number }>(
    env.D1DB, `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`, user.id,
  );
  if (!membership) return error("User not part of organization", 403);
  const orgId = membership.org_id;
  const createdBy = String(user.id);

  // Optional ?/body agent filter so an empty single tab can seed just its slice.
  let only: AgentKey | null = null;
  try {
    const body = (await request.json()) as { agent?: string } | null;
    if (body?.agent && isAgentKey(body.agent)) only = body.agent;
  } catch { /* no body = seed all agents */ }
  const rows = only ? LIBRARY.filter((t) => t.agent === only) : LIBRARY;

  // 1) Ensure each distinct category exists for this org.
  const categories = [...new Set(rows.map((t) => t.category))];
  await env.D1DB.batch(categories.map((name) =>
    env.D1DB.prepare(
      `INSERT INTO template_categories (name, org_id, is_active) VALUES (?, ?, 1)
       ON CONFLICT (org_id, name) DO UPDATE SET is_active = 1`,
    ).bind(name, orgId),
  ));

  // 2) Resolve category ids.
  const catRows = await queryAll<{ id: number; name: string }>(
    env.D1DB,
    `SELECT id, name FROM template_categories WHERE org_id = ? AND name IN (${categories.map(() => "?").join(", ")})`,
    orgId, ...categories,
  );
  const catId = new Map(catRows.map((r) => [r.name, r.id]));
  const now = Date.now();

  // 3) Upsert templates (idempotent on the unique (org,cat,channel,title) index).
  await env.D1DB.batch(rows.flatMap((t) => {
    const cid = catId.get(t.category);
    if (cid === undefined) return [];
    const lastUsed = new Date(now - t.minsAgo * 60_000).toISOString();
    return [env.D1DB.prepare(
      `INSERT INTO message_templates
         (title, content, channel, agent, sent_count, last_used_at, category_id, org_id, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT (org_id, category_id, channel, title) DO UPDATE SET
         content = excluded.content,
         agent = excluded.agent,
         sent_count = excluded.sent_count,
         last_used_at = excluded.last_used_at,
         is_active = 1`,
    ).bind(t.title, t.body, t.channel, t.agent, t.sent, lastUsed, cid, orgId, createdBy)];
  }));

  return json({ ok: true, count: rows.length });
};
