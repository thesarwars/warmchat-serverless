/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { queryFirst, execute } from "../../_shared/db.ts";
import { hashPassword } from "../../_shared/password.ts";
import { issueSession, buildAuthBody, type UserRow } from "../../_shared/auth.ts";
import { setAuthCookies } from "../../_shared/cookies.ts";
import { verifyTurnstile } from "../../_shared/turnstile.ts";
import { normalizeTimezone } from "../../_shared/timezoneAliases.ts";

interface Body {
  name?: string;
  email?: string;
  password?: string;
  org_name?: string;
  /** Browser-detected IANA timezone (Intl...resolvedOptions().timeZone). */
  timezone?: string;
  turnstileToken?: string;
  /** Did the user check the "I agree to Terms + Privacy" box at signup? */
  terms_accepted?: boolean;
  /** Version of the Terms/Privacy the UI showed them (e.g. "2026-05"). */
  terms_version?: string;
}

/**
 * Active ToS / Privacy version. Bump this whenever the legal text materially
 * changes - returning users whose stored terms_version != CURRENT_TERMS_VERSION
 * can then be prompted to re-accept.
 */
const CURRENT_TERMS_VERSION = "2026-05";

/**
 * Default lead qualification questions seeded for every new workspace
 * (AI Settings -> Qualifications). One question per row, scoped by lead type via
 * `applies_to`; the inbound AI works through the relevant ones to qualify a lead.
 * Mirrored in sql/100.seed.sql for the test users - keep both in sync.
 */
const DEFAULT_QUALIFICATIONS: Array<{ applies_to: string; question: string; guidance: string }> = [
  { applies_to: "buyer", question: "What price range are you hoping to stay around?", guidance: "Save to price_range." },
  { applies_to: "buyer", question: "Are you looking to buy in the next few months or just exploring for now?", guidance: "Save to timeline." },
  { applies_to: "buyer", question: "Have you already gotten pre-approved, or still figuring out the financing side?", guidance: "Save to financing_status and pre_approved." },
  { applies_to: "buyer", question: "What area are you hoping to buy in?", guidance: "Save to area; ask only if the area is still unknown." },
  { applies_to: "seller", question: "What's the property address or area?", guidance: "Save to property_address." },
  { applies_to: "seller", question: "Is the home currently owner-occupied, rented, or vacant?", guidance: "Save to occupancy_status." },
  { applies_to: "seller", question: "What's got you thinking about selling?", guidance: "Save to motivation." },
  { applies_to: "renter", question: "What area are you hoping to rent in?", guidance: "Save to area." },
  { applies_to: "renter", question: "What monthly budget would you like to stay around?", guidance: "Save to price_range." },
  { applies_to: "renter", question: "How many bedrooms are you looking for?", guidance: "Save to bedrooms." },
  { applies_to: "renter", question: "When are you hoping to move?", guidance: "Save to timeline." },
];

