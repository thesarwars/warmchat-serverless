/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
}

/**
 * Server-side verification of a Cloudflare Turnstile token.
 *
 * Returns true when the token is valid. If TURNSTILE_SECRET_KEY is blank
 * (unconfigured dev/preview environment) the check is skipped so the form
 * still works - production always has the secret set in wrangler.toml, so
 * verification is enforced there.
 *
 * Pass the original `request` so the caller's IP can be sent to Cloudflare
 * for an extra signal (optional but recommended).
 */
export async function verifyTurnstile(
  env: Env,
  token: string | undefined | null,
  request?: Request,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("TURNSTILE_SECRET_KEY not set - skipping Turnstile verification");
    return true;
  }
  if (!token) return false;

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = request?.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form });
    const data = (await res.json()) as SiteVerifyResponse;
    return data.success === true;
  } catch (err) {
    console.error("Turnstile verification request failed:", err);
    return false;
  }
}
