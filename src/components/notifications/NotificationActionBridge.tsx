import type { ReactElement } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCalling } from "@/context/useCalling";
import { useQuietHoursConfirm } from "@/components/inbox/components/useQuietHoursConfirm";
import { baseURL as API_BASE } from "@/helpers/api";

/**
 * Bridges native notification action buttons (Reply / Answer / Decline / Open)
 * into the running app. The service worker can't answer a WebRTC call and can't
 * reliably send a reply (the send endpoints return HTTP 200 on a quiet-hours
 * block, so a headless fetch reports "sent" while nothing went out). So instead
 * the SW hands the action here - either by posting a `wc-notif-action` message
 * to an already-open window, or by opening a new window with the action encoded
 * in `wc*` URL params that we replay on boot.
 *
 * - reply  -> send the SMS / email through the same endpoint the composer uses,
 *             surface the result (sent / quiet-hours / error) as a toast, then
 *             open the thread so the agent sees it land.
 * - answer -> accept the incoming call via the live Telnyx SDK.
 * - decline-> hang up the incoming call.
 * - open   -> navigate to the notification's target route.
 *
 * Mounted once, app-wide, inside <CallingProvider> + the router.
 */

interface NotifAction {
  action: "reply" | "answer" | "decline" | "open";
  kind: string;
  reply?: string;
  path?: string;
  // routing/recipient data lifted out of the notification payload
  to?: string | null;
  email?: string | null;
  threadId?: number | null;
  leadId?: number | null;
  callId?: string | null;
}

