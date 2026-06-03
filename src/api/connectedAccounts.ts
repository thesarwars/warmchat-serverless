import { baseURL as API_BASE } from "@/helpers/api";

const CONNECTED_ACCOUNTS_API = `${API_BASE}/connected-accounts`;

export type CardState = "not_connected" | "connected" | "error";
type CardIndicator = "active" | "warning" | "inactive";
export type EmailMode = "personal" | "business" | "auto";

export type FixAction = { code: string; message: string; href?: string };

export type EmailCard = {
  state: CardState;
  indicator: CardIndicator;
  mode: "personal" | "business" | null;
  address: string | null;
  personal_gmail_allowed: boolean;
  gmail: { status: string; address: string | null };
  business: { status: string; address: string | null; verified: boolean; can_receive: boolean };
  sending: { ready: boolean; provider: string | null };
  receiving: { ready: boolean };
  dns: null | {
    overall: string;
    spf: string;
    dkim: string;
    sending_ready: boolean;
    reply_ready: boolean;
  };
  fix_actions: FixAction[];
};

export type SmsCard = {
  state: CardState;
  indicator: CardIndicator;
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

export type ConnectedAccountsPayload = {
  email: EmailCard;
  sms: SmsCard;
  defaults: ChannelDefaults;
  team_mode: boolean;
  org_id: number | null;
};

export type TeamMemberAccount = {
  user_id: number;
  name: string | null;
  email: string;
  role: string | null;
  email_summary: { connected: boolean; provider: string | null; address: string | null; verified: boolean; can_receive: boolean };
  sms_summary: { connected: boolean; phone_number: string | null; status: string };
};

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  return res
    .json()
    .catch(() => ({}))
    .then((v) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {}));
}

export async function fetchConnectedAccounts(token: string): Promise<ConnectedAccountsPayload> {
  const res = await fetch(CONNECTED_ACCOUNTS_API, { headers: authHeaders(token) });
  const data = await safeJson(res);
  if (!res.ok) throw new Error((data.error as string) || "Failed to load connected accounts");
  return data as unknown as ConnectedAccountsPayload;
}

export async function patchChannelDefaults(
  token: string,
  payload: Partial<ChannelDefaults>,
): Promise<ChannelDefaults & { team_mode?: boolean }> {
  const res = await fetch(`${CONNECTED_ACCOUNTS_API}/defaults`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error((data.error as string) || "Failed to update defaults");
  return data as unknown as ChannelDefaults & { team_mode?: boolean };
}

export async function fetchTeamConnectedAccounts(
  token: string,
  orgId?: number,
): Promise<{ org_id: number; members: TeamMemberAccount[] }> {
  const qs = orgId ? `?org_id=${orgId}` : "";
  const res = await fetch(`${CONNECTED_ACCOUNTS_API}/team${qs}`, { headers: authHeaders(token) });
  const data = await safeJson(res);
  if (!res.ok) throw new Error((data.error as string) || "Failed to load team accounts");
  return data as unknown as { org_id: number; members: TeamMemberAccount[] };
}

export async function verifyEmailDns(
  token: string,
  email?: string,
): Promise<{ ok: boolean; dns: NonNullable<EmailCard["dns"]> }> {
  const res = await fetch(`${CONNECTED_ACCOUNTS_API}/email/verify-dns`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(email ? { email } : {}),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error((data.error as string) || "DNS verification failed");
  return data as unknown as { ok: boolean; dns: NonNullable<EmailCard["dns"]> };
}

export async function disconnectGmail(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/gmail/disconnect`, { method: "POST", headers: authHeaders(token) });
  if (!res.ok) {
    const data = await safeJson(res);
    throw new Error((data.error as string) || "Failed to disconnect Gmail");
  }
}

export async function disconnectBusinessEmail(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/elastic/domain/disconnect`, { method: "POST", headers: authHeaders(token) });
  if (!res.ok) {
    const data = await safeJson(res);
    throw new Error((data.error as string) || (data.message as string) || "Failed to disconnect business email");
  }
}

export async function disconnectSms(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/telnyx/disconnect`, { method: "POST", headers: authHeaders(token) });
  if (!res.ok) {
    const data = await safeJson(res);
    throw new Error((data.error as string) || "Failed to disconnect SMS");
  }
}

export async function refreshTelnyxStatus(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/telnyx/status`, { headers: authHeaders(token) });
  const data = await safeJson(res);
  if (!res.ok) throw new Error((data.error as string) || "Failed to refresh SMS status");
  return data;
}

export async function startGmailConnect(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/gmail/connect-url`, { headers: authHeaders(token) });
  const data = await safeJson(res);
  if (!res.ok || !data.url) throw new Error((data.error as string) || "Failed to start Gmail connect");
  return data.url as string;
}
