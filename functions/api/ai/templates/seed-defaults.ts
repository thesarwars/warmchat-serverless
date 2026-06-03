/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../../_shared/env.ts";
import { json, error } from "../../../_shared/http.ts";
import { queryAll, queryFirst } from "../../../_shared/db.ts";
import { requireUser } from "../../../_shared/auth.ts";

/**
 * POST /api/ai/templates/seed-defaults
 * Seeds the default real-estate outreach sequences for the caller's org.
 * Safe to call multiple times; upserts by (org_id, title, category_id, channel),
 * retires the old "Nurture" categories, and deactivates anything not in the
 * desired default set. org_id comes from the caller's membership (no query param).
 */

type SeedTemplate = { title: string; delay_days: number; content: string; subject?: string };
type SeedPack = { category: string; channel: "sms" | "email"; templates: SeedTemplate[] };

const DEFAULT_PACKS: SeedPack[] = [
  {
    category: "Buyer Follow-Up",
    channel: "sms",
    templates: [
      { title: "Day 0", delay_days: 0, content: "Hey {firstname}, saw you were interested in homes in {area} are you looking to buy soon or just browsing?" },
      { title: "Day 1", delay_days: 1, content: "Hi {firstname}, just wanted to follow up. Are you still looking to buy an home around {area}?" },
      { title: "Day 3", delay_days: 3, content: "Hey {firstname}, not sure if you saw my last message are you still interested in homes in {area}?" },
      { title: "Day 5", delay_days: 5, content: "Hey {firstname}, I can send you a few good options in {area} if you're still looking want me to?" },
      { title: "Day 7", delay_days: 7, content: "Hi {firstname}, I don't want to bug you I'll assume timing isn't right. Feel free to reach out anytime if that changes!" },
    ],
  },
  {
    category: "Buyer Appointment Push",
    channel: "sms",
    templates: [
      { title: "Day 0", delay_days: 0, content: "Hey {{first_name}}, would you be open in to touring a few homes this week?" },
      { title: "Day 1", delay_days: 1, content: "Hey {{first_name}}, I have a couple homes that match what you're looking for want me to set up a quick showing?" },
      { title: "Day 3", delay_days: 3, content: "Hey {{first_name}}, a few good homes are getting picked up quickly right now do you want to take a look before they're gone?" },
      { title: "Day 5", delay_days: 5, content: "Hey {{first_name}}, I'm free this week would weekday evenings or this weekend work better for you?" },
      { title: "Day 7", delay_days: 7, content: "Hey {{first_name}}, not sure if timing is right, but happy to line up some homes whenever you're ready. Just let me know." },
    ],
  },
  {
    category: "Seller Follow-Up",
    channel: "sms",
    templates: [
      { title: "Day 0", delay_days: 0, content: "Hey {firstname}, I saw you were interested in your home value.\nAre you just curious, or thinking about selling soon?" },
      { title: "Day 1", delay_days: 1, content: "Hi {firstname}, just wanted to follow up\nI ran some numbers for homes near {area}.\nWant me to send you a quick estimate of what your house can sell for in today's market." },
      { title: "Day 3", delay_days: 3, content: "Hey {firstname}, quick question homes in {area} have been selling pretty fast lately.\nHave you thought about what you'd list your home for?" },
      { title: "Day 5", delay_days: 5, content: "Hey {firstname}, no rush at all just checking in. Even if you're not ready to sell, I can keep you updated on your home value over time." },
      { title: "Day 7", delay_days: 7, content: "Hey {firstname}, I don't want to keep bugging you\nShould I close this out for now, or are you still interested in seeing your home value?" },
    ],
  },
  {
    category: "Seller Appointment Push",
    channel: "sms",
    templates: [
      { title: "Day 0", delay_days: 0, content: "Hey {firstname}, based on what you shared, it may be worth taking a closer look at your home's value. Would you be open to a quick 10-15 minute call so I can give you a more accurate estimate?" },
      { title: "Day 1", delay_days: 1, content: "Hi {firstname}, just following up.\nA quick call would help me understand your property, timeline, and what homes near you are selling for.\nDo you have time today or tomorrow?" },
      { title: "Day 3", delay_days: 3, content: "Hey {firstname}, homes in {area} can vary a lot depending on condition, upgrades, and timing.\nWant to schedule a quick home value review so I can give you a realistic number?" },
      { title: "Day 5", delay_days: 5, content: "Hi {firstname}, even if you're not ready to sell right now, it may still help to know what your options are.\nWould you like me to walk you through your estimated value and possible selling strategy?" },
      { title: "Day 7", delay_days: 7, content: "Hey {firstname}, I don't want to keep bugging you.\nShould I close this out for now, or would you still like to schedule a quick call about your home value?" },
    ],
  },
  {
    category: "Re-engagement Automation",
    channel: "sms",
    templates: [
      { title: "Day 1", delay_days: 1, content: "Hey {{first_name}}, are you still looking to buy, or did you already find a house?" },
      { title: "Day 2", delay_days: 2, content: "Hey {{first_name}}, I'm seeing some solid opportunities right now want me to send you a few that match what you're looking for?" },
      { title: "Day 4", delay_days: 4, content: "Hey {{first_name}}, what's your timeline looking like right now?" },
      { title: "Day 6", delay_days: 6, content: "Hi {{first_name}}, just checking are you still in the market right now?" },
      { title: "Day 8", delay_days: 8, content: "Hey {{first_name}}, a few strong homes just hit the market. I can send you the best ones if you're still looking?" },
    ],
  },
  {
    category: "Open House Follow up",
    channel: "sms",
    templates: [
      { title: "Day 0", delay_days: 0, content: "Hey {first_name}, it was great meeting you at the open house!\nWould you like me to send you similar homes that pop up?" },
      { title: "Day 1", delay_days: 1, content: "Hey {{first_name}}, are you actively looking to buy a home in the next 3-6 months or just exploring?" },
      { title: "Day 3", delay_days: 3, content: "Hey {{first_name}}, I came across a couple homes similar to the one you saw. Want me to send them over?" },
      { title: "Day 5", delay_days: 5, content: "Hey {{first_name}}, quick question. If you found the right home, how soon would you be ready to move?" },
      { title: "Day 7", delay_days: 7, content: "Hey {{first_name}}, not sure if you're still in the market, but happy to keep an eye out for deals that fit what you're looking for. Want me to do that?" },
    ],
  },
  {
    category: "Buyer Follow-Up",
    channel: "email",
    templates: [
      { title: "Email 1", delay_days: 0, subject: "A few homes you might like", content: "Hey {{first_name}},\nI came across a few homes that match what you're looking for.\nWant me to send them your way?\n- {{agent_name}}" },
      { title: "Email 2", delay_days: 2, subject: "Quick question for you", content: "Hi {{first_name}},\nJust wanted to check are you actively looking right now, or still exploring your options?\n- {{agent_name}}" },
      { title: "Email 3", delay_days: 4, subject: "Good opportunities hitting the market", content: "Hey {{first_name}},\nThere are a few homes hitting the market right now that are priced really well compared to others nearby.\nIf you want, I can send you the best ones before they get picked up.\n- {{agent_name}}" },
      { title: "Email 4", delay_days: 6, subject: "This week or weekend?", content: "Hey {{first_name}},\nI'm showing a few homes this week that match what you're looking for.\nWould you be open to taking a look Wednesday or Saturday?\n- {{agent_name}}" },
      { title: "Email 5", delay_days: 8, subject: "Should I keep sending homes?", content: "Hey {{first_name}},\nJust wanted to check in to see if you want me to send you good options as they come up.\nJust let me know.\n- {{agent_name}}" },
    ],
  },
  {
    category: "Buyer Appointment Push",
    channel: "email",
    templates: [
      { title: "Day 0", delay_days: 0, subject: "Quick question about your home search", content: "Hey {firstname},\nI saw you were looking at homes recently-are you actively trying to find something right now, or just browsing?\nI'd be happy to send you some options that match exactly what you're looking for and even set up private tours if anything stands out.\nLet me know.\n- {agent_name}" },
      { title: "Day 1", delay_days: 1, subject: "Found a few homes you might like", content: "Hey {firstname},\nI came across a few homes in {area} that could be a great fit based on what you're looking for.\nWould you like me to send them over? I can also set up a time to tour any that catch your eye.\n- {agent_name}" },
      { title: "Day 3", delay_days: 3, subject: "Want to see any homes this week?", content: "Hey {firstname},\nQuick question-if you found the right home, would you want to see it in person this week?\nHomes in {area} have been moving pretty quickly, so I can help you get in early if something pops up.\n- {agent_name}" },
      { title: "Day 5", delay_days: 5, subject: "Should I keep sending homes?", content: "Hey {firstname},\nNot sure where you're at in the process, but I didn't want to overload you.\nDo you want me to keep sending you homes that match what you're looking for, or are you still just exploring for now?\nHappy to help either way.\n- {agent_name}" },
      { title: "Day 7", delay_days: 7, subject: "Still looking or pause for now?", content: "Hey {firstname},\nI haven't heard back, so I just wanted to check in one last time.\nShould I keep an eye out for homes and reach out when something good pops up, or would you prefer I close this out for now?\nEither way, feel free to reach out anytime.\n- {agent_name}" },
    ],
  },
  {
    category: "Seller Follow-Up",
    channel: "email",
    templates: [
      { title: "Email 1", delay_days: 0, subject: "Buyers looking in your area", content: "Hey {{first_name}},\nI've been working with a few buyers actively looking in your area, and your home came up.\nHave you thought about selling, or just keeping an eye on the market?\n- {{agent_name}}" },
      { title: "Email 2", delay_days: 2, subject: "What your home could sell for", content: "Hey {{first_name}},\nQuick heads up-homes around you have been selling strong recently.\nIf you're curious, I can give you a idea of what your home would sell for in today's market.\n- {{agent_name}}" },
      { title: "Email 3", delay_days: 4, subject: "Strong demand right now", content: "Hey {{first_name}},\nThere's still solid buyer demand right now, especially for homes like yours.\nThe ones priced right are moving quickly and getting strong offers.\nWant me to show you what that could look like for your place?\n- {{agent_name}}" },
      { title: "Email 4", delay_days: 6, subject: "This week or weekend", content: "Hey {{first_name}},\nIf you're open to it, I can swing by for a quick 10-minute walkthrough and give you a realistic price + strategy.\nNo pressure at all, just helpful info.\nWould this week or weekend be better?\n- {{agent_name}}" },
      { title: "Email 5", delay_days: 8, subject: "Still thinking about selling?", content: "Hey {{first_name}},\nNot sure where you're at with selling, but I can keep you updated on what homes near you are actually selling for.\nJust let me know.\n- {{agent_name}}" },
    ],
  },
  {
    category: "Seller Appointment Push",
    channel: "email",
    templates: [
      { title: "Day 0", delay_days: 0, subject: "Quick question about your home's value", content: "Hey {firstname}, based on what you shared, it may be worth taking a closer look at your home's value. Would you be open to a quick 10-15 minute call so I can give you a more accurate estimate?\n- {agent_name}" },
      { title: "Day 1", delay_days: 1, subject: "Following up - a quick call would help", content: "Hi {firstname}, just following up.\nA quick call would help me understand your property, timeline, and what homes near you are selling for.\nDo you have time today or tomorrow?\n- {agent_name}" },
      { title: "Day 3", delay_days: 3, subject: "Getting you a realistic number", content: "Hey {firstname}, homes in {area} can vary a lot depending on condition, upgrades, and timing.\nWant to schedule a quick home value review so I can give you a realistic number?\n- {agent_name}" },
      { title: "Day 5", delay_days: 5, subject: "Know your options before you decide", content: "Hi {firstname}, even if you're not ready to sell right now, it may still help to know what your options are.\nWould you like me to walk you through your estimated value and possible selling strategy?\n- {agent_name}" },
      { title: "Day 7", delay_days: 7, subject: "Last check-in", content: "Hey {firstname}, I don't want to keep bugging you.\nShould I close this out for now, or would you still like to schedule a quick call about your home value?\n- {agent_name}" },
    ],
  },
  {
    category: "Open house follow up",
    channel: "email",
    templates: [
      { title: "Email 1", delay_days: 0, subject: "About the open house", content: "Hey {{first_name}}, It was great meeting you at the open house today. Let me know if you'd like to tour any homes or if you have any questions.\n- {{agent_name}}" },
      { title: "Email 2", delay_days: 1, subject: "A few options you might like", content: "Hey {{first_name}},\nBased on what you liked at the open house, I can send you a few similar homes that just hit the market.\nWant me to send those over?\n- {{agent_name}}" },
      { title: "Message 3", delay_days: 3, subject: "Quick Update", content: "Hey {{first_name}},\nJust a heads up homes like the one you saw are moving pretty quickly right now.\nLet me know if you'd like me to send similar options.\n- {{agent_name}}" },
      { title: "Message 4", delay_days: 5, subject: "Want to see a few homes?", content: "Hey {{first_name}},\nI'm showing a few homes this week that are similar to the one you saw.\nWould you be open to taking a look on weekday evening or weekend?\n- {{agent_name}}" },
      { title: "Message 5", delay_days: 7, subject: "Still looking?", content: "Hey {{first_name}},\nNot sure where you're at in your search, but I can keep sending you strong options as they come up.\nJust let me know.\n- {{agent_name}}" },
    ],
  },
  {
    category: "Re engagement automation",
    channel: "email",
    templates: [
      { title: "Email 1", delay_days: 0, subject: "Quick check-in", content: "Hey {{first_name}},\nNot sure where you're at with your home search right now. Are you still looking, or did you put things on hold?\n- {{agent_name}}" },
      { title: "Message 2", delay_days: 2, subject: "Homes you might like", content: "Hey {{first_name}},\nA few solid homes just came up that fit what you were looking for.\nWant me to send you the best ones?\n- {{agent_name}}" },
      { title: "Message 3", delay_days: 4, subject: "Market Update", content: "Hey {{first_name}},\nQuick update I'm seeing some price adjustments and better opportunities popping up right now.\nCould be a good time to take another look. Let me know if you'd like me to send options that may interest you.\n- {{agent_name}}" },
      { title: "Message 4", delay_days: 6, subject: "Timing might be better now", content: "Hey {{first_name}},\nSome buyers who paused a few months ago are starting to jump back in right now.\nIf you've been thinking about it again, I can help you move at the right time.\n- {{agent_name}}" },
      { title: "Message 5", delay_days: 8, subject: "Let me know", content: "Hey {{first_name}},\nNot sure if now just isn't the right time totally fine if that's the case.\nShould I stop sending homes for now, or do you still want to stay updated?\n- {{agent_name}}" },
    ],
  },
];

