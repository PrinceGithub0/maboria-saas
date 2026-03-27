"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RetrySecurePaymentButtonProps = {
  mode?: "checkout" | "flutterwave_renewal";
  autoStart?: boolean;
};

export function RetrySecurePaymentButton({
  mode = "checkout",
  autoStart = false,
}: RetrySecurePaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "flutterwave_renewal") {
        const renewResponse = await fetch("/api/subscription/renew-now", {
          method: "POST",
        });
        const renewPayload = await renewResponse.json().catch(() => ({}));

        if (renewPayload?.redirectUrl) {
          window.location.href = renewPayload.redirectUrl;
          return;
        }

        if (renewResponse.ok) {
          window.location.href = "/dashboard/subscription";
          return;
        }

        const renewalCode = String(renewPayload?.code || "").toLowerCase();
        if (
          renewalCode &&
          renewalCode !== "unsupported_provider" &&
          renewalCode !== "missing_payment_method" &&
          renewalCode !== "auto_renew_disabled"
        ) {
          setError(typeof renewPayload?.error === "string" ? renewPayload.error : "Unable to renew right now.");
          return;
        }
      }

      const endpoints = ["/api/checkout/session", "/api/checkout"];
      const errors: string[] = [];
      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        const checkoutUrl = data?.checkoutUrl || data?.redirectUrl;
        if (res.ok && checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
        const errorText = typeof data?.error === "string" ? data.error : `Request failed (${res.status})`;
        errors.push(`${endpoint}: ${errorText}`);
      }
      console.error("Retry payment failed: Missing checkout URL", errors);
      setError("Unable to open checkout right now.");
    } catch (error) {
      console.error("Retry payment failed:", error);
      setError("Unable to restore billing access right now.");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!autoStart || startedRef.current) return;
    startedRef.current = true;
    void handleRetry();
  }, [autoStart, handleRetry]);

  return (
    <div className="space-y-3">
      <button
        onClick={handleRetry}
        disabled={loading}
        className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading
          ? mode === "flutterwave_renewal"
            ? "Restoring billing access..."
            : "Opening checkout..."
          : mode === "flutterwave_renewal"
            ? "Restore subscription access"
            : "Retry Secure Payment"}
      </button>
      {error ? <p className="text-center text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
