"use client";

import { useEffect, useState } from "react";
import { useApiCall } from "@/hooks/use-api";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export default function CheckoutPage() {
  const { call } = useApiCall();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ data: { url: string } }>("/api/billing/checkout", {
      method: "POST",
    })
      .then((res) => {
        window.location.href = res.data.url;
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to initialize checkout");
      });
  }, [call]);

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

  return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Redirecting to checkout...</p>
    </div>
  );
}
