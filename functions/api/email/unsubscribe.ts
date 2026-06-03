/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../../_shared/env.ts";
import { execute, queryFirst, nowIso } from "../../_shared/db.ts";
import { verifyUnsubscribeToken } from "../../_shared/emailCompliance.ts";

/**
 * GET /api/email/unsubscribe?l=<lead_id>&t=<token>
 *
 * Public, no-auth one-click unsubscribe target for the CAN-SPAM footer link.
 * Flips `lead.email_opt_out = 1` after verifying the HMAC token so a random
 * actor can't bulk-unsubscribe other people's leads. Returns a simple HTML
 * confirmation page so the recipient sees a friendly "you've been
 * unsubscribed" instead of a JSON blob.
 *
 * POST works too (RFC 8058 one-click) - some mail clients prefer it.
 */

async function handle(env: Env, url: URL): Promise<Response> {
  const leadId = Number(url.searchParams.get("l"));
  const token = url.searchParams.get("t") || "";
  if (!Number.isFinite(leadId) || leadId <= 0 || !token) {
    return htmlPage("Invalid unsubscribe link", "This unsubscribe link is missing required information.");
  }

  const ok = await verifyUnsubscribeToken(token, leadId, env.EMAIL_UNSUB_SIGNING_KEY || "");
  if (!ok) {
    return htmlPage("Invalid unsubscribe link", "This unsubscribe link is invalid or has been tampered with. Please reply to the email and ask the sender to remove you.");
  }

  const lead = await queryFirst<{ id: number; email: string | null; email_opt_out: number }>(
    env.D1DB,
    `SELECT id, email, email_opt_out FROM lead WHERE id = ?`,
    leadId,
  );
  if (!lead) {
    // Token is valid for this lead-id but the lead row no longer exists. Still
    // show the friendly success page - there's nothing left to send to.
    return htmlPage("Unsubscribed", "You will not receive further marketing emails.");
  }

  if (lead.email_opt_out !== 1) {
    await execute(
      env.D1DB,
      `UPDATE lead SET email_opt_out = 1, last_email_opt_out_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      nowIso(), leadId,
    );
  }
  return htmlPage(
    "Unsubscribed",
    lead.email
      ? `<strong>${escapeHtml(lead.email)}</strong> has been removed from marketing emails. You will not receive further messages from this sender.`
      : "You will not receive further marketing emails.",
  );
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => handle(env, new URL(request.url));
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => handle(env, new URL(request.url));

function htmlPage(title: string, message: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} | WarmChats</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #f7f7f8; color: #1f2937; margin: 0; padding: 40px 20px; }
    .card { max-width: 480px; margin: 60px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    h1 { font-size: 20px; margin: 0 0 12px; color: #111827; }
    p { font-size: 15px; line-height: 1.5; margin: 0; color: #4b5563; }
    .brand { font-size: 12px; color: #9ca3af; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${message}</p>
    <div class="brand">WarmChats</div>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
