/// <reference types="@cloudflare/workers-types" />
import { execute, nowIso, queryAll } from "./db.ts";

/**
 * Structural minimum needed for push send. Both the Pages Env and the cron
 * Worker's CronEnv satisfy this, so the helper can be reused without locking
 * either side into a single concrete type.
 */
export interface PushEnv {
  D1DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_CONTACT_EMAIL?: string;
}

/**
 * Web Push (RFC 8030 + RFC 8291 + RFC 8188). Pure WebCrypto, zero deps.
 *
 * Two responsibilities:
 *   1. Build the VAPID auth header (ES256 JWT signed with our private key).
 *   2. Encrypt the payload with aes128gcm using the subscriber's p256dh + auth
 *      keys so the browser's SW can decrypt it.
 *
 * If the push service returns 404/410 we mark the subscription revoked so the
 * next dispatch doesn't keep hitting a dead endpoint.
 */

// ---- base64url helpers -----------------------------------------------------

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64urlDecode(str: string): Uint8Array {
  const padded =
    str.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ---- VAPID JWT (ES256) -----------------------------------------------------

/**
 * VAPID private keys are stored as 32-byte raw scalars (the `d` of a P-256
 * keypair). The public key is the uncompressed point (1 + 32 + 32 = 65 bytes
 * starting with 0x04). We import both as JWK so WebCrypto will sign.
 */
async function importVapidSigningKey(env: PushEnv): Promise<CryptoKey> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    throw new Error("VAPID keys not configured");
  }
  const d = b64urlDecode(env.VAPID_PRIVATE_KEY);
  if (d.length !== 32) {
    throw new Error(`VAPID_PRIVATE_KEY must be 32 raw bytes (got ${d.length})`);
  }
  const pub = b64urlDecode(env.VAPID_PUBLIC_KEY);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY must be 65-byte uncompressed P-256 point");
  }
  const x = pub.subarray(1, 33);
  const y = pub.subarray(33, 65);
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: b64url(d),
      x: b64url(x),
      y: b64url(y),
      ext: false,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * Build the modern VAPID Authorization header value (RFC 8292 §3):
 *   Authorization: vapid t=<jwt>, k=<base64url-pubkey>
 */
