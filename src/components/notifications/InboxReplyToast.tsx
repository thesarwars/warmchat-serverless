import { useState, useRef, useEffect } from "react";
import { Send, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { baseURL as API_BASE } from "@/helpers/api";
import type { NotificationItem } from "@/context/useNotifications";
import {
  detectQuietHours,
  type QuietHoursPayload,
} from "../inbox/api/sendMessage";
import { useQuietHoursConfirm } from "../inbox/components/useQuietHoursConfirm";
import { NimbusHead } from "./NimbusHead";

interface Props {
  notification: NotificationItem;
  onSent: () => void;
  onDismiss: () => void;
  /** Open the conversation this notification points at (and mark it read). */
  onOpen: () => void;
}

const SMS_MAX_LENGTH = 800;

export function InboxReplyToast({ notification, onSent, onDismiss, onOpen }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { modal: quietHoursModal, confirm: askQuietHours } =
    useQuietHoursConfirm();

  const isSms = notification.kind === "sms_inbound";
  const isEmail = notification.kind === "email_inbound";
  const channelLabel = isSms ? "SMS" : "Email";
  const maxLength = isSms ? SMS_MAX_LENGTH : 5000;
  const data = (notification.data || {}) as Record<string, unknown>;
  // Show the LEAD's name + contact detail in the toast (not the "Nimbus" brand) -
  // when a lead messages you, you want to see who it is at a glance. Fall back to
  // parsing the notification title ("New message from X") when lead_name is absent.
  const leadName =
    (typeof data.lead_name === "string" && data.lead_name.trim()) ||
    notification.title.replace(/^New (message|email|SMS) from\s+/i, "").trim() ||
    "New message";
  const contactDetail =
    (isSms ? (data.from_number as string | undefined) : ((data.from_email as string | undefined) || (data.to_email as string | undefined))) || "";

  // Auto-grow textarea up to ~5 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Add the vertical border to the target height: with box-sizing: border-box
    // setting height to scrollHeight alone leaves the content overflowing by the
    // border width, which renders a scrollbar (the stray up/down arrows).
    const borderY = el.offsetHeight - el.clientHeight;
    const next = Math.min(el.scrollHeight + borderY, 120);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight + borderY > 120 ? "auto" : "hidden";
  }, [text]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      // Test notification - capture the reply locally, don't send anywhere.
      if (data.test === true) {
        toast.success("Test reply captured. No message was sent.");
        onSent();
        return;
      }
      const doSend = (confirmQuiet: boolean): Promise<Response> => {
        if (isSms) {
          const to = (data.from_number as string | undefined) || "";
          const leadId = data.lead_id as number | undefined;
          if (!to) throw new Error("Missing phone number");
          return fetch(`${API_BASE}/messages/send`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to,
              body: trimmed,
              lead_id: leadId ?? undefined,
              confirm_quiet_hours: confirmQuiet ? true : undefined,
            }),
          });
        }
        if (isEmail) {
          const toEmail = (data.to_email as string | undefined) || (data.from_email as string | undefined) || "";
          const threadId = (data.thread_id as number | undefined) ?? (notification.conversation_id ?? undefined);
          if (!toEmail) throw new Error("Missing recipient email");
          return fetch(`${API_BASE}/inbox/send/reply`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thread_id: threadId,
              to_email: toEmail,
              message: trimmed,
              confirm_quiet_hours: confirmQuiet ? true : undefined,
            }),
          });
        }
        throw new Error("Unsupported reply kind");
      };

      let res = await doSend(false);
      let body = (await res.json().catch(() => ({}))) as QuietHoursPayload;

      const quiet = detectQuietHours(res, body);
      if (quiet) {
        const proceed = await askQuietHours({
          timezone: quiet.timezone,
          hour: quiet.hour,
          until: quiet.until,
        });
        if (!proceed) return;
        res = await doSend(true);
        body = (await res.json().catch(() => ({}))) as QuietHoursPayload;
      }

      if (!res.ok) {
        throw new Error(body.error || `Failed (${res.status})`);
      }
      toast.success("Reply sent");
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const canSend = text.trim().length > 0 && !sending;

  return (
    <>
      {quietHoursModal}
      <div
        style={{
          position: "relative",
          width: "100%",
          marginTop: 30,
          background: "linear-gradient(150deg,#e7f5fe 0%,#f5fbff 58%,#ffffff 100%)",
          border: "1px solid #c8e4f6",
          borderRadius: 18,
          boxShadow: "0 20px 44px -20px rgba(40,90,130,.5)",
          padding: "46px 14px 12px",
        }}
      >
        {/* Head peeks out above the card. */}
        <span style={{ position: "absolute", top: -30, left: 16 }}>
          <NimbusHead size={74} />
        </span>

        {/* Dismiss stays outside the clickable open-conversation region so it
            can't accidentally navigate. */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ position: "absolute", top: 14, right: 12, display: "inline-flex", color: "#7e98ab", background: "none", border: "none", borderRadius: 8, padding: 4, cursor: "pointer" }}
        >
          <X width={15} height={15} />
        </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#16314a", letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{leadName}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: ".08em",
                color: isSms ? "#1f6fb0" : "#7c5cd6",
                background: isSms ? "#e3f1fb" : "#efe9fb",
                border: `1px solid ${isSms ? "#c5e1f4" : "#ddd0f4"}`,
                borderRadius: 99,
                padding: "2px 8px",
                flex: "none",
              }}
            >
              {channelLabel}
            </span>
          </div>

          {/* Contact detail + message preview open the conversation. */}
          <button
            type="button"
            onClick={onOpen}
            title="Open conversation"
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            {contactDetail && (
              <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#7e98ab", marginBottom: 3 }}>{contactDetail}</span>
            )}
            {notification.body && (
              <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 13.5, color: "#16314a", lineHeight: 1.45 }}>
                {notification.body}
              </span>
            )}
          </button>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 12 }}>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, maxLength))}
              placeholder={isSms ? "Type a reply..." : "Reply..."}
              rows={1}
              disabled={sending}
              className="flex-1 resize-none rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              style={{ border: "1px solid #c8e0f0", background: "rgba(255,255,255,.85)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (canSend) void handleSend();
                }
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send reply"
              style={{
                display: "flex",
                height: 34,
                width: 34,
                flex: "none",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                border: "none",
                color: "#fff",
                background: canSend ? "linear-gradient(180deg,#FB8A3B,#F26A1F)" : "#f1bd96",
                boxShadow: canSend ? "0 8px 18px -8px rgba(242,106,31,.6)" : "none",
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send width={14} height={14} />}
            </button>
          </div>
        {isSms && text.length > SMS_MAX_LENGTH * 0.85 && (
          <p style={{ margin: "4px 0 0", textAlign: "right", fontSize: 10, color: "#94a8b6" }}>
            {text.length} / {SMS_MAX_LENGTH}
          </p>
        )}
      </div>
    </>
  );
}
