"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

type Provider = "PAYSTACK" | "FLUTTERWAVE";

type Props = {
  planLabel: string;
  plan: string;
  interval: "monthly" | "yearly";
  currency: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  providers: Provider[];
};

export function CheckoutPanel({
  planLabel,
  plan,
  interval,
  currency,
  monthlyPrice,
  yearlyPrice,
  providers,
}: Props) {
  const [billing, setBilling] = useState<"monthly" | "yearly">(interval);
  const [provider, setProvider] = useState<Provider | null>(providers[0] ?? null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const price = useMemo(() => {
    return billing === "yearly" ? yearlyPrice : monthlyPrice;
  }, [billing, monthlyPrice, yearlyPrice]);

  const onCheckout = async () => {
    if (!provider || !price) return;
    setLoading(true);
    try {
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          interval: billing,
          currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to start checkout");
      }
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl as string;
        return;
      }
      router.refresh();
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-2xl border border-border bg-background p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Selected plan</p>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <p className="text-xl font-semibold">{planLabel}</p>
            <p className="text-sm text-muted-foreground">Plan: {plan}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Billing</p>
            <p className="mt-1 text-sm font-semibold capitalize">{billing}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-background p-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={clsx(
              "rounded-full border px-4 py-2 text-sm font-semibold",
              billing === "monthly"
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-border text-muted-foreground"
            )}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={clsx(
              "rounded-full border px-4 py-2 text-sm font-semibold",
              billing === "yearly"
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-border text-muted-foreground"
            )}
            onClick={() => setBilling("yearly")}
          >
            Yearly
          </button>
          <div className="ml-auto text-right text-sm text-muted-foreground">
            {price ? (
              <>
                <span className="text-lg font-semibold text-foreground">
                  {currency} {price.toLocaleString()}
                </span>
                <span className="ml-2 text-xs uppercase tracking-[0.2em]">{billing}</span>
              </>
            ) : (
              "Pricing unavailable"
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-background p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Choose provider</p>
        {providers.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Payments are not supported in your country yet.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            {providers.map((p) => (
              <button
                key={p}
                type="button"
                className={clsx(
                  "rounded-full border px-4 py-2 text-sm font-semibold",
                  provider === p
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-border text-muted-foreground"
                )}
                onClick={() => setProvider(p)}
              >
                {p === "PAYSTACK" ? "Paystack" : "Flutterwave"}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={loading || !provider || !price}
        onClick={onCheckout}
        className="w-full rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Redirecting..." : "Continue to payment"}
      </button>
    </div>
  );
}