async function vapidAuthHeader(
  env: PushEnv,
  audience: string,
  ttlSec = 12 * 3600,
): Promise<string> {
  const subject = `mailto:${env.VAPID_CONTACT_EMAIL}`;
  const header = b64url(
    new TextEncoder().encode(JSON.stringify({ alg: "ES256", typ: "JWT" })),
  );
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + ttlSec,
        sub: subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const key = await importVapidSigningKey(env);
  // WebCrypto returns ECDSA signatures as raw r||s (64 bytes) which is exactly
  // what JWS expects - no DER unwrapping needed.
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64url(sig)}`;
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}

// ---- HKDF helpers ----------------------------------------------------------

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    salt as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, ikm as BufferSource);
}

async function hkdfExpand(
  prk: ArrayBuffer,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const blocks: Uint8Array[] = [];
  let previous = new Uint8Array(0);
  const counter = new Uint8Array([0]);
  for (let i = 1; blocks.reduce((n, b) => n + b.length, 0) < length; i++) {
    counter[0] = i;
    const buf = await crypto.subtle.sign(
      "HMAC",
      key,
      concat(previous, info, counter) as BufferSource,
    );
    previous = new Uint8Array(buf);
    blocks.push(previous);
  }
  return concat(...blocks).slice(0, length);
}

// ---- aes128gcm payload encryption (RFC 8291 / RFC 8188) --------------------

/**
 * Returns the encrypted body that goes in the POST to the push endpoint.
 * Layout (RFC 8188 §2.1):
 *   salt(16) | rs(4 big-endian) | idlen(1) | keyid(idlen) | ciphertext
 * For Web Push, keyid = the application-server's ephemeral P-256 public key
 * (uncompressed, 65 bytes), so idlen = 65.
 */
async function encryptPayloadAes128Gcm(
  payload: Uint8Array,
  p256dhRaw: Uint8Array, // 65-byte uncompressed subscriber public key
  authSecret: Uint8Array, // 16-byte subscriber auth secret
): Promise<Uint8Array> {
  // 1) Application-server (sender) ephemeral keypair.
  const asKeypair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const asPubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeypair.publicKey),
  );

  // 2) ECDH shared secret.
  const uaPubKey = await crypto.subtle.importKey(
    "raw",
    p256dhRaw as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPubKey },
      asKeypair.privateKey,
      256,
    ),
  );

  // 3) HKDF with auth_secret as salt: derive a 32-byte "IKM" bound to both keys.
  const keyInfo = concat(
    new TextEncoder().encode("WebPush: info\0"),
    p256dhRaw,
    asPubRaw,
  );
  // RFC 8291 §3.3: IKM = HKDF-Expand(HKDF-Extract(auth_secret, ecdh), key_info, 32).
  // hkdfExpand appends the single-byte counter (0x01 for the first 32 bytes) itself.
  const prkKey = await hkdfExtract(authSecret, sharedBits);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  // 4) Generate the 16-byte content salt + derive CEK + nonce per RFC 8188.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, ikm);
  const cekRaw = await hkdfExpand(
    prk,
    new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdfExpand(
    prk,
    new TextEncoder().encode("Content-Encoding: nonce\0"),
    12,
  );

  // 5) AES-GCM encrypt (payload || 0x02) - the 0x02 is the "last record"
  //    padding delimiter per RFC 8188 §2.1.
  const cekKey = await crypto.subtle.importKey(
    "raw",
    cekRaw as BufferSource,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt"],
  );
  const plaintext = concat(payload, new Uint8Array([0x02]));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource },
    cekKey,
    plaintext as BufferSource,
  );
  const ciphertext = new Uint8Array(ciphertextBuf);

  // 6) Assemble header + ciphertext. rs = 4096 is fine for any payload we send.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const idlen = new Uint8Array([asPubRaw.length]); // 65
  return concat(salt, rs, idlen, asPubRaw, ciphertext);
}

// ---- public send helpers ---------------------------------------------------

export interface PushSubscriptionRecord {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendResult {
  ok: boolean;
  status: number;
  statusText?: string;
}

/**
 * Send one push. `payloadJson` is JSON-encoded data the SW will receive on
 * `event.data.json()`. Returns the HTTP status from the push service. On
 * 404/410 the subscription row is auto-marked revoked.
 */
export async function sendPushNotification(
  env: PushEnv,
  sub: PushSubscriptionRecord,
  payloadJson: string,
): Promise<PushSendResult> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    return { ok: false, status: 503, statusText: "VAPID not configured" };
  }
  const audience = new URL(sub.endpoint).origin;
  const auth = await vapidAuthHeader(env, audience);
  const body = await encryptPayloadAes128Gcm(
    new TextEncoder().encode(payloadJson),
    b64urlDecode(sub.p256dh),
    b64urlDecode(sub.auth),
  );
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.length),
      TTL: "60",
      Urgency: "high",
    },
    body: body as BodyInit,
  });
  if (res.status === 404 || res.status === 410) {
    // Endpoint is permanently gone - retire the subscription so we stop
    // pinging it forever.
    try {
      await execute(
        env.D1DB,
        `UPDATE push_subscription SET revoked_at = ? WHERE id = ?`,
        nowIso(),
        sub.id,
      );
    } catch {
      /* ignore */
    }
  }
  return { ok: res.ok, status: res.status, statusText: res.statusText };
}

/**
 * Load all live push subscriptions for the user and fan out the same payload
 * in parallel. Returns the per-endpoint results so callers can log failures.
 */
export async function sendPushToUser(
  env: PushEnv,
  userId: number,
  payloadJson: string,
): Promise<PushSendResult[]> {
  if (!env.VAPID_PRIVATE_KEY) return [];
  const subs = await queryAll<PushSubscriptionRecord>(
    env.D1DB,
    `SELECT id, endpoint, p256dh, auth FROM push_subscription
       WHERE user_id = ? AND revoked_at IS NULL`,
    userId,
  );
  if (!subs.length) return [];
  return Promise.all(subs.map((s) => sendPushNotification(env, s, payloadJson)));
}
