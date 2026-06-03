import { baseURL as API_BASE } from "@/helpers/api";

const KEYS_API = `${API_BASE}/integrations/keys`;

/** Base URL an external service (Zapier) points its actions/triggers at. */
export const INTEGRATION_API_BASE = `${API_BASE}/integrations/v1`;

export type ApiKey = {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
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

export async function fetchApiKeys(token: string, orgId: number): Promise<ApiKey[]> {
  const res = await fetch(`${KEYS_API}?org_id=${orgId}`, { headers: authHeaders(token) });
  const data = await safeJson(res);
  if (!res.ok) throw new Error((data.message as string) || "Failed to load API keys");
  return (data.keys as ApiKey[]) ?? [];
}

/** Returns the new key row plus the full secret, which is shown to the user once. */
export async function createApiKey(
  token: string,
  orgId: number,
  name: string,
): Promise<{ key: ApiKey; secret: string }> {
  const res = await fetch(KEYS_API, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ org_id: orgId, name }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error((data.message as string) || "Failed to create API key");
  return data as unknown as { key: ApiKey; secret: string };
}

export async function revokeApiKey(token: string, id: number): Promise<void> {
  const res = await fetch(`${KEYS_API}/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!res.ok) {
    const data = await safeJson(res);
    throw new Error((data.message as string) || "Failed to revoke API key");
  }
}