/**
 * POST /api/auth/register - self-serve signup.
 * Creates the user, an organization they own, and an Owner membership, sets
 * HttpOnly token cookies, and returns the flat profile body (no tokens).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await readJson<Body>(request);

  const name = body?.name?.trim();
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!name || !email || !password) {
    return error("Missing required fields", 400);
  }

  if (!(await verifyTurnstile(env, body?.turnstileToken, request))) {
    return error("Captcha verification failed. Please try again.", 400);
  }

  // TCPA + contract-formation evidence: refuse registration without explicit
  // acceptance of the Terms + Privacy. The acceptance timestamp + version are
  // written to the user row so a future dispute can prove what they agreed to.
  if (body?.terms_accepted !== true) {
    return error("You must accept the Terms of Service and Privacy Policy.", 400, {
      code: "TERMS_NOT_ACCEPTED",
    });
  }
  const termsVersion = (body?.terms_version || "").trim() || CURRENT_TERMS_VERSION;

  const existing = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM "user" WHERE email = ?`,
    email,
  );
  if (existing) return error("Email already registered", 400);

  const passwordHash = await hashPassword(password);
  const userInsert = await execute(
    env.D1DB,
    `INSERT INTO "user" (name, email, password_hash, terms_accepted_at, terms_version)
       VALUES (?, ?, ?, ?, ?)`,
    name,
    email,
    passwordHash,
    new Date().toISOString(),
    termsVersion,
  );
  const userId = Number(userInsert.meta.last_row_id);

  // Owner-owned organization. Seed the workspace timezone from the browser-
  // detected zone the signup form sends so the account/booking/quiet-hours
  // default matches the user's locale instead of always falling to Eastern.
  const orgName = body?.org_name?.trim() || `${name}'s Workspace`;
  const orgTimezone = normalizeTimezone(body?.timezone);
  const orgInsert = orgTimezone
    ? await execute(
        env.D1DB,
        `INSERT INTO organization (name, owner_id, timezone) VALUES (?, ?, ?)`,
        orgName,
        userId,
        orgTimezone,
      )
    : await execute(
        env.D1DB,
        `INSERT INTO organization (name, owner_id) VALUES (?, ?)`,
        orgName,
        userId,
      );
  const orgId = Number(orgInsert.meta.last_row_id);

  // Ensure the Owner role exists, then attach membership.
  await execute(env.D1DB, `INSERT OR IGNORE INTO role (name) VALUES ('Owner')`);
  const ownerRole = await queryFirst<{ id: number }>(
    env.D1DB,
    `SELECT id FROM role WHERE name = 'Owner'`,
  );
  await execute(
    env.D1DB,
    `INSERT INTO membership (user_id, org_id, role_id) VALUES (?, ?, ?)`,
    userId,
    orgId,
    ownerRole!.id,
  );

  // Seed onboarding_progress so the post-auth GET /api/onboarding/:userId
  // returns step=1 and the UI routes to /onboarding instead of /dashboard.
  await execute(
    env.D1DB,
    `INSERT INTO onboarding_progress (user_id) VALUES (?)`,
    userId,
  );

  // Seed an inbound auto-response config row ON by default. The workspace master
  // switch (below) stays OFF, so nothing sends until the user explicitly turns AI
  // on - this just means Inbound is already enabled when they flip the master.
  // Reactive replies run through the qualification flow; there is no
  // instant/day1/day3 drip (that duplicated the outbound automation, so it was
  // removed). always_say / never_say start with sensible real-estate defaults
  // (the agent can edit them in AI Knowledge Base).
  await execute(
    env.D1DB,
    `INSERT INTO auto_response_settings (user_id, org_id, enabled, always_say, never_say, escalation_keywords)
     VALUES (?, ?, 1, ?, ?, ?)`,
    userId, orgId,
    JSON.stringify(["Local market expertise", "Pre-approval recommendation", "Free home valuation"]),
    JSON.stringify(["Guaranteed results", "Lowest rates", "Guaranteed pricing"]),
    JSON.stringify(["Wants to buy now", "Wants to sell now", "Requests phone call", "Wants to make an offer", "Commission questions", "Financing questions", "Legal or compliance questions", "Lead is upset"]),
  );
  await execute(
    env.D1DB,
    `INSERT OR IGNORE INTO app_settings (org_id, key, value) VALUES (?, 'ai_master_enabled', '0')`,
    orgId,
  );
  // Inbound + Outbound agents ON by default. The global master (above) stays OFF,
  // so this never sends anything on its own - it just means a user only has to
  // flip the master instead of every switch. Seeding explicit rows keeps reads +
  // the cron gate consistent and avoids a later persona PATCH (which has no
  // `enabled`) inserting them as OFF. Inbound also mirrors into
  // auto_response_settings.enabled (seeded =1 above), which the follow-up engine reads.
  await execute(
    env.D1DB,
    `INSERT OR IGNORE INTO ai_agent_state (org_id, user_id, agent_key, enabled) VALUES (?, ?, 'outbound', 1), (?, ?, 'inbound', 1)`,
    orgId, userId, orgId, userId,
  );

  // Seed the AI Knowledge Profile + starter FAQs so the AI section is populated
  // out of the box (agent name/email from the account; sensible defaults the
  // agent edits in AI Settings / Knowledge Base). Best-effort - never abort signup.
  try {
    await execute(
      env.D1DB,
      `INSERT INTO agent_profile
         (org_id, user_id, agent_name, email, languages, specialties, buyer_commission,
          seller_commission, min_commission_rules, avg_price_point, preferred_lender,
          preferred_title_escrow, persona_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (org_id, user_id) DO NOTHING`,
      orgId, userId, name, email,
      JSON.stringify(["English"]),
      JSON.stringify(["Buyers", "Sellers", "First-time buyers", "Luxury", "Investors"]),
      "2.5%",
      "5.0% total (2.5% listing / 2.5% co-op)",
      "Minimum commission of $5,000 or 2.5% per side, whichever is greater.",
      "400000",
      "Preferred Mortgage Co. (add your lender's contact)",
      "Preferred Title & Escrow (add your contact)",
      JSON.stringify({ voice: "Warm & Professional", length: "Short", emoji: "Rarely", humor: "Light", timing: "Natural Delay (30 seconds)", qual: "Balanced Qualification", goals: ["Book Appointments", "Collect Information"], persist: "High", property_types: "Single Family, Condo, Townhouse" }),
    );
    // Single merged FAQ list (the UI no longer splits buyer/seller/custom - the
    // AI prompt reads every entry regardless of category, so all use "faq").
    const faqs: Array<{ category: string; q: string; a: string }> = [
      { category: "faq", q: "Do you work with first-time buyers?", a: "Absolutely - I guide first-time buyers through every step, from pre-approval to closing." },
      { category: "faq", q: "How much do I need for a down payment?", a: "It depends on the loan - some programs allow as little as 3% down. I can connect you with a lender for exact numbers." },
      { category: "faq", q: "How do you decide my home's price?", a: "I run a free comparative market analysis on recent nearby sales and walk you through the numbers." },
      { category: "faq", q: "How long will it take to sell?", a: "It depends on price and condition, but I'll give you a realistic timeline based on current local activity." },
      { category: "faq", q: "What areas do you serve?", a: "Let me know which area you're focused on and I'll confirm my coverage." },
      { category: "faq", q: "Are you available on weekends?", a: "Yes - I keep weekend slots open for showings and calls. What works for you?" },
    ];
    let pos = 0;
    for (const f of faqs) {
      await execute(
        env.D1DB,
        `INSERT INTO ai_knowledge_entry (org_id, user_id, category, question, answer, enabled, position)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        orgId, userId, f.category, f.q, f.a, pos++,
      );
    }
  } catch (e) {
    console.error("register: AI profile/FAQ seed failed (non-fatal)", e);
  }

  // Seed an Outbound Workflow #1 + default qualification questions so every
  // new workspace has a ready-to-run automation to enroll leads into (shows in the
  // Automations tab) and starter qualification questions (AI Settings -> Qualifications,
  // injected into the inbound prompt), matching sql/100.seed.sql. Best-effort: a
  // failure here must not abort the signup.
  try {
    // A few proven starter workflows (kept in sync with sql/100.seed.sql). The
    // opening is sent instantly on enroll; each follow-up fires delay_days later
    // at its send_time (HH:MM, account timezone). `sources` seeds the default
    // enroll audience.
    const EXAMPLE_WORKFLOWS: Array<{ name: string; source: string; message: string; followups: Array<{ delay_days: number; send_time: string; message: string }> }> = [
      {
        name: "Buyer Follow-Up", source: "buyer",
        message: "Hi {{first_name}}, it's {{agent_name}}. Saw you were looking at homes in {{area}} are you hoping to buy soon, or still exploring?",
        followups: [
          { delay_days: 2, send_time: "10:00", message: "Hi {{first_name}}, want me to send a few listings that match what you're after? Happy to line them up." },
          { delay_days: 5, send_time: "11:00", message: "Hi {{first_name}}, a couple of homes in {{area}} are moving fast. Want a quick look before they go?" },
          { delay_days: 9, send_time: "10:00", message: "Hi {{first_name}}, no rush at all - want me to set up alerts so you only hear from me when something great hits?" },
        ],
      },
      {
        name: "Seller Home-Value Follow-Up", source: "seller",
        message: "Hi {{first_name}}, it's {{agent_name}}. I can put together a free, no-obligation estimate of what your home could sell for. Want me to send it over?",
        followups: [
          { delay_days: 2, send_time: "12:00", message: "Hi {{first_name}}, homes near {{area}} have been selling quickly lately. Curious what you'd list yours for?" },
          { delay_days: 6, send_time: "10:00", message: "Hi {{first_name}}, even if you're not ready to sell, I can keep you posted on your home value over time. Want that?" },
        ],
      },
      {
        name: "New Lead Welcome", source: "new",
        message: "Hi {{first_name}}, it's {{agent_name}} - thanks for reaching out! What are you looking for, and how can I help you get started?",
        followups: [
          { delay_days: 1, send_time: "09:00", message: "Hi {{first_name}}, just checking in - happy to answer any questions or send over some options whenever you're ready." },
          { delay_days: 4, send_time: "11:00", message: "Hi {{first_name}}, still here to help! Want me to put together a few listings or a quick home-value estimate?" },
        ],
      },
    ];
    for (const wf of EXAMPLE_WORKFLOWS) {
      await execute(
        env.D1DB,
        `INSERT INTO automation (name, channels, message, sources, leads, org_id, owner_id, status, followup_steps)
         VALUES (?, '["sms"]', ?, ?, '[]', ?, ?, 'Running', ?)`,
        wf.name, wf.message, JSON.stringify([wf.source]), String(orgId), String(userId), JSON.stringify(wf.followups),
      );
    }
    let qpos = 0;
    for (const q of DEFAULT_QUALIFICATIONS) {
      await execute(
        env.D1DB,
        `INSERT INTO ai_qualification (org_id, user_id, applies_to, question, guidance, enabled, position)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        orgId, userId, q.applies_to, q.question, q.guidance, qpos++,
      );
    }
  } catch (e) {
    console.error("[register] example automation/qualification seed failed", e);
  }

  // Seed a few starter custom auto-responses (inbound_responder) so the AI
  // Agent -> Inbound -> Workflows tab has ready-to-use rules out of the box
  // (matches sql/100.seed.sql). These are injected into the inbound system
  // prompt; enabled so they apply once the AI master + Inbound are turned on.
  // Best-effort - a failure here must not abort the signup.
  try {
    const responders: Array<{ name: string; trigger: string; keywords: string; tone: string; message: string }> = [
      { name: "Pricing question", trigger: "Pricing question", keywords: "price, cost, how much, commission, fees, rate", tone: "Helpful", message: "Great question - pricing depends on the specific home and your situation. I'd be glad to put together exact numbers for you. What area and price range are you considering?" },
      { name: "Wants to see a home", trigger: "Showing request", keywords: "see, tour, showing, visit, walk through, view, open house", tone: "Warm", message: "I'd be happy to set up a showing for you. What days or times generally work best?" },
      { name: "Just browsing", trigger: "Not ready yet", keywords: "just looking, browsing, not ready, early, no rush, someday", tone: "Low-pressure", message: "Totally understand - no pressure at all. I can send you new listings as they come up so you stay in the loop. Want me to do that?" },
    ];
    for (const r of responders) {
      await execute(
        env.D1DB,
        `INSERT INTO inbound_responder (org_id, user_id, name, trigger_label, keywords, tone, message, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        orgId, userId, r.name, r.trigger, r.keywords, r.tone, r.message,
      );
    }
  } catch (e) {
    console.error("[register] example auto-responder seed failed", e);
  }

  const user: UserRow = {
    id: userId,
    name,
    email,
    password_hash: passwordHash,
    is_email_confirmed: 0,
  };
  const session = await issueSession(env, user, request);
  const authBody = await buildAuthBody(env, user, session);
  const response = json({ ...authBody, message: "Registered" }, 201);
  return setAuthCookies(response, session, request);
};
