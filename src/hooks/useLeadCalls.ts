import { useCallback, useEffect, useState } from "react";
import { callingApi } from "@/api/calling";
import type { CallSummary } from "@/types/calling";

/**
 * Fetches the call history for a lead. Accepts either a calling-backend
 * lead UUID (preferred) or a phone number. Phone is the common case since
 * the rest of the warmchats app keys contacts by phone, not by the
 * calling backend's Lead UUID.
 */
export function useLeadCalls(args: {
  leadId?: string | null;
  phoneNumber?: string | null;
}) {
  const { leadId, phoneNumber } = args;
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!leadId && !phoneNumber) return;
    setLoading(true);
    try {
      const r = leadId
        ? await callingApi.getCallsByLead(leadId)
        : await callingApi.getCallsByPhone(phoneNumber!);
      setCalls(r.calls);
    } catch {
      // best-effort; don't surface
    } finally {
      setLoading(false);
    }
  }, [leadId, phoneNumber]);

  useEffect(() => {
    if (!leadId && !phoneNumber) return;
    void refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [leadId, phoneNumber, refresh]);

  return { calls, loading, refresh };
}
