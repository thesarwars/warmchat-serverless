/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { execute, queryFirst, queryAll, nowIso } from "./db.ts";

/**
 * Composition for /api/connected-accounts, trimmed to what we actually have in
 * serverless (no live Elastic / Telnyx polling - we read what's persisted).
 */

export type CardState = "not_connected" | "connected" | "error";
export type Indicator = "active" | "warning" | "inactive";
export type EmailMode = "personal" | "business" | "auto";

export type FixAction = { code: string; message: string; href?: string };

export type EmailCard = {
  state: CardState;
  indicator: Indicator;
  mode: "personal" | "business" | null;
  address: string | null;
  personal_gmail_allowed: boolean;
  gmail: { status: string; address: string | null };
  business: { status: string; address: string | null; verified: boolean; can_receive: boolean };
  sending: { ready: boolean; provider: string | null };
  receiving: { ready: boolean };
  dns: null;
  fix_actions: FixAction[];
};

export type SmsCard = {
  state: CardState;
  indicator: Indicator;
  phone_number: string | null;
  ten_dlc: {
    brand: string;
    campaign: string;
    status: string;
    error_reason: string | null;
    campaign_number_status: string | null;
  };
  sending: { ready: boolean };
  receiving: { ready: boolean };
  fix_actions: FixAction[];
};

export type ChannelDefaults = {
  email_mode: EmailMode;
  sms_enabled: boolean;
};

export type TeamMemberAccount = {
  user_id: number;
  name: string | null;
  email: string;
  role: string | null;
  email_summary: { connected: boolean; provider: string | null; address: string | null; verified: boolean; can_receive: boolean };
  sms_summary: { connected: boolean; phone_number: string | null; status: string };
};

export const ALLOWED_EMAIL_MODES: ReadonlyArray<EmailMode> = ["personal", "business", "auto"];

export function normalizeCardState(connected: boolean, hasError: boolean): CardState {
  if (hasError) return "error";
  if (connected) return "connected";
  return "not_connected";
}

export function normalizeIndicator(state: CardState, warning = false): Indicator {
  if (state === "connected") return "active";
  if (state === "error" || warning) return "warning";
  return "inactive";
}

function fix(code: string, message: string, href?: string): FixAction {
  return href ? { code, message, href } : { code, message };
}

export function gmailReconnectAction(): FixAction {
  return fix("GMAIL_NEEDS_REAUTH", "Reconnect your Gmail account to resume personal sending.", "/onboarding");
}

export function smsFixActions(status: string, errorReason: string | null): FixAction[] {
  const s = (status || "inactive").toLowerCase();
  if (s === "rejected") {
    return [fix("SMS_REJECTED", errorReason || "10DLC registration was rejected. Review and resubmit.", "/onboarding")];
  }
  if (s === "pending" || s === "submitted" || s === "in_review") {
    return [fix("SMS_10DLC_PENDING", "10DLC brand or campaign approval is still pending.", "/onboarding")];
  }
  if (s !== "approved" && s !== "active") {
    return [fix("SMS_NOT_CONNECTED", "Complete SMS setup to send and receive texts.", "/onboarding")];
  }
  return [];
}

type UserChannels = {
  telnyx_phone_number: string | null;
  telnyx_sms_status: string | null;
  telnyx_brand_id: string | null;
  telnyx_campaign_id: string | null;
  telnyx_error_reason: string | null;
  telnyx_campaign_number_status: string | null;
};

export async function buildSmsCard(env: Env, userId: number): Promise<SmsCard> {
  const u = await queryFirst<UserChannels>(
    env.D1DB,
    `SELECT telnyx_phone_number, telnyx_sms_status, telnyx_brand_id, telnyx_campaign_id,
            telnyx_error_reason, telnyx_campaign_number_status
       FROM "user" WHERE id = ?`,
    userId,
  );
  const phone = u?.telnyx_phone_number ?? null;
  const status = (u?.telnyx_sms_status || "inactive").toLowerCase();
  const errorReason = u?.telnyx_error_reason ?? null;
  const connected = Boolean(phone || u?.telnyx_brand_id || u?.telnyx_campaign_id);
  const sendingReady = Boolean(phone) && (status === "approved" || status === "active");
  const hasError = status === "rejected" || (errorReason !== null && !sendingReady);
  const state = normalizeCardState(connected, hasError && !sendingReady);
  const actions = smsFixActions(status, errorReason);
  return {
    state,
    indicator: normalizeIndicator(state, actions.length > 0),
    phone_number: phone,
    ten_dlc: {
      // When sms_status is "approved" / "active" the channel works end-to-end
      // even if the brand/campaign rows happened to be cleared (seed flows,
      // partial migrations). Drive the brand/campaign labels off the live
      // status, not just the ID presence, so the card doesn't lie.
      brand: status === "approved" || status === "active"
        ? "approved"
        : u?.telnyx_brand_id ? status : "inactive",
      campaign: status === "approved" || status === "active"
        ? "approved"
        : u?.telnyx_campaign_id ? status : "inactive",
      status,
      error_reason: errorReason,
      campaign_number_status: u?.telnyx_campaign_number_status ?? null,
    },
    sending: { ready: sendingReady },
    receiving: { ready: Boolean(phone) },
    fix_actions: actions,
  };
}

