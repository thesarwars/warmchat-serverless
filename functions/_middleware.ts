/// <reference types="@cloudflare/workers-types" />

/**
 * Canonical-host redirect: warmchats.com (apex) -> www.warmchats.com.
 *
 * The app is served on BOTH the apex and www as DNS-only custom domains. Browser
 * localStorage / sessions are per-origin, so a user on the apex and a user on www
 * hold separate auth tokens. That split broke session persistence and the Gmail
 * OAuth round-trip (the callback came back on a different origin than the user
 * started on, found no token, and bounced to /login). Collapsing every browser
 * navigation onto a single canonical origin (www) removes that whole class of bug.
 *
 * Scope is deliberately narrow:
 *   - Only the apex host is redirected; www requests pass straight through.
 *   - /api/* is left untouched so server-to-server webhooks (Telnyx / Elastic /
 *     Stripe) that hit either host still work, and so same-origin XHRs carrying an
 *     Authorization header are never 301'd across origins (a cross-origin redirect
 *     strips the Authorization header).
 * In practice only the initial document request lands on the apex; once redirected,
 * the page + all its assets/XHRs are same-origin on www.
 */
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  if (url.hostname === "warmchats.com" && !url.pathname.startsWith("/api/")) {
    url.hostname = "www.warmchats.com";
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
};
