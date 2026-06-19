import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Check,
  CheckCircle2,
  LifeBuoy,
  Sparkles,
  X,
} from "lucide-react";

/**
 * Post-onboarding "Getting started" checklist. Lives at the bottom of the
 * sidebar as a full-width "Setup N/total" progress card (collapsed state).
 * Clicking it opens the floating panel, which stays fixed-position so it
 * floats above page content. Data-backed items are auto-detected server-side
 * from real tables; the two "explore/review" items check off automatically
 * when the user actually visits those pages.
 */

type ItemKey =
  | "email" | "sms" | "leads" | "ai_agent" | "ai_followup"
  | "automation" | "automation_active" | "templates" | "dashboard";

type ChecklistState = {
  dismissed: boolean;
  items: Record<ItemKey, boolean>;
};

type ItemDef = { key: ItemKey; label: string; description: string; href: string };

const ITEMS: ItemDef[] = [
  { key: "email", label: "Connect your email", description: "Send and receive emails inside WarmChats", href: "/connect-email" },
  { key: "sms", label: "Connect SMS", description: "Text, call, and manage conversations in one inbox", href: "/connect-phone" },
  { key: "leads", label: "Import your leads", description: "Upload contacts or add leads to build your pipeline", href: "/leads" },
  { key: "ai_agent", label: "Explore the AI Agent", description: "See how AI replies, qualifies, and recommends next steps", href: "/ai/agent" },
  { key: "ai_followup", label: "Turn on AI follow-up", description: "Activate instant replies and automated nurturing", href: "/ai/agent?tab=inbound" },
  { key: "automation", label: "Create your first automation", description: "Build a workflow for buyers, sellers, or new inquiries", href: "/ai/agent?tab=outbound" },
  { key: "automation_active", label: "Launch your first automation", description: "Send personalized outreach across your leads", href: "/ai/agent?tab=outbound" },
  { key: "templates", label: "Customize templates", description: "Create reusable messages for faster follow-up", href: "/ai/agent?tab=outbound&sub=templates" },
  { key: "dashboard", label: "Review your dashboard", description: "Track hot leads, pipeline, and response speed", href: "/dashboard" },
];

const COLLAPSE_KEY = "wc_checklist_collapsed";

// Session-scoped cache. Each dashboard page wraps itself in MainLayout, so this
// component (rendered in the sidebar) remounts on every navigation. Holding the
// loaded state, the in-flight load promise, and the already-sent visit pings at
// module level means we hit the network once per session instead of on every
// page switch.
let cachedState: ChecklistState | null = null;
let loadInFlight: Promise<void> | null = null;
const visitedSent = new Set<string>();

// requestIdleCallback with a setTimeout fallback - mirrors MainLayout.tsx. Keeps
// the checklist's network work off the navigation critical path. Returns a
// canceller for effect cleanup.
const runWhenIdle = (fn: () => void): (() => void) => {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (h: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const handle = w.requestIdleCallback(fn, { timeout: 2000 });
    return () => w.cancelIdleCallback?.(handle);
  }
  const handle = setTimeout(fn, 1200);
  return () => clearTimeout(handle);
};

