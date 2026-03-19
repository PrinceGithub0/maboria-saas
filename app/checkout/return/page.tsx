"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ViewState = "loading" | "success" | "failed" | "pending";

const SUCCESS_STATUSES = new Set(["success", "synced", "active", "completed"]);
const PENDING_STATUSES = new Set(["pending", "processing"]);

function normalizeVerifyStatus(status: unknown): ViewState {
  const value = String(status || "").toLowerCase();
  if (SUCCESS_STATUSES.has(value)) return "success";
  if (PENDING_STATUSES.has(value)) return "pending";
  return "failed";
}

type CheckoutStatusPayload = {
  checkout?: {
    status?: string | null;
    provider?: string | null;
    plan?: string | null;
    billingCycle?: string | null;
    currency?: string | null;
  } | null;
};

export default function CheckoutReturnPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams.get("reference");
  const [view, setView] = useState<ViewState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const verifyPayment = useCallback(async (): Promise<ViewState> => {
    if (!reference) {
      setMessage("Missing payment reference.");
      return "failed";
    }

    const verifyViaApi = async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    };

    // Attempt provider-agnostic payload first.
    let verification = await verifyViaApi({ reference });
    if (verification.ok) {
      return normalizeVerifyStatus(verification.data?.status);
    }

    // Fallback to existing backend contract by resolving provider from checkout session.
    const checkoutStatusRes = await fetch(
      `/api/checkout/status?reference=${encodeURIComponent(reference)}`,
      { cache: "no-store" }
    );
    if (!checkoutStatusRes.ok) {
      setMessage("Unable to confirm payment at the moment.");
      return "failed";
    }

    const checkoutStatus = (await checkoutStatusRes.json().catch(() => ({}))) as CheckoutStatusPayload;
    const provider = String(checkoutStatus?.checkout?.provider || "").toLowerCase();
    const checkoutState = String(checkoutStatus?.checkout?.status || "").toUpperCase();

    if (provider === "stripe") {
      return normalizeVerifyStatus(checkoutState === "SUCCESS" ? "success" : checkoutState === "FAILED" || checkoutState === "ABANDONED" ? "failed" : "pending");
    }

    if (provider === "paystack") {
      verification = await verifyViaApi({ provider: "paystack", reference });
    } else if (provider === "flutterwave") {
      verification = await verifyViaApi({ provider: "flutterwave", txRef: reference });
    } else {
      setMessage("Unable to identify payment provider.");
      return "failed";
    }

    if (!verification.ok) {
      const errorText = String(verification.data?.error || "").toLowerCase();
      if (errorText.includes("pending")) return "pending";
      setMessage("Payment could not be verified yet.");
      return "failed";
    }

    return normalizeVerifyStatus(verification.data?.status);
  }, [reference]);

  const runVerification = useCallback(async () => {
    setView("loading");
    setMessage(null);
    try {
      const nextView = await verifyPayment();
      setView(nextView);
    } catch {
      setMessage("Unable to confirm payment at the moment.");
      setView("failed");
    }
  }, [verifyPayment]);

  const handleRetryPayment = useCallback(async () => {
    try {
      setRetrying(true);
      if (!reference) {
        setMessage("Missing payment reference.");
        return;
      }

      const statusRes = await fetch(`/api/checkout/status?reference=${encodeURIComponent(reference)}`, {
        cache: "no-store",
      });
      const statusData = (await statusRes.json().catch(() => ({}))) as CheckoutStatusPayload;

      if (!statusRes.ok || !statusData?.checkout?.plan || !statusData?.checkout?.billingCycle) {
        setMessage("Unable to restore your checkout details for retry.");
        return;
      }

      const provider = String(statusData.checkout.provider || "").toUpperCase();
      const payload = {
        selectedPlan: statusData.checkout.plan,
        billingCycle: statusData.checkout.billingCycle,
        currency: statusData.checkout.currency || undefined,
        provider:
          provider === "PAYSTACK" || provider === "FLUTTERWAVE" || provider === "STRIPE"
            ? provider
            : undefined,
      };

      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      const checkoutUrl = data?.checkoutUrl || data?.redirectUrl;
      if (res.ok && checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      setMessage(
        typeof data?.error === "string" ? data.error : "Unable to start a secure retry right now."
      );
    } catch {
      setMessage("Unable to start a secure retry right now.");
    } finally {
      setRetrying(false);
    }
  }, [reference]);

  useEffect(() => {
    runVerification();
  }, [runVerification]);

  useEffect(() => {
    if (view !== "success") return;
    const timer = setTimeout(() => {
      router.replace("/dashboard");
    }, 1200);
    return () => clearTimeout(timer);
  }, [view, router]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-12 text-slate-900 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_16px_36px_-24px_rgba(15,23,42,0.24)] sm:p-10">
          {view === "loading" && (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Processing your payment</h1>
              <p className="mt-2 text-sm text-slate-600">
                We&apos;re confirming your transaction securely. Please wait...
              </p>
            </div>
          )}

          {view === "success" && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Payment successful</h1>
              <p className="mt-2 text-sm text-slate-600">
                Your subscription is now active. Redirecting to your dashboard...
              </p>
            </div>
          )}

          {view === "failed" && (
            <div className="text-center">
              <div className="mx-auto h-2 w-16 rounded-full bg-slate-200" />
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Payment not completed</h1>
              <p className="mt-2 text-sm text-slate-600">
                It looks like your transaction did not go through. You can retry securely below.
              </p>
              {message ? <p className="mt-3 text-sm text-slate-500">{message}</p> : null}
              <button
                type="button"
                onClick={handleRetryPayment}
                disabled={retrying}
                className="mt-6 h-14 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 text-base font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {retrying ? "Preparing secure checkout..." : "Retry secure payment"}
              </button>
            </div>
          )}

          {view === "pending" && (
            <div className="text-center">
              <div className="mx-auto h-2 w-16 rounded-full bg-slate-200" />
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Payment pending</h1>
              <p className="mt-2 text-sm text-slate-600">
                We&apos;re still waiting for confirmation from your bank.
              </p>
              {message ? <p className="mt-3 text-sm text-slate-500">{message}</p> : null}
              <button
                type="button"
                onClick={runVerification}
                className="mt-6 h-14 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 text-base font-semibold text-white transition hover:brightness-105"
              >
                Check again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
