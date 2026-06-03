import { useEffect, useState } from "react";
import axios from "axios";
import { callingApi } from "@/api/calling";
import type { CanCallResponse } from "@/types/calling";

export function useCanCall(): {
  canCall: boolean;
  reasons: string[];
  loading: boolean;
} {
  const [state, setState] = useState<CanCallResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setState({ canCall: false, reasons: ["Not signed in"] });
      setLoading(false);
      return;
    }
    callingApi
      .canCall()
      .then((r) => {
        if (!cancelled) setState(r);
      })
      .catch((err) => {
        if (cancelled) return;

        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          const data = err.response?.data as { message?: string | string[]; error?: string } | undefined;
          const message = data?.message ?? data?.error ?? err.message;

          if (status === 401) {
            setState({
              canCall: false,
              reasons: ["Please sign in again to make calls."],
            });
            return;
          }

          if (status) {
            setState({
              canCall: false,
              reasons: Array.isArray(message)
                ? message.map(String)
                : [String(message || `Calling service error (${status})`)],
            });
            return;
          }

          const base =
            (import.meta.env.VITE_CALLING_API_BASE as string | undefined) ||
            (typeof window !== "undefined" ? window.location.origin : "");
          setState({
            canCall: false,
            reasons: [`Could not reach calling service (${base})`],
          });
          return;
        }

        setState({ canCall: false, reasons: ["Could not reach calling service"] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    canCall: state?.canCall ?? false,
    reasons: state?.reasons ?? [],
    loading,
  };
}
