/// <reference types="@cloudflare/workers-types" />
/**
 * Symmetric AES-GCM helpers using the app's secret. Used for at-rest encryption
 * of CRM OAuth refresh tokens, IMAP passwords, and any other long-lived
 * credentials we store in D1.
 */

let cachedKey: CryptoKey | null = null;

async function getKey(secret: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const enc = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", buf(enc));
  cachedKey = await crypto.subtle.importKey(
    "raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"],
  );
  return cachedKey;
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(str: string): Uint8Array {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** TS strict-mode cast helper - Workers' WebCrypto signatures want ArrayBuffer-backed sources. */
function buf(x: Uint8Array): BufferSource {
  return x as unknown as BufferSource;
}

export async function encryptSecret(plain: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: buf(iv) }, key, buf(new TextEncoder().encode(plain)),
  );
  return `v1:${b64(iv)}.${b64(ct)}`;
}

export async function decryptSecret(packed: string, secret: string): Promise<string> {
  if (!packed.startsWith("v1:")) {
    // Plaintext fallback - return as-is.
    return packed;
  }
  const rest = packed.slice(3);
  const dot = rest.indexOf(".");
  if (dot < 0) throw new Error("Malformed ciphertext");
  const iv = b64decode(rest.slice(0, dot));
  const ct = b64decode(rest.slice(dot + 1));
  const key = await getKey(secret);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(ct));
  return new TextDecoder().decode(pt);
}

/** SHA-256 hex of a string. Used for OTP code hashing. */
export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf(new TextEncoder().encode(input)));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string compare. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
