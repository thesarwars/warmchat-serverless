/**
 * Password hashing via Web Crypto PBKDF2-SHA256 - no native deps, runs on Workers.
 * Stored format: `pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>`.
 *
 * NOTE: this is a fresh scheme for the D1 backend. Existing werkzeug hashes from
 * the old RDS are NOT compatible - migrating real users would require a re-hash
 * (deferred, see plan "Out of scope").
 */

// PBKDF2 iteration count. The Workers FREE tier caps CPU at 10ms/request, and
// PBKDF2-SHA256 is pure CPU: ~0.7ms per 1k iterations on the Workers runtime.
// The old value (100_000) cost ~55-73ms => every login/register blew the 10ms
// limit and returned Error 1102 ("Worker exceeded CPU time limit"). 12k landed
// around ~8ms - too close to the cliff, so a cold isolate could still tip over.
// 10k (~6.5ms) buys headroom. Changing this is backward-compatible: every hash
// stores its own iteration count, and verifyPassword reads it from there, so
// existing 12k hashes keep verifying; only new hashes use 10k. On Workers Paid
// (30s CPU) raise it back toward the OWASP 600k recommendation.
const ITERATIONS = 10_000;
const KEY_LEN = 32; // bytes
const SALT_LEN = 16; // bytes

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LEN * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[2]);
  const salt = fromBase64(parts[3]!);
  const expected = fromBase64(parts[4]!);
  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  // Constant-time comparison.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
