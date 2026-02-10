"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function CheckoutReturnPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get("reference");
  const [status, setStatus] = useState<string>("processing");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!reference) {
      setError("Missing payment reference");
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch(`/api/checkout/status?reference=${encodeURIComponent(reference)}`);
        const data = await res.json();
        if (!mounted) return;
        if (data?.subscription?.status === "ACTIVE") {
          router.replace("/onboarding/business");
          return;
        }
        setStatus(data?.checkout?.status || "processing");
      } catch {
        if (!mounted) return;
        setError("Unable to confirm payment yet.");
      }
    };
    const interval = setInterval(poll, 2500);
    poll();
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [reference, router]);

  return (
    <div className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-border/70 bg-card/80 p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Checkout</p>
        <h1 className="mt-3 text-2xl font-semibold">Processing payment</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We are confirming your payment. You will be redirected automatically.
        </p>
        {error ? (
          <p className="mt-4 text-sm text-rose-600">{error}</p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Status: {status}</p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
            onClick={() => router.replace("/checkout")}
          >
            Retry payment
          </button>
          <button
            type="button"
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
            onClick={() => router.refresh()}
          >
            Refresh status
          </button>
        </div>
      </div>
    </div>
  );
}