type GmailRow = { status: string | null; email_address: string | null };
type ElasticRow = { email_address: string | null; status: string | null; is_verified: number; can_receive: number };

export async function buildEmailCard(env: Env, userId: number): Promise<EmailCard> {
  const gmail = await queryFirst<GmailRow>(
    env.D1DB,
    `SELECT status, email_address FROM email_connections
      WHERE user_id = ? AND provider = 'gmail' ORDER BY id DESC LIMIT 1`,
    userId,
  );
  const elastic = await queryFirst<ElasticRow>(
    env.D1DB,
    `SELECT email_address, status, is_verified, can_receive FROM inbox_connection
      WHERE user_id = ? AND provider = 'elastic' ORDER BY id DESC LIMIT 1`,
    userId,
  );

  const gmailStatus = gmail?.status || "not_connected";
  const gmailAddr = gmail?.email_address ?? null;
  const gmailActive = gmailStatus === "active";
  const gmailNeedsReauth = gmailStatus === "needs_reauth";

  const elasticAddr = elastic?.email_address ?? null;
  const elasticStatus = elastic?.status || "not_connected";
  const elasticVerified = Boolean(elastic?.is_verified);
  const elasticCanReceive = Boolean(elastic?.can_receive);
  const elasticConnected = Boolean(elastic);

  const fixActions: FixAction[] = [];
  let mode: EmailCard["mode"] = null;
  let address: string | null = null;

  if (elasticVerified) {
    mode = "business";
    address = elasticAddr;
  } else if (elasticConnected) {
    mode = "business";
    address = elasticAddr;
    fixActions.push(fix("DNS_PENDING", "DNS records are not yet verified. Run DNS verify or check your DNS provider.", "/connect-domain"));
  } else if (gmailActive) {
    mode = "personal";
    address = gmailAddr;
  } else if (gmailNeedsReauth) {
    mode = "personal";
    address = gmailAddr;
    fixActions.push(gmailReconnectAction());
  }

  const sendingReady = elasticVerified || gmailActive;
  const receivingReady = (elasticConnected && elasticCanReceive) || gmailActive;
  const personalGmailAllowed = !elasticVerified;
  const hasError = fixActions.length > 0 || gmailNeedsReauth;
  const connected = mode !== null;
  const state = normalizeCardState(connected, hasError && !sendingReady);
  const provider = mode === "business" ? "elastic" : mode === "personal" ? "gmail" : null;

  return {
    state,
    indicator: normalizeIndicator(state, fixActions.length > 0),
    mode,
    address,
    personal_gmail_allowed: personalGmailAllowed,
    gmail: { status: gmailStatus, address: gmailAddr },
    business: { status: elasticStatus, address: elasticAddr, verified: elasticVerified, can_receive: elasticCanReceive },
    sending: { ready: sendingReady, provider },
    receiving: { ready: receivingReady },
    dns: null,
    fix_actions: fixActions,
  };
}

export async function getOrgIdForUser(env: Env, userId: number): Promise<number | null> {
  const row = await queryFirst<{ org_id: number }>(
    env.D1DB,
    `SELECT org_id FROM membership WHERE user_id = ? LIMIT 1`,
    userId,
  );
  return row?.org_id ?? null;
}

export async function isTeamMode(env: Env, orgId: number | null): Promise<boolean> {
  // True if the caller belongs to an org at all. The Connected Accounts page
  // uses this to decide whether to render the "Team accounts" panel; we want
  // single-member orgs to still see their own row, so the threshold is >=1
  // rather than >1 (Owner/Manager role check is enforced separately).
  if (!orgId) return false;
  const row = await queryFirst<{ n: number }>(
    env.D1DB,
    `SELECT COUNT(*) AS n FROM membership WHERE org_id = ?`,
    orgId,
  );
  return (row?.n ?? 0) >= 1;
}

type PrefRow = {
  id: number;
  user_id: number;
  default_email_mode: string | null;
  default_sms_enabled: number | null;
};

export async function getOrCreatePreferences(env: Env, userId: number): Promise<PrefRow> {
  const existing = await queryFirst<PrefRow>(
    env.D1DB,
    `SELECT id, user_id, default_email_mode, default_sms_enabled
       FROM user_channel_preference WHERE user_id = ?`,
    userId,
  );
  if (existing) return existing;
  await execute(
    env.D1DB,
    `INSERT INTO user_channel_preference (user_id, default_email_mode, default_sms_enabled, created_at, updated_at)
     VALUES (?, 'auto', 1, ?, ?)`,
    userId, nowIso(), nowIso(),
  );
  const row = await queryFirst<PrefRow>(
    env.D1DB,
    `SELECT id, user_id, default_email_mode, default_sms_enabled
       FROM user_channel_preference WHERE user_id = ?`,
    userId,
  );
  return row!;
}

