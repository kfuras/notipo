"use client";

import { useState, useEffect, useCallback } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { useApiCall } from "@/hooks/use-api";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface CheckoutResponse {
  data: {
    clientSecret: string;
    publishableKey: string;
  };
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
    <div className="max-w-2xl mx-auto">
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

      <EmbeddedCheckoutProvider stripe={stripe} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