type DelayMeta = { label: string; seconds: number; send_at: string | null; timezone: string | null };

const delayMetadata = (categoryName: string, title: string, delayDays: number): DelayMeta => {
  const cat = (categoryName || "").toLowerCase();
  const ttl = (title || "").toLowerCase();
  const day = Number.isFinite(delayDays) ? Math.trunc(delayDays) : 0;

  if (day === 0) {
    if (cat.includes("seller follow")) return { label: "1 hour after lead entered", seconds: 60 * 60, send_at: null, timezone: null };
    if (cat.includes("open house")) return { label: "Same day within 1-3 hours", seconds: 60 * 60, send_at: null, timezone: null };
    if (cat.includes("seller appointment")) return { label: "Send instantly / after reply", seconds: 0, send_at: null, timezone: null };
    return { label: "Send Instantly", seconds: 0, send_at: null, timezone: null };
  }
  if ((cat.includes("nurture") || cat.includes("buyer follow")) && ttl.startsWith("day 1")) {
    return { label: "Next Day @ 9:00 AM PST", seconds: 24 * 60 * 60, send_at: "09:00", timezone: "America/Los_Angeles" };
  }
  if ((cat.includes("nurture") || cat.includes("buyer follow")) && ["day 3", "day 5", "day 7"].includes(ttl)) {
    return { label: "2 Days Later @ 9:00 AM PST", seconds: day * 24 * 60 * 60, send_at: "09:00", timezone: "America/Los_Angeles" };
  }
  if (day === 1) {
    return { label: "Next Day @ 9:00 AM PST", seconds: 24 * 60 * 60, send_at: "09:00", timezone: "America/Los_Angeles" };
  }
  return { label: `After ${day} days @ 9:00 AM PST`, seconds: day * 24 * 60 * 60, send_at: "09:00", timezone: "America/Los_Angeles" };
};

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

  // Whole upsert runs as ~6 D1 round-trips total (was ~120+ for 60 templates).
  // Concurrency safety comes from the UNIQUE indexes declared in sql/6.create-automations.sql
  // (uq_template_categories_org_name + uq_message_templates_org_cat_channel_title):
  // two simultaneous calls each UPSERT and the second is a no-op, no duplicates possible.

  const desiredCategoryNames = [...new Set(DEFAULT_PACKS.map((p) => p.category))];

  // ── Round-trip 1: upsert every category (active = 1 on conflict). ──────────
  const categoryStmts = desiredCategoryNames.map((name) =>
    env.D1DB.prepare(
      `INSERT INTO template_categories (name, org_id, is_active) VALUES (?, ?, 1)
       ON CONFLICT (org_id, name) DO UPDATE SET is_active = 1`,
    ).bind(name, orgId),
  );
  await env.D1DB.batch(categoryStmts);

  // ── Round-trip 2: fetch category ids so we can attach templates to them. ───
  const categoryRows = await queryAll<{ id: number; name: string }>(
    env.D1DB,
    `SELECT id, name FROM template_categories WHERE org_id = ? AND name IN (${desiredCategoryNames.map(() => "?").join(", ")})`,
    orgId, ...desiredCategoryNames,
  );
  const categoryIdByName = new Map(categoryRows.map((r) => [r.name, r.id]));

  // Count templates that already exist so the toast can show a sensible "created" number.
  const existingDesired = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM message_templates
       WHERE org_id = ? AND category_id IN (${categoryRows.map(() => "?").join(", ") || "NULL"})
         AND is_active = 1`,
    orgId, ...categoryRows.map((r) => r.id),
  );
  const alreadyHad = existingDesired?.n ?? 0;

  // ── Round-trip 3: upsert every template (60 statements, single transaction). ─
  const templateStmts = DEFAULT_PACKS.flatMap((pack) => {
    const catId = categoryIdByName.get(pack.category);
    if (catId === undefined) return [];
    return pack.templates.map((t) => {
      const meta = delayMetadata(pack.category, t.title, t.delay_days);
      return env.D1DB.prepare(
        `INSERT INTO message_templates
           (title, content, subject, channel, delay_days, delay_label, delay_seconds,
            send_at, timezone, category_id, org_id, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT (org_id, category_id, channel, title) DO UPDATE SET
           content = excluded.content,
           subject = excluded.subject,
           delay_days = excluded.delay_days,
           delay_label = excluded.delay_label,
           delay_seconds = excluded.delay_seconds,
           send_at = excluded.send_at,
           timezone = excluded.timezone,
           is_active = 1`,
      ).bind(
        t.title, t.content, t.subject ?? null, pack.channel, t.delay_days,
        meta.label, meta.seconds, meta.send_at, meta.timezone, catId, orgId, createdBy,
      );
    });
  });
  await env.D1DB.batch(templateStmts);

  // ── Round-trip 4: cleanup batch (old Nurture + non-desired categories). ─
  const placeholders = desiredCategoryNames.map(() => "?").join(", ");
  await env.D1DB.batch([
    // Retire the old "Nurture" category + its templates explicitly.
    env.D1DB.prepare(`UPDATE template_categories SET is_active = 0 WHERE org_id = ? AND name = 'Nurture'`).bind(orgId),
    env.D1DB.prepare(
      `UPDATE message_templates SET is_active = 0
         WHERE category_id IN (SELECT id FROM template_categories WHERE org_id = ? AND name = 'Nurture')`,
    ).bind(orgId),
    // Deactivate any category not in the desired default set - but never one
    // that holds agent-tagged templates (the per-agent library lives in its own
    // categories like Reply/Qualify/Booking and must survive this sweep).
    env.D1DB.prepare(
      `UPDATE template_categories SET is_active = 0
         WHERE org_id = ? AND name NOT IN (${placeholders})
           AND NOT EXISTS (
             SELECT 1 FROM message_templates m
              WHERE m.category_id = template_categories.id AND m.agent IS NOT NULL
           )`,
    ).bind(orgId, ...desiredCategoryNames),
  ]);

  // ── Round-trip 5: fetch active templates so we can deactivate ones whose ──
  // (category_name, channel, title) triple isn't in the desired set, so
  // user-added rows in seeded categories get retired alongside the seed.
  const desiredKeys = new Set(
    DEFAULT_PACKS.flatMap((p) => p.templates.map((t) => `${p.category}||${p.channel}||${t.title}`)),
  );
  const activeTemplates = await queryAll<{ id: number; title: string; channel: string | null; category_name: string }>(
    env.D1DB,
    `SELECT mt.id, mt.title, mt.channel, c.name AS category_name
       FROM message_templates mt
       JOIN template_categories c ON c.id = mt.category_id
       WHERE mt.org_id = ? AND mt.is_active = 1 AND mt.agent IS NULL`,
    orgId,
  );
  const toDeactivate = activeTemplates.filter(
    (t) => !desiredKeys.has(`${t.category_name}||${t.channel}||${t.title}`),
  );

  // ── Round-trip 6 (skipped if nothing to clean): deactivate stragglers. ─────
  if (toDeactivate.length > 0) {
    await env.D1DB.batch(
      toDeactivate.map((t) =>
        env.D1DB.prepare(`UPDATE message_templates SET is_active = 0 WHERE id = ?`).bind(t.id),
      ),
    );
  }

  const total = templateStmts.length;
  return json({ ok: true, created: Math.max(0, total - alreadyHad), updated: Math.min(total, alreadyHad), count: total });
};
