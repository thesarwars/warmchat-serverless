import type { ContactMessage } from "../types";
import AttachmentChips from "./AttachmentChips";
import ChannelBadge from "./ChannelBadge";
import DeliveryTicks from "./DeliveryTicks";
import { formatDateTime } from "../utils/formatters";
import { Icon } from "../../ai-v2/Icon";

/**
 * Was this outbound message authored by the conversational AI agent? The
 * backend stamps a reliable `sent_by_ai` flag (sms_message.sent_by_ai /
 * inbox_messages.sent_by_ai) on every AI-composed send - the tool-calling
 * agent, qualification flow, and instant reply. We trust that flag first.
 *
 * Automation (campaign / workflow) drips are NOT "AI Agent" - they carry a
 * `campaign_name` instead and are tagged with that name (see MessageBubble).
 *
 * The older sender-name heuristic stays only as a fallback for email rows that
 * predate the flag (the backend tags AI replies with an assistant-style name).
 * When neither signal fires, no marker shows - we never fabricate the AI tag.
 */
function isAiSent(message: ContactMessage): boolean {
  if (message.sent_by_ai === true) return true;
  const name = String(message.sender_name || "").toLowerCase();
  if (!name) return false;
  return (
    name.includes("ai ") ||
    name.includes(" ai") ||
    name === "ai" ||
    name.includes("assistant") ||
    name.includes("warmchats ai") ||
    name.includes("auto")
  );
}

export default function MessageBubble({
  message,
  highlight = false,
}: {
  message: ContactMessage;
  highlight?: boolean;
}) {
  // System events render as a centered chip with the timestamp inline.
  if (message.direction === "system") {
    return (
      <div id={`inbox-msg-${message.id}`} className="wc-msg-sys scroll-mt-24">
        <span>{message.body || message.subject || "System event"}</span>
        <time>{formatDateTime(message.timestamp)}</time>
      </div>
    );
  }

  const inbound = message.direction === "inbound";
  // A message sent by an automation (campaign / workflow) is tagged with the
  // campaign name, NOT the "AI Agent" marker. Conversational-AI sends get the
  // sparkles "AI Agent" tag. The two are mutually exclusive.
  const campaign = !inbound ? (message.campaign_name || "").trim() : "";
  const ai = !inbound && !campaign && isAiSent(message);
  // side: outgoing (agent / AI / campaign) is right-aligned + blue; inbound left.
  const side = inbound ? "in" : "out";
  const who = inbound ? "" : ai ? "ai" : "agent";

  return (
    <div
      id={`inbox-msg-${message.id}`}
      className={`wc-msg scroll-mt-24 ${side} ${who}`}
    >
      <div
        className={`wc-msg-bub ${
          highlight ? "ring-2 ring-orange-400 ring-offset-2" : ""
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-[11px] font-medium opacity-80 [&_.bg-white]:bg-white/70 [&_.text-red-200]:text-red-500 [&_.text-white]:text-current">
          {/* AI Agent / campaign marker - now INSIDE the bubble's top row. */}
          {campaign ? (
            <span
              className="inline-flex items-center gap-1 font-bold"
              style={{ color: "inherit" }}
            >
              <Icon name="route" size={11} />
              {campaign}
            </span>
          ) : ai ? (
            <span
              className="inline-flex items-center gap-1 font-bold"
              style={{ color: "var(--accent-strong)" }}
            >
              <Icon name="sparkles" size={11} />
              AI Agent
            </span>
          ) : null}
          <ChannelBadge
            channel={message.channel}
            mms={!!message.attachments && message.attachments.length > 0}
          />
          <DeliveryTicks message={message} />
          {/* Timestamp inside the bubble, top-right - frees the row that used to
              sit under each bubble and tightens the thread. */}
          <time
            className="ml-auto whitespace-nowrap"
            style={{ marginTop: 0, color: "inherit", fontWeight: 400 }}
          >
            {formatDateTime(message.timestamp)}
          </time>
        </div>
        {message.subject && message.channel === "email" ? (
          <div className="mb-1 text-sm font-semibold">{message.subject}</div>
        ) : null}
        {message.body ? (
          <div className="whitespace-pre-wrap wrap-break-word">
            {message.body}
          </div>
        ) : null}
        {message.attachments && message.attachments.length > 0 ? (
          <div className="mt-2">
            <AttachmentChips attachments={message.attachments} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
