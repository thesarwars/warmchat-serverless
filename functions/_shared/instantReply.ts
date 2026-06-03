/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst } from "./db.ts";
import {
  queueScheduledMessage, renderTemplate, isAiMasterEnabled, type LeadFull,
} from "./autoResponse.ts";
import { appendComplianceFooter } from "./smsCompliance.ts";

/**
 * Send a single instant AI opening when the agent explicitly chooses "Send now"
 * in the manual-add gate (AiFollowUpGateModal). This is an EXPLICIT per-lead
 * action - NOT the automatic instant-reply-on-create drip that was deliberately
 * removed (that duplicated outbound automations; see CLAUDE.md). Sends a
 * lead-type opening (Ai Flo templates), +30s, through the compliant queue
 * (suppression/quiet-hours/rate-limit enforced at flush). The lead replying then
 * hands off to the tool-calling agent (runInboundAgent).
 */
const INSTANT_TEMPLATES: Record<string, string> = {
  buyer: "Hey {{first_name}}, this is {{agent_name}}. Are you looking to buy soon, or just exploring right now?",
  seller: "Hey {{first_name}}, this is {{agent_name}}. Are you thinking about selling soon, or just exploring your options?",
  open_house: "Hey {{first_name}}, thanks for coming by today! Anything I can answer about the home?",
  general: "Hi {{first_name}}, this is {{agent_name}}. Thanks for reaching out - are you looking to buy, sell, or both?",
};

function templateFor(leadType: string | null): string {
  if (leadType === "buyer" || leadType === "seller" || leadType === "open_house") return INSTANT_TEMPLATES[leadType]!;
  return INSTANT_TEMPLATES.general!;
}

export async function scheduleInstantReply(env: Env, leadId: number): Promise<{ scheduled: boolean; reason?: string }> {
  const lead = await queryFirst<LeadFull & { sms_consent_status: string | null }>(
    env.D1DB,
    `SELECT id, org_id, owner_id, first_name, last_name, name, email, phone, area, lead_type,
            intent, ai_status, timezone, qualification_step, qualification_status, last_reply_at,
            sms_consent_status
       FROM lead WHERE id = ?`,
    leadId,
  );
  if (!lead || !lead.phone) return { scheduled: false, reason: "no phone" };
  if (!lead.owner_id) return { scheduled: false, reason: "no owner" };
  if ((lead.sms_consent_status || "") === "no_sms") return { scheduled: false, reason: "no consent" };
  if (!(await isAiMasterEnabled(env, lead.org_id))) return { scheduled: false, reason: "ai master off" };

  // Inbound auto-response must be on for the lead's owner.
  const settings = await queryFirst<{ enabled: number }>(
    env.D1DB, `SELECT enabled FROM auto_response_settings WHERE user_id = ? AND org_id = ? LIMIT 1`,
    lead.owner_id, lead.org_id);
  if (!settings || !settings.enabled) return { scheduled: false, reason: "inbound off" };

  // Instant reply = the first automated message in this thread. Carries the
  // AI disclosure + STOP footer per CTIA / state bot-disclosure rules.
  const owner = await queryFirst<{ name: string | null }>(
    env.D1DB, `SELECT name FROM "user" WHERE id = ?`, lead.owner_id,
  );
  const body = appendComplianceFooter(
    await renderTemplate(env, templateFor(lead.lead_type), lead),
    {
      kind: "first_auto",
      agentName: owner?.name ?? null,
      // Already-opted-in leads got the bot disclosure + STOP in the original
      // consent flow; don't re-paste it on every program's first message.
      recipientOptedIn: lead.sms_consent_status === "opted_in",
    },
  );
  const id = await queueScheduledMessage(env, {
    leadId: lead.id, orgId: lead.org_id, userId: lead.owner_id,
    channel: "sms", toAddress: lead.phone, body,
    scheduledAt: new Date(Date.now() + 30_000).toISOString(),
    sentByAi: true,
  });
  return { scheduled: id > 0 };
}