export function NotificationActionBridge(): ReactElement | null {
  const navigate = useNavigate();
  const { incomingCall, acceptIncoming, rejectIncoming } = useCalling();
  const { modal: quietHoursModal, confirm: askQuietHours } = useQuietHoursConfirm();

  // When an "answer" action arrives before the incoming-call invite is wired up
  // (e.g. the app was just cold-opened from the notification), we stash it and
  // accept as soon as the ringing call appears, with a bounded timeout.
  const pendingAnswerRef = useRef(false);
  // Mirror of `incomingCall` presence so handleAction can read it without
  // depending on (and re-subscribing the SW message listener for) every change.
  const hasIncomingRef = useRef(false);
  useEffect(() => {
    hasIncomingRef.current = !!incomingCall;
  }, [incomingCall]);

  const sendReply = useCallback(
    async (a: NotifAction) => {
      const text = (a.reply || "").trim();
      if (!text) return;

      const isEmail = a.kind === "email_inbound";
      if (isEmail && !a.email) {
        toast.error("Could not send reply", { description: "Missing recipient email." });
        return;
      }
      if (!isEmail && !a.to) {
        toast.error("Could not send reply", { description: "Missing recipient number." });
        return;
      }

      // One POST attempt. `confirm` re-sends past the quiet-hours guard.
      const postOnce = (confirm: boolean) =>
        isEmail
          ? fetch(`${API_BASE}/inbox/send/reply`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                thread_id: a.threadId ?? undefined,
                to_email: a.email,
                message: text,
                lead_ids: a.leadId ? [a.leadId] : undefined,
                confirm_quiet_hours: confirm ? true : undefined,
              }),
            })
          : fetch(`${API_BASE}/messages/send`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: a.to,
                body: text,
                lead_id: a.leadId ?? undefined,
                confirm_quiet_hours: confirm ? true : undefined,
              }),
            });

      const openThread = () => {
        // Open the thread so the agent sees the conversation + the just-sent
        // message (the inbox refetches on navigation / WebSocket).
        if (a.leadId) {
          navigate(`/inbox?lead=${a.leadId}&channel=${isEmail ? "email" : "sms"}`);
        } else {
          navigate(a.path || "/inbox");
        }
      };

      try {
        let res = await postOnce(false);
        let data = (await res.json().catch(() => ({}))) as {
          code?: string;
          timezone?: string;
          hour?: number;
          until?: string;
          error?: string;
        };

        // Quiet-hours block comes back as HTTP 200 with a QUIET_HOURS code -
        // prompt the agent (same dialog as the composer) and retry if confirmed.
        if (data?.code === "QUIET_HOURS") {
          const sendAnyway = await askQuietHours({
            timezone: data.timezone,
            hour: data.hour,
            until: data.until,
          });
          if (!sendAnyway) {
            toast.message("Reply not sent");
            openThread();
            return;
          }
          res = await postOnce(true);
          data = (await res.json().catch(() => ({}))) as typeof data;
        }

        if (data?.code === "QUIET_HOURS" || !res.ok) {
          toast.error("Reply failed to send", {
            description: data?.error || "Open the conversation to retry.",
          });
        } else {
          toast.success("Reply sent");
        }
      } catch {
        toast.error("Reply failed to send", { description: "Open the conversation to retry." });
      } finally {
        openThread();
      }
    },
    [navigate, askQuietHours],
  );

  const handleAction = useCallback(
    (a: NotifAction) => {
      switch (a.action) {
        case "answer":
          // Accept now if the call is already ringing; otherwise mark it pending
          // and let the effect below accept once the invite arrives.
          if (hasIncomingRef.current) {
            acceptIncoming();
          } else {
            pendingAnswerRef.current = true;
          }
          if (a.path) navigate(a.path);
          break;
        case "decline":
          rejectIncoming();
          break;
        case "reply":
          void sendReply(a);
          break;
        case "open":
        default:
          navigate(a.path || "/inbox");
          break;
      }
    },
    [acceptIncoming, rejectIncoming, sendReply, navigate],
  );

  // A pending "answer" (cold open) resolves as soon as the ringing call lands.
  useEffect(() => {
    if (!pendingAnswerRef.current) return;
    if (!incomingCall) return;
    pendingAnswerRef.current = false;
    acceptIncoming();
  }, [incomingCall, acceptIncoming]);

  // Clear a stale pending-answer after a bit so it can't fire on an unrelated
  // later call.
  useEffect(() => {
    if (!pendingAnswerRef.current) return;
    const id = window.setTimeout(() => {
      pendingAnswerRef.current = false;
    }, 12_000);
    return () => window.clearTimeout(id);
  });

  // 1) Live hand-off: the SW posts an action to this (already-open) window.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const msg = event.data as
        | { type?: string; action?: string; kind?: string; reply?: string; path?: string; data?: Record<string, unknown> }
        | null;
      if (!msg || msg.type !== "wc-notif-action" || !msg.action) return;
      const d = (msg.data || {}) as Record<string, unknown>;
      handleAction({
        action: msg.action as NotifAction["action"],
        kind: msg.kind || "system",
        reply: msg.reply,
        path: msg.path,
        to: (d.from_number as string) ?? null,
        email: (d.to_email as string) ?? (d.from_email as string) ?? null,
        threadId: d.thread_id != null ? Number(d.thread_id) : d.conversation_id != null ? Number(d.conversation_id) : null,
        leadId: d.lead_id != null ? Number(d.lead_id) : null,
        callId: (d.call_id as string) ?? null,
      });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [handleAction]);

  // 2) Cold open: the SW opened a new window with the action in `wc*` params.
  // Replay it once, then strip the params so a refresh doesn't re-fire it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("wcaction");
    if (!action) return;

    const leadRaw = params.get("wclead");
    const threadRaw = params.get("wcthread");
    const reply = params.get("wcreply") || undefined;
    const kind = params.get("wckind") || "system";
    const to = params.get("wcto");
    const email = params.get("wcemail");
    const callId = params.get("wccall");

    // Strip the wc* keys, preserving any real query params (e.g. lead/tab) so
    // the cleaned URL is the route the notification meant to land on.
    [
      "wcaction",
      "wckind",
      "wcreply",
      "wcto",
      "wcemail",
      "wcthread",
      "wclead",
      "wccall",
    ].forEach((k) => params.delete(k));
    const rest = params.toString();
    const cleaned = window.location.pathname + (rest ? `?${rest}` : "");
    window.history.replaceState(window.history.state, "", cleaned);

    handleAction({
      action: action as NotifAction["action"],
      kind,
      reply,
      to,
      email,
      threadId: threadRaw ? Number(threadRaw) : null,
      leadId: leadRaw ? Number(leadRaw) : null,
      callId,
      path: cleaned,
    });
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return quietHoursModal;
}
