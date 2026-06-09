import React, { useEffect, useState, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/helpers/queryClient";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ChatbaseWidget } from "./components/ChatbaseWidget";
import RoleProtectedRoute from "./components/RoleProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import { ROLES } from "./constants/roles";
import SessionExpiredModal from "./components/SessionExpiredModal";
import ErrorBoundary from "./components/ErrorBoundary";
import Index from "./pages/Index";

// Route pages are code-split: each chunk loads only when its route is visited.
// This shrinks the initial bundle and (with the <ErrorBoundary> below) keeps a
// single page's failure from blanking the whole app.
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./components/Login"));
const Signup = lazy(() => import("./components/SignUp"));
const Leads = lazy(() => import("./components/leads/Leads"));
const Inbox = lazy(() => import("./components/inbox/Inbox"));
const AIWriter = lazy(() => import("./components/AIWriter"));
const AutomationDetails = lazy(() => import("./components/AutomationDetails"));
const Pricing = lazy(() => import("./components/V2/Pricing/Pricing"));
const Waitlist = lazy(() => import("./components/Waitlist"));
const ConnectAccount = lazy(() => import("./components/ConnectAccount"));
const ConnectedAccountsPage = lazy(() => import("./components/connected-accounts/ConnectedAccountsPage"));
const AdminHome = lazy(() => import("./components/admin/AdminHome"));
const AdminPage = lazy(() => import("./components/admin/AdminPage"));
const DebugSendLogs = lazy(() => import("./components/admin/DebugSendLogs"));
const BlockedPhoneNumbers = lazy(() => import("./components/admin/BlockedPhoneNumbers"));
const AgentV2Page = lazy(() => import("./components/ai-v2/AgentV2Page"));
const ForgotPassword = lazy(() => import("./components/ForgotPassword"));
const ResetPassword = lazy(() => import("./components/ResetPassword"));
const ConfirmEmail = lazy(() => import("./components/ConfirmEmail"));
const VerifyEmail = lazy(() => import("./components/VerifyEmail"));
const Onboarding = lazy(() => import("./components/Onboarding"));
const BillingSuccess = lazy(() => import("./components/BillingSuccess"));
const Upgrade = lazy(() => import("./components/Upgrade"));
const ConnectPhoneNumber = lazy(() => import("./components/ConnectPhoneNumber"));
const AcceptInvite = lazy(() => import("./components/AcceptInvite"));
const OnboardingForAgentsManager = lazy(() => import("./components/OnboardingForAgentsManager"));
const ConnectDomain = lazy(() => import("./components/ConnectDomain"));
const AppointmentsCalendar = lazy(() => import("./components/AppointmentsCalendar"));
const TasksPage = lazy(() => import("./components/tasks/TasksPage"));
const DealsPage = lazy(() => import("./components/deals/DealsPage"));
const ReportingPage = lazy(() => import("./components/reporting/ReportingPage"));
const SettingsPage = lazy(() => import("./components/settings/SettingsPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Support = lazy(() => import("./pages/Support"));
const DashboardSupport = lazy(() => import("./pages/DashboardSupport"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const OptInForm = lazy(() => import("./pages/OptInForm"));
const AgentPublicPage = lazy(() => import("./pages/AgentPublicPage"));
const AgentTermsPage = lazy(() => import("./pages/AgentTermsPage"));
const Features = lazy(() => import("./components/V2/Features/Features"));
const DashboardV2 = lazy(() => import("./components/DashboardV2"));
const TeamsPage = lazy(() => import("./components/team/TeamsPage"));
const OfficesPage = lazy(() => import("./components/team/OfficesPage"));
const UsersPage = lazy(() => import("./components/team/UsersPage"));
const LeadRoutingPage = lazy(() => import("./components/team/LeadRoutingPage"));
const GrowthGate = lazy(() => import("./components/team/GrowthGate"));
import { syncSubscriptionOnBoot, setupServiceWorkerUpdates } from "./utils/webPush";
import { toast as sonnerToast } from "sonner";
import { PwaInstallModal } from "./components/notifications/PwaInstallModal";
import { DesktopNotifPrompt } from "./components/notifications/DesktopNotifPrompt";
import { NotificationActionBridge } from "./components/notifications/NotificationActionBridge";
import CookieConsentBanner from "./components/CookieConsentBanner";
import { refreshAuthSession, shouldRefreshAccessToken, clearStoredAuthState, hasRefreshToken, isSessionActive } from "./utils/authSession";
import { baseURL as API_BASE } from "@/helpers/api";
const App: React.FC = () => {
  const [sessionExpired, setSessionExpired] = useState(false);
  const location = useLocation();
  const hideChatWidget = location.pathname.startsWith("/inbox") || location.pathname.startsWith("/leads");

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const markSessionExpired = () => {
      clearStoredAuthState();
      if (window.location.pathname === "/") {
        window.location.href = "/login";
      } else {
        setSessionExpired(true);
      }
    };

    const shouldSkipInterception = (url: string) =>
      [
        "/auth/login",
        "/auth/register",
        "/auth/google-login",
        "/auth/forgot-password",
        "/auth/reset-password",
        "/auth/confirm-email",
        "/auth/resend-confirmation",
        "/auth/accept-invite",
        "/auth/refresh",
        "/auth/logout",
      ].some((path) => url.includes(path));

    window.fetch = async function (
      url: RequestInfo | URL,
      options: RequestInit = {},
    ) {
      const requestUrl =
        typeof url == "string" ? url : url instanceof Request ? url.url : String(url || "");

      if (shouldSkipInterception(requestUrl)) {
        return originalFetch(url, options);
      }

      // Snapshot whether the user was actually logged in when this request
      // started. Background boot fetches (e.g. syncSubscriptionOnBoot POSTing
      // to /notifications/subscribe) fire on every page load - including on
      // /login after a logout, where there is no session. A 401 there is
      // expected and must NOT pop the session-expired modal: doing so traps the
      // user, since clicking "OK" reloads /login, the same fetch 401s again,
      // and the modal reopens forever.
      const hadActiveSession = isSessionActive();

      if (shouldRefreshAccessToken()) {
        const refreshedToken = await refreshAuthSession(API_BASE, originalFetch);
        if (!refreshedToken) {
          markSessionExpired();
          return Promise.reject(new Error("Session expired"));
        }
      }

      // Auth rides on HttpOnly cookies now. Strip any stale Authorization
      // header callers may still attach; the cookie carries the session.
      const baseHeaders =
        options.headers || (url instanceof Request ? url.headers : undefined);
      const headers = new Headers(baseHeaders || {});
      headers.delete("Authorization");

      const requestInput = url instanceof Request ? url.clone() : url;

      let response = await originalFetch(requestInput, {
        ...options,
        headers,
      });

      if (response.status === 401 && hasRefreshToken()) {
        const refreshed = await refreshAuthSession(API_BASE, originalFetch);
        if (refreshed) {
          // Refresh set new cookies; just replay the original request.
          const retryInput = url instanceof Request ? url.clone() : url;
          response = await originalFetch(retryInput, {
            ...options,
            headers,
          });
        }
      }

      if (response.status === 401 && hadActiveSession) {
        markSessionExpired();
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    // Register the service worker on every boot (auth state irrelevant).
    // Chrome only fires `beforeinstallprompt` when an active SW controls the
    // start_url, so this needs to run for logged-out visitors on /login too,
    // not just for authenticated sessions. Defer it to idle so the
    // serviceWorker.ready -> getSubscription -> VAPID fetch -> subscribe -> POST
    // chain doesn't compete with the first-paint render wave.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const bootSync = (): void => { void syncSubscriptionOnBoot(localStorage.getItem("token")); };
    let cancelBootSync: () => void;
    if (typeof w.requestIdleCallback === "function") {
      const handle = w.requestIdleCallback(bootSync, { timeout: 2000 });
      cancelBootSync = () => w.cancelIdleCallback?.(handle);
    } else {
      const handle = setTimeout(bootSync, 1200);
      cancelBootSync = () => clearTimeout(handle);
    }

    // Re-sync whenever auth state flips (login, refresh, logout-then-login).
    // After a server DB reset the user gets bounced to /login; once they sign
    // back in we need to re-POST the still-valid PushSubscription so the
    // freshly-empty `push_subscription` table learns about this device again.
    const onAuthChange = () => {
      void syncSubscriptionOnBoot(localStorage.getItem("token"));
    };
    window.addEventListener("warmchats:auth-session-changed", onAuthChange);

    // Installed PWAs (especially iOS Safari) can sit in the background for
    // days. Re-running sync on visibility-change covers two cases at once:
    // the server forgot us (DB reset) and the browser quietly evicted our
    // subscription while we were away.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void syncSubscriptionOnBoot(localStorage.getItem("token"));
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Detect new service-worker versions and prompt the user to reload. We
    // already call `skipWaiting()` in sw.js, so by the time this fires the
    // new SW is controlling network - the page itself is still old code,
    // hence the explicit reload button.
    //
    // Only surfaced inside the actual app: installed PWAs (standalone display
    // mode) OR an authenticated session. Anonymous visitors on the marketing
    // homepage shouldn't see "Reload to get the latest improvements" - it's
    // meaningless to them and the next navigation will pick up the new bundle
    // anyway.
    const isInApp = (): boolean => {
      if (isSessionActive()) return true;
      if (typeof window === "undefined" || !window.matchMedia) return false;
      return (
        window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari standalone flag (predates the display-mode media query).
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true
      );
    };
    let toasted = false;
    const teardownUpdates = setupServiceWorkerUpdates(() => {
      if (toasted) return;
      if (!isInApp()) return;
      toasted = true;
      sonnerToast("A new version of WarmChats is available", {
        description: "Reload to get the latest improvements.",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => window.location.reload(),
        },
      });
    });

    return () => {
      cancelBootSync();
      window.removeEventListener("warmchats:auth-session-changed", onAuthChange);
      document.removeEventListener("visibilitychange", onVisibility);
      teardownUpdates();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        {/* Global toasters */}
        <Toaster />
        <Sonner />

        {/* Optional analytics / widgets */}
        <ChatbaseWidget hidden={hideChatWidget} />

        {/* Session expired modal */}
        <SessionExpiredModal
          open={sessionExpired}
          onConfirm={() => {
            clearStoredAuthState();
            window.location.href = "/login";
          }}
        />

        {/* Full-screen install guide. Mounted globally so it can auto-open on
            iOS Safari before login and be triggered from any other surface
            via openInstallGuide(). */}
        <PwaInstallModal />

        {/* Desktop-only top-right notification ask. The install modal is the
            single onboarding flow on mobile + inside the PWA; on desktop we
            don't want a full-screen modal blocking work, just this compact
            nudge that re-appears on every refresh until granted. */}
        <DesktopNotifPrompt />

        {/* Bridges native notification action buttons (Reply / Answer /
            Decline) into the running app - the service worker hands the action
            here so the reply actually sends (and shows in the inbox) and the
            call is answered via the in-app WebRTC SDK. */}
        <NotificationActionBridge />

        {/* Cookie consent banner. Defers Mixpanel + session-replay init until
            the visitor accepts; shows once per device until accept/reject. */}
        <CookieConsentBanner />

        {/* NOTE: Do NOT render a Router here. Wrap <App /> with <BrowserRouter> in index.tsx */}
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
              </div>
            }
          >
            <Routes>
          {/* Public */}
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/waitlist" element={<Waitlist />} />
          <Route path="/features" element={<Features />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/support" element={<Support />} />
          <Route path="/opt-in" element={<OptInForm />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/agents/:slug" element={<AgentPublicPage />} />
          <Route path="/agents/:slug/privacy" element={<AgentPublicPage />} />
          <Route path="/agents/:slug/terms" element={<AgentTermsPage />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/confirm-email" element={<ConfirmEmail />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/billing/success" element={<BillingSuccess />} />
          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <DashboardV2 />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/dashboard/support"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <DashboardSupport />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <Onboarding />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/onboarding-agents-managers"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <OnboardingForAgentsManager />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/connect-domain"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <ConnectDomain />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/connect-email"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <ConnectedAccountsPage />
              </RoleProtectedRoute>
            }
          />
          {/* /connect-email/gmail keeps the older Gmail-only flow for OAuth callbacks. */}
          <Route path="/connect-email/gmail" element={<ConnectAccount />} />
          <Route
            path="/appointments"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <AppointmentsCalendar />
              </RoleProtectedRoute>
            }
          />
          {/* The AI section is the single v2 AI Agent command center (Overview,
              Activity, Inbound, Outbound, Action Center, Knowledge Base, AI
              Settings). The old per-agent /ai/{agent,inbound,outbound,settings}
              pages were removed. */}
          <Route
            path="/ai/agent"
            element={
              <RoleProtectedRoute
                allowedRoles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.REPRESENTATIVE, ROLES.GUEST]}
              >
                <AgentV2Page />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/leads"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                ]}
              >
                <Leads />
              </RoleProtectedRoute>
            }
          />
          <Route path="/accept-invite" element={<AcceptInvite />} />

          {/* Tasks workspace (stub for now). Linked from the sidebar. */}
          <Route
            path="/tasks"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <TasksPage />
              </RoleProtectedRoute>
            }
          />

          {/* Deals pipeline. UI-only demo from the leads-remix-2 design (no
              deals backend yet); linked from the sidebar Workspace group. */}
          <Route
            path="/deals"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <DealsPage />
              </RoleProtectedRoute>
            }
          />

          {/* Reporting. UI-only demo from the leads-remix-2 design (no reporting
              backend yet); linked from the sidebar Workspace group. */}
          <Route
            path="/reporting"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <ReportingPage />
              </RoleProtectedRoute>
            }
          />

          {/* Settings is retired - its workspace/billing/compliance content now
              lives in the Admin control center. Redirect any /settings link
              (incl. ?tab=) to /admin so nothing dead-ends. (SettingsPage.tsx is
              kept only for the wired cards Admin imports from it.) */}
          <Route path="/settings" element={<Navigate to="/admin" replace />} />

          {/* Outbound workflows live inside the AI Agent -> Outbound tab (the
              workflow list + in-modal create wizard + template gallery). Only the
              per-workflow detail/editor keeps a standalone route, reached from
              the Outbound tab's "Edit in builder" button. */}
          <Route
            path="/workflows/:id"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <AutomationDetails />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="/inbox"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                ]}
              >
                <Inbox />
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/connect-phone"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                ]}
              >
                <ConnectPhoneNumber />
              </RoleProtectedRoute>
            }
          />

          <Route
            path="/ai-writer"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <AIWriter />
              </RoleProtectedRoute>
            }
          />

          {/* Team pages (Admin + Manager, Growth plan) */}
          <Route
            path="/team/users"
            element={
              <RoleProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <GrowthGate featureName="Users"><UsersPage /></GrowthGate>
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/team/teams"
            element={
              <RoleProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <GrowthGate featureName="Teams"><TeamsPage /></GrowthGate>
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/team/offices"
            element={
              <RoleProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <GrowthGate featureName="Offices"><OfficesPage /></GrowthGate>
              </RoleProtectedRoute>
            }
          />
          <Route
            path="/team/lead-routing"
            element={
              <RoleProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <GrowthGate featureName="Lead Routing"><LeadRoutingPage /></GrowthGate>
              </RoleProtectedRoute>
            }
          />

          <Route
            path="/upgrade"
            element={
              <RoleProtectedRoute
                allowedRoles={[
                  ROLES.ADMIN,
                  ROLES.MANAGER,
                  ROLES.REPRESENTATIVE,
                  ROLES.GUEST,
                ]}
              >
                <Upgrade />
              </RoleProtectedRoute>
            }
          />

          {/* Admin business control center (6 tabs). Linked from the sidebar for
              site admins only. Gated on user.is_admin like the rest of /admin/*. */}
          <Route
            path="/admin"
            element={
              <AdminProtectedRoute>
                <AdminPage />
              </AdminProtectedRoute>
            }
          />

          {/* Legacy site-admin tools launcher (Debug logs, Blocked numbers).
              Kept reachable so the debug/test utilities stay one click away. */}
          <Route
            path="/admin/tools"
            element={
              <AdminProtectedRoute>
                <AdminHome />
              </AdminProtectedRoute>
            }
          />

          {/* Mock send debug log (site admin only). Gated on user.is_admin,
              not membership role - see AdminProtectedRoute for why. */}
          <Route
            path="/admin/debug"
            element={
              <AdminProtectedRoute>
                <DebugSendLogs />
              </AdminProtectedRoute>
            }
          />

          {/* Site-admin SMS suppression manager. Same gating as /admin/debug. */}
          <Route
            path="/admin/blocked"
            element={
              <AdminProtectedRoute>
                <BlockedPhoneNumbers />
              </AdminProtectedRoute>
            }
          />

          {/* /account/blocked was folded into /settings?tab=compliance, the
              unified per-org compliance view. The catch-all 404s any stale
              link; we deliberately avoid a redirect here per the no-redirect
              project rule (pre-production app). */}

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
