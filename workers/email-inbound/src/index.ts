/**
 * WarmChats inbound email worker.
 *
 * Cloudflare Email Routing delivers every message addressed to
 * *@mail.warmchats.com here. We parse the MIME and POST it to the app's
 * existing inbound endpoint (the same contract the ElasticEmail webhook used),
 * so threading/lead matching in the app is untouched.
 *
 * Throwing on a failed forward returns a transient SMTP error to the sender,
 * so their server retries instead of the message being silently dropped.
 */
import PostalMime from "postal-mime";

interface Env {
  INBOUND_ENDPOINT: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    // message.raw is single-use - buffer before parsing.
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);

    const payload = {
      to: message.to,
      from: parsed.from?.address || message.from,
      subject: parsed.subject || message.headers.get("subject") || "(no subject)",
      bodyText: parsed.text || "",
      bodyHtml: parsed.html || "",
      messageId:
        parsed.messageId || message.headers.get("message-id") || "",
      Date: message.headers.get("date") || new Date().toISOString(),
    };

    const res = await fetch(env.INBOUND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`inbound forward failed: HTTP ${res.status}`);
    }
  },
} satisfies ExportedHandler<Env>;
