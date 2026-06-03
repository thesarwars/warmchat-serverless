/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../env.ts";

/**
 * Verify a Telnyx webhook's Ed25519 signature.
 *
 * Telnyx signs `${timestamp}|${rawBody}` with Ed25519 and sends:
 *   header `telnyx-signature-ed25519` - base64 detached signature
 *   header `telnyx-timestamp`         - unix seconds
 * The public key (base64, 32 raw bytes) is `env.TELNYX_PUBLIC_KEY`.
 *
 * We use WebCrypto's native Ed25519 (supported in the Workers runtime) instead
 * of bundling tweetnacl. Falls open (returns true) only when TELNYX_PUBLIC_KEY
 * is unset, so local dev / first boot can warm up - production MUST set it.
 */

const MAX_SKEW_SECONDS = 300;

export async function verifyTelnyxSignature(
  env: Env,
  rawBody: string,
  headers: Headers,
): Promise<boolean> {
  if (!env.TELNYX_PUBLIC_KEY) return true; // dev escape hatch; set in prod

  const sig = headers.get("telnyx-signature-ed25519");
  const ts = headers.get("telnyx-timestamp");
  if (!sig || !ts) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > MAX_SKEW_SECONDS) return false;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      base64ToBytes(env.TELNYX_PUBLIC_KEY) as BufferSource,
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      false,
      ["verify"],
    );
  } catch {
    return false;
  }

  const message = new TextEncoder().encode(`${ts}|${rawBody}`);
  try {
    return await crypto.subtle.verify(
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      key,
      base64ToBytes(sig) as BufferSource,
      message as BufferSource,
    );
  } catch {
    return false;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
