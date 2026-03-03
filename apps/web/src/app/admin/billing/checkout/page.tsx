"use client";

import { useState, useEffect, useCallback } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  CheckoutProvider,
  PaymentElement,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";
import { useApiCall } from "@/hooks/use-api";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface CheckoutResponse {
  data: {
    clientSecret: string;
    publishableKey: string;
  };
}

function CheckoutForm() {
  const checkoutState = useCheckout();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (checkoutState.type === "loading") {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading payment form...</p>
      </div>
    );
  }

  if (checkoutState.type === "error") {
    return <p className="text-destructive text-center">{checkoutState.error.message}</p>;
  }

  const { checkout } = checkoutState;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const result = await checkout.confirm();
    if (result.type === "error") {
      setMessage(result.error.message);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full mt-4 py-3 px-4 rounded-lg font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? "Processing..." : "Subscribe — $19/mo"}
      </button>
      {message && (
        <p className="mt-3 text-sm text-destructive text-center">{message}</p>
      )}
    </form>
  );
}

export default function CheckoutPage() {
  const { call } = useApiCall();
  const [stripe, setStripe] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCheckout = useCallback(async () => {
    try {
      const res = await call<CheckoutResponse>("/api/billing/checkout", {
        method: "POST",
      });
      setStripe(loadStripe(res.data.publishableKey));
      setClientSecret(res.data.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize checkout");
    }
  }, [call]);

  useEffect(() => {
    fetchCheckout();
  }, [fetchCheckout]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-destructive mb-4">{error}</p>
        <Link href="/admin/billing" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 inline mr-1" />
          Back to Billing
        </Link>
      </div>
    );
  }

  if (!stripe || !clientSecret) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Preparing checkout...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/billing"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Billing
        </Link>
        <h1 className="text-2xl font-bold mt-2">Upgrade to Pro</h1>
        <p className="text-muted-foreground text-sm mt-1">
          $19/month — unlimited posts, featured images, and webhook-triggered sync.
        </p>
      </div>

      <div className="rounded-xl border border-border p-6">
        <CheckoutProvider
          stripe={stripe}
          options={{ clientSecret }}
        >
          <CheckoutForm />
        </CheckoutProvider>
      </div>
    </div>
  );
}
