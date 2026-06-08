/// <reference types="@cloudflare/workers-types" />
import type { Env } from "./env.ts";
import { queryFirst } from "./db.ts";
import { mockElasticSendEmail, mockGmailSendMessage } from "./mockSendApi.ts";
import { isMockSendsEnabled } from "./appSettings.ts";
import { getGmailAccessToken, sendGmailMessage, buildRfc822, type EmailAttachmentPart } from "./gmailApi.ts";
import { applyPersonalization, buildPersonalizationVars, type LeadRow } from "./personalize.ts";

/**
 * Shared outbound-email dispatch used by /api/inbox/send and
 * /api/inbox/send/reply. Resolves the sending provider, personalizes the
 * subject/body against the recipient lead, and hands off to ElasticEmail or
 * Gmail. Returns a discriminated result so callers can surface errors.
 */

export interface DispatchInput {
  userId: number;
  to: string;
  subject: string;
  body: string;
  leadId?: number | null;
  senderType?: string | null;   // "business" | "personal" | "gmail" | unset
  senderName?: string | null;
  attachments?: Array<{ storage_key?: string; name?: string; content_type?: string; url?: string }>;
}

export type DispatchResult =
  | {
      ok: true;
      channel: "business" | "gmail";
      fromEmail: string;
      providerMessageId?: string;
      subject: string;
      /** The plain-text body. Persist this; the recipient saw an HTML wrapper. */
      body: string;
      /** Random per-message token used by the open-tracking pixel. */
      trackingToken: string;
    }
  | { ok: false; status: number; error: string; code?: string };

/** Escape a plain-text string for safe embedding inside HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap a plain-text body in minimal HTML and append the tracking-pixel img.
 * Recipients that block remote images simply won't trigger `opened_at`, which
 * is the same behavior as every other open-tracking implementation.
 */
function wrapBodyWithPixel(plain: string, pixelUrl: string): string {
  const escaped = escapeHtml(plain).replace(/\r?\n/g, "<br>");
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#222">${escaped}<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px" /></body></html>`;
}

