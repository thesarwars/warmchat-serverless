import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useState } from "react";
import { storeAuthSession } from "../utils/authSession";

const API_BASE = import.meta.env.VITE_API_BASE;

export default function StripePaymentForm({
  onSuccess,
}: {
  onSuccess: (ownerToken?: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem("token");

  // The SetupIntent is created by the StripeWrapper parent and passed to
  // <Elements options={{ clientSecret }}>; Stripe binds it to `elements`
  // automatically. Don't fetch a second one here - that costs an extra Stripe
  // API call AND leaks an unused SetupIntent in the dashboard.

  const saveCard = async () => {
    setError(null);

    if (!stripe || !elements) {
      setError("Stripe is not ready yet.");
      return;
    }

    setLoading(true);

    try {
      // ---------------- Stripe confirm ----------------
      const result = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });

      if (result.error) {
        // Stripe validation / card error
        setError(result.error.message || "Stripe error occurred");
        return;
      }

      const paymentMethodId = result.setupIntent?.payment_method;
      if (!paymentMethodId) {
        throw new Error("No payment method returned from Stripe");
      }

      // ---------------- Attach on backend ----------------
      const attachRes = await fetch(
        `${API_BASE}/billing/stripe/attach-payment-method`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            payment_method_id: paymentMethodId,
          }),
        }
      );

      type AttachResponse = {
        success?: boolean;
        message?: string;
        role_update?: {
          access_token?: string;
          token?: string;
          [key: string]: unknown;
        };
      };
      let attachData: AttachResponse = {};
      try {
        attachData = (await attachRes.json()) as AttachResponse;
      } catch {
        throw new Error("Invalid server response");
      }

      if (!attachRes.ok || attachData.success === false) {
        // Backend / Stripe error
        throw new Error(
          attachData.message || "Failed to attach payment method"
        );
      }

      // ---------------- Role update success ----------------
      if (attachData.role_update?.access_token || attachData.role_update?.token) {
        const ownerToken =
          attachData.role_update.access_token || attachData.role_update.token;

        storeAuthSession({
          ...attachData.role_update,
          role_id: "2",
          role_name: "Owner",
        });
        onSuccess(ownerToken);
      } else {
        // Payment saved but role not updated
        onSuccess();
      }
    } catch (err) {
      console.error("Save card error:", err);
      setError((err as Error).message || "Unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="border rounded-lg p-4 bg-white">
        <PaymentElement />
      </div>

      <button
        onClick={saveCard}
        disabled={!stripe || loading}
        className="w-full py-3 rounded-lg bg-orange-500 text-white font-semibold disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save payment method"}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Secure payment powered by Stripe. No charge now.
      </p>
    </div>
  );
}
