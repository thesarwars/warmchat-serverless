/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { json, error, readJson } from "../../_shared/http.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { requireUser } from "../../_shared/auth.ts";

/**
 * GET  /api/elastic/sending-address - reports the user's current sending
 *      address plus the provider type and whether the prefix is editable.
 *      Editable only when WarmChats is actually the email provider (Option 3
 *      takeover); for Option 2 (OTP) the prefix maps to a real mailbox the
 *      user owns elsewhere, so we can't change it freely.
 * POST /api/elastic/sending-address - updates the local-part (prefix). 400 if
 *      the prefix is malformed or 409 if the connection isn't editable.
 *
 * Body: { sending_prefix: string }
 */
const PREFIX_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
// Reject consecutive dots and edge dots/dashes - RFC 5321 plus practical
// "what most providers actually accept" tightening.
function validatePrefix(p: string): string | null {
  if (!p) return "Sending prefix is required";
  if (p.length > 64) return "Sending prefix must be 64 characters or fewer";
  if (!PREFIX_RE.test(p)) return "Use only letters, numbers, dot, underscore, or hyphen (must start and end with a letter or number)";
  if (p.includes("..")) return "Sending prefix cannot contain consecutive dots";
  return null;
}

type ProviderType = "gmail" | "elastic-takeover" | "elastic-otp" | "none";

async function loadConnectionInfo(env: Env, userId: number): Promise<{
  address: string | null;
  prefix: string | null;
  domain: string | null;
  providerType: ProviderType;
  editable: boolean;
  connectionId: number | null;
}> {
  const elastic = await queryFirst<{ id: number; email_address: string; elastic_from_email: string | null }>(
    env.D1DB,
    `SELECT id, email_address, elastic_from_email
       FROM inbox_connection
       WHERE user_id = ? AND provider = 'elastic'
       ORDER BY id DESC LIMIT 1`,
    userId,
  );
  if (elastic) {
    const addr = elastic.elastic_from_email || elastic.email_address;
    const [prefix = "", domain = ""] = addr.split("@");
    // If a verified domain_ownership_verification row exists, this is the
    // Option-3 takeover path - WarmChats is the provider, so the prefix is
    // ours to choose. Otherwise it's Option 2 (OTP) and the prefix is locked
    // to a real mailbox at the user's existing provider.
    const owned = await queryFirst<{ id: number }>(
      env.D1DB,
      `SELECT id FROM domain_ownership_verification
         WHERE user_id = ? AND domain = ? AND verified_at IS NOT NULL`,
      userId, domain,
    );
    return {
      address: addr,
      prefix,
      domain,
      providerType: owned ? "elastic-takeover" : "elastic-otp",
      editable: Boolean(owned),
      connectionId: elastic.id,
    };
  }
  const gmail = await queryFirst<{ id: number; email_address: string }>(
    env.D1DB,
    `SELECT id, email_address FROM inbox_connection
       WHERE user_id = ? AND provider = 'gmail'
       ORDER BY id DESC LIMIT 1`,
    userId,
  );
  if (gmail) {
    const [prefix = "", domain = ""] = gmail.email_address.split("@");
    return {
      address: gmail.email_address,
      prefix, domain,
      providerType: "gmail",
      editable: false,
      connectionId: gmail.id,
    };
  }
  return { address: null, prefix: null, domain: null, providerType: "none", editable: false, connectionId: null };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const info = await loadConnectionInfo(env, user.id);
  return json({
    sending_address: info.address,
    sending_prefix: info.prefix,
    domain: info.domain,
    provider_type: info.providerType,
    editable: info.editable,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const user = await requireUser(env, request);
  if (!user) return error("Unauthorized", 401);
  const body = await readJson<{ sending_prefix?: string }>(request);
  const prefix = (body?.sending_prefix || "").trim().toLowerCase();

  const validationError = validatePrefix(prefix);
  if (validationError) return error(validationError, 400);

  const info = await loadConnectionInfo(env, user.id);
  if (!info.connectionId || !info.domain) {
    return error("No email connection configured yet", 404);
  }
  if (!info.editable) {
    return error(
      info.providerType === "gmail"
        ? "Gmail-connected accounts send from the Gmail address you authorized; change it in Gmail."
        : "Your sending address is tied to an existing mailbox you OTP-verified. Disconnect and re-set-up using Option 3 (WarmChats as provider) to choose a new prefix.",
      409,
    );
  }

  const newAddr = `${prefix}@${info.domain}`;
  await execute(
    env.D1DB,
    `UPDATE inbox_connection
        SET email_address = ?, elastic_from_email = ?
        WHERE id = ?`,
    newAddr, newAddr, info.connectionId,
  );
  await execute(
    env.D1DB,
    `UPDATE domain_ownership_verification
        SET sending_prefix = ?, updated_at = ?
        WHERE user_id = ? AND domain = ?`,
    prefix, nowIso(), user.id, info.domain,
  );

  return json({
    sending_address: newAddr,
    sending_prefix: prefix,
    domain: info.domain,
    provider_type: info.providerType,
    editable: true,
  });
};
