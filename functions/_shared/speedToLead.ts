/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst } from "./db.ts";
import {
  queueScheduledMessage, renderTemplate, isAiMasterEnabled, type LeadFull,
} from "./autoResponse.ts";
import { appendComplianceFooter } from "./smsCompliance.ts";
import { stepScheduledAt } from "./workflowSchedule.ts";

/**
 * Speed-to-lead: enroll a NEW lead (form / webhook / integration / manual
 * "Send now") into the per-lead-type SMS sequence from Ai_Flow.md - an instant
 * opening + two no-reply nudges. Stop-on-reply is handled upstream
 * (cancelPendingFollowups cancels any still-scheduled rows the moment the lead
 * replies / an agent replies), so the follow-ups only fire while the lead is
 * silent.
 *
 *   Buyer / Unknown : instant +30s -> FU1 +1h  -> FU2 next day 10:00
 *   Seller          : instant +30s -> FU1 +2h  -> FU2 next day 10:00
 *   Open house      : instant +20m -> FU1 +2h  -> FU2 next day 10:00
 *
 * Compliance/gating mirrors the old single-shot instant reply: AI master on,
 * the owner's inbound auto-response on, a phone + SMS consent. No-ops otherwise.
 */

interface SeqDef { instant: string; fu1: string; fu1Mins: number; fu2: string }

const SEQUENCES: Record<"buyer" | "seller" | "open_house" | "general", SeqDef> = {
  buyer: {
    instant: "Hey {{first_name}}, this is {{agent_name}}. Are you looking to buy soon, or just exploring right now?",
    fu1: "Just wanted to make sure you saw my message 👍",
    fu1Mins: 60,
    fu2: "Hey {{first_name}}, not sure if the timing's right yet - are you still thinking about buying, or just browsing for now?",
  },
  seller: {
    instant: "Hey {{first_name}}, this is {{agent_name}}. Are you thinking about selling soon, or just exploring your options?",
    fu1: "Just wanted to make sure you saw my message 👍",
    fu1Mins: 120,
    fu2: "All good if now's not the right time - I can also give you a quick idea of what your home could sell for if that helps.",
  },
  open_house: {
    instant: "Hey {{first_name}}, thanks for coming by! What did you think of the home after seeing everything?",
    fu1: "Are you looking to buy soon, or just exploring right now?",
    fu1Mins: 120,
    fu2: "No worries if you're still thinking it over - I can also send you similar homes in the area if that helps.",
  },
  general: {
    instant: "Hi {{first_name}}, this is {{agent_name}}. Thanks for reaching out - are you looking to buy, sell, or both?",
    fu1: "Just wanted to make sure you saw my message 👍",
    fu1Mins: 60,
    fu2: "Or are you just exploring options right now?",
  },
};

function seqFor(leadType: string | null): SeqDef {
  if (leadType === "buyer" || leadType === "seller" || leadType === "open_house") return SEQUENCES[leadType];
  return SEQUENCES.general;
}

export async function enrollSpeedToLead(
  env: Env,
  leadId: number,
  opts: { startAtMs?: number } = {},
): Promise<{ enrolled: boolean; queued?: number; reason?: string }> {
  const lead = await queryFirst<LeadFull & { sms_consent_status: string | null }>(
    env.D1DB,
    `SELECT id, org_id, owner_id, first_name, last_name, name, email, phone, area, lead_type,
            intent, ai_status, timezone, qualification_step, qualification_status, last_reply_at,
            sms_consent_status
       FROM lead WHERE id = ?`,
    leadId,
  );
  if (!lead || !lead.phone) return { enrolled: false, reason: "no phone" };
  if (!lead.owner_id) return { enrolled: false, reason: "no owner" };
  if ((lead.sms_consent_status || "") === "no_sms") return { enrolled: false, reason: "no consent" };
  if (!(await isAiMasterEnabled(env, lead.org_id))) return { enrolled: false, reason: "ai master off" };

  const settings = await queryFirst<{ enabled: number }>(
    env.D1DB, `SELECT enabled FROM auto_response_settings WHERE user_id = ? AND org_id = ? LIMIT 1`,
    lead.owner_id, lead.org_id);
  if (!settings || !settings.enabled) return { enrolled: false, reason: "inbound off" };

  const org = await queryFirst<{ timezone: string | null }>(
    env.D1DB, `SELECT timezone FROM organization WHERE id = ?`, lead.org_id);
  const tz = lead.timezone || org?.timezone || "";

  const owner = await queryFirst<{ name: string | null }>(
    env.D1DB, `SELECT name FROM "user" WHERE id = ?`, lead.owner_id);

  const seq = seqFor(lead.lead_type);
  const baseMs = opts.startAtMs && opts.startAtMs > Date.now() ? opts.startAtMs : Date.now();
  const instantDelayMs = lead.lead_type === "open_house" ? 20 * 60_000 : 30_000;

  // Instant opening carries the AI disclosure + STOP footer (first auto message);
  // the two follow-ups are same-thread nudges and don't repaste it.
  const instantBody = appendComplianceFooter(
    await renderTemplate(env, seq.instant, lead),
    {
      kind: "first_auto",
      agentName: owner?.name ?? null,
      recipientOptedIn: lead.sms_consent_status === "opted_in",
    },
  );
  const fu1Body = await renderTemplate(env, seq.fu1, lead);
  const fu2Body = await renderTemplate(env, seq.fu2, lead);

  const common = { orgId: lead.org_id, userId: lead.owner_id, channel: "sms" as const, toAddress: lead.phone, sentByAi: true, leadId: lead.id };
  let queued = 0;
  const a = await queueScheduledMessage(env, { ...common, body: instantBody, scheduledAt: new Date(baseMs + instantDelayMs).toISOString() });
  if (a > 0) queued++;
  const b = await queueScheduledMessage(env, { ...common, body: fu1Body, scheduledAt: new Date(baseMs + instantDelayMs + seq.fu1Mins * 60_000).toISOString() });
  if (b > 0) queued++;
  // FU2: next calendar day at 10:00 local (org/lead timezone).
  const c = await queueScheduledMessage(env, { ...common, body: fu2Body, scheduledAt: stepScheduledAt(baseMs, 1, "10:00", tz) });
  if (c > 0) queued++;

  return { enrolled: queued > 0, queued };
}
