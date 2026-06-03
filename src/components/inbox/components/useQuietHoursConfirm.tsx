import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "../../V2/Dashboard/ConfirmDialog";
import { formatLocalTime } from "../utils/contactUtils";

/**
 * Payload describing why a send is being blocked by quiet hours.
 *
 * For a single recipient, pass `timezone`/`until` (from the server's
 * `QUIET_HOURS` response body - HTTP 200 with `code: "QUIET_HOURS"`).
 * For a bulk send, pass `count` with the number of recipients currently in
 * quiet hours and the modal switches to a summary copy.
 */
export type QuietHoursPrompt = {
  timezone?: string;
  hour?: number;
  until?: string;
  count?: number;
};

function buildMessage(p: QuietHoursPrompt): string {
  if (p.count && p.count > 1) {
    return `${p.count} recipients are outside their local contact hours right now. Send anyway?`;
  }
  const zone = p.timezone || "their timezone";
  const localTime = formatLocalTime(p.timezone);
  const reopen = p.until ? formatLocalTime(p.timezone, Date.parse(p.until)) : "-";
  if (reopen !== "-") {
    return `It's ${localTime} in their local time (${zone}). You can normally send after ${reopen}. Send anyway?`;
  }
  return `It's ${localTime} in their local time (${zone}). Send anyway?`;
}

/**
 * Promise-based quiet-hours confirmation. Render `modal` somewhere in the
 * component tree and `await confirm(payload)` to get the user's choice
 * (`true` = send anyway, `false` = cancel). Replaces the native
 * `window.confirm` so the prompt matches the rest of the app.
 */
export function useQuietHoursConfirm() {
  const [prompt, setPrompt] = useState<QuietHoursPrompt | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((payload: QuietHoursPrompt) => {
    setPrompt(payload);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPrompt(null);
  }, []);

  // Portal to <body> so the dialog is never clipped or mispositioned by a
  // transformed ancestor (e.g. react-hot-toast's animated container).
  const modal =
    prompt !== null
      ? createPortal(
          <ConfirmDialog
            open
            title="Outside contact hours"
            message={buildMessage(prompt)}
            confirmLabel="Send now"
            cancelLabel="Cancel"
            tone="primary"
            onConfirm={() => settle(true)}
            onCancel={() => settle(false)}
          />,
          document.body,
        )
      : null;

  return { modal, confirm };
}
