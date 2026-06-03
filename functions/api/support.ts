/// <reference types="@cloudflare/workers-types" />
import type { Env } from "../_shared/env.ts";
import { error, json, readJson } from "../_shared/http.ts";
import { mockElasticSendEmail } from "../_shared/mockSendApi.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";

type SupportPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  message?: string;
  referral?: string;
  companyWebsite?: string;
  submittedAt?: number;
  turnstileToken?: string;
};

const SUPPORT_RECIPIENT = "hello@warmchats.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clean(value?: string): string {
  return (value || "").trim();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<SupportPayload>(request);
  if (!body) return error("Invalid request body", 400);

  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const email = clean(body.email).toLowerCase();
  const message = clean(body.message);
  const referral = clean(body.referral);
  const submittedAt = Number(body.submittedAt || 0);

  if (clean(body.companyWebsite)) {
    return json({ success: true });
  }

  if (!(await verifyTurnstile(env, body.turnstileToken, request))) {
    return error("Captcha verification failed. Please try again.", 400);
  }

  const elapsed = Date.now() - submittedAt;
  if (!submittedAt || elapsed < 2500 || elapsed > 1000 * 60 * 60 * 6) {
    return error("Please try submitting the form again.", 400);
  }

  if (!firstName || !lastName || !email || !message) {
    return error("Please complete all required fields.", 400);
  }

  if (!EMAIL_RE.test(email)) {
    return error("Please enter a valid email address.", 400);
  }

  if (message.length > 5000 || referral.length > 1000) {
    return error("Please shorten your message and try again.", 400);
  }

  const fullName = `${firstName} ${lastName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#101828;font-size:14px;line-height:1.6">
      <h2 style="margin:0 0 16px">New WarmChats support request</h2>
      <p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>How they heard about us:</strong> ${escapeHtml(referral || "Not provided")}</p>
      <p><strong>Message:</strong></p>
      <div style="white-space:pre-wrap;border:1px solid #eaecf0;border-radius:8px;padding:12px;background:#f9fafb">${escapeHtml(message)}</div>
    </div>
  `;

  const result = await mockElasticSendEmail(env, {
    to: SUPPORT_RECIPIENT,
    subject: `WarmChats support request from ${fullName}`,
    body: html,
    isHtml: true,
    replyTo: email,
    transactional: true,
  });

  if (!result.ok) {
    return error(result.error || "Failed to send support request", 502);
  }

  return json({ success: true, message: "Thanks. We received your request." });
};
