// StripeWrapper.tsx
import { useEffect, useRef, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import StripePaymentForm from "./StripePaymentForm";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
const API_BASE = import.meta.env.VITE_API_BASE;

export default function StripeWrapper({ onSuccess }: { onSuccess?: (ownerToken?: string) => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const token = localStorage.getItem("token");
  // Each Stripe SetupIntent costs a Stripe API call and is one-shot - parent
  // re-renders / React.StrictMode double-mounts would otherwise create
  // unused intents that leak in the Stripe dashboard. requestedRef ensures
  // we only fire the POST once per mount, ever.
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!token || requestedRef.current) return;
    requestedRef.current = true;

    fetch(`${API_BASE}/billing/stripe/setup-intent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setClientSecret(data.client_secret))
      .catch((err) => {
        requestedRef.current = false;
        console.error("SetupIntent error:", err);
      });
  }, [token]);

  if (!clientSecret) return <p>Loading payment form...</p>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripePaymentForm onSuccess={onSuccess} />
    </Elements>
  );
}