const GettingStartedChecklist: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const API_BASE = import.meta.env.VITE_API_BASE;
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("user_id");

  // Seed from the module-level cache so a remount (every navigation) paints the
  // last-known checklist instantly, without re-fetching.
  const [state, setState] = useState<ChecklistState | null>(() => cachedState);
  // Default to the collapsed Setup card in the sidebar; only show the floating
  // panel once the user explicitly opens it (stored as "0").
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) !== "0",
  );

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Fetch once per session. Coalesces concurrent mounts via loadInFlight and
  // short-circuits entirely once cachedState is populated.
  const load = async () => {
    if (!token || !userId) return;
    if (cachedState) {
      setState(cachedState);
      return;
    }
    if (!loadInFlight) {
      loadInFlight = (async () => {
        try {
          const res = await fetch(`${API_BASE}/checklist/${userId}`, { headers: authHeaders });
          if (!res.ok) return;
          cachedState = (await res.json()) as ChecklistState;
        } catch {
          /* non-fatal */
        } finally {
          loadInFlight = null;
        }
      })();
    }
    await loadInFlight;
    if (cachedState) setState(cachedState);
  };

  useEffect(() => {
    const cancel = runWhenIdle(() => { void load(); });
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE, token, userId]);

  // Auto-check the visit-based items when the user actually lands on that page.
  useEffect(() => {
    if (!token || !userId) return;
    const path = location.pathname;
    const visit =
      path.startsWith("/ai/agent") ? "ai_agent" :
      path === "/dashboard" || path.startsWith("/dashboard/") ? "dashboard" :
      null;
    if (!visit || visitedSent.has(visit)) return;
    if (state?.items?.[visit as ItemKey]) {
      visitedSent.add(visit);
      return;
    }
    visitedSent.add(visit);
    const markDone = () => {
      if (cachedState) {
        cachedState = { ...cachedState, items: { ...cachedState.items, [visit]: true } };
      }
      setState((prev) => prev
        ? { ...prev, items: { ...prev.items, [visit]: true } }
        : prev);
    };
    const cancel = runWhenIdle(() => {
      fetch(`${API_BASE}/checklist/${userId}`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ visit }),
      })
        .then(markDone)
        .catch(() => { /* non-fatal */ });
    });
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, state]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  if (!state) return null;

  const doneCount = ITEMS.reduce((n, it) => n + (state.items[it.key] ? 1 : 0), 0);
  const total = ITEMS.length;
  const allDone = doneCount === total;
  const pct = Math.round((doneCount / total) * 100);

  // Once every step is done the Setup widget has served its purpose - hide it
  // entirely so the sidebar isn't cluttered with a permanent "9/9" card.
  if (allDone) return null;

  // Collapsed state - a full-width orange Setup progress card. Designed to sit
  // in the sidebar's bottom area (the parent controls placement); clicking it
  // opens the floating panel below.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        className="mb-3 flex w-full flex-col gap-2 rounded-2xl border border-[#FFE0D2] bg-[#FFF3EC] px-4 py-3 text-left transition hover:border-[#FFC9B0]"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-[#FF6B35]">
            <CheckCircle2 className="h-4 w-4" />
            Setup
          </span>
          <span className="text-sm font-semibold text-[#FF6B35]">
            {doneCount}/{total}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#FFD9C9]">
          <div
            className="h-full rounded-full bg-[#FF6B35] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 left-3 z-40 w-[min(100vw-1.5rem,20rem)] lg:bottom-24">
      <div className="overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 bg-linear-to-br from-[#FFF6F1] to-white px-4 pt-4 pb-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF1EC] text-[#FF6B35]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#101828]">
              {allDone ? "You're all set up" : "Finish setting up WarmChats"}
            </p>
            <p className="mt-0.5 text-xs text-[#667085]">
              {allDone
                ? "Your workspace is ready to convert leads faster."
                : `${doneCount} of ${total} done - a few quick steps left.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="rounded-lg p-1.5 text-[#98A2B3] transition hover:bg-[#F2F4F7] hover:text-[#101828]"
              aria-label="Collapse checklist"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F2F4F7]">
            <div
              className="h-full rounded-full bg-[#FF6B35] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Items */}
        <ul className="max-h-[min(50vh,22rem)] space-y-0.5 overflow-y-auto px-2 py-2">
          {ITEMS.map((it) => {
            const done = state.items[it.key];
            return (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => navigate(it.href)}
                  className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[#F9FAFB]"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      done
                        ? "border-[#FF6B35] bg-[#FF6B35] text-white"
                        : "border-[#D0D5DD] bg-white"
                    }`}
                  >
                    {done && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${done ? "text-[#98A2B3] line-through" : "text-[#101828]"}`}>
                      {it.label}
                    </span>
                    {!done && (
                      <span className="mt-0.5 block text-xs text-[#667085]">{it.description}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Support footer - always reassure users help is one tap away. */}
        <div className="border-t border-[#F2F4F7] px-4 py-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard/support")}
            className="flex w-full items-center gap-2 rounded-xl bg-[#F9FAFB] px-3 py-2 text-left transition hover:bg-[#F2F4F7]"
          >
            <LifeBuoy className="h-4 w-4 shrink-0 text-[#FF6B35]" />
            <span className="text-xs text-[#475467]">
              Stuck? Our <span className="font-semibold text-[#101828]">AI Agent</span> and{" "}
              <span className="font-semibold text-[#101828]">human support</span> are always here to help.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GettingStartedChecklist;
