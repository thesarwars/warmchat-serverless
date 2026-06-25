// import React from "react";
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from "react-router-dom";
import { CRMProvider } from "./context/CRMContext";
import { CallingProvider } from "./context/CallingContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import { GoogleOAuthProvider } from "@react-oauth/google";
import ErrorBoundary from "./components/ErrorBoundary";
import { loadStripe } from "@stripe/stripe-js";
import { getStoredAuthSession } from "./utils/authSession";
import App from "./App";
import "./index.css";

// A new deploy replaces the content-hashed lazy-route chunks and deletes the
// old ones, so a returning tab still on the previous index.html 404s when it
// imports a now-missing chunk ("Failed to fetch dynamically imported module").
// Vite fires `vite:preloadError` for exactly this; reload once to pull the
// fresh index.html (the _headers no-cache rule guarantees a normal reload
// re-fetches it) and the new chunk names. The timestamp guard stops a reload
// loop when the chunk is genuinely unreachable (offline / real 404).
window.addEventListener("vite:preloadError", (event) => {
  const RELOAD_KEY = "wc:chunk-reload-at";
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Analytics is non-essential and heavy (mixpanel-browser ~120KB gz + session
// replay). Defer it off the first-paint critical path - lazy-import + init when
// the browser is idle so it never competes with rendering the app shell.
const bootSession = getStoredAuthSession();
const startAnalytics = () => {
  void import("./lib/mixpanel").then(({ initMixpanel, mixpanelIdentify }) => {
    initMixpanel();
    if (bootSession.userId) {
      mixpanelIdentify(bootSession.userId, {
        email: bootSession.email,
        name: bootSession.name,
        org_id: bootSession.orgId,
        org_name: bootSession.orgName,
        role: bootSession.roleName,
        plan: bootSession.plan,
      });
    }
  });
};
if (typeof window !== "undefined" && "requestIdleCallback" in window) {
  (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(startAnalytics);
} else {
  setTimeout(startAnalytics, 2000);
}

const rootElement = document.getElementById('root')!;

createRoot(rootElement).render(
  // <React.StrictMode>
  <BrowserRouter>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <CRMProvider>
          <CallingProvider>
            <NotificationsProvider>
              <App />
            </NotificationsProvider>
          </CallingProvider>
        </CRMProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </BrowserRouter>
  // </React.StrictMode>
);
