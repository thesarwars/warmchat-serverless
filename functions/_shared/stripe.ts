/// <reference types="@cloudflare/workers-types" />

/**
 * Thin Stripe REST client for Workers. We don't bundle `stripe` (Node SDK) -
 * it pulls in a lot of node:* polyfills. The REST surface is small and
 * application/x-www-form-urlencoded is trivial to encode.
 */

const STRIPE_BASE = "https://api.stripe.com/v1";

function encodeForm(obj: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (v2 === undefined || v2 === null) continue;
        sp.append(`${k}[${k2}]`, String(v2));
      }
    } else if (Array.isArray(v)) {
      v.forEach((item) => sp.append(`${k}[]`, String(item)));
    } else {
      sp.append(k, String(v));
    }
  }
  return sp.toString();
}

export async function stripeCall<T = Record<string, unknown>>(
  secretKey: string,
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown>; apiVersion?: string } = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: { message: string; type?: string; code?: string } }> {
  const method = init.method ?? (init.body ? "POST" : "GET");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
  };
  // Optional per-call API version pin. The account default can drift to newer
  // versions that reshape objects (e.g. the promotion_code/coupon model); pin
  // reads that depend on a specific field layout.
  if (init.apiVersion) headers["Stripe-Version"] = init.apiVersion;
  const reqInit: RequestInit = { method, headers };
  if (init.body && method !== "GET") {
    reqInit.body = encodeForm(init.body);
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const res = await fetch(`${STRIPE_BASE}${path}`, reqInit);
  const text = await res.text();
  let parsed: unknown = {};
  try { parsed = JSON.parse(text); } catch { /* keep empty */ }
  if (!res.ok) {
    const err = (parsed as { error?: { message?: string; type?: string; code?: string } }).error ?? {};
    const errOut: { message: string; type?: string; code?: string } = {
      message: err.message ?? `Stripe ${res.status}`,
    };
    if (err.type) errOut.type = err.type;
    if (err.code) errOut.code = err.code;
    return { ok: false, status: res.status, error: errOut };
  }
  return { ok: true, data: parsed as T };
}