export async function dispatchOutboundEmail(
  env: Env,
  input: DispatchInput,
): Promise<DispatchResult> {
  const to = (input.to || "").trim();
  if (!to) return { ok: false, status: 400, error: "recipient (to) is required" };

  // ---- Personalize against the recipient lead ----
  let lead: LeadRow | null = null;
  if (input.leadId && Number.isInteger(input.leadId)) {
    lead = await queryFirst<LeadRow>(
      env.D1DB,
      `SELECT first_name, last_name, name, email, phone, area FROM lead WHERE id = ?`,
      input.leadId,
    );
  }
  const senderName = (input.senderName || "").trim();
  const vars = buildPersonalizationVars(lead, senderName);
  const subject = applyPersonalization(input.subject?.trim() || "(no subject)", vars);
  const body = applyPersonalization(input.body || "", vars);

  // ---- Resolve sender ----
  const senderType = (input.senderType || "").toLowerCase();
  const elasticConn = await queryFirst<{ id: number; email_address: string | null; elastic_from_email: string | null }>(
    env.D1DB,
    `SELECT id, email_address, elastic_from_email FROM inbox_connection
      WHERE user_id = ? AND provider = 'elastic'
        AND (status IS NULL OR status IN ('verified', 'active'))
      ORDER BY id DESC LIMIT 1`,
    input.userId,
  );
  const gmailConn = await queryFirst<{ id: number; email_address: string }>(
    env.D1DB,
    `SELECT id, email_address FROM email_connections
      WHERE user_id = ? AND provider = 'gmail' AND status = 'active'
      ORDER BY id DESC LIMIT 1`,
    input.userId,
  );

  let channel: "business" | "gmail";
  if (senderType === "business") {
    if (!elasticConn) return { ok: false, status: 400, error: "Business email is not connected. Verify your domain first." };
    channel = "business";
  } else if (senderType === "personal" || senderType === "gmail") {
    if (!gmailConn) return { ok: false, status: 400, error: "Gmail is not connected." };
    channel = "gmail";
  } else if (elasticConn) {
    channel = "business";
  } else if (gmailConn) {
    channel = "gmail";
  } else {
    return { ok: false, status: 400, error: "No email connection configured." };
  }

  // ---- Tracking ----
  // Generate the open-tracking token upfront so we can bake the pixel URL
  // into the HTML body before sending. The caller stores the token alongside
  // the persisted row so the pixel endpoint can flip opened_at.
  const trackingToken = crypto.randomUUID();
  const base = (env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const pixelUrl = `${base}/api/inbox/email/open/${trackingToken}.gif`;
  const htmlBody = wrapBodyWithPixel(body, pixelUrl);

  // ---- Load attachment bytes from R2 (skip silently if the binding/key is missing) ----
  const attachmentParts: EmailAttachmentPart[] = [];
  const bucket = (env as unknown as { ATTACHMENTS?: R2Bucket }).ATTACHMENTS;
  if (bucket && input.attachments?.length) {
    for (const att of input.attachments) {
      if (!att?.storage_key) continue;
      const obj = await bucket.get(att.storage_key);
      if (!obj) continue;
      attachmentParts.push({
        filename: att.name || att.storage_key.split("/").pop() || "attachment",
        contentType: att.content_type || obj.httpMetadata?.contentType || "application/octet-stream",
        bytes: await obj.arrayBuffer(),
      });
    }
  }

  // ---- Dispatch ----
  if (channel === "business") {
    const fromEmail = (elasticConn!.elastic_from_email || elasticConn!.email_address || "").trim();
    // Route replies to our inbound-parsing domain so the lead's reply reaches
    // /api/elastic/inbound instead of the agent's human From mailbox (which may
    // be hosted elsewhere, e.g. Hostinger). The connection id in the local-part
    // lets the inbound webhook resolve the exact connection/org. Requires an
    // ElasticEmail inbound route on REPLY_DOMAIN (mail.warmchats.com, whose
    // MX -> mx.inbound.elasticemail.com).
    const replyDomain = (env.REPLY_DOMAIN || "mail.warmchats.com").trim();
    const replyTo = `inbound+${elasticConn!.id}@${replyDomain}`;
    const result = await mockElasticSendEmail(env, {
      to,
      subject,
      body: htmlBody,
      isHtml: true,
      transactional: true,
      ...(fromEmail ? { fromEmail, replyTo } : {}),
      ...(senderName ? { fromName: senderName } : {}),
      ...(attachmentParts.length ? { attachments: attachmentParts } : {}),
    }, { leadId: input.leadId ?? null });
    if (!result.ok) {
      return { ok: false, status: 502, error: `Email delivery failed: ${result.error || "unknown error"}` };
    }
    return { ok: true, channel, fromEmail, subject, body, trackingToken, ...(result.messageId !== undefined ? { providerMessageId: result.messageId } : {}) };
  }

  // Gmail dispatch: skip the access-token fetch when mocking so dev doesn't
  // need a real Gmail connection to test the email path.
  if (!(await isMockSendsEnabled(env, null))) {
    const access = await getGmailAccessToken(env, gmailConn!.id);
    if (!access) {
      return { ok: false, status: 403, error: "Gmail connection needs reconnect", code: "NEEDS_REAUTH" };
    }
    try {
      const rfc822 = buildRfc822({
        to,
        from: senderName ? `${senderName} <${gmailConn!.email_address}>` : gmailConn!.email_address,
        subject,
        body: htmlBody,
        isHtml: true,
        ...(attachmentParts.length ? { attachments: attachmentParts } : {}),
      });
      const sent = await sendGmailMessage(access, rfc822);
      return { ok: true, channel, fromEmail: gmailConn!.email_address, subject, body, trackingToken, ...(sent.id !== undefined ? { providerMessageId: sent.id } : {}) };
    } catch (e) {
      return { ok: false, status: 502, error: `Gmail delivery failed: ${e instanceof Error ? e.message : "unknown error"}` };
    }
  }
  const mocked = await mockGmailSendMessage(env, gmailConn!.email_address, to, subject, body, { leadId: input.leadId ?? null });
  return { ok: true, channel, fromEmail: gmailConn!.email_address, subject, body, trackingToken, ...(mocked.id !== undefined ? { providerMessageId: mocked.id } : {}) };
}