export function serializePreferences(pref: PrefRow | null): ChannelDefaults {
  if (!pref) return { email_mode: "auto", sms_enabled: true };
  const mode = (pref.default_email_mode || "auto").toLowerCase() as EmailMode;
  return {
    email_mode: ALLOWED_EMAIL_MODES.includes(mode) ? mode : "auto",
    sms_enabled: Boolean(pref.default_sms_enabled),
  };
}

export async function updatePreferences(
  env: Env,
  userId: number,
  payload: Partial<ChannelDefaults>,
): Promise<{ pref: PrefRow | null; error: string | null }> {
  await getOrCreatePreferences(env, userId);
  let nextMode: EmailMode | null = null;
  let nextSms: boolean | null = null;
  if (payload.email_mode !== undefined) {
    const mode = (payload.email_mode || "auto").toString().trim().toLowerCase() as EmailMode;
    if (!ALLOWED_EMAIL_MODES.includes(mode)) {
      return { pref: null, error: `email_mode must be one of: ${ALLOWED_EMAIL_MODES.join(", ")}` };
    }
    nextMode = mode;
  }
  if (payload.sms_enabled !== undefined) {
    nextSms = Boolean(payload.sms_enabled);
  }
  if (nextMode !== null || nextSms !== null) {
    await execute(
      env.D1DB,
      `UPDATE user_channel_preference
          SET default_email_mode  = COALESCE(?, default_email_mode),
              default_sms_enabled = COALESCE(?, default_sms_enabled),
              updated_at          = CURRENT_TIMESTAMP
        WHERE user_id = ?`,
      nextMode,
      nextSms === null ? null : nextSms ? 1 : 0,
      userId,
    );
  }
  const pref = await queryFirst<PrefRow>(
    env.D1DB,
    `SELECT id, user_id, default_email_mode, default_sms_enabled
       FROM user_channel_preference WHERE user_id = ?`,
    userId,
  );
  return { pref, error: null };
}

export async function buildTeamAccounts(env: Env, orgId: number): Promise<TeamMemberAccount[]> {
  type Row = {
    user_id: number;
    name: string | null;
    email: string;
    role_name: string | null;
    telnyx_phone_number: string | null;
    telnyx_sms_status: string | null;
    gmail_address: string | null;
    gmail_status: string | null;
    elastic_address: string | null;
    elastic_is_verified: number | null;
    elastic_can_receive: number | null;
  };
  const rows = await queryAll<Row>(
    env.D1DB,
    `SELECT u.id AS user_id, u.name AS name, u.email AS email,
            r.name AS role_name,
            u.telnyx_phone_number, u.telnyx_sms_status,
            (SELECT email_address FROM email_connections
              WHERE user_id = u.id AND provider = 'gmail' ORDER BY id DESC LIMIT 1) AS gmail_address,
            (SELECT status FROM email_connections
              WHERE user_id = u.id AND provider = 'gmail' ORDER BY id DESC LIMIT 1) AS gmail_status,
            (SELECT email_address FROM inbox_connection
              WHERE user_id = u.id AND provider = 'elastic' ORDER BY id DESC LIMIT 1) AS elastic_address,
            (SELECT is_verified FROM inbox_connection
              WHERE user_id = u.id AND provider = 'elastic' ORDER BY id DESC LIMIT 1) AS elastic_is_verified,
            (SELECT can_receive FROM inbox_connection
              WHERE user_id = u.id AND provider = 'elastic' ORDER BY id DESC LIMIT 1) AS elastic_can_receive
       FROM membership m
       JOIN "user" u ON u.id = m.user_id
       LEFT JOIN role r ON r.id = m.role_id
      WHERE m.org_id = ?`,
    orgId,
  );

  return rows.map((row) => {
    const elasticConnected = row.elastic_address !== null;
    const gmailActive = row.gmail_status === "active";
    const provider = elasticConnected ? "elastic" : gmailActive ? "gmail" : null;
    const emailConnected = elasticConnected || gmailActive;
    const address = elasticConnected ? row.elastic_address : gmailActive ? row.gmail_address : null;
    const verified = elasticConnected ? Boolean(row.elastic_is_verified) : gmailActive;
    const canReceive = elasticConnected ? Boolean(row.elastic_can_receive) : gmailActive;
    return {
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role_name,
      email_summary: {
        connected: emailConnected,
        provider,
        address,
        verified,
        can_receive: canReceive,
      },
      sms_summary: {
        connected: Boolean(row.telnyx_phone_number),
        phone_number: row.telnyx_phone_number,
        status: row.telnyx_sms_status || "not_connected",
      },
    };
  });
}
